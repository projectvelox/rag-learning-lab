// Progress, XP, notes and review schedule. Stored only in this browser (localStorage).

const KEY = "rag-learning-lab:v1";
const listeners = new Set();
let storageOk = true;

const blank = () => ({
  v: 1, xp: 0, days: [], levels: {}, awarded: {}, cards: {}, reviewLog: {},
  settings: { theme: "auto", unlockAll: false },
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...blank(), ...JSON.parse(raw) } : blank();
  } catch {
    storageOk = false;
    return blank();
  }
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    storageOk = false;
  }
  listeners.forEach((fn) => fn());
}

export const canSave = () => storageOk;
export const onChange = (fn) => listeners.add(fn);

export const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};

export function level(id) {
  state.levels[id] ||= { challenges: {}, explain: "", done: false, stars: 0 };
  return state.levels[id];
}

// XP is awarded once per key, so replaying a challenge never double-counts.
export function award(key, xp) {
  if (state.awarded[key]) return 0;
  state.awarded[key] = true;
  state.xp += xp;
  if (!state.days.includes(today())) state.days.push(today());
  save();
  return xp;
}

export function streak() {
  const days = new Set(state.days);
  let n = 0;
  let d = days.has(today()) ? today() : addDays(today(), -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export const RANKS = [
  [0, "Curious Clerk"], [150, "Token Trainee"], [400, "Chunk Apprentice"], [700, "Vector Voyager"],
  [1050, "Retrieval Ranger"], [1450, "Fusion Engineer"], [1900, "RAG Architect"],
];

export function rank() {
  let i = 0;
  while (i + 1 < RANKS.length && state.xp >= RANKS[i + 1][0]) i++;
  const [floor, name] = RANKS[i];
  const next = RANKS[i + 1];
  return { name, floor, next: next ? next[0] : null, nextName: next ? next[1] : null };
}

// ---- spaced review (Leitner boxes). Box n waits INTERVALS[n] days after a correct recall.
const INTERVALS = [0, 1, 3, 7, 16, 35];

export function cardState(id) {
  return state.cards[id] || { box: 0, due: today(), reps: 0 };
}

export function isDue(id) {
  return cardState(id).due <= today();
}

export function grade(id, result) {
  const c = { ...cardState(id) };
  if (result === "again") { c.box = 1; c.due = today(); }
  else if (result === "hard") { c.box = Math.max(c.box, 1); c.due = addDays(today(), Math.max(1, Math.floor(INTERVALS[c.box] / 2))); }
  else { c.box = Math.min(c.box + 1, INTERVALS.length - 1); c.due = addDays(today(), INTERVALS[c.box]); }
  c.reps += 1;
  state.cards[id] = c;
  const key = `review:${id}:${today()}`;
  if (result !== "again") award(key, 5);
  else save();
  return c;
}

export function exportProgress() {
  return JSON.stringify(state, null, 2);
}

export function importProgress(json) {
  const data = JSON.parse(json);
  if (data.v !== 1) throw new Error("Not a RAG Learning Lab progress file.");
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, blank(), data);
  save();
}

export function resetProgress() {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, blank());
  save();
}
