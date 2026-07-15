import type { MatchResult } from "@/lib/matching";
import { Badge } from "@/components/ui/badge";
import { DEADLINE_TONE, TONE_FALLBACK, toneStyle } from "./badge-tone";

export function DeadlineBadge({ indicator }: { indicator: MatchResult["indicators"]["deadline"] }) {
  return (
    <Badge
      variant="outline"
      data-color={indicator.color}
      style={toneStyle(DEADLINE_TONE[indicator.color] ?? TONE_FALLBACK)}
    >
      {indicator.label}
    </Badge>
  );
}
