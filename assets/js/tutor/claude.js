// Optional: let Claude write the tutor's answer from the retrieved lab passages.
// Runs from the browser with the learner's own API key (this is a static site; there is
// no server to keep a key on), so the key is only ever sent to api.anthropic.com.

const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.134.0/+esm";
export const MODEL = "claude-opus-5-5";
let sdk = null;

export async function loadSdk() {
  if (!sdk) sdk = import(SDK_URL).then((m) => m.default || m.Anthropic);
  return sdk;
}

const SYSTEM = `You are the tutor inside RAG Learning Lab, a game that teaches how documents become searchable knowledge: embeddings, chunking, keyword (BM25) and vector search, hybrid search and Reciprocal Rank Fusion, reranking, metadata and relationships, ingestion, evaluation and grounded answers. The learner is a developer building these skills.

- Answer from the numbered lab passages in the learner's message when they cover the question, and cite them inline like [1] or [2][3].
- If the passages don't cover it, you may answer from general knowledge, but mark that part "(beyond the lab)" so the learner knows it isn't from the lessons.
- Explain simply and concretely. Prefer an example from the lab (the fictional Lakbay Freight documents) over an abstract one. Keep it under about 150 words unless the learner asks for more.
- If revisiting a level would help, name it.
- Reply in the learner's language; Taglish is fine.`;

export function label(p) {
  return `${p.where} · ${p.section}`;
}

// passages: retrieved passages, in rank order. history: earlier turns as {role, content} strings.
export async function askClaude({ apiKey, question, passages, history = [], levelTitle, onText, Anthropic, baseURL }) {
  const SDK = Anthropic || (await loadSdk());
  const client = new SDK({ apiKey, dangerouslyAllowBrowser: true, ...(baseURL ? { baseURL } : {}) });
  const sources = passages.map((p, i) => `[${i + 1}] ${label(p)}\n${p.text}`).join("\n\n");
  const messages = [
    ...history.slice(-6),
    { role: "user", content: `<lab_passages>\n${sources}\n</lab_passages>\n\nThe learner is currently on: ${levelTitle}\n\nQuestion: ${question}` },
  ];
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages,
    output_config: { effort: "low" }, // short tutoring answers; low effort keeps them quick
    // If a safety classifier declines, re-run on Anthropic's recommended fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  let text = "";
  stream.on("text", (delta) => { text += delta; onText?.(text); });
  return stream.finalMessage();
}
