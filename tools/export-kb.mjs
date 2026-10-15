// Export the tutor's passages so build_data.py can embed them:  node tools/export-kb.mjs
import { writeFileSync } from "node:fs";
import { buildKB } from "../assets/js/tutor/kb.js";
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
writeFileSync(new URL("./kb-passages.json", import.meta.url), JSON.stringify(kb.map((p) => p.indexed)));
console.log(`wrote tools/kb-passages.json (${kb.length} passages)`);
