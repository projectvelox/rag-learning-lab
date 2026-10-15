import { entitySearch, firstRelevantRank, metrics, rrf, runConfig, vectorSearch } from "../lib/search.js";
import { card, fmt, h } from "../ui.js";

function fusionLab(el, { data, bm25 }) {
  const pick = h("select", { "aria-label": "Question" }, data.queries.map((q, i) => h("option", { value: i }, q.text)));
  const k = h("input", { type: "range", min: 1, max: 120, value: 60, "aria-label": "RRF k" });
  const kOut = h("output");
  const use = { vector: true, keyword: true, entity: true };
  const toggles = h("div", { class: "row" }, Object.keys(use).map((name) => h("label", { class: "check" },
    h("input", { type: "checkbox", checked: true, onchange: (e) => { use[name] = e.target.checked; run(); } }), ` ${name}`)));
  const table = h("div", { class: "table-wrap" });
  const byId = Object.fromEntries(data.chunks.map((c) => [c.id, c]));

  const run = () => {
    const q = data.queries[+pick.value];
    kOut.textContent = `k = ${k.value}`;
    const lists = {};
    if (use.vector) lists.vector = vectorSearch(q.vec, data.chunks, 10);
    if (use.keyword) lists.keyword = bm25.search(q.text, 10);
    const ent = entitySearch(q.text, data.chunks, 10);
    if (use.entity && ent.length) lists.entity = ent;
    const fused = rrf(lists, +k.value).slice(0, 8);
    const names = Object.keys(lists);
    table.replaceChildren(h("table", { class: "data" },
      h("tr", {}, h("th", {}, "#"), h("th", {}, "Chunk"), names.map((n) => h("th", {}, `${n} rank`)), h("th", {}, "RRF score = Σ 1/(k + rank)")),
      fused.map((r, i) => h("tr", { class: q.answers.includes(r.id) ? "hit" : "" },
        h("td", {}, i + 1),
        h("td", {}, q.answers.includes(r.id) ? "✓ " : "", byId[r.id].section, h("span", { class: "muted" }, ` · ${r.id.split("#")[0]}`)),
        names.map((n) => h("td", {}, r.from[n] ?? "–")),
        h("td", {}, names.filter((n) => r.from[n]).map((n) => `1/(${k.value}+${r.from[n]})`).join(" + "), " = ", h("strong", {}, fmt(r.score, 4)))))),
      ent.length ? null : h("p", { class: "hint" }, "No identifiers in this question, so the entity retriever has nothing to add."));
  };
  [pick, k].forEach((x) => x.addEventListener("input", run));
  el.append(card("Fusion reactor",
    h("p", {}, "Pick a question. Each retriever contributes 1/(k + rank) for every chunk it found; the sums decide the final order. Switch retrievers off, move k, and watch the ✓ answer chunk."),
    h("div", { class: "controls" }, h("label", {}, "Question ", pick), h("label", {}, "k ", k, kOut)), toggles, table,
    h("p", { class: "hint" }, "Small k: the #1 of any single list dominates. Large k: chunks that several retrievers agree on rise.")));
  pick.value = 7;
  run();
}

function overall({ data, bm25 }) {
  const m = {};
  for (const c of ["vector", "keyword", "hybrid"]) m[c] = metrics(data.queries.map((q) => firstRelevantRank(runConfig(c, q, data, bm25), q.answers))).mrr;
  return m;
}

export default {
  id: "fusion", num: 4, icon: "⚛️", title: "Fusion", tagline: "Hybrid search and Reciprocal Rank Fusion",
  badge: { icon: "⚛️", name: "Fusion Engineer" },
  problem: `<p>You now have two good detectives with two different top-10 lists. Merge them, but their scores aren't comparable: BM25 says <em>7.31</em>, cosine says <em>0.82</em>. Adding them is meaningless; picking one list throws away the other's strengths.</p>`,
  idea: `<p><strong>Reciprocal Rank Fusion (RRF)</strong> ignores the scores and uses only <strong>ranks</strong>. Each list gives every chunk it found a vote of <strong>1 / (k + rank)</strong>; add the votes up. With the usual k = 60, rank 1 is worth 1/61 ≈ 0.0164 and rank 3 is worth 1/63 ≈ 0.0159, so a chunk that <em>several</em> retrievers like beats one that a single retriever loves.</p>
    <p>A third detective helps with identifiers: an <strong>entity</strong> matcher that normalises “CU50110”, “codeunit 50110” and “Codeunit 50110” to the same thing before matching.</p>
    <p>Running several retrievers and fusing them is called <strong>hybrid search</strong>. It's what managed search services do internally too.</p>`,
  lab: (el, ctx) => fusionLab(el, ctx),
  challenges: [
    { id: "rrf-calc", kind: "number", title: "Calculate",
      prompt: "<p>A chunk is ranked <strong>#1</strong> by vector search and <strong>#4</strong> by keyword search. With k = 60, what is its RRF score? (4 decimals)</p>",
      answer: 1 / 61 + 1 / 64, tolerance: 0.0002,
      explain: "1/(60+1) + 1/(60+4) = 0.01639 + 0.01563 = <strong>0.0320</strong>." },
    { id: "consensus", kind: "choice", title: "Predict",
      prompt: "<p>Chunk X is <strong>#1 in one list</strong> and missing from the other. Chunk Y is <strong>#3 in both</strong>. Which ranks higher after RRF with k = 60?</p>",
      options: [{ v: "x", label: "X (a #1 is a #1)" }, { v: "y", label: "Y (agreement wins)" }, { v: "tie", label: "They tie" }],
      answer: "y",
      explain: "X: 1/61 = 0.0164. Y: 1/63 + 1/63 = 0.0317. Agreement between retrievers that fail in <em>different</em> ways is strong evidence, and RRF rewards it." },
    { id: "why-ranks", kind: "choice", title: "Apply it",
      prompt: "<p>Why fuse by rank instead of adding the raw scores?</p>",
      options: [
        { v: "scale", label: "BM25 and cosine scores are on different, incomparable scales" },
        { v: "speed", label: "Ranks are faster to compute" },
        { v: "privacy", label: "Scores contain private information" },
      ],
      answer: "scale",
      explain: "BM25 is unbounded and depends on the query; cosine sits between −1 and 1. Adding them lets whichever has the bigger numbers win. Ranks put every retriever on the same footing with no calibration." },
    { id: "alias", kind: "choice", title: "Apply it",
      prompt: "<p>A developer searches <strong>“What does CU50110 do?”</strong> but the document says <strong>“Codeunit 50110”</strong>. Which retriever rescues this?</p>",
      options: [{ v: "kw", label: "Keyword: it's an exact code" }, { v: "ent", label: "Entity matcher: it normalises CU50110 to Codeunit 50110" }, { v: "none", label: "None; the user must retype it" }],
      answer: "ent",
      explain: "To BM25, “cu50110” and “codeunit 50110” share no tokens. The vector model sees two short, code-like strings. Normalising identifiers into one canonical entity is cheap and fixes a whole class of misses in Business Central-style docs." },
    { id: "hybrid-wins", kind: "choice", title: "Predict",
      prompt: "<p>Across all 10 preset questions, how does <strong>hybrid</strong> (vector + keyword + entity, fused with RRF) compare with each retriever alone, by MRR?</p>",
      options: [{ v: "beats", label: "Beats both" }, { v: "between", label: "Lands between them" }, { v: "worse", label: "Worse than the best single one" }],
      answer: (ctx) => { const m = overall(ctx); return m.hybrid > Math.max(m.vector, m.keyword) ? "beats" : m.hybrid >= Math.min(m.vector, m.keyword) ? "between" : "worse"; },
      explain: (ctx) => { const m = overall(ctx); return `MRR: vector ${fmt(m.vector)}, keyword ${fmt(m.keyword)}, hybrid <strong>${fmt(m.hybrid)}</strong>. Each retriever misses different questions (Level 3), so where one fails the other usually still ranks the answer high, and fusion keeps it near the top. That's the whole argument for hybrid search.`; } },
  ],
  explain: {
    prompt: "Explain Reciprocal Rank Fusion to someone who has never heard of it, and why hybrid search beats either retriever alone.",
    model: "Every retriever ranks the chunks; RRF gives each chunk 1/(k + rank) from every list it appears in and adds them up, so it never compares raw scores that live on different scales. Chunks that several retrievers rank highly float to the top. Because keyword search and vector search fail on different questions, combining them recovers most of each one's misses.",
  },
  takeaways: [
    "Hybrid search = several retrievers (vector, keyword, entity) fused into one ranking.",
    "RRF: score = Σ 1/(k + rank). Uses ranks only, so no score calibration is needed.",
    "Agreement between retrievers beats a single retriever's #1.",
    "Normalising identifiers (CU50110 = Codeunit 50110) is a cheap, high-value retriever for technical docs.",
  ],
  cards: [
    { id: "rrf", q: "Write the RRF formula and say why it uses ranks.", a: "score(chunk) = Σ over retrievers of 1/(k + rank), k ≈ 60. Ranks, because raw scores from BM25 and cosine are on incomparable scales." },
    { id: "hybrid", q: "Why does hybrid search usually beat vector or keyword alone?", a: "They fail on different questions (paraphrases vs exact codes), so fusing them recovers most of each one's misses." },
    { id: "entity", q: "What does an entity retriever add?", a: "It normalises identifiers (CU50110 → Codeunit 50110, T50101 → Table 50101) and matches on them, catching aliases that keyword and vector search miss." },
  ],
};
