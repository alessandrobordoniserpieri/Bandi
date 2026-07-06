import type { Database } from "@/lib/supabase/database.types";

// The saved-grant pipeline: 4 states (salvato → in_preparazione → candidato) plus 2 terminal
// outcomes from candidato (finanziato / non_ammesso). Kept in sync with the DB enum below.
export type SavedGrantStatus = Database["public"]["Enums"]["saved_grant_status"];

export const SAVED_STATUSES: readonly SavedGrantStatus[] = [
  "salvato",
  "in_preparazione",
  "candidato",
  "finanziato",
  "non_ammesso",
] as const;

export interface StatusMeta {
  label: string;
  color: string; // hex, used for the column/badge accent
}

export const STATUS_META: Record<SavedGrantStatus, StatusMeta> = {
  salvato: { label: "Salvato", color: "#6b7280" }, // grigio
  in_preparazione: { label: "In preparazione", color: "#d97706" }, // giallo/ambra
  candidato: { label: "Candidato", color: "#2563eb" }, // blu
  finanziato: { label: "Finanziato", color: "#16a34a" }, // verde
  non_ammesso: { label: "Non ammesso", color: "#dc2626" }, // rosso
};

// Allowed transitions (forward and backward). Outcomes can be walked back to candidato if the
// user made a mistake.
export const TRANSITIONS: Record<SavedGrantStatus, readonly SavedGrantStatus[]> = {
  salvato: ["in_preparazione"],
  in_preparazione: ["salvato", "candidato"],
  candidato: ["in_preparazione", "finanziato", "non_ammesso"],
  finanziato: ["candidato"],
  non_ammesso: ["candidato"],
};

export function canTransition(from: SavedGrantStatus, to: SavedGrantStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// The states a card can move to from its current one (excludes staying put).
export function nextStatuses(from: SavedGrantStatus): readonly SavedGrantStatus[] {
  return TRANSITIONS[from];
}

export function statusLabel(status: SavedGrantStatus): string {
  return STATUS_META[status].label;
}
