import { runConfig } from "../lib/search.js";
import { card, fmt, h } from "../ui.js";

function shuffled(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function judgeBoard(container, ctx, queryId, onSubmit) {
  const { data, bm25 } = ctx;
  const q = data.queries.find((x) => x.id === queryId);
  const byId = Object.fromEntries(data.chunks.map((c) => [c.id, c]));
  const candidates = runConfig("hybrid", q, data, bm25).slice(0, 5).map((r) => r.id);
  let order = shuffled(candidates, queryId.length * 7 + 3);
  const list = h("ol", { class: "judge" });
  const reveal = h("div", { class: "judge-reveal", "aria-live": "polite" });
  const draw = () => {
    list.replaceChildren(...order.map((id, i) => h("li", {},
      h("div", { class: "judge-btns" },
        h("button", { class: "btn tiny", disabled: i === 0, "aria-label": "Move up", onclick: () => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(); } }, "↑"),
        h("button", { class: "btn tiny", disabled: i === order.length - 1, "aria-label": "Move down", onclick: () => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(); } }, "↓")),
      h("div", {}, h("strong", {}, byId[id].section), h("span", { class: "muted" }, ` · ${id.split("#")[0]}`),
        h("div", { class: "snippet" }, byId[id].text.replace(/\|/g, " ").replace(/\s+/g, " ").slice(0, 160))))));
  };
  const btn = h("button", { class: "btn primary", onclick: () => {
    const model = [...candidates].sort((a, b) => q.rerank[b] - q.rerank[a]);
    const mark = (id) => (q.answers.includes(id) ? " ✓" : "");
    reveal.replaceChildren(h("div", { class: "two-col" },
      h("div", {}, h("h4", {}, "Your order"), h("ol", {}, order.map((id) => h("li", {}, byId[id].section + mark(id))))),
      h("div", {}, h("h4", {}, "Cross-encoder's order (score)"), h("ol", {}, model.map((id) => h("li", {}, `${byId[id].section}${mark(id)} `, h("span", { class: "muted" }, `(${fmt(q.rerank[id], 2)})`)))))),
    h("p", { class: "hint" }, "✓ = the chunk that actually answers the question. Cross-encoder scores are raw relevance scores: only their order matters."));
    onSubmit?.(q.answers.includes(order[0]), q.answers.includes(model[0]));
  } }, "Lock in my order and reveal the judge");
  container.append(h("p", {}, "Question: ", h("span", { class: "quote" }, q.text)),
    h("p", { class: "hint" }, "These are hybrid search's top 5, shuffled. Order them best answer first."), list, h("div", { class: "row" }, btn), reveal);
  draw();
}

function judgeLab(el, ctx) {
  const pick = h("select", { "aria-label": "Question" }, ctx.data.queries.map((q) => h("option", { value: q.id }, q.text)));
  const board = h("div");
  const show = () => { board.replaceChildren(); judgeBoard(board, ctx, pick.value); };
  pick.addEventListener("input", show);
  el.append(
    card("Two ways to compare a question with a chunk", h("div", { class: "two-col diagram" },
      h("div", { class: "box" }, h("h4", {}, "Bi-encoder (embeddings)"),
        h("p", {}, "question → vector"), h("p", {}, "chunk → vector (computed once, stored)"), h("p", {}, "compare the two arrows"),
        h("p", { class: "tag good" }, "fast · precomputable · approximate")),
      h("div", { class: "box" }, h("h4", {}, "Cross-encoder (reranker)"),
        h("p", {}, "[question + chunk] read together → one relevance score"), h("p", {}, "must run again for every question × chunk"),
        h("p", { class: "tag warn" }, "slow · can't precompute · accurate")))),
    card("You are the judge (practice)", h("p", {}, "Practice on any question. The challenge below scores one specific round."), h("label", {}, "Question ", pick), board));
  pick.value = "csv-name";
  show();
}

export default {
  id: "rerank", num: 5, icon: "⚖️", title: "The careful judge", tagline: "Reranking with a cross-encoder",
  badge: { icon: "⚖️", name: "Judge" },
  problem: `<p>Hybrid search gets the right chunk into the top 10, but sometimes at #4. The answer step usually reads only the top few chunks, so the user gets an answer built mostly from the wrong ones.</p>
    <p>The embedding model never actually read the question and the chunk <em>together</em>. It compared two arrows that were computed separately.</p>`,
  idea: `<p>A <strong>cross-encoder</strong> (reranker) reads the question and one chunk side by side and outputs how well the chunk answers it. That is far more accurate than comparing two precomputed vectors, but it can't be precomputed: every question needs a fresh pass over every candidate.</p>
    <p>So you use both: retrieve <strong>20–50 candidates cheaply</strong> (hybrid), let the reranker <strong>re-order</strong> them, keep the top 5. Analogy: a keyword filter shortlists résumés; an interviewer ranks the shortlist.</p>`,
  lab: (el, ctx) => judgeLab(el, ctx),
  challenges: [
    { id: "judge-round", kind: "custom", title: "Judge this round",
      render(box, ctx, done, prior) {
        const fb = h("div", { class: "feedback", "aria-live": "polite" });
        judgeBoard(box, ctx, "validated", (youRight, modelRight) => {
          if (!prior) done(youRight);
          prior = true;
          fb.className = `feedback ${youRight ? "good" : "bad"}`;
          fb.replaceChildren(h("strong", {}, youRight ? "Your #1 is the answer. " : "Your #1 isn't the answer. "),
            modelRight ? "The cross-encoder also put it first: reading “who validated” next to “Production validation was performed by…” makes the match obvious, even though hybrid search had it at #2." : "Note the cross-encoder isn't perfect either.");
        });
        box.append(fb);
      } },
    { id: "why-not-all", kind: "choice", title: "Apply it",
      prompt: "<p>The reranker is more accurate. Why not run it over all 1,000,000 chunks instead of the top 20?</p>",
      options: [
        { v: "cost", label: "It needs a full model pass per (question, chunk) pair at query time; a million passes per question is far too slow" },
        { v: "limit", label: "Cross-encoders only accept 20 inputs" },
        { v: "worse", label: "It gets less accurate with more chunks" },
      ],
      answer: "cost",
      explain: "Chunk vectors are computed once at ingestion; the reranker's work can't be. Rerank only what cheap retrieval already shortlisted." },
    { id: "latency", kind: "number", title: "Calculate",
      prompt: "<p>Reranking takes about <strong>60 ms per candidate</strong> on a laptop CPU. How many <strong>seconds</strong> to rerank 20 candidates?</p>",
      answer: 1.2, tolerance: 0.01, unit: "seconds",
      explain: "20 × 60 ms = 1,200 ms = <strong>1.2 s</strong>. Acceptable for a chat answer, too slow for a search-as-you-type box. Rerank depth is a latency budget." },
    { id: "header-helps", kind: "choice", title: "Apply it",
      prompt: "<p>On real project documents, adding the contextual header (“Document: … / Section: …”) did almost nothing for plain vector search but clearly improved results once a reranker was added. Why?</p>",
      options: [
        { v: "reads", label: "The cross-encoder reads the header together with the question, so it knows which document and section the text comes from" },
        { v: "longer", label: "Longer chunks always score higher" },
        { v: "keyword", label: "The header adds keywords for BM25 only" },
      ],
      answer: "reads",
      explain: "The same header is prepended to every chunk of a document, which barely moves the vectors. The reranker, reading question and chunk together, can use “Section: Validation and Acceptance” as evidence." },
    { id: "ceiling", kind: "choice", title: "Apply it",
      prompt: "<p>The reranker can only be as good as…</p>",
      options: [
        { v: "candidates", label: "the candidates the first-stage retrieval gives it" },
        { v: "llm", label: "the LLM that writes the answer" },
        { v: "gpu", label: "the GPU it runs on" },
      ],
      answer: "candidates",
      explain: "If the right chunk isn't in the top 20, no reranker can bring it back. First-stage recall (hybrid search) sets the ceiling; reranking improves the order within it." },
  ],
  explain: {
    prompt: "Explain the difference between a bi-encoder and a cross-encoder, and why retrieval is done in two stages.",
    model: "A bi-encoder embeds the question and each chunk separately, so chunk vectors are computed once and comparison is a fast dot product, but the model never sees the two together. A cross-encoder reads the question and chunk together and scores the fit: much more accurate, but it has to run per pair at query time. So we shortlist 20 to 50 candidates cheaply with hybrid search and let the cross-encoder re-order only those.",
  },
  takeaways: [
    "Bi-encoder: separate vectors, precomputed, fast, approximate. Cross-encoder: reads both together, slow, accurate.",
    "Two stages: cheap retrieval for recall (top 20–50), reranker for precision (top 5).",
    "The reranker can't recover what stage one missed.",
    "Rerank depth is a latency budget (≈ 60 ms per candidate on CPU).",
  ],
  cards: [
    { id: "bi-cross", q: "Bi-encoder vs cross-encoder: what's the difference?", a: "Bi-encoder embeds question and chunk separately (precomputable, fast). Cross-encoder reads them together and outputs a relevance score (accurate, must run per pair at query time)." },
    { id: "two-stage", q: "Why is retrieval done in two stages?", a: "Stage 1 (hybrid) cheaply finds 20–50 candidates for recall; stage 2 (reranker) re-orders only those for precision, because reranking everything is far too slow." },
    { id: "ceiling", q: "What limits how good a reranker can be?", a: "The candidates from stage one. If the answer chunk isn't shortlisted, reranking can't bring it back." },
  ],
};
