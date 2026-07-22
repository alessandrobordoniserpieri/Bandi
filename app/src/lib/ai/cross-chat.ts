// app/src/lib/ai/cross-chat.ts
// Cross-bando advisory chat (spec V2-A). Unlike V1's per-grant chat (whole PDF in context), this
// spans MANY grants via retrieval: the route embeds the question, pgvector returns the top-k
// relevant chunks across the user's working-set, and we assemble profile + those chunks + recent
// history + question. Output is never rendered raw (JSON schema + zod), same as chat.ts.
import { z } from "zod";
import type { LLMProvider, JsonSchema } from "./provider";
import type { EntityProfile } from "@/lib/matching";
import type { AnalysisProfileInput } from "./analyze-grant";
import { selectRecentHistory, type ChatTurn } from "./chat";

export interface RetrievedChunk {
  grantId: string;
  grantTitle: string;
  chunkText: string;
}

// Compact private profile block, injected at query-time only (never persisted in shared chunks).
function profileBlock(input: AnalysisProfileInput): string {
  const p: EntityProfile = input.profile;
  return [
    "== PROFILO ENTE (privato) ==",
    `Nome: ${input.name ?? "n/d"}`,
    `Forma giuridica: ${p.legalType || "n/d"}`,
    `Territorio: provincia ${p.province || "n/d"}, regione ${p.region || "n/d"}` +
      (p.operatingProvinces.length ? `, opera anche in: ${p.operatingProvinces.join(", ")}` : ""),
    `Temi: ${p.themes.join(", ") || "n/d"}`,
    `Attività: ${input.activityDescription ?? "n/d"}`,
    `Capacità di cofinanziamento: ${p.cofundingCapacity != null ? `${p.cofundingCapacity}%` : "n/d"}`,
  ].join("\n");
}

export function buildCrossChatPrompt(
  input: AnalysisProfileInput,
  chunks: RetrievedChunk[],
  history: ChatTurn[],
  question: string,
): string {
  const recent = selectRecentHistory(history);
  const historyLines = recent.map((t) => `${t.role === "user" ? "UTENTE" : "ASSISTENTE"}: ${t.content}`);
  const passages = chunks.length
    ? chunks.map((c, i) => `--- Passaggio ${i + 1} — dal bando "${c.grantTitle}" (id ${c.grantId}) ---\n${c.chunkText}`)
    : ["Nessun passaggio rilevante trovato tra i bandi dell'utente."];
  return [
    profileBlock(input),
    "",
    "== PASSAGGI RILEVANTI DAI BANDI DELL'UTENTE (recuperati per questa domanda) ==",
    ...passages,
    "",
    "== STORICO CONVERSAZIONE (finestra recente) ==",
    ...(historyLines.length ? historyLines : ["(nessuno storico precedente)"]),
    "",
    "== NUOVA DOMANDA DELL'UTENTE ==",
    question,
  ].join("\n");
}

const responseSchema = z.object({ risposta: z.string().trim().min(1) });

const CROSS_CHAT_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: { risposta: { type: "string" } },
  required: ["risposta"],
};

export const CROSS_CHAT_INSTRUCTIONS = [
  "Sei un consulente esperto di bandi per il Terzo Settore italiano (D.Lgs 117/2017). L'utente ti fa",
  "domande che confrontano o interrogano PIÙ bandi insieme (i suoi bandi salvati). Presta molta",
  "attenzione al profilo dell'ente. Fondati SOLO sui passaggi rilevanti forniti: cita il titolo del",
  "bando quando indichi una fonte; se i passaggi non bastano a rispondere, dillo apertamente invece",
  "di inventare. Rispondi in italiano, conciso e concreto.",
  "Rispondi SOLO con un oggetto JSON con la chiave: risposta (stringa).",
].join(" ");

export async function runCrossChatTurn(
  llm: LLMProvider,
  input: AnalysisProfileInput,
  chunks: RetrievedChunk[],
  history: ChatTurn[],
  question: string,
): Promise<string> {
  let raw = await llm.extract({
    html: buildCrossChatPrompt(input, chunks, history, question),
    schema: CROSS_CHAT_JSON_SCHEMA,
    instructions: CROSS_CHAT_INSTRUCTIONS,
  });
  if (typeof raw === "string") raw = JSON.parse(raw);
  return responseSchema.parse(raw).risposta;
}
