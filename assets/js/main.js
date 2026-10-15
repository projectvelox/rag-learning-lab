import { cardsUnlocked, renderLevel } from "./engine.js";
import { BM25 } from "./lib/search.js";
import * as S from "./lib/state.js";
import { $, card, download, h, toast } from "./ui.js";
import l1 from "./levels/l1-embeddings.js";
import l2 from "./levels/l2-chunking.js";
import l3 from "./levels/l3-detectives.js";
import l4 from "./levels/l4-fusion.js";
import l5 from "./levels/l5-rerank.js";
import l6 from "./levels/l6-relations.js";
import l7 from "./levels/l7-gatekeeper.js";
import l8 from "./levels/l8-scoring.js";
import l9 from "./levels/l9-grounding.js";
import boss from "./levels/boss.js";

const LEVELS = [l1, l2, l3, l4, l5, l6, l7, l8, l9, boss];
const app = $("#app");
let ctx = null;

const unlocked = (i) => i === 0 || S.state.settings.unlockAll || S.state.levels[LEVELS[i - 1].id]?.done;

// ------------------------------------------------------------------ header

function renderHeader() {
  const r = S.rank();
  const span = r.next ? r.next - r.floor : 1;
  const progress = r.next ? Math.min(1, (S.state.xp - r.floor) / span) : 1;
  const due = ctx ? cardsUnlocked(LEVELS).filter((c) => S.isDue(c.id)).length : 0;
  $("#hud").replaceChildren(
    h("div", { class: "hud-rank" }, h("span", { class: "rank-name" }, r.name), h("span", { class: "xp" }, `${S.state.xp} XP`)),
    h("div", { class: "xp-bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(progress * 100),
      title: r.next ? `${r.next - S.state.xp} XP to ${r.nextName}` : "Max rank" }, h("span", { style: { width: `${progress * 100}%` } })),
    h("span", { class: "streak", title: "Days in a row with practice" }, `🔥 ${S.streak()}`),
    h("a", { href: "#/review", class: `nav-link ${due ? "has-due" : ""}` }, "Review", due ? h("span", { class: "badge" }, due) : null),
    h("a", { href: "#/notes", class: "nav-link" }, "My notes"),
  );
}

// ------------------------------------------------------------------ views

function home() {
  const doneCount = LEVELS.filter((l) => S.state.levels[l.id]?.done).length;
  const due = cardsUnlocked(LEVELS).filter((c) => S.isDue(c.id)).length;
  const nextLevel = LEVELS.find((l, i) => unlocked(i) && !S.state.levels[l.id]?.done);
  app.replaceChildren(
    h("section", { class: "hero" },
      h("p", { class: "eyebrow" }, "Vectorization & chunking, learned by doing"),
      h("h1", {}, "RAG Learning Lab"),
      h("p", { class: "lede" }, "Ten levels that take you from “what is an embedding?” to debugging a full retrieval pipeline, using one fictional client's project documents. Every number you see comes from a real embedding model."),
      h("div", { class: "row" },
        nextLevel ? h("a", { class: "btn primary", href: `#/level/${nextLevel.id}` }, doneCount ? `Continue: ${nextLevel.title}` : "Start level 1") : h("span", { class: "chip gold" }, "All levels complete 🏛️"),
        h("a", { class: `btn ${due ? "" : "ghost"}`, href: "#/review" }, due ? `Review ${due} card${due > 1 ? "s" : ""}` : "Review deck"))),
    card("How this works",
      h("ol", { class: "method" },
        h("li", {}, h("strong", {}, "Predict, then reveal. "), "Each challenge asks you to commit before you see the answer. Being wrong and then seeing why is how a mental model gets corrected."),
        h("li", {}, h("strong", {}, "Explain it back. "), "Every level ends with you writing the idea in your own words, then comparing with a model explanation. If you can't explain it, you don't have it yet."),
        h("li", {}, h("strong", {}, "Come back for reviews. "), "Finished levels add cards to a review deck that resurfaces them after 1, 3, 7, 16 and 35 days. Spacing is what moves things into long-term memory.")),
      h("p", { class: "hint" }, `Progress, notes and reviews stay in this browser. ${S.canSave() ? "" : "This browser is blocking storage, so progress will reset when you close the tab."}`)),
    h("div", { class: "section-title" }, h("h2", {}, "Quest map"), h("p", {}, `${doneCount} of ${LEVELS.length} complete`)),
    h("ol", { class: "quest" }, LEVELS.map((l, i) => {
      const st = S.state.levels[l.id];
      const open = unlocked(i);
      const inner = [
        h("span", { class: "q-icon", "aria-hidden": "true" }, open ? l.icon : "🔒"),
        h("span", { class: "q-body" },
          h("span", { class: "q-num" }, l.num === "boss" ? "Final boss" : `Level ${l.num}`),
          h("span", { class: "q-title" }, l.title), h("span", { class: "q-tag" }, l.tagline)),
        h("span", { class: "q-status" }, st?.done ? h("span", { class: "stars" }, "★".repeat(st.stars) + "☆".repeat(3 - st.stars)) : open ? (st ? "in progress" : "open") : "locked"),
      ];
      return h("li", { class: `quest-item ${st?.done ? "done" : ""} ${open ? "" : "locked"}` },
        open ? h("a", { href: `#/level/${l.id}` }, inner) : h("div", { "aria-disabled": "true" }, inner));
    })),
    h("p", { class: "hint center" }, "Locked levels open when you finish the one before. Want to skip ahead? Unlock everything in My notes."),
  );
}

function review() {
  const all = cardsUnlocked(LEVELS);
  const queue = all.filter((c) => S.isDue(c.id));
  let done = 0;
  const total = queue.length;
  const stage = h("div", { class: "review-stage" });
  const show = () => {
    if (!all.length) {
      stage.replaceChildren(h("p", {}, "Your deck is empty. Each level you complete adds its cards here."), h("a", { class: "btn primary", href: "#/" }, "Go to the quest map"));
      return;
    }
    if (!queue.length) {
      const next = all.map((c) => S.cardState(c.id).due).sort()[0];
      stage.replaceChildren(h("h2", {}, "All caught up ✓"), h("p", {}, `${all.length} cards in your deck. Next one is due ${next}.`),
        h("p", { class: "hint" }, "Come back then. Short, spaced sessions beat one long cram."));
      return;
    }
    const c = queue[0];
    const answer = h("textarea", { rows: 3, placeholder: "Answer from memory first (typing or saying it out loud both work)…", "aria-label": "Your answer" });
    const back = h("div", { class: "card-back", hidden: true }, h("p", { class: "eyebrow" }, "Answer"), h("p", {}, c.a),
      h("div", { class: "row grade" },
        h("button", { class: "btn bad", onclick: () => grade("again") }, "Didn't know"),
        h("button", { class: "btn", onclick: () => grade("hard") }, "Partly"),
        h("button", { class: "btn good", onclick: () => grade("good") }, "Knew it")));
    const grade = (g) => {
      const st = S.grade(c.id, g);
      queue.shift();
      if (g === "again") queue.push(c); // see it again this session
      else done++;
      toast(g === "again" ? "It'll come back in a minute." : `+5 XP · next review ${st.due}`, g === "again" ? "warn" : "xp");
      show();
    };
    stage.replaceChildren(
      h("p", { class: "eyebrow" }, `${c.level.icon} ${c.level.title} · card ${done + 1} of ${total}`),
      h("h2", { class: "card-q" }, c.q), answer,
      h("div", { class: "row" }, h("button", { class: "btn primary", onclick: (e) => { back.hidden = false; e.currentTarget.hidden = true; } }, "Reveal")),
      back);
  };
  app.replaceChildren(h("header", { class: "level-header" }, h("a", { href: "#/", class: "back" }, "← Quest map"), h("h1", {}, "Review deck"),
    h("p", { class: "tagline" }, "Recall first, then check. Cards you know wait longer before coming back.")), card(null, stage));
  show();
}

function notes() {
  const started = LEVELS.filter((l) => S.state.levels[l.id]);
  const md = () => [
    "# My RAG learning notes", "", `Exported ${S.today()} · ${S.state.xp} XP · ${S.rank().name}`, "",
    ...LEVELS.flatMap((l) => {
      const st = S.state.levels[l.id];
      if (!st?.explain) return [];
      return [`## ${l.num === "boss" ? "Boss" : `Level ${l.num}`}: ${l.title}`, "", `**Prompt:** ${l.explain.prompt}`, "", "**My explanation:**", "", st.explain, "",
        "**Reference explanation:**", "", l.explain.model, "", "**Takeaways:**", "", ...l.takeaways.map((t) => `- ${t.replace(/<[^>]+>/g, "")}`), ""];
    }),
  ].join("\n");
  const fileInput = h("input", { type: "file", accept: "application/json", hidden: true, onchange: async (e) => {
    try { S.importProgress(await e.target.files[0].text()); toast("Progress imported"); route(); }
    catch (err) { toast(err.message, "warn"); }
  } });
  app.replaceChildren(
    h("header", { class: "level-header" }, h("a", { href: "#/", class: "back" }, "← Quest map"), h("h1", {}, "My notes"),
      h("p", { class: "tagline" }, "Your explanations, in your words. Edit them as your understanding grows.")),
    started.length ? null : card(null, h("p", {}, "Nothing yet. Finish the “Explain it back” step in a level and it shows up here.")),
    ...started.map((l) => {
      const st = S.state.levels[l.id];
      const area = h("textarea", { rows: 4, "aria-label": `Notes for ${l.title}`, onchange: (e) => { st.explain = e.target.value; S.save(); toast("Saved", "xp"); } });
      area.value = st.explain;
      return card(`${l.icon} ${l.title}`, h("p", { class: "prompt" }, l.explain.prompt), area,
        h("details", {}, h("summary", {}, "Reference explanation"), h("p", {}, l.explain.model)));
    }),
    card("Keep your learning",
      h("p", {}, "Everything lives in this browser's storage. Export your notes as Markdown to keep them anywhere (a notes app, a private repo), and export progress to move to another browser."),
      h("div", { class: "row wrap" },
        h("button", { class: "btn primary", onclick: () => download(`rag-notes-${S.today()}.md`, md()) }, "Export notes (.md)"),
        h("button", { class: "btn", onclick: () => download(`rag-progress-${S.today()}.json`, S.exportProgress(), "application/json") }, "Export progress (.json)"),
        h("button", { class: "btn", onclick: () => fileInput.click() }, "Import progress"), fileInput),
      h("div", { class: "row wrap" },
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: S.state.settings.unlockAll || null,
          onchange: (e) => { S.state.settings.unlockAll = e.target.checked; S.save(); } }), " Unlock all levels"),
        h("button", { class: "btn bad", onclick: () => { if (confirm("Erase all progress, XP and notes in this browser?")) { S.resetProgress(); toast("Progress reset", "warn"); route(); } } }, "Reset progress"))),
  );
}

// ------------------------------------------------------------------ routing

function route() {
  const [, view, id] = (location.hash || "#/").split("/");
  window.scrollTo(0, 0);
  if (view === "level") {
    const i = LEVELS.findIndex((l) => l.id === id);
    if (i === -1) { location.hash = "#/"; return; }
    if (!unlocked(i)) {
      app.replaceChildren(card("Locked 🔒", h("p", {}, `Finish “${LEVELS[i - 1].title}” first, or unlock everything in My notes.`), h("a", { class: "btn primary", href: `#/level/${LEVELS[i - 1].id}` }, `Go to ${LEVELS[i - 1].title}`)));
    } else {
      renderLevel(app, LEVELS[i], { ...ctx, next: LEVELS[i + 1] });
      document.title = `${LEVELS[i].title} · RAG Learning Lab`;
    }
  } else if (view === "review") { review(); document.title = "Review · RAG Learning Lab"; }
  else if (view === "notes") { notes(); document.title = "My notes · RAG Learning Lab"; }
  else { home(); document.title = "RAG Learning Lab"; }
  renderHeader();
}

function applyTheme() {
  const t = S.state.settings.theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  $("#theme").textContent = { auto: "◐ Auto", light: "☀ Light", dark: "☾ Dark" }[t];
}

async function boot() {
  $("#theme").addEventListener("click", () => {
    const order = ["auto", "light", "dark"];
    S.state.settings.theme = order[(order.indexOf(S.state.settings.theme) + 1) % 3];
    S.save();
    applyTheme();
  });
  applyTheme();
  try {
    const data = await (await fetch("assets/data/lab-data.json")).json();
    LEVELS.forEach((l) => l.prepare?.(data));
    ctx = { data, bm25: new BM25(data.chunks.map((c) => ({ id: c.id, text: c.embed }))) };
  } catch (e) {
    app.replaceChildren(card("Couldn't load the lab data", h("p", {}, `${e.message}. If you opened index.html directly from disk, serve the folder instead: python -m http.server`)));
    return;
  }
  S.onChange(renderHeader);
  window.addEventListener("hashchange", route);
  route();
}

boot();
