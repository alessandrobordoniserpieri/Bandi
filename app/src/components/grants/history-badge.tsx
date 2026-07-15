import type { HistoryBadge as HistoryBadgeData } from "@/lib/matching";
import { Badge } from "@/components/ui/badge";
import { HISTORY_TONE, toneStyle } from "./badge-tone";

export function HistoryBadge({ badge }: { badge: HistoryBadgeData }) {
  return (
    <Badge
      variant="outline"
      data-history={badge.kind}
      className="font-semibold"
      style={toneStyle(HISTORY_TONE)}
    >
      {badge.label}
    </Badge>
  );
}
