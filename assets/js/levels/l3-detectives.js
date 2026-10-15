import * as live from "../lib/live.js";
import { firstRelevantRank, tokenize, vectorSearch } from "../lib/search.js";
import { card, fmt, h, toast } from "../ui.js";

const LESSONS = {
  w160: "“W160” is a rare token that appears in exactly one chunk, so BM25 gives it a high weight (IDF) and nails it. To the embedding model it's a short character pattern that looks like every other table of codes, so the right chunk only reaches #{v}.",
  licence: "The document says “license … expires”; the question says “licence … lapse”. Zero shared words means a BM25 score of zero: keyword search returns nothing useful. The embedding model knows licence ≈ license and lapse ≈ expire.",
  validated: "“Validated” is not “validation” to a word matcher, and “go-live” matched the word “live” in an unrelated chunk about dimensions. The vector understands the question is about who signed off production.",
  codeunit: "“Codeunit” and “50110” are rare, exact terms: keyword search finds the objects table immediately. The vector sees a question about code and ranks a different code table first.",
  dim1: "Both nail it: the question shares rare words (“Global Dimension”, “live”) with the answer <em>and</em> means the same thing. Easy questions like this one tell you very little about which retriever is better.",
};

function resultList(results, data, answers, extra) {
  const byId = Object.fromEntries(data.chunks.map((c) => [c.id, c]));
  const docTitle = Object.fromEntries(data.docs.map((d) => [d.id, d.title]));
  if (!results.length) return h("p", { class: "empty" }, "No results. No chunk shares a single word with the query.");
  return h("ol", { class: "results" }, results.slice(0, 5).map((r) => {
    const c = byId[r.id];
    const hit = answers?.includes(r.id);
    return h("li", { class: hit ? "hit" : "" },
      h("div", { class: "res-head" }, hit ? h("span", { class: "tag good" }, "✓ answer") : null,
        h("strong", {}, c.section), h("span", { class: "muted" }, ` · ${docTitle[c.doc]}`)),
      h("div", { class: "res-meta" }, `score ${fmt(r.score)}`, extra ? extra(r) : null),
      h("div", { class: "snippet" }, c.text.replace(/\|/g, " ").replace(/\s+/g, " ").slice(0, 130), "…"));
  }));
}

function detectives(el, ctx) {
  const { data, bm25 } = ctx;
  const input = h("input", { type: "text", placeholder: "Type a question, or pick one below", "aria-label": "Search query" });
  const chips = h("div", { class: "chips" }, data.queries.map((q) => h("button", { class: "chip-btn", onclick: () => { input.value = q.text; run(q); } }, q.text)));
  const kwCol = h("div", { class: "col" });
  const vecCol = h("div", { class: "col" });
  const idf = h("div", { class: "idf" });
  const liveBtn = h("button", { class: "btn small", onclick: async () => {
    liveBtn.disabled = true;
    try { await live.load((p) => { liveBtn.textContent = `Downloading model… ${p}%`; }); liveBtn.textContent = "Live model ready ✓"; run(); }
    catch (e) { liveBtn.disabled = false; liveBtn.textContent = "Load the live model"; toast(`Live model unavailable: ${e.message}`, "warn"); }
  } }, "Load the live model (34 MB) to vector-search any text");

  const run = async (preset) => {
    const text = input.value.trim();
    if (!text) return;
    const q = preset || data.queries.find((x) => x.text === text);
    const kw = bm25.search(text, 10);
    const terms = [...new Set(tokenize(text))];
    idf.replaceChildren(h("p", { class: "eyebrow" }, "How rare is each query word? (IDF: higher = rarer = counts more)"),
      terms.length ? h("div", { class: "idf-bars" }, terms.map((t) => {
        const v = bm25.idf(t);
        const inCorpus = bm25.df.get(t) || 0;
        return h("div", { class: "idf-bar" }, h("span", { class: "term" }, t),
          h("span", { class: "bar", style: { width: `${Math.min(100, v * 30)}%` } }),
          h("span", { class: "muted" }, inCorpus ? `${fmt(v, 2)} · in ${inCorpus} chunk${inCorpus > 1 ? "s" : ""}` : "not in any chunk"));
      })) : h("p", { class: "muted" }, "Only stop-words; nothing to match."));
    kwCol.replaceChildren(h("h3", {}, "🔎 Keyword Ken (BM25)"), resultList(kw, data, q?.answers, (r) => h("span", { class: "muted" }, ` · matched: ${r.matched.join(", ")}`)));
    let vec = null;
    if (q) vec = vectorSearch(q.vec, data.chunks, 10);
    else if (live.isReady()) {
      const [v] = await live.embed([data.queryPrefix + text]);
      vec = vectorSearch(v, data.chunks, 10);
    }
    vecCol.replaceChildren(h("h3", {}, "🧭 Vector Vera (embeddings)"),
      vec ? resultList(vec, data, q?.answers) : h("div", { class: "empty" }, h("p", {}, "Vector search needs the question's vector. Pick a preset question, or:"), liveBtn));
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  el.append(card("Two detectives, same case",
    h("p", {}, "Both search the same 27 chunks. Ken counts matching words, weighting rare words heavily. Vera compares meaning. Free text works instantly for Ken; Vera needs the question embedded (preset questions are precomputed)."),
    h("div", { class: "row" }, input, h("button", { class: "btn primary", onclick: () => run() }, "Search")),
    chips, idf, h("div", { class: "two-col" }, kwCol, vecCol)));
  input.value = data.queries[2].text;
  run(data.queries[2]);
}

const winner = (id) => ({
  id: `win-${id}`, kind: "choice", title: "Who finds it first?",
  prompt: ({ data }) => `<p>Question: <span class="quote">${data.queries.find((q) => q.id === id).text}</span></p><p>Which detective puts the correct chunk at <strong>#1</strong>? Predict before you search it in the lab.</p>`,
  options: [
    { v: "vector", label: "🧭 Vector Vera" }, { v: "keyword", label: "🔎 Keyword Ken" },
    { v: "both", label: "Both at #1" }, { v: "neither", label: "Neither" },
  ],
  answer: (ctx) => {
    const { v, k } = ranks(ctx, id);
    return v === 1 && k === 1 ? "both" : v === 1 ? "vector" : k === 1 ? "keyword" : "neither";
  },
  explain: (ctx) => {
    const { v, k } = ranks(ctx, id);
    return `Vector: #${v ?? "– (not in top 10)"} · Keyword: #${k ?? "– (not in top 10)"}. ${LESSONS[id].replace("{v}", v)}`;
  },
});

function ranks({ data, bm25 }, id) {
  const q = data.queries.find((x) => x.id === id);
  return {
    v: firstRelevantRank(vectorSearch(q.vec, data.chunks, 10), q.answers),
    k: firstRelevantRank(bm25.search(q.text, 10), q.answers),
  };
}

export default {
  id: "detectives", num: 3, icon: "🔎", title: "Two detectives", tagline: "Keyword search (BM25) vs vector search",
  badge: { icon: "🔎", name: "Detective" },
  problem: `<p>Search the knowledge base for <em>W160</em>. Vector search returns a table of field rules: it “feels” similar. The exact tax-code row sits further down.</p>
    <p>Now search <em>“Which licence is about to lapse?”</em>. A word-matching search returns nothing: the document says <em>license</em> and <em>expires</em>. Each method fails where the other one shines.</p>`,
  idea: `<p><strong>Keyword search (BM25)</strong> scores a chunk by how often it contains the query's words, with two twists: rare words count far more than common ones (<strong>IDF</strong>: “W160” appears in one chunk, “invoice” in dozens), and long chunks don't win just by being long.</p>
    <p><strong>Vector search</strong> compares meaning (Level 1): great with paraphrases and synonyms, weak with exact codes, numbers and names.</p>
    <p>Analogy: Ken reads every page for the exact words you said; Vera understood what you meant but doesn't remember exact numbers. You want both on the case.</p>`,
  lab: (el, ctx) => detectives(el, ctx),
  challenges: [...["w160", "licence", "validated", "codeunit", "dim1"].map(winner),
    { id: "idf", kind: "choice", title: "Apply it",
      prompt: "<p>Why does BM25 give “W160” more weight than “invoice”?</p>",
      options: [
        { v: "rare", label: "Because it appears in far fewer chunks (higher IDF)" },
        { v: "caps", label: "Because it is in capital letters" },
        { v: "first", label: "Because it is the first word of the query" },
      ],
      answer: "rare",
      explain: "Inverse document frequency: a word that appears in almost every chunk tells you nothing about which chunk is right; a word that appears in one chunk is a strong signal. That is why exact codes are keyword search's strength." }],
  explain: {
    prompt: "When does keyword search beat vector search, and when is it the other way round? Give one example of each from the lab.",
    model: "Keyword search wins on exact, rare terms like codes and object numbers (W160, Codeunit 50110), because rare words weigh the most and the match is exact. Vector search wins when the question uses different words for the same meaning (licence/lapse vs license/expires, validated vs validation), where keyword search scores zero. Their failures are different, which is the case for combining them.",
  },
  takeaways: [
    "BM25 scores word matches, weighting rare words (high IDF) far above common ones.",
    "Keyword search: exact codes, numbers and names; blind to synonyms, spelling variants and word forms.",
    "Vector search: meaning and paraphrase; weak on exact identifiers.",
    "Easy questions (shared words and same meaning) don't tell retrievers apart. Test with hard ones.",
  ],
  cards: [
    { id: "bm25", q: "In one sentence, how does BM25 score a chunk?", a: "By how often it contains the query's words, weighting rare words (high IDF) much more than common ones, and normalising for chunk length." },
    { id: "kw-wins", q: "Give two kinds of query where keyword search beats vector search.", a: "Exact codes and identifiers (W160, Codeunit 50110), names, numbers and error messages." },
    { id: "vec-wins", q: "Give two kinds of query where vector search beats keyword search.", a: "Paraphrases and synonyms (approve vs review, lapse vs expire), spelling variants (licence/license) and different word forms (validated/validation)." },
  ],
};
