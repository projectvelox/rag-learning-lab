# RAG Learning Lab

**Play it:** https://projectvelox.github.io/rag-learning-lab/

A browser game for actually *understanding* how documents become searchable knowledge:
embeddings, chunking, keyword vs vector search, hybrid fusion, reranking, metadata and
relationships, continuous ingestion, evaluation and grounded answers.

Every number in the game comes from a real embedding model (`BAAI/bge-small-en-v1.5`)
and a real cross-encoder reranker, run over a small fictional corpus. All companies, people
and documents in it are invented (Lakbay Freight Inc. does not exist).

## How it teaches

Each level follows the same loop, built on how memory actually works:

1. **The problem**: a concrete failure you'd hit in a real system.
2. **The idea**: the concept in plain language.
3. **Lab**: something to poke at (a meaning map, a chunk lab, two search engines side by side…).
4. **Predict, then reveal**: commit to an answer before seeing what the model actually does.
5. **Explain it back**: write the idea in your own words, then compare with a reference explanation.
6. **Spaced review**: finished levels add cards to a deck that comes back after 1, 3, 7, 16 and 35 days.

XP, ranks, badges, stars and a streak keep it moving. The final boss mixes every lesson into
incident reports, because real bugs never say which chapter they belong to.

| # | Level | Concept |
|---|---|---|
| 1 | Meaning has coordinates | Embeddings, cosine similarity, where similarity breaks |
| 2 | Cutting documents | Chunking strategies, cleaning, table headers, contextual headers |
| 3 | Two detectives | BM25 keyword search vs vector search |
| 4 | Fusion | Hybrid search, Reciprocal Rank Fusion, entity matching |
| 5 | The careful judge | Cross-encoder reranking, two-stage retrieval |
| 6 | Detective board | Metadata, document relationships, conflicting facts |
| 7 | The gatekeeper | Incremental, idempotent ingestion; duplicates; client isolation |
| 8 | Keeping score | Golden sets, hit@k, MRR, noise |
| 9 | Answer from evidence | Grounding and citations |
| 🐉 | The pipeline dragon | Everything, interleaved |

## The tutor (💬 on every page)

Ask questions like “what is a chunk again?” by typing or by voice. The tutor is itself a
small RAG system over the lab's own content: lessons, takeaways, review cards, challenge
explanations and a glossary, chunked into ~200 passages with a contextual header each.

- **Offline (default):** BM25 keyword search, boosted towards the level you're on; the answer
  is the best passage, with links back to its level and a “How I found this” trace.
- **Hybrid:** load the meaning model in ⚙ and vector search joins in (RRF fusion). Passage
  vectors are precomputed and int8-quantised (`assets/data/tutor-vectors.json`, ~100 KB).
- **Claude (optional):** paste your own Anthropic API key in ⚙ and `claude-opus-5-5` writes the
  answer from the retrieved passages, with citations.

## Voice

- 🎤 buttons on every text box (explanations, review answers, notes, the tutor) use the
  browser's speech recognition: English (US), English (Philippines) or Filipino/Taglish.
  Works in Chrome, Edge and Safari, not Firefox.
- The tutor can read its answers aloud (on-device speech synthesis).

## Privacy

- Progress, notes and review schedules are stored only in your browser (`localStorage`).
  Export your notes as Markdown from **My notes**.
- **Dictation:** Chrome and Edge send the audio to Google or Microsoft to transcribe it.
- **Claude mode:** your API key stays in this browser (forgotten when the tab closes unless you
  tick “remember”), is never included in progress exports, and is sent only to
  `api.anthropic.com`, together with your question and the retrieved lab passages. This is a
  static site with no server, so use a key with a spend limit and revoke it when you're done.
- The optional live/hybrid mode downloads the embedding model (~34 MB) from Hugging Face
  through the jsDelivr CDN and runs it in your browser.

## Run it locally

No build step: plain HTML, CSS and JavaScript modules.

```bash
python -m http.server 8000      # then open http://localhost:8000
```

(Opening `index.html` directly from disk won't work; browsers block module imports from `file://`.)

## Rebuild the data

`assets/data/lab-data.json` holds the precomputed embeddings, the 2D meaning map and the
reranker scores. To change the corpus, edit `tools/corpus.py` and rebuild:

```bash
pip install -r tools/requirements.txt
node tools/export-kb.mjs        # export the tutor's passages from the lessons
python tools/build_data.py      # embeddings, meaning map, reranker scores, tutor vectors
node tools/check.mjs            # retriever ranks per question, as the site computes them
node tools/check-levels.mjs     # checks the Chunk Lab missions are solvable
node tools/check-tutor.mjs      # what the tutor retrieves for typical questions
```

If you edit a lesson and skip the rebuild, the tutor still works: passages whose text hash no
longer matches are embedded in the browser when hybrid mode is switched on.
