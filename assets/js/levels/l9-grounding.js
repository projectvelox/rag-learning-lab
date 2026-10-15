import { card, h, renderText } from "../ui.js";

const SOURCES = ["readme#Why Drafts", "urs#CR-01 Process", "signoff#Validation and Acceptance", "design#Overview"];
const QUESTION = "Are invoices posted automatically, and who validated the go-live?";
const SENTENCES = [
  { t: "No. Invoices are created as drafts and are never posted automatically.", ok: ["1", "4"], why: "Source 1 says it directly; source 4 says the ERP creates a draft." },
  { t: "The billing team reviews each invoice and posts it manually.", ok: ["2"], why: "Source 2, step 4." },
  { t: "Posting normally happens within 24 hours of the invoice being created.", ok: ["none"], why: "No source mentions timing. This is the classic hallucination: plausible, specific, and invented." },
  { t: "Production validation was performed by Rosa Villanueva on September 10, 2026.", ok: ["3"], why: "Source 3." },
  { t: "Rosa is Lakbay's finance director.", ok: ["none"], why: "Source 3 names her and her company, not her role. Filling in a job title “because it sounds right” is exactly what grounding forbids." },
];

function relationsFor(docId, data) {
  const title = (id) => data.docs.find((d) => d.id === id).title.split(" - ")[0];
  const out = [];
  data.relations.forEach((r) => {
    if (r.from === docId) out.push(`${r.type} ${title(r.to)}`);
    if (r.to === docId) out.push(`${{ updates: "updated by", implements: "implemented by", details: "detailed by", accepts: "accepted by" }[r.type] || r.type} ${title(r.from)}`);
  });
  return out;
}

function anatomy(el, { data }) {
  const byId = Object.fromEntries(data.chunks.map((c) => [c.id, c]));
  const doc = (id) => data.docs.find((d) => d.id === id);
  el.append(card("Anatomy of a grounded request",
    h("p", {}, "This is what the answer step actually sends to the LLM: rules, then each retrieved chunk as its own numbered source with its metadata, then the question."),
    h("div", { class: "anatomy" },
      h("div", { class: "part system" }, h("p", { class: "eyebrow" }, "System rules"),
        h("ul", {}, h("li", {}, "Use only the sources below. Cite the source for every claim."),
          h("li", {}, "If the sources don't contain the answer, say so and name what's missing."),
          h("li", {}, "If sources conflict, prefer the newer one or the one that updates the other, and say the older one disagrees."))),
      SOURCES.map((id, i) => {
        const c = byId[id];
        const d = doc(c.doc);
        const rel = relationsFor(c.doc, data);
        return h("div", { class: "part source" },
          h("p", { class: "eyebrow" }, `Source [${i + 1}] · ${d.title}`),
          h("p", { class: "meta" }, `type: ${d.type} · date: ${d.date} · section: ${c.section}${rel.length ? ` · relations: ${rel.join("; ")}` : ""}`),
          renderText(c.text));
      }),
      h("div", { class: "part question" }, h("p", { class: "eyebrow" }, "Question"), h("p", {}, QUESTION)))));
}

const factCheck = {
  id: "fact-check", kind: "custom", title: "Fact-checker",
  render(box, ctx, done, prior) {
    const picks = SENTENCES.map(() => null);
    const rows = h("div", { class: "fact-rows" });
    const result = h("div", { class: "feedback", "aria-live": "polite" });
    const opts = [["1", "[1]"], ["2", "[2]"], ["3", "[3]"], ["4", "[4]"], ["none", "Not supported"]];
    SENTENCES.forEach((s, i) => {
      const group = h("div", { class: "seg", role: "group", "aria-label": `Sentence ${i + 1}` }, opts.map(([v, label]) => h("button", { class: "seg-btn", onclick: (e) => {
        picks[i] = v;
        group.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget));
      } }, label)));
      rows.append(h("div", { class: "fact-row" }, h("p", {}, h("strong", {}, `${i + 1}. `), s.t), group));
    });
    const check = h("button", { class: "btn primary", onclick: () => {
      if (picks.some((p) => p === null)) { result.className = "feedback bad"; result.textContent = "Mark every sentence first."; return; }
      const marks = SENTENCES.map((s, i) => s.ok.includes(picks[i]));
      const score = marks.filter(Boolean).length;
      result.className = `feedback ${score >= 4 ? "good" : "bad"}`;
      result.replaceChildren(h("p", {}, h("strong", {}, `${score}/5 correct.`)), h("ul", {}, SENTENCES.map((s, i) => h("li", { class: marks[i] ? "ok" : "bad" }, `${marks[i] ? "✓" : "✗"} ${i + 1}: ${s.why}`))));
      if (!prior) { done(score >= 4); prior = true; }
    } }, "Check");
    box.append(h("p", {}, "The model answered the question using the four sources in the lab above. For each sentence, which source supports it, if any?"),
      h("p", { class: "quote" }, QUESTION), rows, h("div", { class: "row" }, check), result);
  },
};

export default {
  id: "grounding", num: 9, icon: "📎", title: "Answer from evidence", tagline: "Grounded answers with citations",
  badge: { icon: "📎", name: "Fact-checker" },
  problem: `<p>Retrieval is done; an LLM now writes the answer. LLMs are fluent gap-fillers: if the sources don't say something, they may still say it, confidently and specifically.</p>
    <p>An answer with one invented sentence is worse than no answer, because nobody can tell which sentence it was.</p>`,
  idea: `<p><strong>Grounding</strong> means the model answers <em>only</em> from the retrieved chunks, and every claim carries a <strong>citation</strong> back to its source, so a reader can check it instead of trusting it.</p>
    <ul><li>Send each chunk as its own numbered source, with its title, date, section and relations.</li>
    <li>Tell the model to say <strong>“the documents don't say”</strong> when they don't, and to name what's missing.</li>
    <li>Use the metadata to resolve conflicts (Level 6) and mention the older claim.</li>
    <li>Check answers: an unsupported sentence is a bug, even when it happens to be true.</li></ul>`,
  lab: (el, ctx) => anatomy(el, ctx),
  challenges: [
    factCheck,
    { id: "missing", kind: "choice", title: "Apply it",
      prompt: "<p>A user asks “What is the payment term for Lakbay invoices?” None of the retrieved sources mention payment terms. What should the answer be?</p>",
      options: [
        { v: "say", label: "Say the documents don't specify it, and suggest where it might be (customer card, contract)" },
        { v: "guess", label: "Give the most common term (30 days) so the user isn't left empty-handed" },
        { v: "nearest", label: "Answer with the closest thing found, e.g. the currency rule" },
      ],
      answer: "say",
      explain: "“I don't know, and here's why” is a correct answer. A guessed “30 days” would be cited to nothing and could end up on an invoice." },
    { id: "conflict", kind: "choice", title: "Apply it",
      prompt: "<p>Two sources disagree: the 2021 URS says Global Dimension 1 = Product; the 2026 field mapping (which updates the URS) says DEPT. Best answer?</p>",
      options: [
        { v: "both", label: "“DEPT [2]. The 2021 URS says Product [1], but the 2026 field mapping corrects it.”" },
        { v: "first", label: "“Product [1].” (it ranked first)" },
        { v: "avoid", label: "“The documents are unclear.”" },
      ],
      answer: "both",
      explain: "Give the current fact, cite both, and make the disagreement visible. Hiding the older claim leaves the reader unable to explain why someone else read “Product”." },
    { id: "blocks", kind: "choice", title: "Apply it",
      prompt: "<p>Why send each retrieved chunk as a separate, numbered source with its own title and date, instead of pasting all the text together?</p>",
      options: [
        { v: "cite", label: "So citations point to an exact source and the model can weigh each source's date and type" },
        { v: "cheap", label: "It's cheaper in tokens" },
        { v: "format", label: "LLMs can't read long text" },
      ],
      answer: "cite",
      explain: "Boundaries make citations precise (“source 3, section Validation and Acceptance”) and let the model use metadata per source. Concatenated text loses both." },
  ],
  explain: {
    prompt: "What does it mean for an answer to be grounded, and how would you catch an answer that isn't?",
    model: "A grounded answer uses only the retrieved sources and cites a source for every claim, says plainly when the sources don't contain the answer, and resolves conflicts using dates and relations while mentioning the older claim. To catch ungrounded answers, check each sentence against its cited source: any sentence with no supporting source, like an invented job title or timeframe, is a defect even if it happens to be true.",
  },
  takeaways: [
    "Grounded = only from the retrieved sources, with a citation for every claim.",
    "“The documents don't say” is a correct answer.",
    "Each chunk goes in as its own source, with title, date, section and relations.",
    "Unsupported sentences are bugs, even when they happen to be true.",
  ],
  cards: [
    { id: "grounded", q: "What makes an answer grounded?", a: "It uses only the retrieved sources, cites a source for each claim, admits when the sources don't contain the answer, and handles conflicts openly." },
    { id: "missing", q: "The sources don't contain the answer. What should the system say?", a: "That the documents don't specify it, what's missing, and where it might be found. Never a plausible guess." },
    { id: "hallucination", q: "How do you spot a hallucination in a RAG answer?", a: "Check each sentence against its cited source; a specific claim with no supporting source (a timeframe, a job title) is invented." },
  ],
};
