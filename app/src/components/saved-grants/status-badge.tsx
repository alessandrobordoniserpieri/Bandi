import { STATUS_META, type SavedGrantStatus } from "@/lib/saved-grants/status";
import { Badge } from "@/components/ui/badge";
import { toneStyle } from "@/components/grants/badge-tone";

// Pipeline-status badge shared by the Kanban (future use) and the Scadenze
// agenda (DEC-13) — same soft-tint treatment as VerdictBadge/DeadlineBadge,
// keyed to the same STATUS_META colors already used for Kanban columns.
export function StatusBadge({ status }: { status: SavedGrantStatus }) {
  return (
    <Badge variant="outline" data-status={status} style={toneStyle(STATUS_META[status].color)}>
      {STATUS_META[status].label}
    </Badge>
  );
}
