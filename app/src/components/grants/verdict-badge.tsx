import type { Verdict } from "@/lib/matching";

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className="badge badge-verdict" data-verdict={verdict}>{verdict}</span>;
}
