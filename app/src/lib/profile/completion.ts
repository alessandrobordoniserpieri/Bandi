import type { ProfileRow } from "./schema";
import { SECTION_META, type SectionKey } from "./constants";

export type CompletionSuggestion = { section: SectionKey; points: number; message: string };
export type ProfileCompletion = { percent: number; suggestions: CompletionSuggestion[] };

// Sections that unlock matching points, in canonical order.
const WEIGHTED: SectionKey[] = ["identity", "territory", "themes", "capacity", "documents", "history"];

function isFilled(section: SectionKey, r: ProfileRow): boolean {
  switch (section) {
    case "identity":  return !!r.name && !!r.legal_type;
    case "territory": return !!r.province;
    case "themes":    return r.themes.length > 0;
    case "capacity":
      return (
        !!r.stable_staff && r.dedicated_admin !== null && !!r.funded_projects_3y &&
        !!r.reporting_experience && !!r.annual_budget && r.eu_project !== null
      );
    case "documents":
      return (
        r.doc_statuto || r.doc_bilancio || r.doc_runts ||
        r.doc_rasd || r.doc_durc || r.doc_certificazioni
      );
    case "history":
      return Array.isArray(r.project_history) && r.project_history.length > 0;
    default:
      return false;
  }
}

const SUGGESTION_TEXT: Record<SectionKey, string> = {
  identity:     "Completa l'identità dell'ente",
  territory:    "Completa il territorio di attività",
  themes:       "Indica i temi e le attività dell'ente",
  capacity:     "Compila la capacità gestionale",
  documents:    "Aggiungi i documenti e registri",
  partnerships: "Aggiungi le partnership",
  history:      "Aggiungi lo storico progetti",
  contacts:     "Aggiungi i contatti",
};

export function profileCompletion(row: ProfileRow): ProfileCompletion {
  let percent = 0;
  const suggestions: CompletionSuggestion[] = [];

  for (const section of WEIGHTED) {
    const points = SECTION_META[section].points;
    if (isFilled(section, row)) {
      percent += points;
    } else {
      suggestions.push({
        section,
        points,
        message: `${SUGGESTION_TEXT[section]} per sbloccare ${points} punti di matching`,
      });
    }
  }

  suggestions.sort((a, b) => b.points - a.points);
  return { percent, suggestions };
}
