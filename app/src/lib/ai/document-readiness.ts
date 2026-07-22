// app/src/lib/ai/document-readiness.ts
// Pure derivation of the "strong analysis" UI state (spec §9) from the grant's PDF count and its
// grant_documents rows. No I/O — callers (prepare/status routes) fetch the inputs.
export type ReadinessState =
  | "no_documents"
  | "not_started"
  | "preparing"
  | "ready"
  | "ready_partial"
  | "failed_total";

export interface DocumentStatusRow {
  status: string;
}

export function deriveReadiness(totalPdfCount: number, rows: DocumentStatusRow[]): ReadinessState {
  if (totalPdfCount === 0) return "no_documents";
  if (rows.length === 0) return "not_started";
  if (rows.some((r) => r.status === "pending" || r.status === "processing")) return "preparing";

  const readyCount = rows.filter((r) => r.status === "ready").length;
  if (readyCount === 0) return "failed_total";
  if (readyCount < rows.length) return "ready_partial";
  return "ready";
}
