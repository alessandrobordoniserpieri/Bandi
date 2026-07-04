# Grant Display (branch 005) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show grants to the user with their match: a grant card (score, verdict, colored deadline) and a full detail page (§5.3 — 6-bar breakdown, indicators, missing-documents checklist, link to the original), plus a dev seed of realistic grants. This is the first screen where matching + profile + grants meet.

**Architecture:** Pure logic first — a `grants` DB row → matching `Grant` mapper (joining the provider for kind/name, coalescing nullable text per branch-001 notes) and a pure `buildMatchedGrants(profile, grants)` that applies `calculateMatch` and sorts. Then presentational components (badges, breakdown, checklist, card) tested via `renderToStaticMarkup`. Then a minimal `/bandi` list page and the `/bandi/[id]` detail page (server components that recompute matching per request → invariant I10). A dev-only SQL seed feeds the pages for manual verification.

**Tech Stack:** Next.js 16 (App Router, async `cookies()`, server components) / React 19 / `@supabase/ssr` / vitest (+ `renderToStaticMarkup` from `react-dom/server`, already the project's component-test method — no testing-library/jsdom added). Consumes `@/lib/matching` (branch 002) and `@/lib/profile` (branch 004), both in `main`.

## Global Constraints

- **UI language: Italian. Code/comments: English.** (project CLAUDE.md)
- **This is Next.js 16, not your training data.** `cookies()` is async; a `"use server"` module exports only async functions; read `node_modules/next/dist/docs/` before writing routes.
- Matching is authoritative: components render what `calculateMatch` / `buildIndicators` produce. Do **not** re-derive scores, colors, verdicts, or thresholds in the UI — read them from `MatchResult` / `Indicators`.
- **Invariant I10:** score reflects the current profile with no manual invalidation. The list and detail pages are dynamic server components that load the profile + grants and recompute matching on every request — never cache a `MatchResult`.
- **ADR-006 desktop-first:** semantic, responsive markup; readable at 1280px, not broken at 375px. No heavy styling in this branch (unstyled/semantic HTML, matching existing pages).
- Import all matching constants/types/functions from `@/lib/matching`; import the profile mapper from `@/lib/profile/schema`. Do not re-declare them.
- Seed SQL under `app/supabase/seed-dev/` is **development-only** — never referenced by app code or migrations.
- The "badge storico" slot (branch 013) and colored-amount slot (branch 014) are **placeholders** in the card — do not implement their logic here.
- "Salva" and "Analisi AI" buttons on the detail page are **disabled placeholders** with an Italian "in arrivo" tooltip (activated in branches 010 / 011).

## Reference: exact shapes this branch builds on (already in `main`)

`Grant` (matching/types.ts): `{ id; title; providerId: string|null; providerKind: ProviderKind|null; deadline: string|null; status: "aperto"|"chiuso"; amount: number|null; cofundingRequired: number|null; eligibleTypes: string[]; tags: string[]; area: string|null; geoScope: GeoScope|null; complexity: ComplexityLevel|null; requiredDocuments: string[]; summary: string; requirements: string; url: string; beneficiaries: string }` (summary/requirements/beneficiaries are **non-null** strings).

`grants` Row (database.types.ts): same columns snake_case, but `summary`/`requirements`/`beneficiaries`/`area`/`amount`/`cofunding_required`/`deadline`/`geo_scope`/`complexity`/`provider_id` are nullable; `status` is `grant_status` (`"aperto"|"chiuso"`); `eligible_types`/`tags`/`required_documents` are non-null arrays.

`MatchResult` (matching/types.ts): `{ score; baseScore; verdict: Verdict; breakdown: BreakdownItem[] (exactly 6); bonuses: BonusItem[]; indicators: Indicators; missingDocuments: string[]; actions: string[] }`.
`BreakdownItem`: `{ key: DimensionKey; label: string; value: number; max: number; note: string }`.
`Indicators`: `{ deadline: { days: number|null; color: "verde"|"giallo"|"rosso"|"nero"; label: string }; cofunding: { required: number|null; color: "verde"|"giallo"|"rosso"|"grigio"; label: string } }`.
`calculateMatch(profile: EntityProfile, grant: Grant): MatchResult`.
`rowToEntityProfile(row: ProfileRow): EntityProfile` (from `@/lib/profile/schema`).

Supabase provider join: `.select("*, provider:grant_providers(name, kind)")` returns each grants row with an embedded `provider: { name: string; kind: ProviderKind } | null`.

---

## File Structure

- `app/src/lib/grants/mapping.ts` — pure `mapGrantRow(row) → { grant: Grant; providerName: string|null }`.
- `app/src/lib/grants/queries.ts` — server-side `getGrants()`, `getGrant(id)` (Supabase + `mapGrantRow`).
- `app/src/lib/grants/match-list.ts` — pure `buildMatchedGrants(profile, views) → MatchedGrant[]`.
- `app/src/lib/grants/__tests__/mapping.test.ts`, `match-list.test.ts`.
- `app/src/components/grants/deadline-badge.tsx`, `verdict-badge.tsx`, `score-breakdown.tsx`, `document-checklist.tsx`, `grant-card.tsx`.
- `app/src/components/grants/__tests__/grants-components.test.tsx`.
- `app/src/app/(app)/bandi/page.tsx` — minimal list (cards sorted by score).
- `app/src/app/(app)/bandi/[id]/page.tsx` — detail (§5.3).
- `app/src/app/(app)/layout.tsx` — add a "Bandi" nav link.
- `app/supabase/seed-dev/grants.sql` — 15–18 realistic dev grants.
- `docs/adr/0006-desktop-first.md`.

---

### Task 1: grants row→Grant mapper + queries

**Files:**
- Create: `app/src/lib/grants/mapping.ts`
- Create: `app/src/lib/grants/queries.ts`
- Test: `app/src/lib/grants/__tests__/mapping.test.ts`

**Interfaces:**
- Consumes: `Grant`, `ProviderKind` types from `@/lib/matching`; `Tables` from `@/lib/supabase/database.types`; `createClient` from `@/lib/supabase/server`.
- Produces:
  - `type GrantRow = Tables<"grants">`
  - `type GrantRowWithProvider = GrantRow & { provider: { name: string; kind: ProviderKind } | null }`
  - `type GrantView = { grant: Grant; providerName: string | null }`
  - `mapGrantRow(row: GrantRowWithProvider): GrantView`
  - `async getGrants(): Promise<GrantView[]>`
  - `async getGrant(id: string): Promise<GrantView | null>`

- [ ] **Step 1: Write the failing test `mapping.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { mapGrantRow, type GrantRowWithProvider } from "../mapping";

function row(overrides: Partial<GrantRowWithProvider> = {}): GrantRowWithProvider {
  return {
    id: "g1", title: "Bando Sport 2026", provider_id: "prov1",
    deadline: "2026-12-31", status: "aperto", amount: 50000, cofunding_required: 20,
    eligible_types: ["APS - Associazione di Promozione Sociale"], tags: ["sport"],
    area: "Lombardia", geo_scope: "regionale", complexity: "media",
    required_documents: ["statuto", "bilancio"],
    summary: null, requirements: null, beneficiaries: null,
    url: "https://example.it/bando", source_id: null, raw: null,
    discovered_at: "2026-07-01T00:00:00Z", created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    provider: { name: "Fondazione Test", kind: "privato" },
    ...overrides,
  };
}

describe("mapGrantRow", () => {
  it("maps columns to the matching Grant and lifts provider kind + name", () => {
    const { grant, providerName } = mapGrantRow(row());
    expect(grant.id).toBe("g1");
    expect(grant.providerId).toBe("prov1");
    expect(grant.providerKind).toBe("privato");
    expect(providerName).toBe("Fondazione Test");
    expect(grant.status).toBe("aperto");
    expect(grant.geoScope).toBe("regionale");
    expect(grant.requiredDocuments).toEqual(["statuto", "bilancio"]);
  });

  it("coalesces nullable text (summary/requirements/beneficiaries) to empty string", () => {
    const { grant } = mapGrantRow(row());
    expect(grant.summary).toBe("");
    expect(grant.requirements).toBe("");
    expect(grant.beneficiaries).toBe("");
  });

  it("handles a missing provider (null join) → providerKind null, providerName null", () => {
    const { grant, providerName } = mapGrantRow(row({ provider: null, provider_id: null }));
    expect(grant.providerKind).toBeNull();
    expect(providerName).toBeNull();
    expect(grant.providerId).toBeNull();
  });

  it("passes nullable scalars through as null (amount/cofunding/deadline/area/geo/complexity)", () => {
    const { grant } = mapGrantRow(row({
      amount: null, cofunding_required: null, deadline: null,
      area: null, geo_scope: null, complexity: null,
    }));
    expect(grant.amount).toBeNull();
    expect(grant.cofundingRequired).toBeNull();
    expect(grant.deadline).toBeNull();
    expect(grant.area).toBeNull();
    expect(grant.geoScope).toBeNull();
    expect(grant.complexity).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/grants/__tests__/mapping.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `mapping.ts`**

```ts
// app/src/lib/grants/mapping.ts
import type { Grant, ProviderKind } from "@/lib/matching";
import type { Tables } from "@/lib/supabase/database.types";

export type GrantRow = Tables<"grants">;
export type GrantRowWithProvider = GrantRow & {
  provider: { name: string; kind: ProviderKind } | null;
};
export type GrantView = { grant: Grant; providerName: string | null };

export function mapGrantRow(row: GrantRowWithProvider): GrantView {
  const grant: Grant = {
    id: row.id,
    title: row.title,
    providerId: row.provider_id,
    providerKind: row.provider?.kind ?? null,
    deadline: row.deadline,
    status: row.status,
    amount: row.amount,
    cofundingRequired: row.cofunding_required,
    eligibleTypes: row.eligible_types,
    tags: row.tags,
    area: row.area,
    geoScope: row.geo_scope,
    complexity: row.complexity,
    requiredDocuments: row.required_documents,
    summary: row.summary ?? "",
    requirements: row.requirements ?? "",
    url: row.url,
    beneficiaries: row.beneficiaries ?? "",
  };
  return { grant, providerName: row.provider?.name ?? null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/grants/__tests__/mapping.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `queries.ts`** (server-side; not unit-tested — verified via the pages' build + manual)

```ts
// app/src/lib/grants/queries.ts
import { createClient } from "@/lib/supabase/server";
import { mapGrantRow, type GrantRowWithProvider, type GrantView } from "./mapping";

const SELECT = "*, provider:grant_providers(name, kind)";

export async function getGrants(): Promise<GrantView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grants")
    .select(SELECT)
    .order("deadline", { ascending: true, nullsFirst: false });
  if (error || !data) return [];
  return (data as unknown as GrantRowWithProvider[]).map(mapGrantRow);
}

export async function getGrant(id: string): Promise<GrantView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grants")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapGrantRow(data as unknown as GrantRowWithProvider);
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
cd app && npx tsc --noEmit
git add src/lib/grants/mapping.ts src/lib/grants/queries.ts src/lib/grants/__tests__/mapping.test.ts
git commit -m "feat(grants): grants row→Grant mapper (provider join) + server queries"
```

---

### Task 2: match-list (pure sort by score, closed to tail)

**Files:**
- Create: `app/src/lib/grants/match-list.ts`
- Test: `app/src/lib/grants/__tests__/match-list.test.ts`

**Interfaces:**
- Consumes: `EntityProfile`, `calculateMatch`, `MatchResult` from `@/lib/matching`; `GrantView` from `./mapping`.
- Produces:
  - `type MatchedGrant = GrantView & { match: MatchResult }`
  - `buildMatchedGrants(profile: EntityProfile, views: GrantView[]): MatchedGrant[]`

**Behavior:** apply `calculateMatch(profile, view.grant)` to each; sort by `match.score` descending; **closed grants (verdict "Storico") always sort after open ones** regardless of score; the sort is stable within a group (input order preserved for equal scores).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildMatchedGrants } from "../match-list";
import type { GrantView } from "../mapping";
import type { EntityProfile, Grant } from "@/lib/matching";

// Minimal profile — exact scores don't matter; relative ordering does.
function profile(): EntityProfile {
  return {
    legalType: "APS - Associazione di Promozione Sociale",
    province: "MI", region: "Lombardia", operatingProvinces: [],
    themes: ["sport"], capacity: null,
    documents: { statuto: true, bilancio: true, runts: false, rasd: false, durc: false, certificazioni: false },
    publicPartners: false, privatePartners: false, projectHistory: [],
    fundingTypesReceived: [], cofundingCapacity: null,
  };
}
function grant(id: string, over: Partial<Grant> = {}): Grant {
  return {
    id, title: id, providerId: null, providerKind: null,
    deadline: "2026-12-31", status: "aperto", amount: null, cofundingRequired: null,
    eligibleTypes: ["APS - Associazione di Promozione Sociale"], tags: ["sport"],
    area: null, geoScope: null, complexity: null, requiredDocuments: [],
    summary: "", requirements: "", url: `https://x/${id}`, beneficiaries: "", ...over,
  };
}
function view(g: Grant): GrantView { return { grant: g, providerName: null }; }

describe("buildMatchedGrants", () => {
  it("sorts open grants by score descending", () => {
    // strong match vs weak match (wrong type + no shared tag)
    const strong = view(grant("strong"));
    const weak = view(grant("weak", { eligibleTypes: ["Comune"], tags: ["cultura"] }));
    const out = buildMatchedGrants(profile(), [weak, strong]);
    expect(out.map((m) => m.grant.id)).toEqual(["strong", "weak"]);
    expect(out[0].match.score).toBeGreaterThanOrEqual(out[1].match.score);
  });

  it("puts closed grants (verdict Storico) after all open grants, even with a higher raw score", () => {
    const closedStrong = view(grant("closed", { status: "chiuso", deadline: "2020-01-01" }));
    const openWeak = view(grant("open", { eligibleTypes: ["Comune"], tags: ["cultura"] }));
    const out = buildMatchedGrants(profile(), [closedStrong, openWeak]);
    expect(out.map((m) => m.grant.id)).toEqual(["open", "closed"]);
    expect(out[1].match.verdict).toBe("Storico");
  });

  it("is stable for equal-score open grants (preserves input order)", () => {
    const a = view(grant("a"));
    const b = view(grant("b"));
    const out = buildMatchedGrants(profile(), [a, b]);
    // identical grants → identical score → input order kept
    expect(out.map((m) => m.grant.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/grants/__tests__/match-list.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `match-list.ts`**

```ts
// app/src/lib/grants/match-list.ts
import { calculateMatch, type EntityProfile, type MatchResult } from "@/lib/matching";
import type { GrantView } from "./mapping";

export type MatchedGrant = GrantView & { match: MatchResult };

export function buildMatchedGrants(profile: EntityProfile, views: GrantView[]): MatchedGrant[] {
  const matched: MatchedGrant[] = views.map((v) => ({ ...v, match: calculateMatch(profile, v.grant) }));
  // Closed grants (verdict "Storico") always sink below open ones; within a group,
  // higher score first. Array.prototype.sort is stable (ES2019+), so equal keys
  // keep input order.
  return matched.sort((a, b) => {
    const aClosed = a.match.verdict === "Storico" ? 1 : 0;
    const bClosed = b.match.verdict === "Storico" ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
    return b.match.score - a.match.score;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/grants/__tests__/match-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd app && npx tsc --noEmit
git add src/lib/grants/match-list.ts src/lib/grants/__tests__/match-list.test.ts
git commit -m "feat(grants): buildMatchedGrants — pure match + sort (closed to tail)"
```

---

### Task 3: presentational components (badges, breakdown, checklist)

**Files:**
- Create: `app/src/components/grants/deadline-badge.tsx`, `verdict-badge.tsx`, `score-breakdown.tsx`, `document-checklist.tsx`
- Test: `app/src/components/grants/__tests__/grants-components.test.tsx`

**Interfaces (all take matching output — no re-derivation):**
- `DeadlineBadge({ indicator })` — `indicator: MatchResult["indicators"]["deadline"]`. Renders `indicator.label` and a `data-color={indicator.color}` attribute (the 4 colors: verde/giallo/rosso/nero).
- `VerdictBadge({ verdict })` — `verdict: Verdict`. Renders the Italian verdict text + `data-verdict={verdict}`.
- `ScoreBreakdown({ breakdown })` — `breakdown: BreakdownItem[]` (exactly 6). Renders 6 rows, each with `label`, `value`/`max`, `note`, and a `<progress value={value} max={max}>`.
- `DocumentChecklist({ missing })` — `missing: string[]`. If empty → "Hai tutti i documenti richiesti."; else "Per candidarti ti manca:" + a `<li>` per document.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DeadlineBadge } from "../deadline-badge";
import { VerdictBadge } from "../verdict-badge";
import { ScoreBreakdown } from "../score-breakdown";
import { DocumentChecklist } from "../document-checklist";
import type { BreakdownItem } from "@/lib/matching";

describe("DeadlineBadge", () => {
  it("renders each of the 4 colors from the indicator", () => {
    for (const color of ["verde", "giallo", "rosso", "nero"] as const) {
      const html = renderToStaticMarkup(
        <DeadlineBadge indicator={{ days: 5, color, label: `label-${color}` }} />,
      );
      expect(html).toContain(`data-color="${color}"`);
      expect(html).toContain(`label-${color}`);
    }
  });
});

describe("VerdictBadge", () => {
  it("renders the verdict text and data attribute", () => {
    const html = renderToStaticMarkup(<VerdictBadge verdict="Candidabile" />);
    expect(html).toContain("Candidabile");
    expect(html).toContain('data-verdict="Candidabile"');
  });
});

describe("ScoreBreakdown", () => {
  it("renders exactly 6 progress bars with value/max and notes", () => {
    const items: BreakdownItem[] = [
      { key: "themes", label: "Temi", value: 20, max: 28, note: "n1" },
      { key: "legalForm", label: "Forma", value: 22, max: 22, note: "n2" },
      { key: "territory", label: "Territorio", value: 10, max: 18, note: "n3" },
      { key: "capacity", label: "Capacità", value: 9, max: 14, note: "n4" },
      { key: "documents", label: "Documenti", value: 8, max: 12, note: "n5" },
      { key: "trackRecord", label: "Storico", value: 3, max: 6, note: "n6" },
    ];
    const html = renderToStaticMarkup(<ScoreBreakdown breakdown={items} />);
    expect((html.match(/<progress/g) ?? []).length).toBe(6);
    expect(html).toContain("Temi");
    expect(html).toContain("value=\"20\"");
    expect(html).toContain("max=\"28\"");
    expect(html).toContain("n6");
  });
});

describe("DocumentChecklist", () => {
  it("lists missing documents under the italian heading", () => {
    const html = renderToStaticMarkup(<DocumentChecklist missing={["statuto", "durc"]} />);
    expect(html).toContain("Per candidarti ti manca");
    expect(html).toContain("statuto");
    expect(html).toContain("durc");
  });
  it("shows the all-clear message when nothing is missing", () => {
    const html = renderToStaticMarkup(<DocumentChecklist missing={[]} />);
    expect(html).toContain("Hai tutti i documenti richiesti");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/components/grants/__tests__/grants-components.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the four components**

```tsx
// app/src/components/grants/deadline-badge.tsx
import type { MatchResult } from "@/lib/matching";

export function DeadlineBadge({ indicator }: { indicator: MatchResult["indicators"]["deadline"] }) {
  return <span data-color={indicator.color}>{indicator.label}</span>;
}
```

```tsx
// app/src/components/grants/verdict-badge.tsx
import type { Verdict } from "@/lib/matching";

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span data-verdict={verdict}>{verdict}</span>;
}
```

```tsx
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
```

```tsx
// app/src/components/grants/document-checklist.tsx
export function DocumentChecklist({ missing }: { missing: string[] }) {
  if (missing.length === 0) return <p>Hai tutti i documenti richiesti.</p>;
  return (
    <div>
      <p>Per candidarti ti manca:</p>
      <ul>{missing.map((d) => <li key={d}>{d}</li>)}</ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/components/grants/__tests__/grants-components.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd app && npx tsc --noEmit
git add src/components/grants/deadline-badge.tsx src/components/grants/verdict-badge.tsx src/components/grants/score-breakdown.tsx src/components/grants/document-checklist.tsx src/components/grants/__tests__/grants-components.test.tsx
git commit -m "feat(grants): deadline/verdict badges, score breakdown, document checklist"
```

---

### Task 4: grant card + minimal /bandi list page + nav link

**Files:**
- Create: `app/src/components/grants/grant-card.tsx`
- Create: `app/src/app/(app)/bandi/page.tsx`
- Modify: `app/src/app/(app)/layout.tsx` (add "Bandi" link)
- Test: extend `app/src/components/grants/__tests__/grants-components.test.tsx` with a grant-card render test.

**Note on scope:** the roadmap's b005 file list names only the detail page, but acceptance criterion #1 ("la lista mostra card ordinate per score") needs a host for the card. This branch adds a **minimal, unfiltered** `/bandi` list (sorted by score); the richer Dashboard + Nuovi-bandi with filters are branch 006. This keeps 005 independently demoable.

**Interfaces:**
- `GrantCard({ matched })` — `matched: MatchedGrant`. Renders: title (link to `/bandi/[id]`), provider name, `DeadlineBadge` (from `matched.match.indicators.deadline`), score, `VerdictBadge`. Include an empty placeholder slot (an HTML comment or empty element) for the storico badge (013) and colored amount (014) — do not implement them.

- [ ] **Step 1: Write the failing card test (append to grants-components.test.tsx)**

```tsx
// add these imports at top:
// import { GrantCard } from "../grant-card";
// import type { MatchedGrant } from "@/lib/grants/match-list";

describe("GrantCard", () => {
  it("renders title link, provider, score and verdict", () => {
    const matched = {
      grant: {
        id: "g1", title: "Bando Sport 2026", providerId: "p", providerKind: "privato",
        deadline: "2026-12-31", status: "aperto", amount: 50000, cofundingRequired: null,
        eligibleTypes: [], tags: [], area: null, geoScope: null, complexity: null,
        requiredDocuments: [], summary: "", requirements: "", url: "https://x", beneficiaries: "",
      },
      providerName: "Fondazione Test",
      match: {
        score: 82, baseScore: 82, verdict: "Candidabile", breakdown: [], bonuses: [],
        indicators: {
          deadline: { days: 180, color: "verde", label: "scade tra 180 giorni" },
          cofunding: { required: null, color: "grigio", label: "n/d" },
        },
        missingDocuments: [], actions: [],
      },
    } as unknown as import("@/lib/grants/match-list").MatchedGrant;
    const html = renderToStaticMarkup(<GrantCard matched={matched} />);
    expect(html).toContain("Bando Sport 2026");
    expect(html).toContain("Fondazione Test");
    expect(html).toContain("82");
    expect(html).toContain('data-verdict="Candidabile"');
    expect(html).toContain('href="/bandi/g1"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run src/components/grants/__tests__/grants-components.test.tsx`
Expected: FAIL (grant-card not found).

- [ ] **Step 3: Implement `grant-card.tsx`**

```tsx
// app/src/components/grants/grant-card.tsx
import Link from "next/link";
import type { MatchedGrant } from "@/lib/grants/match-list";
import { DeadlineBadge } from "./deadline-badge";
import { VerdictBadge } from "./verdict-badge";

export function GrantCard({ matched }: { matched: MatchedGrant }) {
  const { grant, providerName, match } = matched;
  return (
    <article>
      <h3><Link href={`/bandi/${grant.id}`}>{grant.title}</Link></h3>
      {providerName && <p>{providerName}</p>}
      <p>
        <DeadlineBadge indicator={match.indicators.deadline} />{" "}
        <strong>{match.score}</strong>/100{" "}
        <VerdictBadge verdict={match.verdict} />
      </p>
      {/* slot: storico badge (branch 013) */}
      {/* slot: colored amount / economic coherence (branch 014) */}
    </article>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run src/components/grants/__tests__/grants-components.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement the `/bandi` list page**

```tsx
// app/src/app/(app)/bandi/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import { getGrants } from "@/lib/grants/queries";
import { buildMatchedGrants } from "@/lib/grants/match-list";
import { GrantCard } from "@/components/grants/grant-card";

export default async function BandiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  const views = await getGrants();
  const matched = buildMatchedGrants(rowToEntityProfile(profile as ProfileRow), views);

  return (
    <main>
      <h1>Bandi</h1>
      {matched.length === 0
        ? <p>Nessun bando disponibile al momento.</p>
        : matched.map((m) => <GrantCard key={m.grant.id} matched={m} />)}
    </main>
  );
}
```

- [ ] **Step 6: Add the "Bandi" nav link in `layout.tsx`**

In `app/src/app/(app)/layout.tsx`, inside the `isOnboarded` nav block, add a link (keep the existing links):

```tsx
<Link href="/bandi">Bandi</Link>
```

Place it right after the Dashboard link. Do not otherwise restructure the nav.

- [ ] **Step 7: Typecheck + build + commit**

```bash
cd app && npx tsc --noEmit && npx next build
git add src/components/grants/grant-card.tsx "src/app/(app)/bandi/page.tsx" "src/app/(app)/layout.tsx" src/components/grants/__tests__/grants-components.test.tsx
git commit -m "feat(grants): grant card + minimal /bandi list + nav link"
```
Expected: build compiles `/bandi`.

---

### Task 5: grant detail page (§5.3)

**Files:**
- Create: `app/src/app/(app)/bandi/[id]/page.tsx`

**Behavior (§5.3):** load user → profile (→ `/login` / `/onboarding` guards); `getGrant(id)`; if null → `notFound()`. Compute `calculateMatch(profile, grant)`. Render: title + provider; score + `VerdictBadge`; the 3 indicators (deadline via `DeadlineBadge`; cofunding label; amount shown plainly — colored economic coherence is branch 014, so a plain amount here); `ScoreBreakdown`; `DocumentChecklist missing={match.missingDocuments}`; the grant `summary`/`requirements`/`beneficiaries` if non-empty; a **disabled** "Salva" button and a **disabled** "Analisi AI approfondita" button, each with `title="In arrivo"` (Italian tooltip); and an "Apri bando originale" link to `grant.url` (`target="_blank" rel="noopener noreferrer"`). Next.js 16 dynamic route: `params` is a Promise — `await params`.

- [ ] **Step 1: Implement the detail page**

```tsx
// app/src/app/(app)/bandi/[id]/page.tsx
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import { getGrant } from "@/lib/grants/queries";
import { calculateMatch } from "@/lib/matching";
import { DeadlineBadge } from "@/components/grants/deadline-badge";
import { VerdictBadge } from "@/components/grants/verdict-badge";
import { ScoreBreakdown } from "@/components/grants/score-breakdown";
import { DocumentChecklist } from "@/components/grants/document-checklist";

export default async function BandoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  const view = await getGrant(id);
  if (!view) notFound();

  const { grant, providerName } = view;
  const match = calculateMatch(rowToEntityProfile(profile as ProfileRow), grant);

  return (
    <main>
      <h1>{grant.title}</h1>
      {providerName && <p>{providerName}</p>}

      <p>
        <strong>{match.score}</strong>/100{" "}
        <VerdictBadge verdict={match.verdict} />
      </p>

      <section>
        <h2>Indicatori</h2>
        <p>Scadenza: <DeadlineBadge indicator={match.indicators.deadline} /></p>
        <p>Cofinanziamento: {match.indicators.cofunding.label}</p>
        <p>Importo: {grant.amount != null ? `€ ${grant.amount.toLocaleString("it-IT")}` : "non specificato"}</p>
      </section>

      <section>
        <h2>Punteggio per dimensione</h2>
        <ScoreBreakdown breakdown={match.breakdown} />
      </section>

      <section>
        <h2>Documenti</h2>
        <DocumentChecklist missing={match.missingDocuments} />
      </section>

      {grant.summary && (<section><h2>Sintesi</h2><p>{grant.summary}</p></section>)}
      {grant.requirements && (<section><h2>Requisiti</h2><p>{grant.requirements}</p></section>)}
      {grant.beneficiaries && (<section><h2>Destinatari</h2><p>{grant.beneficiaries}</p></section>)}

      <section>
        <button type="button" disabled title="In arrivo">Salva</button>{" "}
        <button type="button" disabled title="In arrivo">Analisi AI approfondita</button>{" "}
        <a href={grant.url} target="_blank" rel="noopener noreferrer">Apri bando originale</a>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + build + commit**

```bash
cd app && npx tsc --noEmit && npx next build
git add "src/app/(app)/bandi/[id]/page.tsx"
git commit -m "feat(grants): grant detail page (§5.3) — breakdown, indicators, checklist"
```
Expected: build compiles `/bandi/[id]`.

---

### Task 6: dev seed + ADR-006

**Files:**
- Create: `app/supabase/seed-dev/grants.sql`
- Create: `docs/adr/0006-desktop-first.md`

**Seed spec (development only):** 15–18 `INSERT INTO public.grants (...)` rows of realistic Italian grants. Constraints that make the seed useful for matching:
- `eligible_types` must use exact strings from `LEGAL_TYPES` (see `app/src/lib/matching/constants.ts`); `tags` from `TAGS` (all lowercase); `required_documents` from `DOCUMENT_KEYS` (`statuto`,`bilancio`,`runts`,`rasd`,`durc`,`certificazioni`); `geo_scope` from (`comunale`,`provinciale`,`regionale`,`nazionale`,`europeo`); `complexity` from (`bassa`,`media`,`alta`); `status` `aperto`/`chiuso`.
- Reference an existing provider by name via subquery so the join works: `provider_id => (select id from public.grant_providers where name = '<seeded name>' limit 1)`. Use provider names actually present from branch-001 seed (e.g. a mix; where unsure, leave `provider_id` null — the mapper handles null).
- Vary for visible ranges: some `deadline` far future (verde), some within 15 days of 2026-07-04 (giallo), some within 7 days (rosso), 2–3 with `status='chiuso'` and a past deadline (Storico). Vary `amount`, `cofunding_required`, `geo_scope`, `complexity`. `url` must be unique (the column is `unique not null`).
- Derive themes/titles loosely from `auto-grants.json` (sport/inclusione/cultura/ambiente/giovani…) but write clean summaries (1–2 sentences), not the scraped junk.

Provide the full 15–18 rows. Example of the exact shape to follow for every row:

```sql
-- app/supabase/seed-dev/grants.sql — DEVELOPMENT SEED ONLY (not a migration)
insert into public.grants
  (title, provider_id, deadline, status, amount, cofunding_required,
   eligible_types, tags, area, geo_scope, complexity, required_documents,
   summary, requirements, url, beneficiaries)
values
  ('Sport e inclusione sociale 2026',
   (select id from public.grant_providers where name = 'Fondazione CON IL SUD' limit 1),
   '2026-12-15', 'aperto', 50000, 20,
   array['APS - Associazione di Promozione Sociale','ASD - Associazione Sportiva Dilettantistica'],
   array['sport','inclusione'], 'Italia', 'nazionale', 'media',
   array['statuto','bilancio'],
   'Contributi per progetti che usano lo sport come strumento di inclusione sociale.',
   'Enti del terzo settore e sportivi dilettantistici con almeno 2 anni di attività.',
   'https://seed.dev/bandi/sport-inclusione-2026', 'minori e giovani in condizioni di fragilità'),
  -- … 14–17 more rows, varied per the constraints above …
  ;
```

- [ ] **Step 1: Author `grants.sql`** with 15–18 rows meeting the constraints above.

- [ ] **Step 2: Validate the SQL parses** (syntax only; no DB write required for the commit)

Run: `cd app && node -e "const fs=require('fs');const s=fs.readFileSync('supabase/seed-dev/grants.sql','utf8');const n=(s.match(/https:\/\/seed\.dev/g)||[]).length; if(n<15) throw new Error('need >=15 rows, got '+n); console.log(n+' grant rows');"`
Expected: prints ">=15 grant rows".

- [ ] **Step 3: Write `docs/adr/0006-desktop-first.md`**

```markdown
# ADR-006 — Desktop-first, responsive for mobile

## Status
Accepted (branch 005).

## Context
The "evaluate and act" moment — reading a grant PDF, analyzing the score breakdown,
filling the profile — is a desktop activity. Mobile serves fast discovery: scrolling
the dashboard, saving grants.

## Decision
Design desktop-first (readable at 1280px), responsive down to 375px without breaking.
Rich interactions (breakdown, detail, profile forms) are optimized for desktop; the
list/discovery views must remain usable on mobile.

## Consequences
- Layout work prioritizes the desktop detail/breakdown view.
- Components use semantic, flowing markup so they degrade gracefully on small screens.
- Heavy responsive polish is deferred; no horizontal-scroll or overflow at 375px.
```

- [ ] **Step 4: Commit**

```bash
cd app && git add supabase/seed-dev/grants.sql ../docs/adr/0006-desktop-first.md
git commit -m "feat(grants): dev seed (15-18 grants) + ADR-006 desktop-first"
```

**Controller note (post-implementer, optional):** to demo, apply the seed to the dev Supabase project via MCP `execute_sql` with the file contents (subagents lack DB access). Not required for tests/build/merge.

---

### Task 7: full verification

**Files:** none new — gate.

- [ ] **Step 1:** `cd app && npx vitest run` → all pass (branch 002/003/004 + new grants tests).
- [ ] **Step 2:** `cd app && npx tsc --noEmit` → exit 0.
- [ ] **Step 3:** `cd app && npx next build` → succeeds; routes `/bandi` and `/bandi/[id]` listed.
- [ ] **Step 4:** commit any fixups, then stop for the whole-branch review.

---

## Self-Review

**1. Spec coverage (roadmap b005):**
- `lib/grants/queries.ts` `getGrants`/`getGrant` + row→Grant mapping → Task 1 ✅
- `lib/grants/match-list.ts` `buildMatchedGrants` pure, reused by dashboard/digest → Task 2 ✅
- `grant-card.tsx` (title, provider, colored deadline, score, verdict; storico/amount slots) → Task 4 ✅
- `score-breakdown.tsx` (6 bars value/max + notes) → Task 3 ✅
- `deadline-badge.tsx`, `verdict-badge.tsx`, `document-checklist.tsx` ("Per candidarti ti manca:") → Task 3 ✅
- `bandi/[id]/page.tsx` (§5.3 detail; disabled Salva/Analisi AI with "in arrivo" tooltip; open original) → Task 5 ✅
- `supabase/seed-dev/grants.sql` (15–18 grants on the 16 fields) → Task 6 ✅
- `docs/adr/0006-desktop-first.md` → Task 6 ✅
- Tests: `match-list.test.ts` (stable score-desc, closed→tail Storico) → Task 2 ✅; component tests score-breakdown (6 bars) + deadline-badge (4 colors) → Task 3 ✅
- Acceptance: list sorted by score with colored deadline (Task 4); detail breakdown matches `calculateMatch` + checklist = exact missing docs (Task 5, both read the same `MatchResult`); score changes on refresh w/o invalidation = dynamic server components recomputing (I10, Tasks 4/5); readable 1280 / not broken 375 = semantic markup + ADR-006 (Tasks 3–6).
- Scope note: a minimal `/bandi` list page + nav link were added (Task 4) beyond the roadmap's literal file list, to satisfy acceptance #1 and host the card; the filtered Dashboard/Nuovi-bandi remain branch 006.

**2. Placeholder scan:** the seed's example block ends with a `-- … more rows …` comment, but Task 6 Step 1 explicitly requires the implementer to author all 15–18 rows and Step 2 fails the task if fewer than 15 are present — the comment is illustrative, not shipped as-is. No other TODO/TBD in shipped code.

**3. Type consistency:** `GrantView`/`GrantRowWithProvider`/`MatchedGrant` used consistently across mapping/match-list/card/pages. Components consume `MatchResult`/`BreakdownItem`/`Verdict`/`Indicators` from `@/lib/matching` verbatim (verified against types.ts). `mapGrantRow` output matches the `Grant` interface field-for-field. Pages use `rowToEntityProfile` + `ProfileRow` from `@/lib/profile/schema` (branch 004, in main). `params: Promise<{id}>` + `await params` per Next.js 16.
