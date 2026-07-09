import type { HistoryBadge as HistoryBadgeData } from "@/lib/matching";

export function HistoryBadge({ badge }: { badge: HistoryBadgeData }) {
  return (
    <span className="badge" data-history={badge.kind} style={{ fontWeight: 600 }}>
      {badge.label}
    </span>
  );
}
