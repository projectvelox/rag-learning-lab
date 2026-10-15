// What the tutor retrieves for typical questions (keyword mode):  node tools/check-tutor.mjs
import { buildKB, keywordQuery } from "../assets/js/tutor/kb.js";
import { BM25, rrf } from "../assets/js/lib/search.js";
import l1 from "../assets/js/levels/l1-embeddings.js";
import l2 from "../assets/js/levels/l2-chunking.js";
import l3 from "../assets/js/levels/l3-detectives.js";
import l4 from "../assets/js/levels/l4-fusion.js";
import l5 from "../assets/js/levels/l5-rerank.js";
import l6 from "../assets/js/levels/l6-relations.js";
import l7 from "../assets/js/levels/l7-gatekeeper.js";
import l8 from "../assets/js/levels/l8-scoring.js";
import l9 from "../assets/js/levels/l9-grounding.js";
import boss from "../assets/js/levels/boss.js";

const kb = buildKB([l1, l2, l3, l4, l5, l6, l7, l8, l9, boss]);
const bm25 = new BM25(kb.map((p) => ({ id: p.id, text: p.indexed })));
const byId = Object.fromEntries(kb.map((p) => [p.id, p]));
console.log(`${kb.length} passages`);
for (const q of ["What is a chunk again?", "Explain cosine similarity simply", "Why combine keyword and vector search?", "What does RRF do?",
  "what is overlap for", "why do we need a reranker", "what is MRR", "ano ang embedding", "how do I know if my change made search better"]) {
  const top = rrf({ keyword: bm25.search(keywordQuery(q), 20) }).slice(0, 3).map((r) => `${byId[r.id].where} · ${byId[r.id].section}`);
  console.log(`\n${q}\n  ${top.join("\n  ") || "(nothing)"}`);
}
