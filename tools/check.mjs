// Sanity check for the site's search code and data:  node tools/check.mjs
// Prints, per preset question, the rank of the first correct chunk under each retriever.
import { readFileSync } from "node:fs";
import { BM25, firstRelevantRank, metrics, runConfig } from "../assets/js/lib/search.js";
import { chunk, clean } from "../assets/js/lib/chunkers.js";

const data = JSON.parse(readFileSync(new URL("../assets/data/lab-data.json", import.meta.url), "utf8"));
const bm25 = new BM25(data.chunks.map((c) => ({ id: c.id, text: c.embed })));
const configs = ["vector", "keyword", "hybrid", "rerank"];
const ranks = Object.fromEntries(configs.map((c) => [c, []]));

console.log("query".padEnd(11), configs.map((c) => c.padEnd(8)).join(""), "keyword top hit");
for (const q of data.queries) {
  const row = configs.map((c) => {
    const r = firstRelevantRank(runConfig(c, q, data, bm25), q.answers);
    ranks[c].push(r);
    return String(r ?? "-").padEnd(8);
  });
  console.log(q.id.padEnd(11), row.join(""), bm25.search(q.text, 1)[0]?.id ?? "(none)");
}
for (const c of configs) {
  const m = metrics(ranks[c]);
  console.log(`${c.padEnd(8)} hit@1 ${m.hit1.toFixed(2)}  hit@5 ${m.hit5.toFixed(2)}  MRR ${m.mrr.toFixed(3)}`);
}

// Chunk Lab smoke test on a tiny document
const md = "# Doc\n\n## A\nOne. Two.\n\nFOOTER LINE THAT REPEATS\n\n## B\n|h1|h2|\n|---|---|\n|a|b|\n\nFOOTER LINE THAT REPEATS\n\nFOOTER LINE THAT REPEATS";
const cleaned = clean(md, []);
for (const s of ["fixed", "recursive", "sections", "structure"]) {
  console.log(s, chunk(cleaned.md, s, { size: 40, overlap: 10, title: "Doc" }).length, "chunks; removed", cleaned.removed);
}
