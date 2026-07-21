import { describe, it, expect } from "vitest";
import { buildCrossChatPrompt, runCrossChatTurn, type RetrievedChunk } from "../cross-chat";
import type { AnalysisProfileInput } from "../analyze-grant";
import type { ChatTurn } from "../chat";
import type { LLMProvider } from "../provider";
import type { EntityProfile } from "@/lib/matching";

const profile: EntityProfile = {
  legalType: "APS - Associazione di Promozione Sociale",
  province: "BO", region: "Emilia-Romagna", operatingProvinces: ["MO"],
  themes: ["sport", "giovani"], capacity: null,
  documents: { statuto: true, bilancio: true, runts: false, rasd: false, durc: false, certificazioni: false },
  publicPartners: true, privatePartners: false, projectHistory: [], fundingTypesReceived: ["pubblico"],
  cofundingCapacity: 20,
};
const input: AnalysisProfileInput = { profile, name: "ASD Futuro", activityDescription: "Sport per ragazzi" };

const chunks: RetrievedChunk[] = [
  { grantId: "g1", grantTitle: "Bando Sport Giovani", chunkText: "Contributo per attività sportive giovanili." },
  { grantId: "g2", grantTitle: "Bando Inclusione", chunkText: "Fondo per progetti di inclusione sociale." },
];

describe("buildCrossChatPrompt", () => {
  it("includes the profile, the retrieved chunks (with their grant titles), history and question", () => {
    const history: ChatTurn[] = [{ role: "user", content: "Quali bandi sullo sport?" }];
    const prompt = buildCrossChatPrompt(input, chunks, history, "E sull'inclusione?");
    expect(prompt).toContain("ASD Futuro");
    expect(prompt).toContain("APS - Associazione di Promozione Sociale");
    expect(prompt).toContain("Bando Sport Giovani");
    expect(prompt).toContain("Contributo per attività sportive giovanili.");
    expect(prompt).toContain("Bando Inclusione");
    expect(prompt).toContain("Quali bandi sullo sport?");
    expect(prompt).toContain("E sull'inclusione?");
  });

  it("states explicitly when no relevant passages were retrieved", () => {
    const prompt = buildCrossChatPrompt(input, [], [], "domanda senza contesto");
    expect(prompt).toContain("Nessun passaggio rilevante");
  });
});

describe("runCrossChatTurn", () => {
  it("returns the validated reply", async () => {
    const llm: LLMProvider = { name: "stub", extract: async () => ({ risposta: "Il bando g1 è il più adatto." }) };
    const reply = await runCrossChatTurn(llm, input, chunks, [], "quale bando?");
    expect(reply).toBe("Il bando g1 è il più adatto.");
  });

  it("throws on empty/malformed output (never rendered raw)", async () => {
    const llm: LLMProvider = { name: "stub", extract: async () => ({ risposta: "" }) };
    await expect(runCrossChatTurn(llm, input, chunks, [], "quale bando?")).rejects.toThrow();
  });
});
