// app/src/components/grants/score-breakdown.tsx
import type { BreakdownItem } from "@/lib/matching";

export function ScoreBreakdown({ breakdown }: { breakdown: BreakdownItem[] }) {
  return (
    <ul>
      {breakdown.map((item) => (
        <li key={item.key}>
          <span>{item.label}</span>{" "}
          <progress value={item.value} max={item.max}>{item.value}/{item.max}</progress>{" "}
          <span>{item.value}/{item.max}</span>
          <div>{item.note}</div>
        </li>
      ))}
    </ul>
  );
}
