// app/src/components/grants/verdict-badge.tsx
import type { Verdict } from "@/lib/matching";

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span data-verdict={verdict}>{verdict}</span>;
}
