import type { Verdict } from "@/lib/matching";
import { Badge } from "@/components/ui/badge";
import { VERDICT_TONE, toneStyle } from "./badge-tone";
import { VERDICT_HELP } from "./verdict-help";

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const help = VERDICT_HELP[verdict];
  return (
    <Badge
      variant="outline"
      data-verdict={verdict}
      style={toneStyle(VERDICT_TONE[verdict])}
      title={help}
      aria-label={`${verdict}: ${help}`}
    >
      {verdict}
    </Badge>
  );
}
