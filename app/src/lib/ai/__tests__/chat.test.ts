import { describe, it, expect } from "vitest";
import { buildChatPrompt, runChatTurn, selectRecentHistory, type ChatTurn } from "../chat";
import type { AnalysisProfileInput } from "../analyze-grant";
import type { LLMProvider } from "../provider";
import type { EntityProfile, Grant } from "@/lib/matching";

const profile: EntityProfile = {
  legalType: "APS - Associazione di Promozione Sociale",
  province: "BO", region: "Emilia-Romagna", operatingProvinces: [],
  themes: ["sport"], capacity: null,
  documents: { statuto: true, bilancio: true, runts: false, rasd: false, durc: false, certificazioni: false },
  publicPartners: true, privatePartners: false, projectHistory: [], fundingTypesReceived: [],
  cofundingCapacity: 20,
};
const input: AnalysisProfileInput = { profile, name: "ASD Futuro", activityDescription: "Sport" };
const grant: Grant = {
  id: "g1", title: "Bando Sport", providerId: null, providerKind: null, deadline: null,
  status: "aperto", grantType: "bando", amount: null, cofundingRequired: null,
  cofundingPercentage: null, eligibleTypes: [], tags: [], area: null, geoScope: null,
  complexity: null, requiredDocuments: [], summary: "", requirements: "", url: "https://x",
  beneficiaries: "", openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
  eligibleExpenses: null, applicationMethod: null, contactInfo: null,
};

describe("selectRecentHistory", () => {
  it("keeps at most the last 16 messages", () => {
    const history: ChatTurn[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `messaggio ${i}`,
    }));
    const recent = selectRecentHistory(history);
    expect(recent.length).toBe(16);
    expect(recent[0]!.content).toBe("messaggio 4"); // the last 16 of 20 -> starts at index 4
    expect(recent[recent.length - 1]!.content).toBe("messaggio 19");
  });

  it("drops the oldest messages first when the token budget (~8000) is exceeded", () => {
    // Each message ~3000 tokens (12000 chars @ ~4 chars/token): budget fits 2, not 3.
    const big = "x".repeat(12_000);
    const history: ChatTurn[] = [
      { role: "user", content: big },
      { role: "assistant", content: big },
      { role: "user", content: big },
    ];
    const recent = selectRecentHistory(history);
    expect(recent.length).toBe(2);
    expect(recent[0]!.content).toBe(big);
    expect(recent).toEqual(history.slice(1)); // the OLDEST of the three was dropped
  });

  it("returns everything unchanged when short and few", () => {
    const history: ChatTurn[] = [{ role: "user", content: "ciao" }, { role: "assistant", content: "ciao a te" }];
    expect(selectRecentHistory(history)).toEqual(history);
  });
});

describe("buildChatPrompt", () => {
  it("includes the profile+grant block, the recent history, and the new question", () => {
    const history: ChatTurn[] = [{ role: "user", content: "Chi può partecipare?" }, { role: "assistant", content: "Le APS." }];
    const prompt = buildChatPrompt(input, grant, "Fondazione Test", [], history, "E il cofinanziamento?");
    expect(prompt).toContain("ASD Futuro"); // profile block
    expect(prompt).toContain("Bando Sport"); // grant block
    expect(prompt).toContain("Chi può partecipare?");
    expect(prompt).toContain("Le APS.");
    expect(prompt).toContain("E il cofinanziamento?");
  });

  it("includes the full document text when documents are given", () => {
    const prompt = buildChatPrompt(input, grant, null, [{ title: "Avviso.pdf", text: "Clausola XYZ999" }], [], "domanda");
    expect(prompt).toContain("Clausola XYZ999");
  });
});

describe("runChatTurn", () => {
  it("returns the validated reply from the provider", async () => {
    const llm: LLMProvider = { name: "stub", extract: async () => ({ risposta: "Sì, le APS possono partecipare." }) };
    const reply = await runChatTurn(llm, input, grant, null, [], [], "Chi può partecipare?");
    expect(reply).toBe("Sì, le APS possono partecipare.");
  });

  it("accepts a JSON string payload", async () => {
    const llm: LLMProvider = { name: "stub", extract: async () => JSON.stringify({ risposta: "Ok." }) };
    const reply = await runChatTurn(llm, input, grant, null, [], [], "domanda");
    expect(reply).toBe("Ok.");
  });

  it("throws on malformed output (never rendered raw)", async () => {
    const llm: LLMProvider = { name: "stub", extract: async () => ({ risposta: "" }) };
    await expect(runChatTurn(llm, input, grant, null, [], [], "domanda")).rejects.toThrow();
  });
});
