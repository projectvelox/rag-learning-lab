import { firstRelevantRank, metrics, runConfig } from "../lib/search.js";
import { card, fmt, h, pct } from "../ui.js";

const CONFIGS = { vector: "vector", keyword: "keyword", hybrid: "hybrid", rerank: "hybrid + rerank" };

function scoreboard(el, { data, bm25 }) {
  const rows = data.queries.map((q) => ({ q, ranks: Object.fromEntries(Object.keys(CONFIGS).map((c) => [c, firstRelevantRank(runConfig(c, q, data, bm25), q.answers)])) }));
  const m = Object.fromEntries(Object.keys(CONFIGS).map((c) => [c, metrics(rows.map((r) => r.ranks[c]))]));
  const cell = (r) => h("td", { class: r === 1 ? "r1" : r && r <= 5 ? "r5" : "miss" }, r ?? "–");
  el.append(card("Scoreboard: 10 golden questions × 4 configurations",
    h("p", {}, "Each cell is the rank of the first correct chunk (– = not in the top 10). Computed live in your browser from the same data as every other level."),
    h("div", { class: "table-wrap" }, h("table", { class: "data scoreboard" },
      h("tr", {}, h("th", {}, "Question"), Object.values(CONFIGS).map((n) => h("th", {}, n))),
      rows.map((r) => h("tr", {}, h("td", {}, r.q.text), Object.keys(CONFIGS).map((c) => cell(r.ranks[c])))),
      h("tr", { class: "totals" }, h("td", {}, "hit@1"), Object.keys(CONFIGS).map((c) => h("td", {}, pct(m[c].hit1)))),
      h("tr", { class: "totals" }, h("td", {}, "hit@5"), Object.keys(CONFIGS).map((c) => h("td", {}, pct(m[c].hit5)))),
      h("tr", { class: "totals" }, h("td", {}, "MRR"), Object.keys(CONFIGS).map((c) => h("td", {}, h("strong", {}, fmt(m[c].mrr)))))))));

  const inputs = [1, 3, 0, 2, 1].map((v, i) => h("input", { type: "number", min: 0, max: 10, value: v, "aria-label": `Rank for question ${i + 1}` }));
  const out = h("div", { class: "stat-row" });
  const calc = () => {
    const ranks = inputs.map((x) => (+x.value > 0 ? +x.value : null));
    const r = metrics(ranks);
    out.replaceChildren(
      h("div", { class: "stat" }, h("span", { class: "stat-v" }, pct(r.hit1)), h("span", { class: "stat-l" }, "hit@1")),
      h("div", { class: "stat" }, h("span", { class: "stat-v" }, pct(r.hit5)), h("span", { class: "stat-l" }, "hit@5")),
      h("div", { class: "stat" }, h("span", { class: "stat-v" }, fmt(r.mrr)), h("span", { class: "stat-l" }, `MRR = (${ranks.map((x) => (x ? `1/${x}` : "0")).join(" + ")}) / ${ranks.length}`)));
  };
  inputs.forEach((x) => x.addEventListener("input", calc));
  el.append(card("Metric calculator",
    h("p", {}, "Five questions; type the rank of the first correct chunk for each (0 = not found). Watch which metric moves."),
    h("div", { class: "row" }, inputs), out));
  calc();
}

export default {
  id: "scoring", num: 8, icon: "📊", title: "Keeping score", tagline: "Evaluating retrieval",
  badge: { icon: "📊", name: "Scorekeeper" },
  problem: `<p>You changed the chunk size from 1,200 to 800 characters and search “feels better”. Does it? On which questions? Did anything get worse?</p>
    <p>Without a score, every tweak is an opinion, and “improve how documents are chunked and searched” can never be shown.</p>`,
  idea: `<p>Build a <strong>golden set</strong>: real questions, each paired with what a correct result must contain. Run every configuration over it and record the <strong>rank of the first correct chunk</strong>. Then:</p>
    <ul><li><strong>hit@1</strong> / <strong>hit@5</strong>: the share of questions with a correct chunk at #1 / in the top 5.</li>
    <li><strong>MRR</strong> (mean reciprocal rank): average of 1/rank (0 if not found). Rewards putting the answer high.</li></ul>
    <p>Three rules that keep it honest: questions come from <strong>real users</strong>, phrased their way; <strong>small sets are noisy</strong> (with 10 questions one question moves hit@1 by 10 points); and a question that <em>no</em> configuration can answer usually means the fact was lost in <strong>parsing or chunking</strong>, not search.</p>`,
  lab: (el, ctx) => scoreboard(el, ctx),
  challenges: [
    { id: "mrr", kind: "number", title: "Calculate",
      prompt: "<p>Four questions. First correct chunk at ranks <strong>1, 2, not found, 4</strong>. What is the MRR?</p>",
      answer: (1 + 0.5 + 0 + 0.25) / 4, tolerance: 0.001,
      explain: "(1/1 + 1/2 + 0 + 1/4) / 4 = 1.75 / 4 = <strong>0.4375</strong>." },
    { id: "noise", kind: "choice", title: "Judge it",
      prompt: "<p>Config A scores MRR <strong>0.693</strong>, config B <strong>0.672</strong>, on <strong>29</strong> golden questions. What do you conclude?</p>",
      options: [
        { v: "a", label: "A is better; ship it" },
        { v: "noise", label: "Too close to call: one question moves hit rate ~3.4 points. Look at which questions differ and grow the set" },
        { v: "b", label: "B is better because it's simpler" },
      ],
      answer: "noise",
      explain: "These are real numbers from a POC on real project documents. A 0.02 MRR gap is one or two questions. Inspect the per-question ranks; if A only wins on easy questions, it's noise. More (and harder) questions is the fix." },
    { id: "unanswerable", kind: "choice", title: "Diagnose",
      prompt: "<p>“Who wrote the design document?” fails in <strong>every</strong> configuration. You check: no chunk contains the answer. The parsed text says “Author: PaoloReyes” instead of “Paolo Reyes”. Where is the bug?</p>",
      options: [{ v: "parse", label: "Parsing: the PDF table extraction dropped a space" }, { v: "search", label: "Search: needs a better embedding model" }, { v: "question", label: "The question: rewrite it to match" }],
      answer: "parse",
      explain: "This kind of bug happens with real PDFs: table extraction drops the space between two text spans. When the fact isn't inside any chunk, no retriever can find it. Fix the parser, not the question; changing the question to match broken text would hide the bug." },
    { id: "who-writes", kind: "choice", title: "Apply it",
      prompt: "<p>Who should write the golden questions?</p>",
      options: [
        { v: "users", label: "The people who will use the system, in their own words" },
        { v: "copy", label: "You, copying sentences from the documents" },
        { v: "llm", label: "An LLM, from the documents, with no review" },
      ],
      answer: "users",
      explain: "Questions copied from the documents share their exact wording, which flatters keyword search and hides the paraphrase problems real users create. Generated questions are a fine start, but they need human review and real questions added over time." },
    { id: "winner", kind: "choice", title: "Read the scoreboard",
      prompt: "<p>On the scoreboard above, which configuration has the highest MRR?</p>",
      options: Object.entries(CONFIGS).map(([v, label]) => ({ v, label })),
      answer: ({ data, bm25 }) => {
        const scores = Object.keys(CONFIGS).map((c) => [c, metrics(data.queries.map((q) => firstRelevantRank(runConfig(c, q, data, bm25), q.answers))).mrr]);
        return scores.sort((a, b) => b[1] - a[1] || (a[0] === "hybrid" ? -1 : 1))[0][0];
      },
      explain: ({ data, bm25 }) => {
        const s = Object.keys(CONFIGS).map((c) => `${CONFIGS[c]} ${fmt(metrics(data.queries.map((q) => firstRelevantRank(runConfig(c, q, data, bm25), q.answers))).mrr)}`);
        return `${s.join(" · ")}. On a 27-chunk corpus, hybrid already puts almost everything at #1, so the reranker has little room to help (and moves one answer down). On larger corpora the gap usually opens. Measure on <em>your</em> data.`;
      } },
  ],
  explain: {
    prompt: "How would you prove that a change to chunking or search made things better? Include the metrics and one way the measurement can fool you.",
    model: "Keep a golden set of real questions with what a correct result must contain, run the old and new configuration over it, and compare hit@1, hit@5 and MRR, question by question. It can fool you when the set is small (one question is several points), when the questions copy the documents' wording, or when a question is unanswerable because parsing lost the fact. In those cases the score reflects the test, not the system.",
  },
  takeaways: [
    "No score, no improvement. A golden set turns opinions into numbers.",
    "hit@k: answer in the top k? MRR: average 1/rank, rewards ranking it high.",
    "Small sets are noisy; read per-question ranks, not just averages.",
    "Unanswerable in every config = the fact was lost upstream (parsing/chunking).",
    "Golden questions come from real users, in their words.",
  ],
  cards: [
    { id: "metrics", q: "Define hit@5 and MRR.", a: "hit@5: share of questions with a correct chunk in the top 5. MRR: mean of 1/rank of the first correct chunk (0 if not found)." },
    { id: "noise", q: "Config A beats B by 0.02 MRR on 29 questions. Ship A?", a: "Not on that evidence. One question ≈ 3.4 points of hit rate. Inspect per-question differences and grow the golden set." },
    { id: "unans", q: "A question fails in every configuration. What do you check first?", a: "Whether any chunk contains the answer at all. If not, the bug is in parsing or chunking, not search." },
  ],
};
