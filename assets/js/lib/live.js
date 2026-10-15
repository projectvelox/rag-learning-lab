// Optional live mode: the same embedding model as the precomputed data (bge-small-en-v1.5),
// running in this browser through transformers.js. Downloaded once (~34 MB), then cached.

const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const MODEL = "Xenova/bge-small-en-v1.5";
let extractor = null;
let loading = null;

export const isReady = () => extractor !== null;

export function load(onProgress) {
  if (extractor) return Promise.resolve(extractor);
  if (!loading) {
    loading = (async () => {
      const { pipeline } = await import(CDN);
      extractor = await pipeline("feature-extraction", MODEL, {
        dtype: "q8",
        progress_callback: (p) => {
          if (onProgress && p.status === "progress" && p.total) onProgress(Math.round((p.loaded / p.total) * 100));
        },
      });
      return extractor;
    })().catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

// BGE uses the [CLS] token's vector, normalised to length 1.
export async function embed(texts) {
  if (!extractor) await load();
  const out = await extractor(texts, { pooling: "cls", normalize: true });
  return out.tolist();
}
