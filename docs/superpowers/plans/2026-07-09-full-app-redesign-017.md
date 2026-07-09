# Plan — branch 017 `feat/017-full-app-redesign`

> Full visual redesign of the six authenticated app surfaces (dashboard, nuovi bandi, dettaglio
> bando, i miei bandi, profilo, onboarding), replacing the mechanically-styled first pass (016)
> with one that actually executes PRODUCT.md's principles. Design direction locked via a
> `grilling`-style interview (see summary below); execution follows TDD for new behavior and
> `verification-before-completion` for every claim — real test/build output and real screenshots,
> not "should work."

## Design brief (confirmed, do not re-derive)

**Audience & mood**: weekly/occasional use, often triggered by the Monday digest email. Mixed
mental state — calm exploration ("what's new") vs. pressured search under a deadline ("what can I
still apply to"). Must be immediately comprehensible every session; no relied-upon learned
shortcuts.

**Primary surface**: the grant list/dashboard is the most-invested surface — first contact, where
trust in the score is won or lost. Detail page is second. Kanban/profilo are secondary, used only
by already-engaged users.

**Color strategy**: Restrained app-wide (neutral tokens + one blue accent, already in
`globals.css`). Committed (solid color) reserved for 1–2 high-value moments only — already spent
on the auth brand panel (016). Do not introduce more Committed surfaces without asking.

**Light/dark**: light is primary (office, daytime, shared screens, occasional printing). Dark
stays as the existing automatic `prefers-color-scheme` secondary — no new design investment there
beyond keeping the existing (already-fixed) dark contrast tokens consistent.

**Anchor references**: Instrumentl (domain — what to actively avoid: generic SaaS grant-scoring
look), Stripe Dashboard (calm density, clear hierarchy with many numbers on screen at once), Wise
(trust around serious/money matters without corporate coldness). Anti-references unchanged from
PRODUCT.md (Duolingo/gamification, Monday.com neon, AdminLTE, startup gradients, SAP/Oracle).

**Score module** (the single most-repeated element — grant-card, detail page, kanban card): number
+ a thin horizontal color bar underneath, colored by verdict. Explicitly NOT a circular/ring
progress indicator — that reads as gamification (Duolingo/fitness-app coded), which PRODUCT.md's
anti-references ban outright.

**List density**: user-togglable, not auto-derived from result count (auto-switching would be an
invisible, unpredictable layout change between sessions — violates the "same rhythm every time"
consistency principle). Toggle sits at the top of the list: "Vista a card" (spacious, default) /
"Vista compatta" (dense). Persisted per user across sessions (cookie).

**Filter bar**: the original critique flagged 16 simultaneous visible controls (cognitive-load
violation, >4 items at a decision point). Collapse secondary filters (verdetto multi-select, ambito
multi-select, importo min/max) behind an "Altri filtri" disclosure; keep sort, "solo candidabili",
and the new density toggle visible by default.

**Scope for this pass**: production-ready, all six surfaces, in this order: (1) dashboard/nuovi
bandi shared components (grant-card, filter-bar, score module, density toggle), (2) dettaglio
bando, (3) i miei bandi (kanban) + profilo, (4) onboarding. Each task gated by its own
test/build/screenshot verification before moving to the next — not one big bang at the end.

## Files

- `app/src/lib/grants/view-density.ts` — new. `DensityMode = "card" | "compact"`, a
  `parseDensityCookie`/`serializeDensityCookie` pair (pure functions, unit-tested first).
- `app/src/components/grants/density-toggle.tsx` — new client component, two buttons ("Vista a
  card" / "Vista compatta"), reads/writes the `bandi-density` cookie via a server action,
  `aria-pressed` on the active mode.
- `app/src/components/grants/grant-card.tsx` — score module becomes number + `<div class="score-bar">`
  (verdict-colored `<div class="score-bar-fill">`), reflow badges under it. Add a `density` prop
  driving a `data-density` attribute for the compact-mode CSS variant.
- `app/src/components/grants/filter-bar.tsx` — wrap verdetto/ambito/importo behind a
  `<details class="filter-bar-more">` disclosure ("Altri filtri"); sort + solo-candidabili +
  density toggle stay always visible.
- `app/src/app/(app)/page.tsx`, `app/src/app/(app)/nuovi-bandi/page.tsx` — read the density cookie
  server-side, pass to `FilterBar`/`GrantCard`.
- `app/src/app/(app)/bandi/[id]/page.tsx` — detail page score module reuses the same score-bar
  pattern at a larger scale; visual pass on section rhythm.
- `app/src/components/saved-grants/saved-grant-card.tsx`, `kanban-column.tsx` — score-bar applied
  to kanban cards; visual density pass (unchanged status state machine/logic).
- `app/src/app/(app)/profilo/page.tsx` + section components — visual pass only (spacing,
  accordion polish); no behavior change.
- `app/src/app/(app)/onboarding/page.tsx`, `wizard.tsx` — visual pass only, inherits patterns from
  the rest.
- `app/src/app/globals.css` — `.score-bar`/`.score-bar-fill`, `[data-density="compact"]` variants
  for `.grant-card`/`.kanban-card`, `.filter-bar-more`, `.density-toggle`.

## Tests / verification

- `view-density.test.ts` — TDD: write failing tests for `parseDensityCookie`/
  `serializeDensityCookie` first (unknown/missing value → `"card"` default; round-trip for both
  modes), watch them fail, then implement.
- `density-toggle` — render test asserting both buttons present, `aria-pressed` reflects the
  current mode, `data-density` attribute present (existing project convention: assert on markup/
  attributes, not CSS classes).
- Existing `grants-components.test.tsx` / `discovery-components.test.tsx` — extend for the new
  score-bar markup (assert verdict color still reaches the DOM via `data-*`, not hardcoded style).
- Full suite (`npm test --workspace=app`) green after every task, not just at the end.
- `npm run build --workspace=app` clean after every task.
- Screenshot verification per task: desktop (1400×900) and mobile (390×844) for the surface just
  changed, read back before claiming the task done (per `verification-before-completion` — no
  "should look right").
- Static + live `impeccable` detector run once at the end across all touched surfaces.

## Notes

Kanban status state machine, saved-grants actions, profile server actions, and all matching/
scoring logic are unchanged — this branch is presentation only, except for the new density-cookie
read/write which is genuinely new behavior and gets full TDD (red → green → refactor), not folded
into the visual work.
