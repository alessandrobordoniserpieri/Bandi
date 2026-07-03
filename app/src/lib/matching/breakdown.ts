import type { DimensionScore, BreakdownItem, DimensionKey } from "./types";

const LABELS: Record<DimensionKey, string> = {
  themes: "Temi", legalForm: "Forma giuridica", territory: "Territorio",
  capacity: "Capacità", documents: "Documenti", trackRecord: "Track record",
};

export function buildBreakdown(dims: Record<DimensionKey, DimensionScore>): BreakdownItem[] {
  return (Object.keys(LABELS) as DimensionKey[]).map((key) => ({
    key, label: LABELS[key], value: dims[key].value, max: dims[key].max, note: dims[key].note,
  }));
}
