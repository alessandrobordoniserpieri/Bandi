// app/src/lib/profile/navigation.ts
// Pure helpers for the profile sub-navigation (DEC-4, concept §5.3). The profile
// stops being one long accordion: a single URL param (`?sezione=…`) selects which
// of the 8 sections (+ notifiche) is shown, server-rendered and shareable. Kept
// framework-free so the param → active-section logic is unit-testable.

import { SECTION_KEYS, SECTION_META, type SectionKey, type SectionPriority } from "./constants";
import type { CompletionSuggestion } from "./completion";

// Notifiche is reachable through the same sub-nav (DEC-14 keeps it inside the
// profile) but is not a scored profile section, so it lives alongside the 8.
export const PROFILE_SUBNAV_KEYS = [...SECTION_KEYS, "notifiche"] as const;
export type SubNavKey = (typeof PROFILE_SUBNAV_KEYS)[number];

const NOTIFICATIONS_LABEL = "Notifiche";

/** Readable Italian priority labels — never the raw enum token (concept §2.6). */
const PRIORITY_LABELS: Record<SectionPriority, string> = {
  obbligatoria: "Obbligatoria",
  suggerita: "Consigliata",
  dopo: "Consigliata dopo l'avvio",
};

export function priorityLabel(priority: SectionPriority): string {
  return PRIORITY_LABELS[priority];
}

export function subNavLabel(key: SubNavKey): string {
  return key === "notifiche" ? NOTIFICATIONS_LABEL : SECTION_META[key].label;
}

export function isSubNavKey(value: unknown): value is SubNavKey {
  return (
    typeof value === "string" &&
    (PROFILE_SUBNAV_KEYS as readonly string[]).includes(value)
  );
}

/**
 * The first incomplete section in canonical order, or null when nothing is
 * pending. `suggestions` arrive sorted by matching points (see `completion.ts`),
 * so we re-scan in section order to get a stable, predictable default target.
 */
export function firstIncompleteSection(
  suggestions: CompletionSuggestion[],
): SectionKey | null {
  const pending = new Set(suggestions.map((s) => s.section));
  return SECTION_KEYS.find((key) => pending.has(key)) ?? null;
}

/**
 * Resolve which sub-section to show. A valid `?sezione=` param always wins;
 * otherwise default to the first incomplete section (so returning users land on
 * work still to do), falling back to identity for a complete profile.
 */
export function resolveActiveSection(
  param: string | string[] | undefined,
  firstIncomplete: SectionKey | null,
): SubNavKey {
  const raw = Array.isArray(param) ? param[0] : param;
  if (isSubNavKey(raw)) return raw;
  return firstIncomplete ?? "identity";
}
