// app/src/lib/ai/chat.ts
// Per-grant advisory chat (spec §5). The LLM is stateless: we assemble the full context on every
// turn — profile+grant+PDF text (shared, cacheable), a token-budgeted recent history window, and
// the new question. Output is never rendered raw: a minimal JSON schema + zod, same principle as
// analyze-grant.ts.
import { z } from "zod";
import type { LLMProvider, JsonSchema } from "./provider";
import type { Grant } from "@/lib/matching";
import { buildStrongAnalysisDocument, type AnalysisProfileInput, type DocumentText } from "./analyze-grant";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Rough estimate (~4 chars/token), consistent with the pragmatic sizing already used for chunking
// elsewhere in this codebase — good enough for a soft budget, not billing-accurate.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const HISTORY_TOKEN_BUDGET = 8_000;
const HISTORY_MAX_TURNS = 16; // ~8 exchanges

// Keeps the most recent turns, capped at HISTORY_MAX_TURNS, then trimmed further so the total
// stays under HISTORY_TOKEN_BUDGET — whichever limit bites first. Older turns are dropped from
// what's SENT to the LLM; the full conversation still lives in chat_messages (route).
export function selectRecentHistory(history: ChatTurn[]): ChatTurn[] {
  const capped = history.slice(-HISTORY_MAX_TURNS);
  const result: ChatTurn[] = [];
  let tokens = 0;
  for (let i = capped.length - 1; i >= 0; i--) {
    const t = estimateTokens(capped[i]!.content);
    if (tokens + t > HISTORY_TOKEN_BUDGET) break;
    tokens += t;
    result.unshift(capped[i]!);
  }
  return result;
}

export function buildChatPrompt(
  input: AnalysisProfileInput,
  grant: Grant,
  providerName: string | null,
  documents: DocumentText[],
  history: ChatTurn[],
  question: string,
): string {
  const base = buildStrongAnalysisDocument(input, grant, providerName, documents);
  const recent = selectRecentHistory(history);
  const historyLines = recent.map((t) => `${t.role === "user" ? "UTENTE" : "ASSISTENTE"}: ${t.content}`);
  return [
    base,
    "",
    "== STORICO CONVERSAZIONE (finestra recente) ==",
    ...(historyLines.length ? historyLines : ["(nessuno storico precedente)"]),
    "",
    "== NUOVA DOMANDA DELL'UTENTE ==",
    question,
  ].join("\n");
}

const chatResponseSchema = z.object({ risposta: z.string().trim().min(1) });

const CHAT_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: { risposta: { type: "string" } },
  required: ["risposta"],
};

export const CHAT_INSTRUCTIONS = [
  "Sei un consulente esperto di bandi per il Terzo Settore italiano (D.Lgs 117/2017), in una",
  "chat con un rappresentante dell'ente. Presta molta attenzione al profilo dell'ente fornito.",
  "Rispondi in italiano, in modo colloquiale ma preciso, citando elementi concreti del profilo e",
  "del bando quando pertinenti — niente frasi generiche. Se il testo dei documenti allegati è",
  "presente, fondati su quello per le risposte specifiche.",
  "Rispondi SOLO con un oggetto JSON con la chiave: risposta (stringa, la tua risposta).",
].join(" ");

export async function runChatTurn(
  llm: LLMProvider,
  input: AnalysisProfileInput,
  grant: Grant,
  providerName: string | null,
  documents: DocumentText[],
  history: ChatTurn[],
  question: string,
): Promise<string> {
  let raw = await llm.extract({
    html: buildChatPrompt(input, grant, providerName, documents, history, question),
    schema: CHAT_JSON_SCHEMA,
    instructions: CHAT_INSTRUCTIONS,
  });
  if (typeof raw === "string") raw = JSON.parse(raw);
  const parsed = chatResponseSchema.parse(raw);
  return parsed.risposta;
}
