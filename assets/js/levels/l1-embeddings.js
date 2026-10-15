import * as live from "../lib/live.js";
import { card, fmt, h, toast } from "../ui.js";

const GROUP_LABELS = {
  billing: "Billing", licence: "Licence", auth: "Authentication", chunking: "Chunking",
  codes: "Codes", dimensions: "Dimensions", other: "Off-topic",
};

const PAIR_LESSONS = {
  paraphrase: "Small embedding models lean hard on shared words. “The invoice was …” appears in both, so the sentence with the <em>wrong</em> meaning wins over the true paraphrase. Paraphrases are not guaranteed to be closest, which is one reason real systems add keyword search and a reranker (Levels 3–5).",
  negation: "Negation barely moves the vector. “Posted” and “not posted” are opposite facts, yet their arrows point almost the same way. Similarity tells you two texts are <em>about</em> the same thing, never that a statement is true.",
  codes: "To the model, codes are character patterns. W160 and W161 look alike, so they land close together, even though they are different tax codes. What W160 <em>means</em> is far away. Exact codes need keyword search (Level 3).",
  dimension: "Meaning won this time, but look at the margin: the sentence stating the <em>opposite</em> fact still scores very high. Vectors find the topic; they cannot tell you which fact is current. That is what dates and relationships are for (Level 6).",
  tagalog: "This model was trained on English. The Tagalog sentence means the same thing, yet it scores lower than an English sentence with a different meaning. If your notes or chats are Taglish, you need a multilingual embedding model.",
};

function meaningMap(el, data) {
  const W = 640, H = 420, P = 36;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "map");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Two-dimensional map of sentence embeddings");
  const pt = (s) => [P + s.x * (W - 2 * P), H - (P + s.y * (H - 2 * P))];
  const NS = "http://www.w3.org/2000/svg";
  const lines = document.createElementNS(NS, "g");
  const dots = document.createElementNS(NS, "g");
  svg.append(lines, dots);
  const panel = h("div", { class: "neighbors" }, h("p", { class: "hint" }, "Click a dot or a sentence to see its nearest neighbours."));
  const list = h("div", { class: "sentence-list" });

  const select = (i) => {
    const sims = data.sim[i].map((s, j) => [s, j]).filter(([, j]) => j !== i).sort((a, b) => b[0] - a[0]);
    lines.replaceChildren();
    const [x0, y0] = pt(data.sentences[i]);
    sims.slice(0, 4).forEach(([, j]) => {
      const [x1, y1] = pt(data.sentences[j]);
      const ln = document.createElementNS(NS, "line");
      Object.entries({ x1: x0, y1: y0, x2: x1, y2: y1, class: "nb-line" }).forEach(([k, v]) => ln.setAttribute(k, v));
      lines.append(ln);
    });
    dots.querySelectorAll("circle").forEach((c, j) => c.classList.toggle("sel", j === i));
    list.querySelectorAll("button").forEach((b, j) => b.classList.toggle("sel", j === i));
    const row = ([s, j]) => h("li", {}, h("span", { class: "score" }, fmt(s)), " ", data.sentences[j].text);
    panel.replaceChildren(
      h("p", { class: "eyebrow" }, "Selected"), h("p", { class: "selected-sentence" }, data.sentences[i].text),
      h("p", { class: "eyebrow" }, "Closest (cosine similarity, from the real 384-number vectors)"), h("ol", {}, sims.slice(0, 5).map(row)),
      h("p", { class: "eyebrow" }, "Farthest"), h("ol", {}, sims.slice(-2).reverse().map(row)),
    );
  };

  const placed = []; // label boxes, to nudge overlapping labels apart
  data.sentences.forEach((s, i) => {
    const [x, y] = pt(s);
    let ly = y + 4;
    const lw = Math.min(s.text.length, 26) * 5.4;
    const flip = s.x > 0.62; // keep labels on the right-hand side inside the map
    const lx0 = flip ? x - 10 - lw : x + 10;
    for (let tries = 0; tries < 4 && placed.some((b) => Math.abs(b.y - ly) < 11 && lx0 < b.x1 && lx0 + lw > b.x0); tries++) ly += 11;
    placed.push({ x0: lx0, x1: lx0 + lw, y: ly });
    const c = document.createElementNS(NS, "circle");
    Object.entries({ cx: x, cy: y, r: 7, class: `dot g-${s.group}`, tabindex: -1 }).forEach(([k, v]) => c.setAttribute(k, v));
    const t = document.createElementNS(NS, "title");
    t.textContent = s.text;
    c.append(t);
    c.addEventListener("click", () => select(i));
    const label = document.createElementNS(NS, "text");
    Object.entries({ x: flip ? x - 10 : x + 10, y: ly, class: "dot-label", "text-anchor": flip ? "end" : "start" }).forEach(([k, v]) => label.setAttribute(k, v));
    label.textContent = s.text.length > 26 ? `${s.text.slice(0, 24)}…` : s.text;
    dots.append(c, label);
    list.append(h("button", { class: `sentence g-${s.group}`, onclick: () => select(i) }, s.text));
  });

  const legend = h("div", { class: "legend" }, Object.entries(GROUP_LABELS).map(([g, l]) => h("span", { class: `legend-item g-${g}` }, l)));
  el.append(card("Meaning map",
    h("p", {}, "Each dot is a sentence. The model turned each one into 384 numbers; this map squashes those 384 dimensions down to 2 (like a shadow), so positions are approximate. The scores on the right are exact."),
    h("p", { class: "hint" }, "Look for the two green Dimensions dots almost on top of each other: “Global Dimension 1 is the department” and “… is the product” state opposite facts, yet the model sees them as near-twins."),
    legend, h("div", { class: "map-wrap" }, svg, panel), h("details", {}, h("summary", {}, "All sentences (keyboard friendly)"), list)));
}

function angleWidget(el) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "-120 -120 240 240");
  svg.setAttribute("class", "angle");
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  svg.append(mk("circle", { cx: 0, cy: 0, r: 100, class: "unit" }));
  const a = mk("line", { x1: 0, y1: 0, class: "arrow a" });
  const b = mk("line", { x1: 0, y1: 0, class: "arrow b" });
  svg.append(a, b);
  const out = h("div", { class: "angle-out" });
  const sA = h("input", { type: "range", min: 0, max: 180, value: 20, "aria-label": "Angle of A" });
  const sB = h("input", { type: "range", min: 0, max: 180, value: 65, "aria-label": "Angle of B" });
  const sL = h("input", { type: "range", min: 20, max: 100, value: 100, "aria-label": "Length of B" });
  const draw = () => {
    const ra = (+sA.value * Math.PI) / 180, rb = (+sB.value * Math.PI) / 180, len = +sL.value;
    a.setAttribute("x2", 100 * Math.cos(ra)); a.setAttribute("y2", -100 * Math.sin(ra));
    b.setAttribute("x2", len * Math.cos(rb)); b.setAttribute("y2", -len * Math.sin(rb));
    const cos = Math.cos(rb - ra);
    out.replaceChildren(
      h("p", {}, "Angle between them: ", h("strong", {}, `${Math.abs(+sB.value - +sA.value)}°`)),
      h("p", {}, "Cosine similarity: ", h("strong", { class: "big-num" }, fmt(cos, 2))),
      h("p", { class: "hint" }, `Length of B: ${(len / 100).toFixed(2)}. Change it: the cosine stays the same.`),
    );
  };
  [sA, sB, sL].forEach((s) => s.addEventListener("input", draw));
  draw();
  el.append(card("Angle, not length",
    h("p", {}, "Cosine similarity is the cosine of the angle between two arrows: 1 = same direction, 0 = unrelated (90°), −1 = opposite. Length doesn't matter. Embedding vectors are normalised to length 1, so cosine is simply the dot product."),
    h("div", { class: "angle-wrap" }, svg, h("div", {},
      h("label", {}, "Arrow A angle ", sA), h("label", {}, "Arrow B angle ", sB), h("label", {}, "Arrow B length ", sL), out))));
}

function liveTester(el, data) {
  const s1 = h("input", { type: "text", value: "The license expires next month.", "aria-label": "Sentence one" });
  const s2 = h("input", { type: "text", value: "Our licence will lapse soon.", "aria-label": "Sentence two" });
  const out = h("div", { class: "live-out", "aria-live": "polite" });
  const btn = h("button", { class: "btn primary", onclick: async () => {
    btn.disabled = true;
    try {
      if (!live.isReady()) out.textContent = "Downloading the model (about 34 MB, only the first time)…";
      await live.load((p) => { out.textContent = `Downloading the model… ${p}%`; });
      out.textContent = "Embedding…";
      const [v1, v2] = await live.embed([s1.value, s2.value]);
      const sim = v1.reduce((s, x, i) => s + x * v2[i], 0);
      out.replaceChildren(h("span", {}, "Cosine similarity: "), h("strong", { class: "big-num" }, fmt(sim)),
        h("p", { class: "hint" }, `First numbers of vector 1: [${v1.slice(0, 5).map((x) => x.toFixed(3)).join(", ")}, …] (384 in total)`));
    } catch (e) {
      out.textContent = `The live model couldn't load here (${e.message}). The precomputed labs still work.`;
      toast("Live model unavailable", "warn");
    } finally { btn.disabled = false; }
  } }, "Compare");
  el.append(card("Live: compare any two sentences (optional)",
    h("p", {}, `Runs ${data.model} in your browser, the same model as the rest of the site. Try: a sentence and its negation; W160 vs W161; English vs Tagalog; two unrelated sentences.`),
    h("div", { class: "stack" }, s1, s2), h("div", { class: "row" }, btn), out));
}

const pairChallenge = (id) => ({
  id: `pair-${id}`, kind: "choice", title: "Predict the model",
  prompt: ({ data }) => {
    const p = data.pairs.find((x) => x.id === id);
    return `<p>Which sentence will the model place <strong>closer</strong> to A?</p><p class="quote">A: ${p.a}</p>`;
  },
  options: [{ v: "b1", label: "" }, { v: "b2", label: "" }],
  answer: ({ data }) => { const p = data.pairs.find((x) => x.id === id); return p.s1 > p.s2 ? "b1" : "b2"; },
  explain: ({ data }) => {
    const p = data.pairs.find((x) => x.id === id);
    return `Scores: “${p.b1}” <strong>${fmt(p.s1)}</strong> vs “${p.b2}” <strong>${fmt(p.s2)}</strong>. ${PAIR_LESSONS[id]}`;
  },
  pairId: id,
});

const level = {
  id: "embeddings", num: 1, icon: "🧭", title: "Meaning has coordinates", tagline: "Embeddings and similarity",
  badge: { icon: "🧭", name: "Navigator" },
  problem: `<p>Someone asks the knowledge base: <em>“Does a person have to approve invoices?”</em> The answer sits in the spec: <em>“The created sales invoice is reviewed and manually posted by the billing team.”</em></p>
    <p>The words that matter don't match: <em>approve</em> ≠ <em>reviewed</em>, <em>person</em> ≠ <em>billing team</em>. The only shared word, <em>invoices</em>, appears in almost every chunk, so a word-matching search can't tell which one answers the question. We need to compare <strong>meaning</strong>, not spelling.</p>`,
  idea: `<p>An <strong>embedding model</strong> reads a text and outputs a list of numbers (384 for the model used here). Think of them as coordinates in a “meaning space”: texts about similar things land near each other, whatever words they use.</p>
    <p>To compare two texts, compare the <strong>direction</strong> of their vectors: <strong>cosine similarity</strong> is 1 for the same direction and near 0 for unrelated. Search then becomes: turn the question into a vector, return the chunks whose vectors point the same way.</p>
    <p>The catch: “similar” means <em>similar topic and wording</em>, not <em>same fact</em>. This level is about learning where that intuition breaks.</p>`,
  lab: (el, ctx) => { meaningMap(el, ctx.data); angleWidget(el); liveTester(el, ctx.data); },
  challenges: [
    ...["paraphrase", "negation", "codes", "dimension", "tagalog"].map(pairChallenge),
    { id: "model-swap", kind: "choice", title: "Apply it",
      prompt: "<p>You stored 10,000 chunk vectors made with model A. You switch to a better model B. What happens to the old vectors?</p>",
      options: [
        { v: "keep", label: "Keep them; only new chunks use model B" },
        { v: "reembed", label: "Re-embed every chunk with model B" },
        { v: "average", label: "Average the old and new vectors" },
      ],
      answer: "reembed",
      explain: "Each model has its own meaning space; a question embedded with model B compared against chunks from model A is like comparing GPS coordinates with street addresses. Changing the model means re-embedding everything, which is why the real pipeline stores the model name with the index and caches vectors by (model, text)." },
  ],
  explain: {
    prompt: "Explain to a teammate what an embedding is, how two texts are compared, and one thing similarity is bad at. Use an example from this level.",
    model: "An embedding model turns a text into a list of numbers so that texts about the same thing end up close together. We compare two texts by the angle between their vectors (cosine similarity), not by shared words, so “approve” can match “reviewed”. But similarity measures topic and wording, not truth: “posted” and “not posted” score about the same, and codes like W160 and W161 look nearly identical to the model.",
  },
  takeaways: [
    "An embedding is a list of numbers that places text in meaning space; similar topics land close together.",
    "Cosine similarity compares direction; with normalised vectors it is just the dot product.",
    "Similarity is not truth: negation, codes, contradicting facts and other languages trip it up.",
    "Vectors from different models are not comparable. New model = re-embed everything.",
  ],
  cards: [
    { id: "what", q: "What does an embedding model output for a piece of text?", a: "A fixed-length list of numbers (a vector; 384 for bge-small) that positions the text in a meaning space where similar topics are close." },
    { id: "cosine", q: "Why compare embeddings with cosine similarity?", a: "It compares direction (topic) and ignores length. With normalised vectors it equals the dot product. Unlike word overlap, it matches paraphrases." },
    { id: "weak", q: "Name three things vector similarity is bad at.", a: "Negation (posted vs not posted), exact codes (W160 vs W161), telling which of two contradicting facts is current, and other languages for an English-only model." },
    { id: "swap", q: "You switch to a better embedding model. What must happen to stored chunks?", a: "Re-embed all of them. Each model has its own vector space; mixing models makes similarity meaningless." },
  ],
};

// Fill the option labels from the data once it is available.
level.prepare = (data) => {
  level.challenges.forEach((c) => {
    if (!c.pairId) return;
    const p = data.pairs.find((x) => x.id === c.pairId);
    c.options = [{ v: "b1", label: `B1: ${p.b1}` }, { v: "b2", label: `B2: ${p.b2}` }];
  });
};

export default level;
