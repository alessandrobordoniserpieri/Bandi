import type { MatchResult } from "@/lib/matching";

export function DeadlineBadge({ indicator }: { indicator: MatchResult["indicators"]["deadline"] }) {
  return <span className="badge badge-deadline" data-color={indicator.color}>{indicator.label}</span>;
}
