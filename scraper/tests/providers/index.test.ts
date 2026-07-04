import { describe, it, expect } from "vitest";
import { getProvider } from "../../src/providers/index";

describe("getProvider", () => {
  it("selects each adapter from AI_PROVIDER", () => {
    expect(getProvider({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k" }).name).toBe("gemini");
    expect(getProvider({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }).name).toBe("anthropic");
    expect(getProvider({ AI_PROVIDER: "groq", GROQ_API_KEY: "k" }).name).toBe("groq");
    expect(getProvider({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k" }).name).toBe("openai");
  });

  it("defaults to gemini when AI_PROVIDER is unset", () => {
    expect(getProvider({ GEMINI_API_KEY: "k" }).name).toBe("gemini");
  });

  it("is case-insensitive and trims the value", () => {
    expect(getProvider({ AI_PROVIDER: "  OpenAI ", OPENAI_API_KEY: "k" }).name).toBe("openai");
  });

  it("throws an explicit error for an unknown provider", () => {
    expect(() => getProvider({ AI_PROVIDER: "mistral", MISTRAL_API_KEY: "k" })).toThrow(/sconosciuto/i);
  });

  it("throws an explicit error when the active provider's key is missing", () => {
    expect(() => getProvider({ AI_PROVIDER: "gemini" })).toThrow(/GEMINI_API_KEY/);
    expect(() => getProvider({ AI_PROVIDER: "anthropic", GEMINI_API_KEY: "k" })).toThrow(/ANTHROPIC_API_KEY/);
  });
});
