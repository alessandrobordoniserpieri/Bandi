import type { DimensionScore, BreakdownItem, DimensionKey } from "./types";

// "Storico attività" (not "Track record") disambiguates this dimension from the "Storico"
// verdict (bando chiuso) and the profile's "Storico e finanze" section — concept §6.3.
const LABELS: Record<DimensionKey, string> = {
  themes: "Temi", legalForm: "Forma giuridica", territory: "Territorio",
  capacity: "Capacità", documents: "Documenti", trackRecord: "Storico attività",
};

export function buildBreakdown(dims: Record<DimensionKey, DimensionScore>): BreakdownItem[] {
  return (Object.keys(LABELS) as DimensionKey[]).map((key) => ({
    key, label: LABELS[key], value: dims[key].value, max: dims[key].max, note: dims[key].note,
  }));
}
