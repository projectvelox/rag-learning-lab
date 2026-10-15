import { h } from "../ui.js";

const STAGES = [
  ["detect", "Detect new, changed and deleted files"],
  ["parse", "Parse (PDF/DOCX → text with headings and tables)"],
  ["clean", "Clean (footers, placeholders, table of contents)"],
  ["guard", "Classify and guard (type, client, date; reject what doesn't belong)"],
  ["chunk", "Chunk (structure-aware, contextual header)"],
  ["embed", "Embed and index (vectors + keyword index + metadata)"],
  ["retrieve", "Retrieve (hybrid: vector + keyword + entity, fused)"],
  ["rerank", "Rerank (cross-encoder on the top 20)"],
  ["answer", "Answer with citations (sources + dates + relations)"],
];
// Order constraints; clean and guard may swap, everything else follows the data.
const BEFORE = [["detect", "parse"], ["parse", "clean"], ["parse", "guard"], ["clean", "chunk"], ["guard", "chunk"],
  ["chunk", "embed"], ["embed", "retrieve"], ["retrieve", "rerank"], ["rerank", "answer"]];

const pipeline = {
  id: "pipeline", kind: "custom", title: "Assemble the pipeline",
  render(box, ctx, done, prior) {
    let order = [5, 2, 8, 0, 6, 3, 1, 7, 4].map((i) => STAGES[i]);
    const list = h("ol", { class: "judge" });
    const result = h("div", { class: "feedback", "aria-live": "polite" });
    const draw = () => list.replaceChildren(...order.map(([, label], i) => h("li", {},
      h("div", { class: "judge-btns" },
        h("button", { class: "btn tiny", disabled: i === 0, "aria-label": "Move up", onclick: () => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(); } }, "↑"),
        h("button", { class: "btn tiny", disabled: i === order.length - 1, "aria-label": "Move down", onclick: () => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(); } }, "↓")),
      h("span", {}, label))));
    const check = h("button", { class: "btn primary", onclick: () => {
      const pos = Object.fromEntries(order.map(([id], i) => [id, i]));
      const broken = BEFORE.filter(([a, b]) => pos[a] > pos[b]);
      const name = (id) => STAGES.find((s) => s[0] === id)[1].split(" (")[0];
      result.className = `feedback ${broken.length ? "bad" : "good"}`;
      result.replaceChildren(broken.length
        ? h("div", {}, h("strong", {}, `${broken.length} ordering problem${broken.length > 1 ? "s" : ""}: `), h("ul", {}, broken.map(([a, b]) => h("li", {}, `“${name(a)}” has to happen before “${name(b)}”.`))))
        : h("p", {}, h("strong", {}, "Correct. "), "And around all of it runs the loop from Level 8: evaluate on golden questions, change one thing, measure again."));
      if (!prior) { done(!broken.length); prior = true; }
    } }, "Check order");
    box.append(h("p", {}, "Put the stages in the order a document travels, from a new file to a cited answer."), list, h("div", { class: "row" }, check), result);
    draw();
  },
};

const incident = (id, symptom, options, answer, explain) => ({ id, kind: "choice", title: "Incident", prompt: `<p class="quote">${symptom}</p><p>Which fix?</p>`, options, answer, explain });

export default {
  id: "boss", num: "boss", icon: "🐉", title: "The pipeline dragon", tagline: "Everything at once: assemble it, then debug it",
  badge: { icon: "🏛️", name: "RAG Architect" },
  problem: `<p>The knowledge base is live and the incident reports are coming in. Every one of them is a lesson from an earlier level, in disguise. Mixing them up on purpose is what makes this stick: in real life the bug report never says which level it belongs to.</p>`,
  challenges: [
    pipeline,
    incident("i-footer", "“Half my questions return ‘CONFIDENTIAL – internal document. Do not distribute.’ as the top result.”",
      [{ v: "clean", label: "Clean: drop lines repeated on many pages before chunking" }, { v: "model", label: "Use a bigger embedding model" }, { v: "k", label: "Lower the RRF k" }], "clean",
      "Level 2. The footer became its own chunks, and they match everything a little."),
    incident("i-code", "“Searching W160 returns a JSON sample instead of the tax-code table.”",
      [{ v: "hybrid", label: "Add keyword (BM25) and entity retrieval, fuse with RRF" }, { v: "size", label: "Make chunks bigger" }, { v: "prompt", label: "Tell the LLM to try harder" }], "hybrid",
      "Levels 3–4. Exact codes are keyword search's strength and vector search's weakness."),
    incident("i-client", "“A question about Lakbay was answered from another client's handover form.”",
      [{ v: "guard", label: "Check the client from content at ingestion; separate index or enforced filter per client" }, { v: "rename", label: "Ask people to name files correctly" }, { v: "rerank", label: "Add a reranker" }], "guard",
      "Level 7. File names lie. Client isolation is enforced by content checks and index boundaries, not conventions."),
    incident("i-parser", "“We fixed the PDF parser last week, but answers still show the garbled text.”",
      [{ v: "fingerprint", label: "Include the parser version in the index fingerprint so a pipeline change re-processes files" }, { v: "cache", label: "Clear the browser cache" }, { v: "wait", label: "Wait for the files to change" }], "fingerprint",
      "Level 7. The files' hashes didn't change, so incremental ingestion skipped them. The pipeline needs its own fingerprint."),
    incident("i-stale", "“The bot says Global Dimension 1 is Product. It's been DEPT since 2026.”",
      [{ v: "relations", label: "Pass dates and ‘updates’ relations to the answer step; prefer the current source and mention the old one" }, { v: "delete", label: "Delete the 2021 URS" }, { v: "rerank", label: "Add a reranker" }], "relations",
      "Level 6. Both chunks are relevant; only metadata and relations say which is current. Deleting the URS would lose everything it is still the authority on."),
    incident("i-rows", "“Retrieved chunks look like ‘|Qty|Quantity|Must be greater than zero|’ and the LLM can't tell what the columns mean.”",
      [{ v: "header", label: "Structure-aware chunking: split tables by rows and repeat the header" }, { v: "overlap", label: "Increase overlap" }, { v: "temp", label: "Lower the LLM temperature" }], "header",
      "Level 2. Rows without their header row have no meaning, for the embedding model or the LLM."),
    incident("i-measure", "“We changed the chunk size. Some people say it's better, some say it's worse.”",
      [{ v: "eval", label: "Run the golden set on both settings and compare per question" }, { v: "vote", label: "Take a team vote" }, { v: "revert", label: "Revert, to be safe" }], "eval",
      "Level 8. Without a score, it's opinions. With 29 questions, also check whether the difference is bigger than one or two questions."),
  ],
  explain: {
    prompt: "Final explanation: describe the whole journey of a document, from a new file in SharePoint to a cited answer, and the one thing at each stage that most often goes wrong.",
    model: "A watcher notices the new file and hashes it; it's parsed into text with its headings and tables, cleaned of footers and placeholders, classified and checked to belong to the right client, then cut into structure-aware chunks with a contextual header, embedded and indexed with its metadata and relations. A question runs hybrid retrieval, a reranker orders the top candidates, and the answer step writes a cited answer that prefers current sources. What goes wrong: lost text in parsing, noise from cleaning, the wrong client, split facts in chunking, codes in vector search, stale facts at answer time. A golden set measures every change.",
  },
  takeaways: [
    "Detect → parse → clean → guard → chunk → embed/index → retrieve → rerank → answer, with evaluation around all of it.",
    "Most quality problems are decided before the vector database is involved.",
    "Every fix is a hypothesis until the golden set says otherwise.",
  ],
  cards: [
    { id: "order", q: "Name the pipeline stages in order, from new file to answer.", a: "Detect change → parse → clean → classify & guard → chunk → embed & index → retrieve (hybrid) → rerank → answer with citations; evaluation wraps it all." },
    { id: "where", q: "Where are most retrieval-quality problems decided?", a: "Upstream: parsing, cleaning and chunking. If the fact isn't intact in a chunk, no search can find it." },
  ],
};
