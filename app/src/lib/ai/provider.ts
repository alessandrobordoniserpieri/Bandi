// The app's single touchpoint with the AI-provider seam (ADR-002/ADR-008): re-export the
// scraper package's selector. Server-side only — the provider reads API keys from env.
export { getProvider, ProviderError } from "bandi-scraper";
export type { LLMProvider, JsonSchema } from "bandi-scraper";
