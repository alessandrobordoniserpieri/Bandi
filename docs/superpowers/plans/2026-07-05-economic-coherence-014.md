# Plan — branch 014 `feat/014-economic-coherence`

> Depends on 002 (matching) + 005 (grant display). The §2.7A visual indicator: grant amount /
> entity annual budget → a colored, **non-scored** reading. Fills the amount slot in the
> grant-card and the detail.

## Design
- `economicCoherence(grantAmount, budgetBand)` → `{ratio, level, label}`. The budget is a band;
  we use each band's **midpoint** (`<20k`=10k, `20-100k`=60k, `100-500k`=300k, `>500k`=750k,
  the open-ended top band by convention). Thresholds on ratio (§2.7A):
  `<0.05` da verificare · `0.05–1.0` alla tua portata (0.3 splits the reading, same level) ·
  `1.0–2.0` ambizioso · `>2.0` fuori scala · missing amount/budget → da verificare.
- `buildIndicators` gains a third `economic` indicator (amount + `budgetKnown`) alongside
  deadline and cofunding. The score is untouched — indicator only.
- `AmountBadge` renders the it-IT amount (`€ 1.500.000`) colored by level; the detail adds a
  prompt to fill the profile budget when `budgetKnown` is false.

## Files
- `lib/matching/economic-coherence.ts` (new), `types.ts` (EconomicLevel/Coherence/Indicator),
  `indicators.ts` (+economic), `index.ts` (exports), `components/grants/amount-badge.tsx` (new),
  `grant-card.tsx` + `bandi/[id]/page.tsx` (wire).

## Tests
- `economic-coherence.test.ts` — every §2.7A row incl. exact borders 0.05 / 0.3 / 1.0 / 2.0,
  missing-data cases, band midpoints, it-IT formatting. Existing card/filter fixtures updated
  for the new indicator; score never changes (covered by the untouched calculate-match tests).
