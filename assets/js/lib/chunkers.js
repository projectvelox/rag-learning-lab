// Chunking strategies, ported from the Python POC so the Chunk Lab behaves like the real thing.

export const STRATEGIES = {
  fixed: "Fixed size: every N characters with overlap, ignoring structure",
  recursive: "Recursive: split on paragraphs, then lines, then sentences, then pack",
  sections: "Sections: follow the headings; split long tables by rows with the header repeated",
  structure: "Structure: sections + a contextual header (document + section) on every chunk",
};

const SEPARATORS = ["\n\n", "\n", ". ", " "];
const TABLE_SEP = /^\|?\s*:?-{3,}/;

export const estimateTokens = (text) => Math.ceil(text.length / 4);

export function parseBlocks(md) {
  const blocks = [];
  let para = [];
  let table = [];
  const flushPara = () => { if (para.length) { blocks.push({ kind: "text", text: para.join("\n") }); para = []; } };
  const flushTable = () => { if (table.length) { blocks.push({ kind: "table", text: table.join("\n") }); table = []; } };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushPara(); flushTable(); blocks.push({ kind: "heading", level: h[1].length, text: h[2] }); continue; }
    if (line.trimStart().startsWith("|")) { flushPara(); table.push(line.trim()); continue; }
    if (!line.trim()) { flushPara(); flushTable(); continue; }
    flushTable();
    para.push(line);
  }
  flushPara(); flushTable();
  return blocks;
}

// Cleaning: drop lines repeated on several "pages" (footers) and Word placeholders.
export function clean(md, placeholders) {
  const counts = new Map();
  md.split("\n").forEach((l) => { const k = l.trim(); if (k.length >= 15) counts.set(k, (counts.get(k) || 0) + 1); });
  let removed = 0;
  let out = md.split("\n").filter((l) => {
    const k = l.trim();
    const repeated = counts.get(k) >= 3 && !k.startsWith("|") && !k.startsWith("#");
    if (repeated) removed++;
    return !repeated;
  }).join("\n");
  for (const p of placeholders) {
    const parts = out.split(p);
    removed += parts.length - 1;
    out = parts.join("");
  }
  return { md: out.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n"), removed };
}

function fixed(text, size, overlap) {
  const out = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const cut = Math.max(text.lastIndexOf(" ", end), text.lastIndexOf("\n", end));
      if (cut > start + size / 2) end = cut;
    }
    const piece = text.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end >= text.length) break;
    const from = Math.max(end - overlap, start + 1);
    const space = text.indexOf(" ", from);
    start = space !== -1 && space < end ? space + 1 : end;
  }
  return out;
}

function split(text, offset, size, seps) {
  if (text.length <= size) return text.trim() ? [[offset, text]] : [];
  for (let i = 0; i < seps.length; i++) {
    const sep = seps[i];
    if (!text.includes(sep)) continue;
    const pieces = [];
    let pos = 0;
    for (const part of text.split(sep)) {
      if (part.length > size) pieces.push(...split(part, offset + pos, size, seps.slice(i + 1)));
      else if (part.trim()) pieces.push([offset + pos, part]);
      pos += part.length + sep.length;
    }
    return pieces;
  }
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push([offset + i, text.slice(i, i + size)]);
  return out;
}

function recursive(text, size, overlap) {
  const groups = [];
  let cur = [];
  let curLen = 0;
  for (const piece of split(text, 0, size, SEPARATORS)) {
    if (cur.length && curLen + piece[1].length + 1 > size) {
      groups.push(cur);
      let carry = [];
      let total = 0;
      for (let i = cur.length - 1; i >= 0; i--) {
        if (total + cur[i][1].length > overlap) break;
        carry.unshift(cur[i]);
        total += cur[i][1].length + 1;
      }
      if (total + piece[1].length > size) { carry = []; total = 0; }
      cur = carry;
      curLen = total;
    }
    cur.push(piece);
    curLen += piece[1].length + 1;
  }
  if (cur.length) groups.push(cur);
  return groups.map((g) => text.slice(g[0][0], g[g.length - 1][0] + g[g.length - 1][1].length).trim());
}

function splitTable(text, size) {
  const rows = text.split("\n");
  const header = rows.length > 1 && TABLE_SEP.test(rows[1]) ? rows.slice(0, 2) : [];
  const headLen = header.join("\n").length + 1;
  const pieces = [];
  let cur = [];
  let curLen = headLen;
  for (const row of rows.slice(header.length)) {
    if (cur.length && curLen + row.length + 1 > size) { pieces.push([...header, ...cur]); cur = []; curLen = headLen; }
    cur.push(row);
    curLen += row.length + 1;
  }
  if (cur.length) pieces.push([...header, ...cur]);
  return pieces.map((p) => p.join("\n"));
}

function bySection(blocks, size, title, withHeader) {
  const chunks = [];
  const stack = [];
  let path = "";
  let body = [];
  const sections = [];
  for (const b of blocks) {
    if (b.kind === "heading") {
      if (body.length) sections.push([path, body]);
      body = [];
      while (stack.length && stack[stack.length - 1].level >= b.level) stack.pop();
      stack.push(b);
      path = stack.map((s) => s.text).join(" > ");
    } else body.push(b);
  }
  if (body.length) sections.push([path, body]);

  for (const [section, items] of sections) {
    let cur = [];
    let curLen = 0;
    const emit = () => {
      const text = cur.join("\n\n");
      const header = `Document: ${title}${section ? `\nSection: ${section}` : ""}`;
      chunks.push({ text, section, embed: withHeader ? `${header}\n\n${text}` : text });
    };
    for (const b of items) {
      const pieces = b.kind === "table" ? splitTable(b.text, size) : b.text.length <= size ? [b.text] : recursive(b.text, size, 0);
      for (const p of pieces) {
        if (cur.length && curLen + p.length + 2 > size) { emit(); cur = []; curLen = 0; }
        cur.push(p);
        curLen += p.length + 2;
      }
    }
    if (cur.length) emit();
  }
  return chunks;
}

export function chunk(md, strategy, { size = 600, overlap = 100, title = "" } = {}) {
  const blocks = parseBlocks(md);
  if (strategy === "sections" || strategy === "structure") return bySection(blocks, size, title, strategy === "structure");
  const flat = blocks.map((b) => b.text).join("\n\n");
  const pieces = strategy === "fixed" ? fixed(flat, size, overlap) : recursive(flat, size, overlap);
  return pieces.map((text) => ({ text, section: "", embed: text }));
}

// Table rows that ended up in a chunk without the header row that names their columns.
export function orphanRows(chunkText) {
  const lines = chunkText.split("\n").filter((l) => l.trim().startsWith("|"));
  if (!lines.length) return 0;
  return lines.some((l) => TABLE_SEP.test(l)) ? 0 : lines.length;
}
