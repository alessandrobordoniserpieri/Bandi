// scraper/src/pipeline/documents.ts
// Derives the DOCUMENT_KEYS checklist (statuto/bilancio/runts/rasd/durc/certificazioni) from a
// bando's free-text prose — the applicant-side documents the matching engine compares against the
// entity's profile. Keyword rules calibrated against real bandi (2026-07-17): ER Sociale spells out
// "RUNTS", Sport-events bandi spell out "RASD". EXTRACTION IS PARTIAL by nature: many bandi list the
// full document set only in the attached PDF, which we don't parse — so an empty result means "not
// found in the prose", NOT "no documents required". The app treats an empty checklist as UNKNOWN
// ("consulta il bando"), never as "you're all set".
import { DOCUMENT_KEY_SET } from "./vocab";

const RULES: ReadonlyArray<{ re: RegExp; key: string }> = [
  { re: /\bstatuto\b/i, key: "statuto" },
  { re: /\bbilancio\b|\brendiconto\b/i, key: "bilancio" },
  { re: /\brunts\b|registro unico nazionale del terzo settore/i, key: "runts" },
  { re: /\brasd\b|registro.{0,40}attività sportive/i, key: "rasd" },
  { re: /\bdurc\b|regolarità contributiv/i, key: "durc" },
  { re: /certificazion/i, key: "certificazioni" },
];

export function deriveRequiredDocuments(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const rule of RULES) {
    if (rule.re.test(text)) out.add(rule.key);
  }
  return [...out].filter((k) => DOCUMENT_KEY_SET.has(k));
}
