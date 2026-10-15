// Retrieval building blocks: BM25 keyword search, cosine similarity, reciprocal rank fusion.
// Small on purpose: everything the levels show is computed here, in the browser.

export const STOPWORDS = new Set(`a an and are as at be by can do does for from has have how i if in into is it its
of on or should so that the their there these this to was what when where which who why will with would you your
we our they them then than also any all`.split(/\s+/));

const stem = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9_]+/g) || []).filter((w) => !STOPWORDS.has(w) && w.length > 1).map(stem);
}

// BM25: score = sum over query terms of idf(term) * tf * (k1 + 1) / (tf + k1 * (1 - b + b * len / avgLen))
export class BM25 {
  constructor(docs, { k1 = 1.2, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = docs.map((d) => {
      const terms = tokenize(d.text);
      const tf = new Map();
      terms.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
      return { id: d.id, len: terms.length, tf };
    });
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(this.docs.length, 1);
    this.df = new Map();
    this.docs.forEach((d) => d.tf.forEach((_, t) => this.df.set(t, (this.df.get(t) || 0) + 1)));
  }

  idf(term) {
    const n = this.docs.length;
    const df = this.df.get(term) || 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query, k = 10) {
    const terms = [...new Set(tokenize(query))];
    const scored = this.docs.map((d) => {
      let score = 0;
      const matched = [];
      for (const t of terms) {
        const tf = d.tf.get(t);
        if (!tf) continue;
        matched.push(t);
        score += (this.idf(t) * tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + (this.b * d.len) / this.avgLen));
      }
      return { id: d.id, score, matched };
    });
    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  }
}

export const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export const norm = (a) => Math.sqrt(dot(a, a));
export const cosine = (a, b) => dot(a, b) / (norm(a) * norm(b));

export function vectorSearch(queryVec, chunks, k = 10) {
  return chunks
    .map((c) => ({ id: c.id, score: cosine(queryVec, c.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Reciprocal Rank Fusion: each list votes 1 / (k + rank). Ranks only, so scales never matter.
export function rrf(lists, k = 60) {
  const out = new Map();
  for (const [name, list] of Object.entries(lists)) {
    list.forEach((item, i) => {
      const e = out.get(item.id) || { id: item.id, score: 0, from: {} };
      e.score += 1 / (k + i + 1);
      e.from[name] = i + 1;
      out.set(item.id, e);
    });
  }
  return [...out.values()].sort((a, b) => b.score - a.score);
}

// Normalised identifiers: "CU50110", "codeunit 50110" and "Codeunit 50110" are one entity.
export function entities(text) {
  const found = new Set();
  const abbr = { T: "Table", P: "Page", CU: "Codeunit" };
  for (const m of text.matchAll(/\b(table|page|codeunit)\s+(\d{2,6})\b/gi)) found.add(`${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`);
  for (const m of text.matchAll(/\b(CU|T|P)(\d{3,6})\b/g)) found.add(`${abbr[m[1]]} ${m[2]}`);
  for (const m of text.matchAll(/\bW\d{3}\b/g)) found.add(m[0]);
  for (const m of text.matchAll(/\bCR-\d{2}\b/gi)) found.add(m[0].toUpperCase());
  return [...found];
}

export function entitySearch(query, chunks, k = 10) {
  const wanted = entities(query);
  if (!wanted.length) return [];
  return chunks
    .map((c) => ({ id: c.id, score: entities(`${c.section}\n${c.text}`).filter((e) => wanted.includes(e)).length }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// The four configurations the scoring level compares.
export function runConfig(name, query, data, bm25, { depth = 20 } = {}) {
  const vec = vectorSearch(query.vec, data.chunks, depth);
  const kw = bm25.search(query.text, depth);
  if (name === "vector") return vec;
  if (name === "keyword") return kw;
  const lists = { vector: vec, keyword: kw };
  const ent = entitySearch(query.text, data.chunks, depth);
  if (ent.length) lists.entity = ent;
  const fused = rrf(lists);
  if (name === "hybrid") return fused;
  // hybrid + rerank: precomputed cross-encoder scores re-order the fused top 20.
  return fused.slice(0, 20).map((r) => ({ ...r, score: query.rerank[r.id] })).sort((a, b) => b.score - a.score);
}

export function firstRelevantRank(results, answers, k = 10) {
  const i = results.slice(0, k).findIndex((r) => answers.includes(r.id));
  return i === -1 ? null : i + 1;
}

export function metrics(ranks) {
  const n = ranks.length || 1;
  return {
    hit1: ranks.filter((r) => r === 1).length / n,
    hit5: ranks.filter((r) => r && r <= 5).length / n,
    mrr: ranks.reduce((s, r) => s + (r ? 1 / r : 0), 0) / n,
  };
}
