// Voice in and out, using what the browser already has.
// Dictation: the Web Speech API (Chrome, Edge, Safari). Chrome and Edge send the audio to
// their speech service to transcribe it. Reading aloud: speechSynthesis, which runs locally.
import { save, state } from "./state.js";
import { h, toast } from "../ui.js";

const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const LANGS = { "en-US": "English (US)", "en-PH": "English (Philippines)", "fil-PH": "Filipino / Taglish" };
export const canDictate = () => Boolean(SR);
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;
export const voiceLang = () => state.settings.voiceLang || "en-US";

const ERRORS = {
  "not-allowed": "Microphone access is blocked. Allow it for this site in your browser's address-bar settings.",
  "service-not-allowed": "This browser doesn't allow speech recognition here.",
  "no-speech": "Didn't catch anything. Try again a little closer to the mic.",
  network: "The browser's speech service couldn't be reached.",
  "audio-capture": "No microphone was found.",
};

let active = null; // one recognizer at a time across the page

// A mic button that types what you say into `target` (an input or textarea).
// continuous: keep listening until clicked again; otherwise stop at the first pause.
export function micButton(target, { continuous = true, onEnd } = {}) {
  if (!SR) return null;
  const label = h("span", { class: "mic-label" }, "Speak");
  const btn = h("button", { type: "button", class: "btn mic", "aria-pressed": "false", title: `Dictate (${LANGS[voiceLang()]})` }, "🎤 ", label);
  let rec = null;

  btn.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    if (active) active.stop();
    rec = new SR();
    rec.lang = voiceLang();
    rec.continuous = continuous;
    rec.interimResults = true;
    const base = target.value;
    const sep = base && !/\s$/.test(base) ? " " : "";
    let finalText = "";

    rec.onresult = (e) => {
      let fin = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      finalText = fin;
      target.value = base + sep + fin + interim;
    };
    rec.onerror = (e) => { if (e.error !== "aborted") toast(ERRORS[e.error] || `Dictation stopped (${e.error}).`, "warn"); };
    rec.onend = () => {
      target.value = (base + sep + finalText).trimEnd();
      rec = null;
      active = null;
      btn.classList.remove("rec");
      btn.setAttribute("aria-pressed", "false");
      label.textContent = "Speak";
      target.dispatchEvent(new Event("input", { bubbles: true }));
      onEnd?.(finalText.trim());
    };
    try {
      rec.start();
    } catch (err) {
      toast(`Couldn't start the microphone: ${err.message}`, "warn");
      rec = null;
      return;
    }
    active = rec;
    btn.classList.add("rec");
    btn.setAttribute("aria-pressed", "true");
    label.textContent = continuous ? "Listening… click to stop" : "Listening…";
  });
  return btn;
}

export function speak(text) {
  if (!canSpeak() || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voiceLang();
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.replace("_", "-").startsWith(u.lang.split("-")[0]));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel();
}

export function voiceSettings(onChange) {
  const sel = h("select", { "aria-label": "Speech language", onchange: (e) => { state.settings.voiceLang = e.target.value; save(); onChange?.(); } },
    Object.entries(LANGS).map(([v, l]) => h("option", { value: v, selected: v === voiceLang() || null }, l)));
  const aloud = h("input", { type: "checkbox", checked: state.settings.readAloud || null, onchange: (e) => { state.settings.readAloud = e.target.checked; save(); if (!e.target.checked) stopSpeaking(); onChange?.(); } });
  return h("div", { class: "voice-settings" },
    h("div", { class: "row wrap" }, h("label", {}, "Speech language ", sel), canSpeak() ? h("label", { class: "check" }, aloud, " Read tutor answers aloud") : null),
    h("p", { class: "hint" }, canDictate()
      ? "Dictation uses your browser's speech service: Chrome and Edge send the audio to Google or Microsoft to transcribe it. Reading aloud happens on your device."
      : "This browser has no speech recognition (Firefox doesn't support it). Use Chrome, Edge or Safari for the 🎤 buttons."));
}
