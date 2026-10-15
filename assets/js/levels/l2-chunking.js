import { chunk, clean, estimateTokens, orphanRows, STRATEGIES } from "../lib/chunkers.js";
import { card, h } from "../ui.js";

const FOOTER = "CONFIDENTIAL - Lakbay Freight Inc. internal document. Do not distribute.";
const PLACEHOLDERS = ["Click or tap here to enter text.", "Choose an item."];
const FACTS = [
  ["Max length of External Document No.", "|Invoice Number|External Document No.|Up to 35 alphanumeric characters; must be unique|"],
  ["W160 is the 2% services group", "|WHT Prod.|W160|2% supplier of services|"],
  ["The usual WHT group", "Common value will be W160."],
  ["What the global dimensions are", "Global Dimension 1 = Product. Global Dimension 2 = Segment."],
  ["Invoices are posted by hand", "4. The created sales invoice is reviewed and manually posted by the billing team."],
  ["CSV file name check", "Filename: validate that the file name does not already exist in the upload archive."],
  ["Out-of-scope work costs extra", "Additional specifications not covered by this document will incur additional cost."],
];
const TOKEN_LIMIT = 512;
let bus = new EventTarget(); // replaced on every render so old listeners are dropped
let lastResult = null;

function rawUrs(data) {
  const doc = data.docs.find((d) => d.id === "urs");
  const lines = [`# ${doc.title}`, "", `Revision history: 1.0 initial draft. 1.1 removed the sales order flow. ${PLACEHOLDERS[0]} ${PLACEHOLDERS[1]}`, ""];
  data.chunks.filter((c) => c.doc === "urs").forEach((s, i) => {
    lines.push(`## ${s.section}`, "", s.text, "");
    if (i % 2 === 1) lines.push(FOOTER, ""); // every "page" ends with the footer
  });
  return lines.join("\n");
}

const squash = (s) => s.replace(/\s+/g, " ").trim();

function analyse(chunks) {
  const texts = chunks.map((c) => squash(c.text));
  return {
    chunks,
    facts: FACTS.map(([label, fact]) => ({ label, intact: texts.some((t) => t.includes(squash(fact))) })),
    noise: chunks.filter((c) => c.text.includes(FOOTER) || PLACEHOLDERS.some((p) => c.text.includes(p))).length,
    orphans: chunks.reduce((s, c) => s + orphanRows(c.text), 0),
    maxTokens: Math.max(0, ...chunks.map((c) => estimateTokens(c.embed))),
  };
}

function chunkLab(el, data) {
  bus = new EventTarget();
  const raw = rawUrs(data);
  const title = data.docs.find((d) => d.id === "urs").title;
  const strategy = h("select", { "aria-label": "Strategy" }, Object.entries(STRATEGIES).map(([k, v]) => h("option", { value: k, title: v }, k)));
  const size = h("input", { type: "range", min: 150, max: 2400, step: 50, value: 300, "aria-label": "Chunk size" });
  const overlap = h("input", { type: "range", min: 0, max: 300, step: 10, value: 0, "aria-label": "Overlap" });
  const doClean = h("input", { type: "checkbox", "aria-label": "Clean noise first" });
  const sizeOut = h("output"), overlapOut = h("output");
  const desc = h("p", { class: "hint" });
  const stats = h("div", { class: "stat-row" });
  const facts = h("ul", { class: "facts" });
  const list = h("div", { class: "chunk-list" });

  const run = () => {
    const src = doClean.checked ? clean(raw, PLACEHOLDERS).md : raw;
    const res = analyse(chunk(src, strategy.value, { size: +size.value, overlap: +overlap.value, title }));
    lastResult = { ...res, strategy: strategy.value, cleaned: doClean.checked };
    sizeOut.textContent = `${size.value} chars ≈ ${Math.round(+size.value / 4)} tokens`;
    overlapOut.textContent = `${overlap.value} chars`;
    overlap.disabled = !["fixed", "recursive"].includes(strategy.value);
    desc.textContent = STRATEGIES[strategy.value];
    const intact = res.facts.filter((f) => f.intact).length;
    const stat = (label, value, bad) => h("div", { class: `stat ${bad ? "bad" : "good"}` }, h("span", { class: "stat-v" }, value), h("span", { class: "stat-l" }, label));
    stats.replaceChildren(
      stat("chunks", res.chunks.length, false),
      stat("facts intact", `${intact}/${FACTS.length}`, intact < FACTS.length),
      stat("noise chunks", res.noise, res.noise > 0),
      stat("headerless table rows", res.orphans, res.orphans > 0),
      stat("largest chunk (tokens)", res.maxTokens, res.maxTokens > TOKEN_LIMIT),
    );
    facts.replaceChildren(...res.facts.map((f) => h("li", { class: f.intact ? "ok" : "bad" }, f.intact ? "✓ " : "✗ split: ", f.label)));
    list.replaceChildren(...res.chunks.map((c, i) => {
      const noisy = c.text.includes(FOOTER) || PLACEHOLDERS.some((p) => c.text.includes(p));
      const tokens = estimateTokens(c.embed);
      return h("article", { class: `chunk c${i % 6} ${noisy ? "noisy" : ""}` },
        h("header", {}, h("strong", {}, `#${i + 1}`), ` ${c.text.length} chars · ~${tokens} tokens`,
          c.section ? h("span", { class: "sec" }, ` · ${c.section}`) : null,
          noisy ? h("span", { class: "tag bad" }, "noise") : null,
          orphanRows(c.text) ? h("span", { class: "tag bad" }, "rows without header") : null,
          tokens > TOKEN_LIMIT ? h("span", { class: "tag bad" }, "truncated by model") : null),
        h("pre", {}, c.embed));
    }));
    bus.dispatchEvent(new Event("change"));
  };
  [strategy, size, overlap, doClean].forEach((x) => x.addEventListener("input", run));
  el.append(card("Chunk Lab",
    h("p", {}, "This is the raw requirements spec, as a parser would hand it over: a confidentiality footer at the end of every page and Word placeholders in the revision history. Cut it up and watch what survives."),
    h("div", { class: "controls" },
      h("label", {}, "Strategy ", strategy),
      h("label", {}, "Chunk size ", size, sizeOut),
      h("label", {}, "Overlap ", overlap, overlapOut),
      h("label", { class: "check" }, doClean, " Clean noise first (drop repeated footers and placeholders)")),
    desc, stats,
    h("details", { open: true }, h("summary", {}, "Fact tracker: is each fact still inside one chunk?"), facts),
    h("details", {}, h("summary", {}, "Show the chunks (the text that gets embedded)"), list)));
  run();
}

function mission(id, title, goal, check) {
  return {
    id, kind: "custom", title: `Mission: ${title}`,
    render(box, ctx, done, prior) {
      const status = h("p", { class: "mission-status" });
      const update = () => {
        if (prior || ctx.levelState.challenges[id]) { status.className = "mission-status good"; status.textContent = "✓ Mission complete."; return; }
        if (lastResult && check(lastResult)) { done(true); status.className = "mission-status good"; status.textContent = "✓ Mission complete."; }
        else { status.className = "mission-status"; status.textContent = "○ Not yet. Adjust the Chunk Lab above."; }
      };
      bus.addEventListener("change", update);
      box.append(h("p", { html: goal }), status);
      update();
    },
  };
}

// --------------------------------------------------------------------------- Chunk Ninja

const ATOMS = [
  { t: "## Line Field Mapping", kind: "heading", topic: "lines" },
  { t: "|TMS field|ERP field|Rule|", kind: "thead", topic: "lines", table: "L" },
  { t: "|Qty|Quantity|Must be greater than zero|", kind: "row", topic: "lines", table: "L" },
  { t: "|UOM|Unit of Measure Code|Must match the item's base unit of measure|", kind: "row", topic: "lines", table: "L" },
  { t: "## Tax Posting Groups", kind: "heading", topic: "tax" },
  { t: "|Group|Code|Meaning|", kind: "thead", topic: "tax", table: "T" },
  { t: "|VAT Bus.|CVAT|Customer VAT|", kind: "row", topic: "tax", table: "T" },
  { t: "|WHT Prod.|W160|2% supplier of services|", kind: "row", topic: "tax", table: "T" },
  { t: "Common value will be W160.", kind: "note", topic: "tax", noteFor: 7 },
  { t: "## Dimensions", kind: "heading", topic: "dims" },
  { t: "Global Dimension 1 = Product.", kind: "text", topic: "dims" },
  { t: "Global Dimension 2 = Segment.", kind: "text", topic: "dims" },
];
const NINJA_LIMIT = 200;

function scoreCuts(cuts, repeat) {
  const chunks = [[]];
  ATOMS.forEach((a, i) => {
    if (i > 0 && cuts[i - 1]) chunks.push(repeat[i - 1] && a.table ? [{ ...ATOMS.find((x) => x.table === a.table && x.kind === "thead"), repeated: true }] : []);
    chunks[chunks.length - 1].push({ ...a, i });
  });
  const issues = [];
  chunks.forEach((c, n) => {
    const label = `Chunk ${n + 1}`;
    const topics = new Set(c.map((a) => a.topic));
    if (topics.size > 1) issues.push([20 * (topics.size - 1), `${label} mixes ${topics.size} topics; its vector becomes a blur of all of them.`]);
    const len = c.reduce((s, a) => s + a.t.length + 1, 0);
    if (len > NINJA_LIMIT) issues.push([20, `${label} is ${len} characters, over the ${NINJA_LIMIT}-character limit.`]);
    if (c[c.length - 1].kind === "heading") issues.push([15, `${label} ends with a heading cut off from its content.`]);
    const rows = c.filter((a) => a.kind === "row");
    if (rows.length && !c.some((a) => a.kind === "thead")) issues.push([15, `${label} has table rows without the header row that names the columns.`]);
    if (!c.some((a) => a.kind === "heading" || a.kind === "thead")) issues.push([10, `${label} has no heading or table header, so it has no context on its own.`]);
    const note = c.find((a) => a.kind === "note");
    if (note && !c.some((a) => a.i === note.noteFor)) issues.push([15, `${label}: "Common value will be W160." is separated from the W160 row it explains.`]);
  });
  return { chunks, issues, score: Math.max(0, 100 - issues.reduce((s, [p]) => s + p, 0)) };
}

const ninja = {
  id: "ninja", kind: "custom", title: "Chunk Ninja",
  render(box, ctx, done, prior) {
    const cuts = Array(ATOMS.length - 1).fill(false);
    const repeat = Array(ATOMS.length - 1).fill(false);
    const view = h("div", { class: "ninja" });
    const result = h("div", { class: "feedback", "aria-live": "polite" });
    const draw = () => {
      let n = 0;
      view.replaceChildren();
      ATOMS.forEach((a, i) => {
        view.append(h("div", { class: `atom k-${a.kind} c${n % 6}` }, a.t));
        if (i === ATOMS.length - 1) return;
        const inTable = a.table && ATOMS[i + 1].table === a.table;
        const btn = h("button", { class: `cut ${cuts[i] ? "on" : ""}`, "aria-pressed": cuts[i], title: "Toggle a cut here",
          onclick: () => { cuts[i] = !cuts[i]; if (!cuts[i]) repeat[i] = false; draw(); } }, cuts[i] ? "✂ cut" : "· · ·");
        const rep = inTable && cuts[i] ? h("label", { class: "repeat" }, h("input", { type: "checkbox", checked: repeat[i] || null,
          onchange: (e) => { repeat[i] = e.target.checked; } }), " repeat the table header below") : null;
        view.append(h("div", { class: "cut-row" }, btn, rep));
        if (cuts[i]) n++;
      });
    };
    const check = h("button", { class: "btn primary", onclick: () => {
      const r = scoreCuts(cuts, repeat);
      result.className = `feedback ${r.score >= 85 ? "good" : "bad"}`;
      result.replaceChildren(h("p", {}, h("strong", {}, `Score ${r.score}/100`), ` · ${r.chunks.length} chunks. `, r.score >= 85 ? "Clean cuts." : "Pass mark is 85."),
        r.issues.length ? h("ul", {}, r.issues.map(([p, t]) => h("li", {}, `−${p} ${t}`))) : h("p", {}, "No issues: each chunk is one topic, complete, with its heading, and under the limit."));
      done(r.score >= 85);
    } }, "Check my cuts");
    box.append(h("p", { html: `Click the dotted lines to cut this passage into chunks (limit ${NINJA_LIMIT} characters each). Aim for chunks a reader could understand <em>on their own</em>. Inside a table you can choose to repeat the header row.` }),
      view, h("div", { class: "row" }, check, prior ? h("span", { class: "hint" }, prior.ok ? "You passed this already; play again for practice." : "Scored already; try again for practice.") : null), result);
    draw();
  },
};

export default {
  id: "chunking", num: 2, icon: "✂️", title: "Cutting documents", tagline: "Chunking strategies",
  badge: { icon: "✂️", name: "Chunk Ninja" },
  problem: `<p>The spec has eight sections: field mappings, tax codes, dimensions, CSV checks… Embed it as <strong>one</strong> vector and that vector is an average of eight topics: it matches every question a little and none of them well.</p>
    <p>Cut it every 300 characters instead and the row <em>“External Document No. — Up to 35 alphanumeric characters”</em> may be sliced in half. No chunk contains the whole fact, so no search can find it. And the confidentiality footer printed on every page becomes chunks of its own.</p>`,
  idea: `<p>You never retrieve documents; you retrieve <strong>chunks</strong>. A good chunk is about <strong>one topic</strong>, contains <strong>whole facts</strong>, carries enough context to make sense <strong>on its own</strong>, and fits the embedding model's input limit (512 tokens here; roughly 4 characters per token). Longer text is silently truncated.</p>
    <ul><li><strong>Fixed</strong>: every N characters, with some overlap so facts near a boundary appear twice. Simple, structure-blind.</li>
    <li><strong>Recursive</strong>: split at paragraphs, then lines, then sentences, until pieces fit; then pack them.</li>
    <li><strong>Sections</strong>: follow the headings. Split long tables by rows and <em>repeat the header row</em>.</li>
    <li><strong>Structure</strong>: sections plus a <strong>contextual header</strong> (“Document: … / Section: …”) on every chunk.</li></ul>
    <p>And <strong>clean before you cut</strong>: repeated footers and form placeholders are noise that ends up in your vectors.</p>`,
  lab: (el, ctx) => chunkLab(el, ctx.data),
  challenges: [
    { id: "one-vector", kind: "choice", title: "Predict",
      prompt: "<p>You embed the entire eight-section spec as <strong>one</strong> vector, then ask “What is the usual withholding tax group?”. What happens?</p>",
      options: [
        { v: "exact", label: "It finds the W160 line exactly" },
        { v: "weak", label: "The document matches weakly; its vector is an average of eight topics" },
        { v: "error", label: "The model throws an error" },
      ],
      answer: "weak",
      explain: "One vector for many topics points somewhere in the middle of all of them. Worse, the model only reads the first 512 tokens, so later sections are not in the vector at all. Even if this document is returned, you still need to find the line inside it." },
    mission("m-clean", "remove the noise", "In the Chunk Lab, reach <strong>0 noise chunks</strong>. Notice which setting does it, and how much of the spec the footer took up.",
      (r) => r.noise === 0),
    mission("m-fixed", "fixed size, nothing broken", "Using the <strong>fixed</strong> strategy with noise cleaned, get <strong>all 7 facts intact</strong>. Hint: overlap exists for exactly this.",
      (r) => r.strategy === "fixed" && r.cleaned && r.facts.every((f) => f.intact)),
    mission("m-structure", "structure-aware", "Using <strong>structure</strong> with noise cleaned: all facts intact, <strong>0 headerless table rows</strong>, and the largest chunk under <strong>140 tokens</strong>.",
      (r) => r.strategy === "structure" && r.cleaned && r.facts.every((f) => f.intact) && r.orphans === 0 && r.maxTokens < 140),
    ninja,
    { id: "header-row", kind: "choice", title: "Apply it",
      prompt: "<p>Why repeat a table's header row in every piece when a long table is split?</p>",
      options: [
        { v: "size", label: "To keep the chunks the same size" },
        { v: "meaning", label: "A row like |Qty|Quantity|Must be greater than zero| is meaningless without its column names" },
        { v: "search", label: "Keyword search needs every chunk to start with a table" },
      ],
      answer: "meaning",
      explain: "Rows only mean something together with their columns. Without the header, neither the embedding model nor the LLM reading the chunk knows that “Qty” is a TMS field and “Must be greater than zero” is a rule." },
    { id: "context-header", kind: "choice", title: "Apply it",
      prompt: "<p>What does the contextual header (“Document: URS … / Section: Tax Posting Groups”) add to a chunk?</p>",
      options: [
        { v: "context", label: "Where the chunk came from, so it makes sense on its own" },
        { v: "speed", label: "Faster embedding" },
        { v: "security", label: "Access control" },
      ],
      answer: "context",
      explain: "A chunk saying “Common value will be W160.” is ambiguous on its own. With the document and section in front of it, both the reranker and the LLM know what it is about. In the real POC this header did little for plain vector search but helped a lot once a reranker read it (Level 5)." },
  ],
  explain: {
    prompt: "Why does the way you cut a document change what search can find? Describe one failure you produced in the Chunk Lab and how you fixed it.",
    model: "Search can only return chunks, so a fact that was cut in half, buried in a chunk about five other topics, or truncated past the model's token limit is effectively gone. Fixed-size chunks at 300 characters split the External Document No. row and the footer created noise chunks; cleaning first, adding overlap, or cutting along sections with the table header repeated kept every fact whole.",
  },
  takeaways: [
    "You retrieve chunks, not documents. A chunk should be one topic, whole facts, and under the model's token limit.",
    "Clean before you cut: repeated footers and placeholders become chunks that match everything.",
    "Follow the document's structure; when a table is split, repeat its header row.",
    "A contextual header (document + section) makes each chunk understandable on its own.",
    "There is no universal best chunk size. Measure it (Level 8).",
  ],
  cards: [
    { id: "good-chunk", q: "What four properties make a good chunk?", a: "One topic; whole facts (nothing cut in half); enough context to stand alone; fits the embedding model's token limit (512 for bge-small)." },
    { id: "overlap", q: "What is chunk overlap for, and what does it cost?", a: "Text near a boundary is repeated in both neighbouring chunks, so facts cut at the edge still appear whole once. Cost: more chunks and duplicated text." },
    { id: "clean", q: "Why clean documents before chunking?", a: "Repeated footers, page numbers and form placeholders become their own chunks (or pollute real ones), and that noise matches many queries." },
    { id: "strategies", q: "Fixed vs structure-aware chunking: what's the difference?", a: "Fixed cuts every N characters regardless of meaning. Structure-aware follows headings and tables (header repeated) and can prefix a contextual header." },
  ],
};
