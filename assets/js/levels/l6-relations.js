import { rrf, vectorSearch } from "../lib/search.js";
import { card, h } from "../ui.js";

const TYPES = {
  implements: "a design/build that implements a requirement",
  updates: "a newer document that revises facts in an older one",
  details: "expands on part of another document",
  accepts: "a sign-off that accepts a deliverable",
  amends: "a change request that modifies a requirement",
  duplicate_of: "a byte-identical copy",
};
const CLUES = {
  urs: "The original requirements, signed in 2021.",
  design: "Describes how the integration was built to deliver the URS requirements.",
  fieldmap: "“The 2021 URS value 'Product' is stale.”",
  guide: "Spells out the SOAP request and response described in the design document.",
  readme: "“This replaces the sandbox endpoint shown in the integration guide.” · “Since September 2026 the TMS sends two dimensions” (the design document said none).",
  signoff: "“Supporting document: Technical Design Document.”",
};
const LABEL = { contract: "contract", business_process: "business process", project_doc: "project doc" };

function hybrid(q, data, bm25, filter) {
  const keep = (r) => filter(data.chunks.find((c) => c.id === r.id));
  return rrf({ vector: vectorSearch(q.vec, data.chunks, 27).filter(keep).slice(0, 10), keyword: bm25.search(q.text, 27).filter(keep).slice(0, 10) });
}

function evidence(el, { data, bm25 }) {
  const q = data.queries.find((x) => x.id === "dim1");
  const docs = Object.fromEntries(data.docs.map((d) => [d.id, d]));
  const byId = Object.fromEntries(data.chunks.map((c) => [c.id, c]));
  const top = hybrid(q, data, bm25, () => true).slice(0, 8).filter((r) => /Global Dimension 1/.test(byId[r.id].text));
  el.append(card("Two relevant chunks, two different answers",
    h("p", {}, "Question: ", h("span", { class: "quote" }, q.text)),
    h("div", { class: "evidence" }, top.map((r) => {
      const c = byId[r.id];
      const d = docs[c.doc];
      return h("article", { class: "ev" }, h("header", {}, h("strong", {}, d.title), h("span", { class: "tag" }, LABEL[d.type]), h("span", { class: "tag" }, d.date)),
        h("p", {}, c.text));
    })),
    h("p", {}, "Both chunks are about exactly this question, so search did its job. Which one is ", h("em", {}, "true today"), " is not something similarity can tell you. You need each document's ", h("strong", {}, "date"), ", ", h("strong", {}, "type"), " and ", h("strong", {}, "how it relates"), " to the others.")));

  const types = Object.keys(LABEL);
  const on = Object.fromEntries(types.map((t) => [t, true]));
  let recent = false;
  const pick = h("select", { "aria-label": "Question" }, data.queries.map((x) => h("option", { value: x.id }, x.text)));
  const out = h("ol", { class: "results" });
  const run = () => {
    const query = data.queries.find((x) => x.id === pick.value);
    const filter = (c) => on[docs[c.doc].type] && (!recent || docs[c.doc].date >= "2026-01-01");
    const res = hybrid(query, data, bm25, filter).slice(0, 4);
    out.replaceChildren(...(res.length ? res.map((r) => {
      const c = byId[r.id];
      return h("li", { class: query.answers.includes(r.id) ? "hit" : "" }, query.answers.includes(r.id) ? "✓ " : "", h("strong", {}, c.section), h("span", { class: "muted" }, ` · ${docs[c.doc].title} · ${docs[c.doc].date}`));
    }) : [h("li", { class: "empty" }, "Nothing left after filtering. A too-strict filter hides the answer completely.")]));
  };
  pick.addEventListener("input", run);
  el.append(card("Metadata filters",
    h("p", {}, "Every chunk carries its document's metadata. Filters narrow the search before similarity even matters, e.g. “contracts only” or “ignore documents older than this year”."),
    h("div", { class: "row" }, types.map((t) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: true, onchange: (e) => { on[t] = e.target.checked; run(); } }), ` ${LABEL[t]}`)),
      h("label", { class: "check" }, h("input", { type: "checkbox", onchange: (e) => { recent = e.target.checked; run(); } }), " only 2026 documents")),
    h("label", {}, "Question ", pick), out));
  pick.value = "auto-post";
  run();
}

const board = {
  id: "board", kind: "custom", title: "Build the relationship board",
  render(box, { data }, done, prior) {
    const docs = data.docs;
    const edges = [];
    const sel = (opts, label) => h("select", { "aria-label": label }, opts.map(([v, t]) => h("option", { value: v }, t)));
    const from = sel(docs.map((d) => [d.id, d.title]), "From");
    const type = sel(Object.keys(TYPES).map((t) => [t, t]), "Relation");
    const to = sel(docs.map((d) => [d.id, d.title]), "To");
    const list = h("ul", { class: "edges" });
    const result = h("div", { class: "feedback", "aria-live": "polite" });
    const key = data.relations.map((r) => `${r.from}|${r.type}|${r.to}`);
    const short = (id) => docs.find((d) => d.id === id).title.split(" - ")[0];
    const draw = () => list.replaceChildren(...edges.map((e, i) => h("li", {},
      `${short(e.from)} `, h("strong", {}, e.type), ` ${short(e.to)} `,
      h("button", { class: "btn tiny", "aria-label": "Remove", onclick: () => { edges.splice(i, 1); draw(); } }, "✕"))));
    const add = h("button", { class: "btn", onclick: () => {
      if (from.value === to.value) return;
      if (!edges.some((e) => e.from === from.value && e.type === type.value && e.to === to.value)) edges.push({ from: from.value, type: type.value, to: to.value });
      draw();
    } }, "Add edge");
    const check = h("button", { class: "btn primary", onclick: () => {
      const keys = edges.map((e) => `${e.from}|${e.type}|${e.to}`);
      const right = keys.filter((k) => key.includes(k)).length;
      const wrong = keys.length - right;
      const ok = right >= 5 && wrong <= 1;
      result.className = `feedback ${ok ? "good" : "bad"}`;
      result.replaceChildren(h("p", {}, h("strong", {}, `${right} of ${key.length} edges found, ${wrong} not in the answer key. `), ok ? "That's a solid board." : "Pass: 5 correct, at most 1 extra."),
        h("details", {}, h("summary", {}, "Show the answer key"), h("ul", {}, data.relations.map((r) => h("li", {}, `${short(r.from)} `, h("strong", {}, r.type), ` ${short(r.to)}`)))));
      if (!prior) { done(ok); prior = true; }
    } }, "Check board");
    box.append(
      h("p", {}, "Read the clue on each document and connect them. Direction matters: “Field Mapping updates URS”."),
      h("div", { class: "doc-cards" }, docs.map((d) => h("div", { class: "doc-card" }, h("strong", {}, d.title), h("div", {}, h("span", { class: "tag" }, LABEL[d.type]), h("span", { class: "tag" }, d.date)), h("p", { class: "muted" }, CLUES[d.id])))),
      h("details", {}, h("summary", {}, "What each relation means"), h("ul", {}, Object.entries(TYPES).map(([t, d]) => h("li", {}, h("strong", {}, t), `: ${d}`)))),
      h("div", { class: "row edge-builder" }, from, type, to, add), list, h("div", { class: "row" }, check), result);
  },
};

const conflict = (id, question, options, answer, explain) => ({ id, kind: "choice", title: "Which source wins?", prompt: `<p>${question}</p>`, options, answer, explain });

export default {
  id: "relations", num: 6, icon: "🕵️", title: "Detective board", tagline: "Metadata and relationships between documents",
  badge: { icon: "🕵️", name: "Stale-fact Slayer" },
  problem: `<p>Ask <em>“Which dimension is Global Dimension 1 in the live system?”</em> and search returns two excellent chunks. The 2021 spec says <strong>Product</strong>. The 2026 field mapping says <strong>DEPT</strong>.</p>
    <p>Both are relevant, and they disagree. An answer built from whichever chunk ranked first is right or wrong by luck. This is the most common way RAG systems give confident, outdated answers.</p>`,
  idea: `<p>Vectors know what a chunk <em>means</em>, not when it was written, what kind of document it came from, or what replaced it. That knowledge lives in two places:</p>
    <ul><li><strong>Metadata</strong> on every document: client, type (contract / business process / project doc), date, version, status. Used to <strong>filter</strong> and to <strong>weigh</strong> sources.</li>
    <li><strong>Relationships</strong> between documents: <em>implements, updates, amends, details, accepts, duplicate_of</em>. Some are detected automatically (identical hash, one document naming another); the important ones come from people who know the project.</li></ul>
    <p>The answer step receives each chunk <em>with</em> its date and relations (“updated by: Field Mapping, 2026-08-20”), so it can choose the current fact and say that the older document disagrees.</p>`,
  lab: (el, ctx) => evidence(el, ctx),
  challenges: [
    board,
    conflict("c-dim1", "Global Dimension 1: the URS (2021-05-18) says <strong>Product</strong>; the field mapping (2026-08-20) says <strong>DEPT</strong>.",
      [{ v: "urs", label: "Product: the signed URS is the contract" }, { v: "fieldmap", label: "DEPT: the field mapping" }, { v: "flag", label: "Can't tell; flag it" }], "fieldmap",
      "The field mapping is newer <em>and</em> explicitly <strong>updates</strong> the URS (“the 2021 URS value 'Product' is stale”). A good answer: “DEPT. The 2021 URS says Product, but the 2026 field mapping corrects it.”"),
    conflict("c-endpoint", "The production endpoint: the integration guide (2026-08-28) shows <code>…/Sandbox_0812/…</code>; the README (2026-09-09) shows <code>…/Production/…</code>.",
      [{ v: "guide", label: "The guide's URL" }, { v: "readme", label: "The README's URL" }, { v: "flag", label: "Can't tell; flag it" }], "readme",
      "The README is newer and says “This replaces the sandbox endpoint shown in the integration guide”: an <strong>updates</strong> edge. The guide's URL was never production."),
    conflict("c-dims", "Does the TMS send dimensions? The design document (2026-09-03) <em>and</em> the field mapping (2026-08-20) say <strong>no</strong>. The README (2026-09-09) says it sends <strong>two</strong> since September 2026.",
      [{ v: "majority", label: "No: two documents against one" }, { v: "readme", label: "Yes, two per line: the README" }, { v: "flag", label: "Can't tell; flag it" }], "readme",
      "Facts aren't a vote. The README is the newest and <strong>updates</strong> the design document on exactly this point. Two older documents agreeing just means they were written before the change."),
    conflict("c-date", "When did it go live? The sign-off's summary says <strong>September 8</strong>; the same sign-off's deployment section says <strong>September 3</strong>.",
      [{ v: "sep8", label: "September 8 (the summary)" }, { v: "sep3", label: "September 3 (the detail)" }, { v: "flag", label: "Flag it: the document contradicts itself" }], "flag",
      "Same document, same date, two values: no date or relation can settle it. The honest answer cites both and says a person needs to confirm. A good system surfaces contradictions instead of hiding them; this one is worth fixing in the source document."),
    { id: "newest", kind: "choice", title: "Apply it",
      prompt: "<p>Why not just always trust the newest document?</p>",
      options: [
        { v: "scope", label: "A newer document may be about something else or silent on this fact; “updates” edges say exactly what was replaced" },
        { v: "fine", label: "You should; newest always wins" },
        { v: "old", label: "Older documents are more trustworthy" },
      ],
      answer: "scope",
      explain: "The sign-off (newest of all) says nothing about dimensions; the URS is still the authority on CSV validations nobody revised. Recency is a tie-breaker; relations tell you what actually changed." },
  ],
  explain: {
    prompt: "Why isn't retrieving the most relevant chunks enough to answer correctly? What extra information fixes it, and where does it come from?",
    model: "Relevance only says a chunk is about the question; two relevant chunks can state different facts because one is outdated. Metadata (document type, date, status) and relationships (this field mapping updates that URS) tell the answer step which source is current. Some relations are detected automatically, like duplicates and one document citing another, but the important ones come from people on the project, and real contradictions should be flagged rather than guessed.",
  },
  takeaways: [
    "Relevant ≠ current. Two relevant chunks can contradict each other.",
    "Metadata (type, date, status, client) filters and weighs sources; too strict a filter hides answers.",
    "Relations (updates, implements, amends, accepts, details, duplicate_of) say what replaced what.",
    "Facts aren't a vote, and newest isn't automatically right. Contradictions get flagged, not guessed.",
  ],
  cards: [
    { id: "relevant", q: "Search returns two relevant chunks that disagree. What does the answer step need to pick the right one?", a: "Each source's metadata (date, type, status) and relationships (e.g. the field mapping updates the URS), so it can prefer the current fact and mention the older claim." },
    { id: "types", q: "Name four relationship types between project documents.", a: "implements, updates, amends, details, accepts, duplicate_of (and references, detected automatically)." },
    { id: "selfcontra", q: "A document contradicts itself (two different dates). What should a good RAG answer do?", a: "Cite both values and say it can't be resolved from the documents; a person should confirm. Never pick one silently." },
  ],
};
