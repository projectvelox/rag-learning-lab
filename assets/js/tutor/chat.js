// The tutor panel available on every page. Retrieval is local (BM25 over the lab's own
// lessons, plus vectors once the in-browser model is loaded); Claude is an optional writer.
import * as live from "../lib/live.js";
import { BM25, cosine, rrf } from "../lib/search.js";
import { state } from "../lib/state.js";
import { canSpeak, micButton, speak, stopSpeaking, voiceSettings } from "../lib/voice.js";
import { esc, h, toast } from "../ui.js";
import { buildKB, keywordQuery } from "./kb.js";
import { askClaude, label, loadSdk, MODEL } from "./claude.js";

const KEY_NAME = "rag-learning-lab:anthropic-key"; // never part of progress exports
const STARTERS = ["What is a chunk again?", "Explain cosine similarity simply", "Why combine keyword and vector search?", "What does RRF do?"];

function getKey() {
  try { return sessionStorage.getItem(KEY_NAME) || localStorage.getItem(KEY_NAME) || ""; } catch { return ""; }
}
function setKey(key, remember) {
  try {
    sessionStorage.removeItem(KEY_NAME);
    localStorage.removeItem(KEY_NAME);
    if (key) (remember ? localStorage : sessionStorage).setItem(KEY_NAME, key);
  } catch { toast("This browser is blocking storage; the key can't be saved.", "warn"); }
}

// Minimal, safe formatting for model output: escape, then **bold**, `code`, bullets, [n] badges.
function format(text) {
  const lines = esc(text).split("\n");
  let html = "";
  let inList = false;
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    if (bullet && !inList) { html += "<ul>"; inList = true; }
    if (!bullet && inList) { html += "</ul>"; inList = false; }
    const body = (bullet ? bullet[1] : line)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[(\d+)\]/g, '<span class="cite">$1</span>');
    html += bullet ? `<li>${body}</li>` : body.trim() ? `<p>${body}</p>` : "";
  }
  return inList ? `${html}</ul>` : html;
}

// FNV-1a over UTF-8 bytes; tools/build_data.py computes the same hash for each passage.
const fnv1a = (text) => {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
};

// Passage vectors precomputed offline, int8-quantised (vector × 127). Keyed by text hash so a
// lesson edited after the last data build is simply embedded in the browser instead.
async function precomputedVectors() {
  try {
    const t = await (await fetch("assets/data/tutor-vectors.json")).json();
    const ints = new Int8Array(Uint8Array.from(atob(t.int8), (c) => c.charCodeAt(0)).buffer);
    return new Map(t.hashes.map((hash, i) => [hash, Array.from(ints.subarray(i * t.dim, (i + 1) * t.dim), (x) => x / t.scale)]));
  } catch {
    return new Map();
  }
}

const plain = (text) => text.replace(/\[\d+\]/g, "").replace(/\*\*|`/g, "").replace(/^\s*[-*•]\s+/gm, "");

export function initTutor({ levels, getLevel }) {
  const kb = buildKB(levels);
  const byId = Object.fromEntries(kb.map((p) => [p.id, p]));
  const bm25 = new BM25(kb.map((p) => ({ id: p.id, text: p.indexed })));
  let kbVecs = null;
  let history = [];
  let busy = false;

  // ------------------------------------------------------------ retrieval
  async function retrieve(question, k = 5) {
    const here = getLevel()?.id;
    // Prefer the level you're on; glossary definitions count as "on every page".
    const local = (p) => p.levelId === here || p.levelId === null;
    const boost = (id) => (local(byId[id]) ? 1.3 : 1);
    const lists = {
      keyword: bm25.search(keywordQuery(question), 20).map((r) => ({ ...r, score: r.score * boost(r.id) })).sort((a, b) => b.score - a.score),
    };
    if (kbVecs) {
      const [qv] = await live.embed([`Represent this sentence for searching relevant passages: ${question}`]);
      lists.vector = kb.map((p, i) => ({ id: p.id, score: cosine(qv, kbVecs[i]) + (local(p) ? 0.02 : 0) }))
        .sort((a, b) => b.score - a.score).slice(0, 20);
    }
    const kwById = Object.fromEntries(lists.keyword.map((r) => [r.id, r]));
    return rrf(lists).slice(0, k).map((r) => ({ ...byId[r.id], from: r.from, matched: kwById[r.id]?.matched || [] }));
  }

  // ------------------------------------------------------------ UI
  const fab = h("button", { id: "tutor-fab", class: "btn primary", "aria-expanded": "false", "aria-controls": "tutor", onclick: () => toggle() }, "💬 Ask the tutor");
  const log = h("div", { class: "tutor-log", "aria-live": "polite" });
  const input = h("textarea", { rows: 2, placeholder: "Ask anything about the lab… (Enter to send)", "aria-label": "Your question" });
  const send = h("button", { class: "btn primary", onclick: () => submit() }, "Send");
  const mic = micButton(input, { continuous: false, onEnd: (said) => { if (said) submit(); } });
  const modeBadge = h("span", { class: "tag" });
  const settings = h("div", { class: "tutor-settings", hidden: true });

  const panel = h("aside", { id: "tutor", class: "tutor", role: "dialog", "aria-label": "Tutor", hidden: true },
    h("header", { class: "tutor-head" },
      h("div", {}, h("strong", {}, "Tutor"), " ", modeBadge),
      h("div", { class: "row" },
        h("button", { class: "btn tiny", title: "Settings", "aria-label": "Tutor settings", onclick: () => { settings.hidden = !settings.hidden; if (!settings.hidden) renderSettings(); } }, "⚙"),
        h("button", { class: "btn tiny", title: "Clear chat", "aria-label": "Clear chat", onclick: () => { history = []; log.replaceChildren(); stopSpeaking(); greet(); } }, "🗑"),
        h("button", { class: "btn tiny", title: "Close", "aria-label": "Close tutor", onclick: () => toggle(false) }, "✕"))),
    settings, log,
    h("div", { class: "tutor-input" }, input, h("div", { class: "row" }, mic, send)));

  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") toggle(false); });

  function updateMode() {
    const parts = [getKey() ? "Claude" : "offline", kbVecs ? "hybrid" : "keyword"];
    modeBadge.textContent = parts.join(" · ");
  }

  function toggle(open = panel.hidden) {
    panel.hidden = !open;
    fab.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("tutor-open", open);
    if (open) {
      if (!log.children.length) greet();
      updateMode();
      input.focus();
    } else {
      stopSpeaking();
      fab.focus();
    }
  }

  function bubble(cls, ...children) {
    const b = h("div", { class: `msg ${cls}` }, ...children);
    log.append(b);
    log.scrollTop = log.scrollHeight;
    return b;
  }

  function greet() {
    const lv = getLevel();
    const chips = [...(lv?.cards || []).slice(0, 2).map((c) => c.q), ...STARTERS].slice(0, 5);
    bubble("bot",
      h("p", {}, "Hi! Ask me anything from the lab, by typing or with 🎤. ",
        getKey() ? "Claude will write the answers from the lab's lessons." : "Right now I answer by finding the best passages in the lab's lessons: I'm a small RAG system myself. Open ⚙ to switch on meaning-based search or connect Claude."),
      h("div", { class: "chips" }, chips.map((q) => h("button", { class: "chip-btn", onclick: () => { input.value = q; submit(); } }, q))));
  }

  function sourcesBlock(hits, numbered) {
    return h("details", { class: "how" },
      h("summary", {}, numbered ? "Sources and how I found them" : "How I found this"),
      h("ol", {}, hits.map((p) => h("li", {},
        h("a", { href: p.levelId ? `#/level/${p.levelId}` : "#/" }, label(p)),
        h("span", { class: "muted" }, ` · found by ${Object.entries(p.from).map(([k, v]) => `${k} #${v}`).join(", ")}${p.matched.length ? ` (matched: ${p.matched.join(", ")})` : ""}`)))),
      h("p", { class: "hint" }, kbVecs ? "Keyword (BM25) and vector rankings fused with RRF, with a small boost for the level you're on." : "Keyword search (BM25) only, with a boost for the level you're on. Load the meaning model in ⚙ for hybrid search."));
  }

  function localAnswer(hits) {
    const [top, ...rest] = hits;
    const b = bubble("bot",
      h("p", { class: "eyebrow" }, `From ${label(top)}`),
      h("p", {}, top.text),
      top.levelId ? h("p", {}, h("a", { href: `#/level/${top.levelId}` }, "Open that level →")) : null,
      rest.length ? h("div", { class: "also" }, h("p", { class: "eyebrow" }, "Also relevant"),
        h("ul", {}, rest.slice(0, 2).map((p) => h("li", {}, h("strong", {}, `${label(p)}: `), p.text.length > 220 ? `${p.text.slice(0, 217)}…` : p.text)))) : null,
      sourcesBlock(hits, false));
    if (state.settings.readAloud) speak(top.text);
    return b;
  }

  async function submit() {
    const question = input.value.trim();
    if (!question || busy) return;
    input.value = "";
    busy = true;
    send.disabled = true;
    stopSpeaking();
    bubble("user", h("p", {}, question));
    try {
      const hits = await retrieve(question);
      if (!hits.length) {
        bubble("bot", h("p", {}, "I couldn't find that in the lab's lessons. Try different words (I match on words unless the meaning model is loaded in ⚙)."));
        return;
      }
      const key = getKey();
      if (!key) { localAnswer(hits); return; }

      const body = h("div", { class: "md" }, h("p", { class: "typing" }, "Thinking…"));
      const b = bubble("bot", body);
      let final;
      try {
        final = await askClaude({
          apiKey: key, question, passages: hits, history,
          levelTitle: getLevel()?.title || "the quest map",
          onText: (t) => { body.innerHTML = format(t); log.scrollTop = log.scrollHeight; },
        });
      } catch (err) {
        b.remove();
        const SDK = await loadSdk().catch(() => null);
        const why = SDK && err instanceof SDK.AuthenticationError ? "the API key was rejected (check it in ⚙)"
          : SDK && err instanceof SDK.RateLimitError ? "rate limited; try again in a moment"
            : SDK && err instanceof SDK.APIError ? `API error ${err.status}`
              : err.message;
        bubble("bot error", h("p", {}, `Claude couldn't answer: ${why}. Here's what the lessons say instead:`));
        localAnswer(hits);
        return;
      }
      if (final.stop_reason === "refusal") {
        body.innerHTML = "<p>Claude declined to answer that. Here are the passages I found instead.</p>";
        b.append(sourcesBlock(hits, true));
        return;
      }
      const text = final.content.filter((c) => c.type === "text").map((c) => c.text).join("");
      body.innerHTML = format(text);
      b.append(sourcesBlock(hits, true), h("p", { class: "hint" }, `Answered by ${final.model === MODEL ? MODEL : `${final.model} (fallback)`}`));
      history.push({ role: "user", content: question }, { role: "assistant", content: text });
      if (state.settings.readAloud) speak(plain(text));
    } catch (err) {
      bubble("bot error", h("p", {}, `Something went wrong: ${err.message}`));
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  }

  // ------------------------------------------------------------ settings
  function renderSettings() {
    const status = h("p", { class: "hint", "aria-live": "polite" }, kbVecs ? "✓ Meaning model loaded: hybrid search is on." : "Not loaded: keyword search only.");
    const load = h("button", { class: "btn small", disabled: Boolean(kbVecs), onclick: async () => {
      load.disabled = true;
      try {
        await live.load((p) => { status.textContent = `Downloading the model… ${p}%`; });
        status.textContent = "Loading the lesson vectors…";
        const pre = await precomputedVectors();
        const vecs = kb.map((p) => pre.get(fnv1a(p.indexed)) || null);
        const missing = vecs.flatMap((v, i) => (v ? [] : [i]));
        for (let j = 0; j < missing.length; j += 16) {
          status.textContent = `Embedding changed lessons… ${j}/${missing.length}`;
          const batch = missing.slice(j, j + 16);
          (await live.embed(batch.map((i) => kb[i].indexed))).forEach((v, k) => { vecs[batch[k]] = v; });
        }
        kbVecs = vecs;
        status.textContent = `✓ Meaning model loaded: hybrid search is on (${kb.length - missing.length} lesson vectors precomputed, ${missing.length} embedded now).`;
        updateMode();
      } catch (e) {
        load.disabled = false;
        status.textContent = `Couldn't load the model: ${e.message}`;
      }
    } }, kbVecs ? "Meaning model loaded" : "Load meaning model (34 MB, once)");

    const keyInput = h("input", { type: "password", placeholder: "sk-ant-…", value: getKey(), autocomplete: "off", "aria-label": "Anthropic API key" });
    const remember = h("input", { type: "checkbox", checked: (() => { try { return Boolean(localStorage.getItem(KEY_NAME)); } catch { return false; } })() || null });
    const keyStatus = h("p", { class: "hint", "aria-live": "polite" });
    settings.replaceChildren(
      h("h3", {}, "Search"), h("div", { class: "row" }, load), status,
      h("h3", {}, "Claude (optional)"),
      h("p", { class: "hint" }, `With your own Anthropic API key, ${MODEL} writes answers from the passages the tutor retrieves, with citations. The key stays in this browser and is sent only to api.anthropic.com. Use a key with a monthly spend limit, and revoke it anytime in the Claude Console.`),
      h("form", { class: "row", onsubmit: (e) => e.preventDefault() }, keyInput),
      h("div", { class: "row wrap" },
        h("label", { class: "check" }, remember, " Remember on this device (otherwise forgotten when the tab closes)"),
        h("button", { class: "btn small", onclick: () => { setKey(keyInput.value.trim(), remember.checked); keyStatus.textContent = keyInput.value.trim() ? "Saved." : "Cleared."; updateMode(); } }, "Save key"),
        h("button", { class: "btn small bad", onclick: () => { keyInput.value = ""; setKey("", false); keyStatus.textContent = "Key removed from this browser."; updateMode(); } }, "Forget key")),
      keyStatus,
      h("h3", {}, "Voice"), voiceSettings(),
    );
  }

  document.body.append(fab, panel);
  if (!canSpeak()) state.settings.readAloud = false;
  return { open: () => toggle(true) };
}
