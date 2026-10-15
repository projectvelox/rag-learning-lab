// Renders one level: problem -> idea -> lab -> predict-then-reveal challenges -> explain it back -> complete.
import { award, level, save, state } from "./lib/state.js";
import { micButton } from "./lib/voice.js";
import { card, h, toast, xpToast } from "./ui.js";

const CORRECT_XP = 20;
const TRY_XP = 5;
const EXPLAIN_XP = 30;
const COMPLETE_XP = 50;

export function starsFor(lv, def) {
  const ids = def.challenges.map((c) => c.id);
  const firstTry = ids.filter((id) => lv.challenges[id]?.ok).length;
  const ratio = ids.length ? firstTry / ids.length : 1;
  return ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1;
}

export function renderLevel(root, def, ctx) {
  const lv = level(def.id);
  const completion = h("section", { class: "card completion" });
  const progress = h("div", { class: "level-progress" });
  const refreshProgress = () => {
    const answered = def.challenges.filter((c) => lv.challenges[c.id]).length;
    progress.replaceChildren(...[
      h("span", { class: `chip ${answered === def.challenges.length ? "ok" : ""}` }, `Challenges ${answered}/${def.challenges.length}`),
      h("span", { class: `chip ${lv.explain.trim().length >= 40 ? "ok" : ""}` }, lv.explain.trim().length >= 40 ? "Explained ✓" : "Explain it back"),
      lv.done ? h("span", { class: "chip gold" }, "★".repeat(lv.stars) + "☆".repeat(3 - lv.stars)) : null,
    ].filter(Boolean));
    renderCompletion();
  };

  const record = (challengeId, ok) => {
    if (lv.challenges[challengeId]) return;
    lv.challenges[challengeId] = { ok };
    save();
    xpToast(award(`${def.id}:${challengeId}`, ok ? CORRECT_XP : TRY_XP), ok ? "nice prediction" : "you tried, now you know");
    refreshProgress();
  };

  const header = h("header", { class: "level-header" },
    h("a", { href: "#/", class: "back" }, "← Quest map"),
    h("p", { class: "eyebrow" }, def.num === "boss" ? "Final boss" : `Level ${def.num}`),
    h("h1", {}, h("span", { class: "level-icon", "aria-hidden": "true" }, def.icon), " ", def.title),
    h("p", { class: "tagline" }, def.tagline),
    progress,
  );

  const levelCtx = { ...ctx, record, levelState: lv };
  const sections = [header];
  if (def.problem) sections.push(card("The problem", h("div", { class: "prose", html: def.problem })));
  if (def.idea) sections.push(card("The idea", h("div", { class: "prose", html: def.idea })));
  if (def.lab) {
    const labWrap = h("div", { class: "lab" });
    sections.push(h("div", { class: "section-title" }, h("h2", {}, "Lab"), h("p", {}, "Play with it. Change things and watch what happens.")), labWrap);
    def.lab(labWrap, levelCtx);
  }

  sections.push(h("div", { class: "section-title" }, h("h2", {}, "Challenges"), h("p", {}, "Commit to an answer before you reveal. A wrong prediction you understand beats a right guess.")));
  def.challenges.forEach((c, i) => sections.push(renderChallenge(c, i + 1, lv, levelCtx, record)));

  // Explain it back: writing it in your own words is what makes it stick.
  const area = h("textarea", { rows: 5, placeholder: "Write it as if you were explaining it to a teammate who missed this level…", "aria-label": "Your explanation" });
  area.value = lv.explain;
  const model = h("div", { class: "model-answer", hidden: lv.explain.trim().length < 40 },
    h("p", { class: "eyebrow" }, "Compare with this explanation"), h("p", {}, def.explain.model));
  const saveBtn = h("button", { class: "btn primary", onclick: () => {
    lv.explain = area.value;
    save();
    if (area.value.trim().length < 40) { toast("Write at least a couple of sentences (40+ characters).", "warn"); return; }
    model.hidden = false;
    xpToast(award(`${def.id}:explain`, EXPLAIN_XP), "explained in your own words");
    refreshProgress();
  } }, "Save & compare");
  sections.push(card("Explain it back",
    h("p", { class: "prompt" }, def.explain.prompt),
    area, h("div", { class: "row" }, saveBtn, micButton(area), h("span", { class: "hint" }, "Saved in this browser only. Export them anytime from My notes.")),
    model));

  function renderCompletion() {
    const answered = def.challenges.every((c) => lv.challenges[c.id]);
    const explained = lv.explain.trim().length >= 40;
    if (lv.done) {
      completion.replaceChildren(
        h("h2", {}, `${def.badge.icon} Badge earned: ${def.badge.name}`),
        h("p", { class: "stars big" }, "★".repeat(lv.stars) + "☆".repeat(3 - lv.stars)),
        h("h3", {}, "Key takeaways"), h("ul", {}, def.takeaways.map((t) => h("li", { html: t }))),
        h("p", { class: "hint" }, `${def.cards.length} review cards are now in your deck. They come back over the next days so this sticks.`),
        h("div", { class: "row" }, ctx.next ? h("a", { class: "btn primary", href: `#/level/${ctx.next.id}` }, `Next: ${ctx.next.title} →`) : null,
          h("a", { class: "btn", href: "#/review" }, "Review deck")),
      );
      return;
    }
    const ready = answered && explained;
    completion.replaceChildren(
      h("h2", {}, "Finish the level"),
      h("p", {}, ready ? "Everything is done. Claim your badge and unlock the next level." :
        `Still to do: ${[!answered && "answer every challenge", !explained && "explain it back"].filter(Boolean).join(" and ")}.`),
      h("button", { class: "btn primary", disabled: !ready, onclick: () => {
        lv.done = true;
        lv.stars = starsFor(lv, def);
        save();
        xpToast(award(`${def.id}:complete`, COMPLETE_XP), `${def.badge.name} badge`);
        refreshProgress();
        completion.scrollIntoView({ behavior: "smooth", block: "center" });
      } }, `Complete level (+${COMPLETE_XP} XP)`),
    );
  }
  sections.push(completion);
  refreshProgress();
  root.replaceChildren(...sections);
}

function renderChallenge(c, n, lv, ctx, record) {
  const box = h("section", { class: "card challenge" });
  const title = h("h3", {}, h("span", { class: "num" }, n), " ", c.title || "Predict");
  box.append(title);
  if (c.kind === "custom") {
    c.render(box, ctx, (ok) => record(c.id, ok), lv.challenges[c.id]);
    return box;
  }
  box.append(h("div", { class: "prose", html: typeof c.prompt === "function" ? c.prompt(ctx) : c.prompt }));
  const feedback = h("div", { class: "feedback", "aria-live": "polite" });
  const answer = () => (typeof c.answer === "function" ? c.answer(ctx) : c.answer);
  const explain = (chosen) => (typeof c.explain === "function" ? c.explain(ctx, chosen) : c.explain);
  const showResult = (chosen, ok) => {
    feedback.className = `feedback ${ok ? "good" : "bad"}`;
    feedback.innerHTML = `<strong>${ok ? "Correct." : "Not quite."}</strong> ${explain(chosen)}`;
  };

  if (c.kind === "choice") {
    const opts = h("div", { class: "options" });
    const prior = lv.challenges[c.id];
    c.options.forEach((o) => {
      const b = h("button", { class: "option", onclick: () => {
        if (lv.challenges[c.id]) return;
        const ok = o.v === answer();
        lock(o.v);
        showResult(o.v, ok);
        record(c.id, ok);
        lv.challenges[c.id].chosen = o.v;
        save();
      } }, o.label);
      b.dataset.v = o.v;
      opts.append(b);
    });
    const lock = (chosen) => {
      opts.querySelectorAll(".option").forEach((b) => {
        b.disabled = true;
        if (b.dataset.v === answer()) b.classList.add("right");
        if (b.dataset.v === chosen && chosen !== answer()) b.classList.add("wrong");
      });
    };
    box.append(opts, feedback);
    if (prior) { lock(prior.chosen ?? answer()); showResult(prior.chosen ?? answer(), prior.ok); }
  } else if (c.kind === "number") {
    const input = h("input", { type: "number", step: "any", inputmode: "decimal", "aria-label": "Your answer" });
    const go = h("button", { class: "btn primary", onclick: () => {
      if (lv.challenges[c.id]) return;
      const v = parseFloat(input.value);
      if (Number.isNaN(v)) { toast("Type a number first.", "warn"); return; }
      const ok = Math.abs(v - answer()) <= (c.tolerance ?? 1e-6);
      input.disabled = go.disabled = true;
      showResult(v, ok);
      record(c.id, ok);
      lv.challenges[c.id].chosen = String(v);
      save();
    } }, "Check");
    box.append(h("div", { class: "row" }, input, go, c.unit ? h("span", { class: "hint" }, c.unit) : null), feedback);
    const prior = lv.challenges[c.id];
    if (prior) { input.value = prior.chosen ?? ""; input.disabled = go.disabled = true; showResult(prior.chosen, prior.ok); }
  }
  return box;
}

export function cardsUnlocked(levels) {
  return levels.filter((l) => state.levels[l.id]?.done).flatMap((l) => l.cards.map((c) => ({ ...c, id: `${l.id}:${c.id}`, level: l })));
}
