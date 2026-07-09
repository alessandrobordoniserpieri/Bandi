import type { BreakdownItem } from "@/lib/matching";

export function ScoreBreakdown({ breakdown }: { breakdown: BreakdownItem[] }) {
  return (
    <ul className="breakdown-list">
      {breakdown.map((item) => (
        <li key={item.key} className="breakdown-item">
          <span className="breakdown-label">{item.label}</span>
          <progress value={item.value} max={item.max}>{item.value}/{item.max}</progress>
          <span className="breakdown-score">{item.value}/{item.max}</span>
          {item.note && <div className="breakdown-note">{item.note}</div>}
        </li>
      ))}
    </ul>
  );
}
