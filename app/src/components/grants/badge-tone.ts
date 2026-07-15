import type { CSSProperties } from "react";
import type { Verdict } from "@/lib/matching";

// Soft-tinted badge style keyed to an existing OKLCH color token: token-colored text on a
// low-opacity fill of the same hue, plus a faint same-hue border. color-mix stays in OKLCH so the
// tint remains on-palette in both themes (the tokens themselves flip via prefers-color-scheme).
export function toneStyle(token: string): CSSProperties {
  return {
    color: token,
    backgroundColor: `color-mix(in oklch, ${token} 12%, transparent)`,
    borderColor: `color-mix(in oklch, ${token} 22%, transparent)`,
  };
}

export const VERDICT_TONE: Record<Verdict, string> = {
  Candidabile: "var(--verdict-candidabile)",
  "Da preparare": "var(--verdict-da-preparare)",
  "Da valutare": "var(--verdict-da-valutare)",
  "Bassa priorità": "var(--verdict-bassa-priorita)",
  "Non compatibile": "var(--verdict-non-compatibile)",
  Storico: "var(--verdict-storico)",
};

// Permissive maps (string-keyed) with a muted fallback, so a widened union never breaks the build.
export const DEADLINE_TONE: Record<string, string> = {
  verde: "var(--success)",
  giallo: "var(--warning-text)",
  rosso: "var(--error)",
  nero: "var(--text)",
};

export const ECONOMIC_TONE: Record<string, string> = {
  da_verificare: "var(--text-muted)",
  alla_tua_portata: "var(--success)",
  ambizioso: "var(--warning-text)",
  fuori_scala: "var(--error)",
};

export const TONE_FALLBACK = "var(--text-muted)";
export const HISTORY_TONE = "var(--verdict-storico)";
