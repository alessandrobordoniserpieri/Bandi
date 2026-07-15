import type { Verdict } from "@/lib/matching";
import { Badge } from "@/components/ui/badge";
import { VERDICT_TONE, toneStyle } from "./badge-tone";

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <Badge variant="outline" data-verdict={verdict} style={toneStyle(VERDICT_TONE[verdict])}>
      {verdict}
    </Badge>
  );
}
