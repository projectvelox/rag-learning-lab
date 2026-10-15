// Checks that level mechanics are solvable with the real data:  node tools/check-levels.mjs
import { readFileSync } from "node:fs";
import { chunk, clean, estimateTokens, orphanRows } from "../assets/js/lib/chunkers.js";
import { BM25, rrf, vectorSearch } from "../assets/js/lib/search.js";

const data = JSON.parse(readFileSync(new URL("../assets/data/lab-data.json", import.meta.url), "utf8"));
const FOOTER = "CONFIDENTIAL - Lakbay Freight Inc. internal document. Do not distribute.";
const PH = ["Click or tap here to enter text.", "Choose an item."];
const FACTS = ["|Invoice Number|External Document No.|Up to 35 alphanumeric characters; must be unique|", "|WHT Prod.|W160|2% supplier of services|",
  "Common value will be W160.", "Global Dimension 1 = Product. Global Dimension 2 = Segment.",
  "4. The created sales invoice is reviewed and manually posted by the billing team.",
  "Filename: validate that the file name does not already exist in the upload archive.",
  "Additional specifications not covered by this document will incur additional cost."];
const doc = data.docs.find((d) => d.id === "urs");
const lines = [`# ${doc.title}`, "", `Revision history: 1.0 initial draft. 1.1 removed the sales order flow. ${PH[0]} ${PH[1]}`, ""];
data.chunks.filter((c) => c.doc === "urs").forEach((s, i) => { lines.push(`## ${s.section}`, "", s.text, ""); if (i % 2 === 1) lines.push(FOOTER, ""); });
const raw = lines.join("\n");
const sq = (s) => s.replace(/\s+/g, " ").trim();
const report = (label, md, strategy, size, overlap) => {
  const ch = chunk(md, strategy, { size, overlap, title: doc.title });
  const intact = FACTS.filter((f) => ch.some((c) => sq(c.text).includes(sq(f)))).length;
  const noise = ch.filter((c) => c.text.includes(FOOTER) || PH.some((p) => c.text.includes(p))).length;
  const orphans = ch.reduce((s, c) => s + orphanRows(c.text), 0);
  const maxT = Math.max(...ch.map((c) => estimateTokens(c.embed)));
  console.log(`${label.padEnd(34)} chunks ${String(ch.length).padEnd(3)} facts ${intact}/7 noise ${noise} orphans ${orphans} maxTokens ${maxT}`);
};
const cleaned = clean(raw, PH);
console.log("cleaning removed", cleaned.removed, "items");
report("default: fixed 300/0 raw", raw, "fixed", 300, 0);
report("fixed 300/0 cleaned", cleaned.md, "fixed", 300, 0);
for (const [s, o] of [[400, 150], [600, 150], [500, 200], [800, 200], [600, 300]]) report(`fixed ${s}/${o} cleaned`, cleaned.md, "fixed", s, o);
for (const s of [300, 400, 500, 600]) report(`structure ${s} cleaned`, cleaned.md, "structure", s, 0);
report("recursive 600/100 cleaned", cleaned.md, "recursive", 600, 100);
report("sections 400 cleaned", cleaned.md, "sections", 400, 0);

const bm25 = new BM25(data.chunks.map((c) => ({ id: c.id, text: c.embed })));
const q = data.queries.find((x) => x.id === "dim1");
const fused = rrf({ vector: vectorSearch(q.vec, data.chunks, 27).slice(0, 10), keyword: bm25.search(q.text, 27).slice(0, 10) }).slice(0, 8);
console.log("L6 evidence:", fused.filter((r) => /Global Dimension 1/.test(data.chunks.find((c) => c.id === r.id).text)).map((r) => r.id));
