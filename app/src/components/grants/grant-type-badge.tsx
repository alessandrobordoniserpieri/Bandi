import type { GrantType } from "@/lib/matching";
import { Badge } from "@/components/ui/badge";

// Purely informational, no scoring impact: renders only for co_progettazione. An ordinary bando
// renders nothing — most grants never show this badge.
export function GrantTypeBadge({ grantType }: { grantType: GrantType }) {
  if (grantType !== "co_progettazione") return null;
  return (
    <Badge variant="secondary" data-grant-type={grantType}>
      Co-progettazione
    </Badge>
  );
}
