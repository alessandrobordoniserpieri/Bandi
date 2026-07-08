// app/src/lib/matching/economic-coherence.ts
// §2.7A — economic coherence indicator (NOT scored): grant amount / entity annual budget →
// a colored reading. The budget is a band, so we use each band's midpoint (the open-ended
// >500k band is treated as 750k) documented below.
import type { CapacityAnswers, EconomicCoherence, EconomicLevel } from "./types";

export type BudgetBand = CapacityAnswers["annualBudget"];

// Midpoints of each declared band (euros). >500k is open-ended → 750k by convention.
const BUDGET_MIDPOINT: Record<BudgetBand, number> = {
  "<20k": 10_000,
  "20-100k": 60_000,
  "100-500k": 300_000,
  ">500k": 750_000,
};

const LABEL: Record<EconomicLevel, string> = {
  da_verificare: "da verificare",
  alla_tua_portata: "alla tua portata",
  ambizioso: "ambizioso",
  fuori_scala: "fuori scala",
};

// Thresholds on ratio = grantAmount / budgetMidpoint (§2.7A):
//   < 0.05         → da verificare (troppo piccolo)
//   0.05 .. < 1.0  → alla tua portata (0.05–0.3 fascia bassa, 0.3–1.0 fascia alta)
//   1.0 .. 2.0     → ambizioso
//   > 2.0          → fuori scala
//   missing amount or budget → da verificare (non valutabile)
export function economicCoherence(
  grantAmount: number | null,
  budgetBand: BudgetBand | null,
): EconomicCoherence {
  if (grantAmount == null || grantAmount <= 0 || budgetBand == null) {
    return { ratio: null, level: "da_verificare", label: LABEL.da_verificare };
  }
  const ratio = grantAmount / BUDGET_MIDPOINT[budgetBand];

  let level: EconomicLevel;
  if (ratio < 0.05) level = "da_verificare";
  else if (ratio < 1.0) level = "alla_tua_portata";
  else if (ratio <= 2.0) level = "ambizioso";
  else level = "fuori_scala";

  return { ratio, level, label: LABEL[level] };
}
