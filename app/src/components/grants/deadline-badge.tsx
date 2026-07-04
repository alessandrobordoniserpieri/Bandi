// app/src/components/grants/deadline-badge.tsx
import type { MatchResult } from "@/lib/matching";

export function DeadlineBadge({ indicator }: { indicator: MatchResult["indicators"]["deadline"] }) {
  return <span data-color={indicator.color}>{indicator.label}</span>;
}
