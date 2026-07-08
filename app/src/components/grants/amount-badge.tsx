// app/src/components/grants/amount-badge.tsx
import type { EconomicIndicator, EconomicLevel } from "@/lib/matching";

const COLOR: Record<EconomicLevel, string> = {
  alla_tua_portata: "#16a34a", // verde
  ambizioso: "#d97706", // giallo/ambra
  fuori_scala: "#dc2626", // rosso
  da_verificare: "#6b7280", // grigio
};

// §2.7A: the grant amount formatted it-IT (€ 1.500.000) + the coherence reading, color-coded.
// Not scored — purely a visual indicator, shown on every card and the detail.
export function AmountBadge({ indicator }: { indicator: EconomicIndicator }) {
  const amount =
    indicator.amount != null ? `€ ${indicator.amount.toLocaleString("it-IT")}` : "importo non indicato";
  return (
    <span data-level={indicator.level} style={{ color: COLOR[indicator.level] }}>
      {amount} · {indicator.label}
    </span>
  );
}
