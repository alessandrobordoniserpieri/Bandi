import type { EconomicIndicator } from "@/lib/matching";

export function AmountBadge({ indicator }: { indicator: EconomicIndicator }) {
  const amount =
    indicator.amount != null ? `€ ${indicator.amount.toLocaleString("it-IT")}` : "importo non indicato";
  return (
    <span className="badge" data-level={indicator.level}>
      {amount} · {indicator.label}
    </span>
  );
}
