// app/src/lib/ai/embedding-provider.ts
// Embedding seam (spec V2-A): turns text into vectors for pgvector retrieval. Default is Gemini
// text-embedding-004 (768 dims) — consistent with the Gemini default LLM, good Italian coverage,
// free tier. Swappable behind EmbeddingProvider (e.g. an open model) without touching callers.
export const EMBEDDING_MODEL = "text-embedding-004";
export const EMBEDDING_DIMS = 768;

export interface EmbeddingProvider {
  // One vector per input text, same order. [] in -> [] out (no network call).
  embed(texts: string[]): Promise<number[][]>;
}

interface GeminiBatchEmbedResponse {
  embeddings?: { values?: number[] }[];
}

export interface GeminiEmbeddingConfig {
  apiKey: string;
  fetchImpl?: typeof fetch;
  model?: string;
  endpoint?: string;
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;
  private readonly endpoint: string;

  constructor(config: GeminiEmbeddingConfig) {
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.model = config.model ?? EMBEDDING_MODEL;
    this.endpoint = config.endpoint ?? ENDPOINT;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const url = `${this.endpoint}/${this.model}:batchEmbedContents?key=${encodeURIComponent(this.apiKey)}`;
    const body = {
      requests: texts.map((text) => ({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
      })),
    };

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new Error("Gemini embedding: errore di rete", { cause });
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini embedding: HTTP ${res.status} ${detail}`.trim());
    }

    const parsed = (await res.json()) as GeminiBatchEmbedResponse;
    const vectors = (parsed.embeddings ?? []).map((e) => e.values ?? []);
    if (vectors.length !== texts.length) {
      throw new Error(`Gemini embedding: attesi ${texts.length} vettori, ricevuti ${vectors.length}`);
    }
    return vectors;
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY non impostata: necessaria per gli embeddings dell'assistente cross-bando.");
  }
  return new GeminiEmbeddingProvider({ apiKey });
}
