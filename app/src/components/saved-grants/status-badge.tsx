import { STATUS_META, type SavedGrantStatus } from "@/lib/saved-grants/status";
import { Badge } from "@/components/ui/badge";
import { toneStyle, STATUS_TONE } from "@/components/grants/badge-tone";

// Pipeline-status badge shared by the Kanban (future use) and the Scadenze
// agenda (DEC-13) — same soft-tint treatment as VerdictBadge/DeadlineBadge.
// Uses STATUS_TONE (verified-contrast CSS tokens), not STATUS_META.color
// (a raw hex that fails WCAG AA in dark mode).
export function StatusBadge({ status }: { status: SavedGrantStatus }) {
  return (
    <Badge variant="outline" data-status={status} style={toneStyle(STATUS_TONE[status])}>
      {STATUS_META[status].label}
    </Badge>
  );
}
