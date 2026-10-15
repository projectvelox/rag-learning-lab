import { card, h } from "../ui.js";

const ACTIONS = {
  new: "Index it (new)",
  unchanged: "Skip (unchanged)",
  updated: "Re-process (changed)",
  duplicate: "Link as duplicate",
  reject: "Reject (wrong client)",
  remove: "Remove from index",
};

const EVENTS = [
  { file: "URS_TMS_ERP_v1.1_signed.pdf", where: "SharePoint › Lakbay › Business Process", hash: "a1b2c3d4", index: "not in the index",
    preview: "User Requirement Specification … Lakbay Freight Inc. … CR-01 …", answer: "new",
    why: "Never seen before and it's a Lakbay document: parse, chunk, embed, index." },
  { file: "URS_TMS_ERP_v1.1_signed (1).pdf", where: "Teams › Chat files", hash: "a1b2c3d4", index: "not in the index · but hash a1b2c3d4 is already indexed as the signed URS",
    preview: "User Requirement Specification … Lakbay Freight Inc. … CR-01 …", answer: "duplicate",
    why: "Same bytes, different name and folder. Indexing it again doubles every URS chunk in the results. Record it as duplicate_of the original instead." },
  { file: "Lakbay Sign-Off.docx", where: "OneDrive root", hash: "e9f81a20", index: "not in the index",
    preview: "Handover form. Client Name: Bulalakaw Foods Corp. Activity: POS integration resource transfer and handover…", answer: "reject",
    why: "The filename says Lakbay; the content is another client's handover form. Indexing it would let one client's information answer another client's questions. Check the client from content, never the filename." },
  { file: "Field Mapping Specification.pdf", where: "SharePoint › Lakbay › Project Docs", hash: "77de0119", index: "indexed with hash 77de0119",
    preview: "Field Mapping Specification - TMS to ERP … Confirmations Log …", answer: "unchanged",
    why: "Same hash as the indexed version. Skipping it saves parsing and embedding, and running ingestion twice changes nothing (idempotent)." },
  { file: "Integration README.md", where: "SharePoint › Lakbay › Project Docs", hash: "9c4410ab", index: "indexed with hash 5b0e2f71",
    preview: "Integration README … Dimensions Update: since September 2026 the TMS sends two dimensions…", answer: "updated",
    why: "Known document, new hash: someone edited it. Delete its old chunks and re-chunk/re-embed the new version, or answers go stale." },
  { file: "URS draft v0.9.docx", where: "SharePoint (deleted yesterday)", hash: "-", index: "indexed with hash 4410be02",
    preview: "(file no longer exists)", answer: "remove",
    why: "The source is gone. If its chunks stay, the system keeps answering from a draft nobody can open. Deletions must flow through too." },
  { file: "Technical Design Document.docx", where: "SharePoint › Lakbay › Project Docs", hash: "31c0de55", index: "indexed with hash 31c0de55 · BUT you upgraded the PDF/DOCX parser this morning",
    preview: "Technical Design Document - TMS Billing Integration …", answer: "updated",
    why: "The file didn't change, but your pipeline did. The stored chunks came from the old parser. Make the parser version, chunk settings and embedding model part of the index fingerprint so a pipeline change re-processes everything (an embedding cache keyed by model + text keeps it cheap)." },
  { file: "Kickoff meeting notes.txt", where: "Teams › Lakbay channel", hash: "c0ffee42", index: "not in the index",
    preview: "Notes: Lakbay Freight kickoff. Sabi ni Rosa, kailangan i-review muna bago i-post ang invoice…", answer: "new",
    why: "A new Lakbay document: index it. Note the Taglish: an English-only embedding model will understand it poorly (Level 1). Meeting notes are a document type worth planning for." },
];

const gatekeeper = {
  id: "gate", kind: "custom", title: "The gatekeeper (8 files arrive)",
  render(box, ctx, done, prior) {
    let i = 0;
    let score = 0;
    const stage = h("div", { class: "gate" });
    const log = h("ol", { class: "gate-log" });
    const next = () => {
      if (i >= EVENTS.length) {
        const ok = score >= 7;
        stage.replaceChildren(h("div", { class: `feedback ${ok ? "good" : "bad"}` }, h("strong", {}, `${score}/${EVENTS.length} correct. `), ok ? "The index is clean." : "Pass mark is 7. Read the log below and try again."),
          h("button", { class: "btn", onclick: () => { i = 0; score = 0; log.replaceChildren(); next(); } }, "Play again"));
        if (!prior) { done(ok); prior = true; }
        return;
      }
      const e = EVENTS[i];
      stage.replaceChildren(h("article", { class: "file-card" },
        h("p", { class: "eyebrow" }, `File ${i + 1} of ${EVENTS.length}`),
        h("h4", {}, "📄 ", e.file), h("p", { class: "muted" }, e.where),
        h("dl", {}, h("dt", {}, "Content hash"), h("dd", {}, h("code", {}, e.hash)), h("dt", {}, "Index says"), h("dd", {}, e.index), h("dt", {}, "Content preview"), h("dd", {}, e.preview)),
        h("div", { class: "options" }, Object.entries(ACTIONS).map(([v, label]) => h("button", { class: "option", onclick: () => {
          const ok = v === e.answer;
          if (ok) score++;
          log.prepend(h("li", { class: ok ? "ok" : "bad" }, h("strong", {}, `${e.file}: `), ok ? "✓ " : `✗ you chose “${ACTIONS[v]}”; answer “${ACTIONS[e.answer]}”. `, e.why));
          i++;
          next();
        } }, label)))));
    };
    box.append(h("p", {}, "You are the ingestion agent for the Lakbay Freight knowledge base. Decide what to do with each file. Your index currently holds Lakbay documents only."), stage, log);
    next();
  },
};

export default {
  id: "gatekeeper", num: 7, icon: "🚪", title: "The gatekeeper", tagline: "Continuous, incremental ingestion",
  badge: { icon: "🚪", name: "Gatekeeper" },
  problem: `<p>New files land in SharePoint and Teams every day. Re-embedding everything every night is slow and expensive. Doing nothing makes answers stale. Indexing blindly lets in duplicates and, worse, another client's documents.</p>`,
  idea: `<p>Make ingestion <strong>incremental</strong> and <strong>idempotent</strong> (running it twice changes nothing). For every file, compute a <strong>content hash</strong> (a fingerprint of its bytes) and compare with the index:</p>
    <ul><li>not seen → <strong>new</strong>: parse, clean, chunk, embed, index</li>
    <li>same hash → <strong>unchanged</strong>: skip</li>
    <li>known file, new hash → <strong>updated</strong>: replace its chunks</li>
    <li>gone from the source → <strong>removed</strong>: delete its chunks</li>
    <li>same hash as another indexed file → <strong>duplicate</strong>: link, don't index twice</li>
    <li>content doesn't belong to this client → <strong>reject</strong> / quarantine</li></ul>
    <p>The pipeline itself also has a fingerprint: parser version, chunk settings, embedding model. Change any of them and everything is re-processed.</p>`,
  challenges: [
    gatekeeper,
    { id: "why-hash", kind: "choice", title: "Apply it",
      prompt: "<p>Why decide by content hash instead of file name or modified date?</p>",
      options: [
        { v: "lie", label: "Names and dates lie (copies, renames, re-saves); identical bytes always give the identical hash" },
        { v: "fast", label: "Hashes are shorter to store" },
        { v: "secure", label: "Hashing encrypts the file" },
      ],
      answer: "lie",
      explain: "The duplicate URS had a different name and folder; the misfiled sign-off had the right client in its name and the wrong one in its content. A hash answers “are these the same bytes?” exactly. Content checks answer “whose is this?”." },
    { id: "model-change", kind: "choice", title: "Apply it",
      prompt: "<p>You switch the embedding model. Which documents need re-processing?</p>",
      options: [{ v: "all", label: "All of them" }, { v: "changed", label: "Only files that changed since the last run" }, { v: "none", label: "None; vectors are portable" }],
      answer: "all",
      explain: "Every stored vector belongs to the old model's space (Level 1). The file hashes didn't change, which is exactly why the model name must be part of the index fingerprint." },
    { id: "idempotent", kind: "choice", title: "Apply it",
      prompt: "<p>Ingestion is <strong>idempotent</strong>. What does that guarantee?</p>",
      options: [
        { v: "same", label: "Running it again on unchanged sources leaves the index exactly as it was" },
        { v: "once", label: "It can only run once" },
        { v: "fast", label: "It always finishes in the same time" },
      ],
      answer: "same",
      explain: "So it's safe to run on a timer, after a crash or twice by accident: no duplicate chunks, no wasted embedding." },
  ],
  explain: {
    prompt: "Walk through what an ingestion agent does when a file appears, changes or disappears, and name two ways it protects the index.",
    model: "It hashes each file and compares with the index: new files are parsed, chunked, embedded and indexed; unchanged hashes are skipped; a known file with a new hash has its old chunks replaced; deleted files have their chunks removed. It protects the index by linking byte-identical copies as duplicates instead of indexing them twice, and by checking the client from the content so another client's document is rejected. If the pipeline itself changes (parser, chunking, model) everything is re-processed.",
  },
  takeaways: [
    "Hash the bytes: new / unchanged / updated / removed / duplicate decisions become exact.",
    "Idempotent ingestion is safe to run on a schedule, after crashes, or twice.",
    "Guard client boundaries by reading content, never trusting file names.",
    "The pipeline has a fingerprint too (parser, chunking, model). Change it, re-process; cache embeddings to keep that cheap.",
  ],
  cards: [
    { id: "states", q: "List the six decisions an ingestion agent makes per file.", a: "New (index), unchanged (skip), updated (replace chunks), removed (delete chunks), duplicate (link, don't re-index), reject (wrong client / doesn't belong)." },
    { id: "fingerprint", q: "A file's hash didn't change but you upgraded the parser. Re-process or skip?", a: "Re-process. Parser version, chunk settings and embedding model belong in the index fingerprint; a pipeline change invalidates stored chunks." },
    { id: "guard", q: "How do you stop another client's file from entering a client's index?", a: "Check the client from the document's content (and metadata), never the file name; quarantine anything that doesn't match. Keep a separate index or enforced filter per client." },
  ],
};
