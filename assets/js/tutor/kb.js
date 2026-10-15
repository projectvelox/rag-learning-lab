// The tutor's knowledge base: the lab's own lessons, chunked. The tutor is a small RAG
// system, so it is built the way the levels teach: structure-aware chunks (one paragraph,
// takeaway or card each), each with a contextual header saying where it came from.

const GLOSSARY = [
  ["Embedding", "a list of numbers (a vector) that represents a text's meaning; texts about similar things get vectors pointing in similar directions. bge-small produces 384 numbers per text."],
  ["Vector", "an ordered list of numbers. In retrieval, the embedding of a text."],
  ["Cosine similarity", "how closely two vectors point the same way: 1 = same direction, 0 = unrelated, −1 = opposite. It ignores length; with normalised vectors it equals the dot product."],
  ["Chunk", "a retrievable piece of a document. Search returns chunks, not whole documents. A good chunk is one topic, contains whole facts, makes sense on its own and fits the embedding model's token limit."],
  ["Chunking", "cutting documents into chunks. Strategies: fixed size (every N characters), recursive (paragraphs, then lines, then sentences), section-based (follow headings) and structure-aware with a contextual header."],
  ["Overlap", "text repeated at the boundary between neighbouring chunks, so a fact cut at the edge still appears whole in one of them."],
  ["Contextual header", "a line like “Document: … / Section: …” put in front of a chunk before embedding, so the chunk is understandable on its own."],
  ["Token", "the unit models read text in; roughly 4 characters of English. Embedding models have a token limit (512 for bge-small); longer text is silently cut off."],
  ["BM25", "classic keyword ranking: scores a chunk by how often it contains the query's words, weighting rare words more (IDF) and normalising for chunk length."],
  ["IDF (inverse document frequency)", "how rare a word is across all chunks. Rare words like “W160” get high IDF and count a lot; common words like “invoice” count little."],
  ["Keyword search", "matching the query's exact words (BM25). Strong on codes, names and numbers; blind to synonyms and spelling variants."],
  ["Vector search", "finding chunks whose embeddings are closest to the question's embedding. Strong on paraphrases; weak on exact identifiers."],
  ["Hybrid search", "running several retrievers (vector, keyword, entity) and merging their rankings, usually with Reciprocal Rank Fusion."],
  ["RRF (Reciprocal Rank Fusion)", "merges ranked lists by giving each chunk 1/(k + rank) from every list it appears in and adding them up (k is usually 60). Uses ranks only, so incomparable scores don't matter."],
  ["Entity matching", "normalising identifiers (CU50110 = Codeunit 50110) and retrieving chunks that mention the same entities as the question."],
  ["Bi-encoder", "encodes the question and each chunk separately into vectors; fast and precomputable, but approximate. Embedding models are bi-encoders."],
  ["Cross-encoder / reranker", "reads the question and a chunk together and outputs a relevance score; accurate but slow, so it only re-orders the top 20–50 candidates."],
  ["Two-stage retrieval", "cheap hybrid search finds candidates (recall), a reranker orders them (precision)."],
  ["Metadata", "facts about a document stored with every chunk: client, type, date, version, status. Used to filter and to weigh sources."],
  ["Relationship (document)", "a typed link between documents: implements, updates, amends, details, accepts, duplicate_of, references. Tells the answer step which source is current."],
  ["Content hash", "a fingerprint of a file's bytes. Same bytes, same hash: used to skip unchanged files and detect duplicates."],
  ["Idempotent ingestion", "running ingestion again on unchanged sources leaves the index exactly as it was."],
  ["Index fingerprint", "parser version, chunk settings and embedding model stored with the index; if any changes, everything is re-processed."],
  ["Golden set", "real questions paired with what a correct result must contain; used to score retrieval."],
  ["hit@k", "the share of golden questions with a correct chunk in the top k results."],
  ["MRR (mean reciprocal rank)", "average of 1/rank of the first correct chunk (0 if not found). Rewards putting the answer high."],
  ["RAG (retrieval-augmented generation)", "retrieve relevant chunks, then have an LLM answer using only those chunks."],
  ["Grounding", "answering only from the retrieved sources, with a citation for every claim, and saying so when the sources don't contain the answer."],
  ["Hallucination", "a confident claim with no support in the sources, like an invented job title or timeframe."],
  ["ANN / HNSW", "approximate nearest-neighbour search and the common graph index for it; needed when you have millions of vectors. Small corpora can use exact search."],
];

// Conversational filler that carries no topic. Left in, a rare word like "again" outweighs
// the real topic under BM25 (IDF, Level 3): "what is a chunk again?" matched "...ingestion again...".
const FILLER = /\b(again|explain|explanation|simply|simple|please|pls|tell|me|remind|quick|quickly|ano|ang|ba|yung|po|naman|lang|kasi|nga|sa|ng)\b/gi;
export const keywordQuery = (q) => q.replace(FILLER, " ");

const strip = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const units = (html) => String(html).split(/<\/(?:p|li)>/i).map(strip).filter((t) => t.length > 30);

export function buildKB(levels) {
  const passages = [];
  const add = (level, section, text, boost = "") => {
    const where = level ? `${level.num === "boss" ? "Boss" : `Level ${level.num}`} · ${level.title}` : "Glossary";
    passages.push({ id: `p${passages.length}`, levelId: level?.id ?? null, where, section, text, indexed: `${where} · ${section}: ${boost}${text}` });
  };
  for (const l of levels) {
    if (l.problem) add(l, "The problem", strip(l.problem));
    if (l.idea) units(l.idea).forEach((t) => add(l, "The idea", t));
    l.takeaways.forEach((t) => add(l, "Key takeaway", strip(t)));
    l.cards.forEach((c) => add(l, "Review card", `${c.q} ${c.a}`));
    add(l, "Explanation", l.explain.model);
    for (const c of l.challenges) {
      if (typeof c.explain === "string" && typeof c.prompt === "string") add(l, "Challenge", `${strip(c.prompt)} ${strip(c.explain)}`);
    }
  }
  // Shown text is just the definition. The indexed text repeats the term ("title boosting"), so a
  // definition outranks passages that merely mention the word: without it, "what is a chunk?"
  // matched the RAG definition ("...relevant chunks... those chunks") before the Chunk one.
  GLOSSARY.forEach(([term, def]) => add(null, term, def[0].toUpperCase() + def.slice(1), `${term}. `));
  return passages;
}
