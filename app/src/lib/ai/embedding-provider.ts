// app/src/lib/ai/embedding-provider.ts
// Embedding seam (spec V2-A): turns text into vectors for pgvector retrieval. Default is Gemini
// gemini-embedding-001 reduced to 768 dims (outputDimensionality) — consistent with the Gemini
// default LLM, good Italian coverage, free tier. The Generative Language API exposes only
// embedContent (no synchronous batch), so embed() calls it once per text, in order. Swappable
// behind EmbeddingProvider (e.g. an open model) without touching callers.
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMS = 768;

export interface EmbeddingProvider {
  // One vector per input text, same order. [] in -> [] out (no network call).
  embed(texts: string[]): Promise<number[][]>;
}

interface GeminiEmbedResponse {
  embedding?: { values?: number[] };
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

  private async embedOne(text: string): Promise<number[]> {
    const url = `${this.endpoint}/${this.model}:embedContent?key=${encodeURIComponent(this.apiKey)}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIMS,
        }),
      });
    } catch (cause) {
      throw new Error("Gemini embedding: errore di rete", { cause });
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini embedding: HTTP ${res.status} ${detail}`.trim());
    }
    const parsed = (await res.json()) as GeminiEmbedResponse;
    const values = parsed.embedding?.values;
    if (!values || values.length !== EMBEDDING_DIMS) {
      throw new Error(`Gemini embedding: vettore mancante o di dimensione errata (${values?.length ?? 0})`);
    }
    return values;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const out: number[][] = [];
    for (const text of texts) {
      out.push(await this.embedOne(text));
    }
    return out;
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY non impostata: necessaria per gli embeddings dell'assistente cross-bando.");
  }
  return new GeminiEmbeddingProvider({ apiKey });
}
