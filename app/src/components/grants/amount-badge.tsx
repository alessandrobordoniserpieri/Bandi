import type { EconomicIndicator } from "@/lib/matching";
import { Badge } from "@/components/ui/badge";
import { ECONOMIC_TONE, TONE_FALLBACK, toneStyle } from "./badge-tone";

export function AmountBadge({ indicator }: { indicator: EconomicIndicator }) {
  const amount =
    indicator.amount != null ? `€ ${indicator.amount.toLocaleString("it-IT")}` : "importo non indicato";
  return (
    <Badge
      variant="outline"
      data-level={indicator.level}
      style={toneStyle(ECONOMIC_TONE[indicator.level] ?? TONE_FALLBACK)}
    >
      {amount} · {indicator.label}
    </Badge>
  );
}
