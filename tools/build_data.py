"""Precompute the data the site needs, so GitHub Pages can serve it as static files.

    pip install -r tools/requirements.txt
    python tools/build_data.py            # writes assets/data/lab-data.json

Embeddings: BAAI/bge-small-en-v1.5 (384 dimensions), the same model the site's live
mode loads in the browser. Reranker: ms-marco-MiniLM-L-6-v2 cross-encoder.
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path

import numpy as np

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

from corpus import CLIENT, DOCS, PAIRS, QUERIES, QUERY_PREFIX, RELATIONS, SENTENCES  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "data" / "lab-data.json"
TUTOR_OUT = ROOT / "assets" / "data" / "tutor-vectors.json"
CACHE = Path(os.environ.get("LAB_MODEL_CACHE", ROOT / "tools" / ".models"))  # git-ignored
EMBED_MODEL = "BAAI/bge-small-en-v1.5"
RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2"
LABELS = {"contract": "contract / sign-off", "business_process": "client business process",
          "project_doc": "project document"}


def fnv1a(text: str) -> int:
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def rounded(v: np.ndarray, places: int = 5) -> list[float]:
    return [round(float(x), places) for x in v]


def main() -> None:
    from fastembed import TextEmbedding
    from fastembed.rerank.cross_encoder import TextCrossEncoder

    embedder = TextEmbedding(EMBED_MODEL, cache_dir=str(CACHE))
    reranker = TextCrossEncoder(RERANK_MODEL, cache_dir=str(CACHE))
    embed = lambda texts: np.array([np.asarray(v, dtype=np.float32) for v in embedder.embed(texts)])

    # Chunks: one per section, with a contextual header ("structure" strategy).
    chunks = []
    for d in DOCS:
        for section, text in d["sections"]:
            header = f"Document: {d['title']} ({LABELS[d['type']]})\nSection: {section}"
            chunks.append({"id": f"{d['id']}#{section}", "doc": d["id"], "section": section, "text": text,
                           "embed": f"{header}\n\n{text}"})
    chunk_vecs = embed([c["embed"] for c in chunks])
    for c, v in zip(chunks, chunk_vecs):
        c["vec"] = rounded(v)

    queries = []
    for q in QUERIES:
        qv = embed([QUERY_PREFIX + q["text"]])[0]
        scores = reranker.rerank(q["text"], [c["embed"] for c in chunks])
        queries.append({**q, "vec": rounded(qv),
                        "rerank": {c["id"]: round(float(s), 4) for c, s in zip(chunks, scores)}})

    # Meaning map: 2D shadow (PCA) of the 384-dimensional sentence vectors.
    sent_vecs = embed([s for _, s in SENTENCES])
    centered = sent_vecs - sent_vecs.mean(axis=0)
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    xy = centered @ vt[:2].T
    xy = (xy - xy.min(axis=0)) / (xy.max(axis=0) - xy.min(axis=0))
    sim = sent_vecs @ sent_vecs.T
    sentences = [{"group": g, "text": s, "x": round(float(p[0]), 4), "y": round(float(p[1]), 4)}
                 for (g, s), p in zip(SENTENCES, xy)]

    pairs = []
    for p in PAIRS:
        a, b1, b2 = embed([p["a"], p["b1"], p["b2"]])
        pairs.append({**p, "s1": round(float(a @ b1), 4), "s2": round(float(a @ b2), 4)})

    data = {
        "model": EMBED_MODEL, "rerankModel": RERANK_MODEL, "queryPrefix": QUERY_PREFIX, "client": CLIENT,
        "docs": [{k: d[k] for k in ("id", "title", "type", "date")} for d in DOCS],
        "relations": [{"from": a, "type": t, "to": b} for a, t, b in RELATIONS],
        "chunks": chunks, "queries": queries, "sentences": sentences,
        "sim": [[round(float(x), 3) for x in row] for row in sim], "pairs": pairs,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB): "
          f"{len(chunks)} chunks, {len(queries)} queries, {len(sentences)} sentences")

    # Tutor passages (exported from the lessons by `node tools/export-kb.mjs`), embedded and
    # quantised to int8: 384 bytes per passage instead of ~2.7 KB of JSON floats. Each entry
    # carries an FNV-1a hash of its text so the site can tell when a lesson changed.
    kb_file = ROOT / "tools" / "kb-passages.json"
    if kb_file.exists():
        texts = json.loads(kb_file.read_text(encoding="utf-8"))
        vecs = embed(texts)
        q = np.clip(np.round(vecs * 127), -127, 127).astype(np.int8)
        tutor = {"model": EMBED_MODEL, "dim": int(q.shape[1]), "scale": 127,
                 "hashes": [fnv1a(t) for t in texts], "int8": base64.b64encode(q.tobytes()).decode()}
        TUTOR_OUT.write_text(json.dumps(tutor, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {TUTOR_OUT.relative_to(ROOT)} ({TUTOR_OUT.stat().st_size // 1024} KB): {len(texts)} tutor passages")
    else:
        print("skipped tutor vectors: run `node tools/export-kb.mjs` first")

    # Diagnostics, used to write the lessons so they match what the model actually does.
    for p in pairs:
        print(f"pair {p['id']:<11} A~b1 {p['s1']:.3f}  A~b2 {p['s2']:.3f}  -> {'b1' if p['s1'] > p['s2'] else 'b2'} closer")
    ids = [c["id"] for c in chunks]
    for q in queries:
        vec_rank = list(np.argsort(-(chunk_vecs @ np.array(q["vec"]))))
        rr_rank = sorted(ids, key=lambda i: -q["rerank"][i])
        first_v = min(vec_rank.index(ids.index(a)) for a in q["answers"]) + 1
        first_r = min(rr_rank.index(a) for a in q["answers"]) + 1
        print(f"query {q['id']:<10} vector rank {first_v:<3} rerank-all rank {first_r:<3} top vector: {ids[vec_rank[0]]}")


if __name__ == "__main__":
    main()
