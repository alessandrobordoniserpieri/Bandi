# Plan — branch 013 `feat/013-storico-matching`

> Depends on 002 (matching) + 005 (grant display) + 010 (saved grants auto-populate history).
> §2.8 specific-history match (NOT scored): compares the entity's project history with the
> current grant and produces the badge **Già finanziato / Già candidato / Conosce l'erogatore**.

## Design
- `matchHistory(history, grant) → HistoryBadge | null` on two levels:
  - **grant-level** — the SAME bando in history, detected by fuzzy name match (Levenshtein
    similarity ≥ 0.85 after normalization). Outcome decides: `finanziato` → **Già finanziato**;
    otherwise (applied but not funded) → **Già candidato**.
  - **provider-level** — `provider_id` matches on a DIFFERENT bando → **Conosce l'erogatore**.
  - Priority: finanziato > candidato > conosce; empty/no match → null.
- Name normalization: lowercase, strip accents, drop years, "edizione", common legal suffixes
  (S.p.A. …), punctuation → space, collapse spaces. So "Bando Sport 2024 — edizione 2024" and
  "Bando Sport" normalize equal.
- `calculateMatch` carries `historyBadge` in `MatchResult`, **outside the score** — the badge
  never alters score or verdict (property-tested by swapping only `provider_id`).
- The dim-6 "+1 same funding kind" bonus the roadmap mentions is **already** implemented in
  `scoreTrackRecord` (002); nothing to add.

## Files
- `lib/matching/storico-match.ts` (new: normalizeName, nameSimilarity, matchHistory),
  `types.ts` (HistoryBadge/HistoryBadgeKind + `MatchResult.historyBadge`), `calculate-match.ts`,
  `index.ts` (exports), `components/grants/history-badge.tsx` (new), `grant-card.tsx` +
  `bandi/[id]/page.tsx` (fill the storico slot). Existing MatchResult fixtures updated.

## Tests
- `storico-match.test.ts` — the badge cases, fuzzy match with edition/year noise, priority,
  normalization; **20 real-ish name pairs (10 match / 10 no)** all classified correctly;
  property: changing only `provider_id` flips the badge but leaves score/verdict identical.
