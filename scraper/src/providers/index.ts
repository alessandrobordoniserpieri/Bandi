// scraper/src/providers/index.ts
// Selects the LLM adapter from AI_PROVIDER. Switching providers = changing one env var
// (ADR-002). Only the active provider's API key is required.
import type { LLMProvider } from "./types";
import type { ProviderConfig } from "./http";
import { GeminiProvider } from "./gemini";
import { AnthropicProvider } from "./anthropic";
import { GroqProvider } from "./groq";
import { OpenAIProvider } from "./openai";

export type ProviderName = "gemini" | "anthropic" | "groq" | "openai";

interface ProviderSpec {
  keyEnv: string;
  modelEnv: string;
  make: (config: ProviderConfig) => LLMProvider;
}

const SPECS: Record<ProviderName, ProviderSpec> = {
  gemini: { keyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", make: (c) => new GeminiProvider(c) },
  anthropic: { keyEnv: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", make: (c) => new AnthropicProvider(c) },
  groq: { keyEnv: "GROQ_API_KEY", modelEnv: "GROQ_MODEL", make: (c) => new GroqProvider(c) },
  openai: { keyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", make: (c) => new OpenAIProvider(c) },
};

const VALID = Object.keys(SPECS) as ProviderName[];

function isProviderName(v: string): v is ProviderName {
  return (VALID as string[]).includes(v);
}

export function getProvider(env: Record<string, string | undefined> = process.env): LLMProvider {
  const name = (env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
  if (!isProviderName(name)) {
    throw new Error(`AI_PROVIDER sconosciuto: "${name}". Valori validi: ${VALID.join(", ")}.`);
  }
  const spec = SPECS[name];
  const apiKey = env[spec.keyEnv]?.trim();
  if (!apiKey) {
    throw new Error(`Chiave API mancante per AI_PROVIDER="${name}": imposta ${spec.keyEnv}.`);
  }
  const model = env[spec.modelEnv]?.trim();
  // Gemini "thinking" budget (default 0 = off, see GeminiProvider). Harmlessly ignored by others.
  const rawThinking = env.GEMINI_THINKING_BUDGET?.trim();
  const thinkingBudget = rawThinking && Number.isFinite(Number(rawThinking)) ? Number(rawThinking) : 0;
  return spec.make({ apiKey, ...(model ? { model } : {}), thinkingBudget });
}
