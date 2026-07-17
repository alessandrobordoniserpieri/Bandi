# Sport-Governo Archetype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `sport-governo` archetype that ingests `avvisibandi.sport.governo.it` (Dipartimento per lo Sport) via direct fetch, zero-LLM code parsing, and a shared economics-escalation module reused from `er-sociale`.

**Architecture:** `parseItalianAmount` (enrich.ts) gains spelled-out-millions support. A new shared `economics.ts` module generalizes er-sociale's sentence-anchored amount extraction and LLM escalation to also resolve `cofundingPercentage`, in one call, shared by both archetypes. `sport-governo.ts` mirrors er-sociale.ts's shape: `parse()`/`parseDetail()` extract `__NEXT_DATA__` JSON embedded in server-rendered HTML, transcode `dest`→`eligibleTypes`, and transcribe Quill HTML `description` into the same light-markup convention (`## `/`### `/`- `) the app's `Prose` component already renders.

**Tech Stack:** TypeScript, Vitest, existing scraper pipeline seams (`Archetype`, `LLMProvider`, `FakeLLMProvider`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-sport-governo-archetype-design.md` (read before starting — every task below implements one of its sections).
- ADR-009 (`docs/adr/0009-shared-economics-escalation.md`): the LLM escalation resolves ONLY `amount` + `cofundingPercentage`, never `fundingType`/`minAmount`/`maxAmount`/`eligibleExpenses`/`applicationMethod`.
- ADR-010 (`docs/adr/0010-skip-out-of-scope-notices-at-parse-time.md`, corrected 2026-07-17): a notice is skipped in `parse()` iff `dest.length > 0 && deriveEligibleTypes(dest).length === 0`. On the 22 real notices (2026-07-17) this is exactly ONE notice (`dest: ["pf"]`) — do NOT skip notices whose `dest` includes religious/ecclesiastical categories, they map to real `LEGAL_TYPES` entries.
- No production writes to `grants` or scheduler activation without the user's explicit go-ahead — every task through Task 10 stops at `grants_preview`.
- Real verified facts to use in fixtures (do not invent alternates):
  - Listing: `GET https://avvisibandi.sport.governo.it/` → `<script id="__NEXT_DATA__" type="application/json">{...}</script>` → `.props.pageProps.notices[]`, fields `_id, title, description, image, dest, schedule`.
  - Detail: `GET https://avvisibandi.sport.governo.it/bandi/<_id>` → same `__NEXT_DATA__` shape → `.props.pageProps.notice` (singular), same fields plus `code`, `attachments: [{name, url, _id}]`, `faq`.
  - `deadline` = `schedule.compilazione.end` (ISO datetime → `YYYY-MM-DD`).
  - Real `dest` → `LEGAL_TYPES` mapping table is in the spec § "Transcodifica `dest` → `eligibleTypes`" — copy it verbatim into code, do not re-derive.

---

### Task 1: `parseItalianAmount` — spelled-out millions

**Files:**
- Modify: `scraper/src/pipeline/enrich.ts`
- Test: `scraper/tests/enrich.test.ts` (create if it doesn't exist — check first with `ls scraper/tests/enrich.test.ts`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseItalianAmount(raw: string): number | null` (existing export, behavior extended) — every later task that parses amounts from sport-governo prose relies on this handling "N milioni di euro".

- [ ] **Step 1: Check for an existing enrich test file**

Run: `ls /workspaces/Bandi/scraper/tests/enrich.test.ts 2>&1 || echo "does not exist"`

If it exists, read it first and add the new tests to it (don't duplicate the file's existing describe blocks). If not, create it fresh with the import below.

- [ ] **Step 2: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { parseItalianAmount } from "../src/pipeline/enrich";

describe("parseItalianAmount — spelled-out millions (avvisibandi.sport.governo.it, verified live 2026-07-17)", () => {
  it("expands 'N milioni di euro' embedded in a sentence", () => {
    const text = "L'iniziativa è finanziata con 50 milioni di euro a valere sul Fondo per lo Sviluppo e la Coesione.";
    expect(parseItalianAmount(text)).toBe(50_000_000);
  });

  it("expands 'euro N milioni' (euro BEFORE the number, milioni after)", () => {
    const text = "è stato stanziato un finanziamento complessivo pari ad euro 100 milioni, di cui € 30.000.000 per nuovi impianti.";
    expect(parseItalianAmount(text)).toBe(100_000_000);
  });

  it("expands 'oltre N milioni di euro'", () => {
    expect(parseItalianAmount("Le risorse destinate per il 2024 ammontano a oltre 5 milioni di euro.")).toBe(5_000_000);
  });

  it("expands a decimal million value", () => {
    expect(parseItalianAmount("Sono stanziati 2,5 milioni di euro per il programma.")).toBe(2_500_000);
  });

  it("still parses a whole-string digit amount unchanged (regression)", () => {
    expect(parseItalianAmount("1.371.182,26")).toBe(1371182.26);
  });

  it("still parses 'N euro' embedded in a sentence unchanged (regression)", () => {
    expect(parseItalianAmount("Le risorse complessivamente a disposizione ammontano a 390.000 euro.")).toBe(390000);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/enrich.test.ts`
Expected: the four new "milioni" tests FAIL (return `null` instead of the expected number); the two regression tests PASS (they exercise unchanged behavior).

- [ ] **Step 4: Implement**

In `scraper/src/pipeline/enrich.ts`, add this above `export function parseItalianAmount` and change the function body:

```typescript
// Some sources spell out large totals ("50 milioni di euro", "pari ad euro 100 milioni") instead
// of digits. Expand "N milion[ei]" (optionally followed by "di euro"/"euro") to its digit form
// BEFORE the rest of this function runs, so the existing digit-based parsing handles it unchanged.
// Verified against avvisibandi.sport.governo.it (2026-07-17): every real occurrence in that corpus
// names a euro total this way; no other unit is ever spelled out as "milioni" in this domain, so
// forcing "euro" onto the expansion is safe. Intentionally does NOT handle "mila" (thousands) —
// no real bando in the checked corpus spells out a TOTAL that way (only per-project caps like
// "700mila euro", which the signal-anchored callers already exclude by sentence, not by this fn).
const MILLIONS_RE = /([0-9]+(?:[.,][0-9]+)?)\s*milion[ei]\s*(?:di\s+)?(?:euro|€)?/gi;
function expandSpelledOutMillions(s: string): string {
  return s.replace(MILLIONS_RE, (match, num: string) => {
    const n = Number(num.replace(",", "."));
    return Number.isFinite(n) ? `${Math.round(n * 1_000_000)} euro` : match;
  });
}

export function parseItalianAmount(raw: string): number | null {
  const expanded = expandSpelledOutMillions(raw);
  // Strip a spelled-out currency ("Euro 900.000", "900.000 EUR") as well as the symbol/spaces,
  // otherwise the leftover letters make Number() return NaN and the amount is silently dropped.
  const cleaned = expanded.replace(/euro|eur/gi, "").replace(/[€\s]/g, "");
  if (cleaned !== "" && /[0-9]/.test(cleaned)) {
    const n = toNumber(cleaned);
    if (n != null) return n;
  }
  // Fallback for free text carrying a TOTAL followed by a breakdown tail ("di cui: ...",
  // "Ripartizione: ...") — the whole-string parse above fails on the extra prose even though a
  // clean total figure is present. Pull just the first currency-adjacent figure instead.
  const m = AMOUNT_IN_TEXT_RE.exec(expanded);
  const digits = m?.[1] ?? m?.[2];
  return digits ? toNumber(digits) : null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/enrich.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 6: Run the full scraper suite to check for regressions**

Run: `cd /workspaces/Bandi/scraper && npx vitest run`
Expected: all existing tests still PASS (186 before this task).

- [ ] **Step 7: Commit**

```bash
cd /workspaces/Bandi
git add scraper/src/pipeline/enrich.ts scraper/tests/enrich.test.ts
git commit -m "feat(scraper): parseItalianAmount handles spelled-out 'N milioni di euro'"
```

---

### Task 2: `economics.ts` — sentence-anchored amount and percentage extraction

**Files:**
- Create: `scraper/src/pipeline/economics.ts`
- Test: `scraper/tests/economics.test.ts`

**Interfaces:**
- Consumes: `parseItalianAmount` from `./enrich`.
- Produces: `extractAnchoredAmount(text: string, signalRe: RegExp): number | null`, `extractAnchoredPercentage(text: string, signalRe: RegExp): number | null`, `COFUNDING_SIGNAL_RE: RegExp` — Task 3 (LLM escalation) and Task 4 (er-sociale retrofit) and Task 8 (sport-governo detail) all import these by these exact names.

- [ ] **Step 1: Write the failing tests**

```typescript
// scraper/tests/economics.test.ts
import { describe, it, expect } from "vitest";
import { extractAnchoredAmount, extractAnchoredPercentage, COFUNDING_SIGNAL_RE } from "../src/pipeline/economics";

const TOTAL_SIGNAL_RE = /ammontano|complessivamente|somma complessiva|messe a bando|a disposizione|destinate/i;

describe("extractAnchoredAmount", () => {
  it("picks the signal-sentence amount over an earlier unrelated euro mention", () => {
    const text = "Il Bando prevede il limite massimo di 200 euro per le spese in contanti. "
      + "Le risorse complessivamente a disposizione ammontano a 390.000 euro.";
    expect(extractAnchoredAmount(text, TOTAL_SIGNAL_RE)).toBe(390000);
  });

  it("returns null when no signal-matching sentence is present", () => {
    expect(extractAnchoredAmount("Il contributo massimo per progetto è di 50.000 euro.", TOTAL_SIGNAL_RE)).toBeNull();
  });

  it("works with a different signal regex (sport-governo phrasing)", () => {
    const sportGovernoSignal = /finanziat[ao] con|stanziat[oi]|stanziamento|ammontano a|dotazione di|finanziamento complessivo/i;
    const text = "Al riguardo, è stato stanziato un finanziamento complessivo pari ad euro 100 milioni, di cui € 30.000.000 per nuovi impianti. "
      + "I contributi massimi attribuibili sono i seguenti: importo massimo di euro 3.000.000,00.";
    expect(extractAnchoredAmount(text, sportGovernoSignal)).toBe(100_000_000);
  });
});

describe("extractAnchoredPercentage", () => {
  it("picks a cofunding percentage anchored to 'quota di cofinanziamento'", () => {
    const text = "È, in ogni caso, prevista una quota di cofinanziamento a carico del Comune richiedente pari ad almeno il 15% del contributo.";
    expect(extractAnchoredPercentage(text, COFUNDING_SIGNAL_RE)).toBe(15);
  });

  it("picks a cofunding percentage anchored to 'compartecipazione'", () => {
    const text = "L'iniziativa prevede una quota di compartecipazione del 15% da parte dei beneficiari.";
    expect(extractAnchoredPercentage(text, COFUNDING_SIGNAL_RE)).toBe(15);
  });

  it("ignores an unrelated percentage in the same text (tax-credit rate, not cofunding)", () => {
    // Real confounder (Sport Bonus): a 65% tax-credit rate has nothing to do with cofunding, and
    // must not be picked up just because it's the only "%" in the text.
    const text = "I soggetti che possono effettuare tali erogazioni sono esclusivamente le imprese, "
      + "a cui è riconosciuto un credito di imposta pari al 65% del versamento effettuato.";
    expect(extractAnchoredPercentage(text, COFUNDING_SIGNAL_RE)).toBeNull();
  });

  it("returns null when no percentage is present at all", () => {
    expect(extractAnchoredPercentage("Il bando è rivolto a enti pubblici.", COFUNDING_SIGNAL_RE)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/economics.test.ts`
Expected: FAIL — `Cannot find module '../src/pipeline/economics'`.

- [ ] **Step 3: Implement**

```typescript
// scraper/src/pipeline/economics.ts
// Shared economics extraction, used by any archetype whose amount/cofunding live in free prose
// (er-sociale, sport-governo). See ADR-009 (docs/adr/0009-shared-economics-escalation.md) for why
// this is scoped to exactly these two fields and no others.
import { parseItalianAmount } from "./enrich";
import type { JsonSchema, LLMProvider } from "../providers/types";

// Split on ". " + uppercase (not a bare "."), so Italian-formatted numbers ("20.000") never get
// split into false sentence boundaries. Shared by both anchored extractors below.
function sentences(text: string): string[] {
  return text.split(/\.\s+(?=[A-ZÀ-Ú])/);
}

// Only trusts a euro figure in the SAME sentence as a signal phrase — a bare "first mention" grabs
// unrelated figures (expense caps, per-project thresholds) that commonly appear before the real
// total in Italian bando prose. The signal regex is caller-supplied because the phrasing that
// introduces a total varies by source (er-sociale: "ammontano"/"complessivamente"/...; sport-governo:
// "finanziata con"/"stanziato"/...).
export function extractAnchoredAmount(text: string, signalRe: RegExp): number | null {
  for (const sentence of sentences(text)) {
    if (signalRe.test(sentence)) {
      const n = parseItalianAmount(sentence);
      if (n != null) return n;
    }
  }
  return null;
}

// Cofunding-percentage anchor words are generic Italian grant-bureaucracy terminology (not
// source-specific like the amount signal), so this is one shared default rather than a
// per-archetype constant.
export const COFUNDING_SIGNAL_RE = /cofinanziamento|compartecipazione|quota/i;

const PERCENT_TOKEN_RE = /([0-9]+(?:[.,][0-9]+)?)\s*(?:%|per\s*cento)/i;

export function extractAnchoredPercentage(text: string, signalRe: RegExp): number | null {
  for (const sentence of sentences(text)) {
    if (signalRe.test(sentence)) {
      const m = PERCENT_TOKEN_RE.exec(sentence);
      if (m) {
        const n = Number(m[1]!.replace(",", "."));
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

export interface EconomicsResult { amount: number | null; cofundingPercentage: number | null; }

const ECONOMICS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    totalAmount: { type: "string", nullable: true },
    cofundingPercentage: { type: "string", nullable: true },
  },
  required: [],
};

const ECONOMICS_INSTRUCTIONS = [
  "Il testo è la descrizione completa di un bando di finanziamento pubblico italiano.",
  "Estrai due valori indipendenti, se presenti chiaramente nel testo:",
  "1) totalAmount: SOLO l'importo TOTALE complessivamente disponibile per il bando (il fondo nel suo insieme).",
  "IGNORA per totalAmount: limiti di spesa per singola voce, soglie minime o massime per singolo progetto, percentuali.",
  "2) cofundingPercentage: la percentuale di COFINANZIAMENTO/COMPARTECIPAZIONE richiesta al beneficiario (es. '15' per '15%').",
  "NON confondere cofundingPercentage con altre percentuali (es. un credito d'imposta, un tasso di interesse): deve essere esplicitamente legata a cofinanziamento/compartecipazione/quota a carico del beneficiario.",
  "Se un valore non è chiaramente indicato, restituisci null per quel campo. Non sommare cifre né indovinare.",
].join(" ");

// Last resort: called only when the deterministic tiers left `amount` unresolved (see each
// archetype's call site — the trigger is amount alone, never cofunding alone, to keep this call
// rare). Resolves both fields in the SAME call so a rare escalation isn't wasted on one field.
// Never throws: any failure (provider error, unusable response) yields nulls, retried next run.
export async function escalateEconomicsToLLM(text: string, llm: LLMProvider): Promise<EconomicsResult> {
  if (!text) return { amount: null, cofundingPercentage: null };
  try {
    let out: unknown = await llm.extract({ html: text, schema: ECONOMICS_SCHEMA, instructions: ECONOMICS_INSTRUCTIONS });
    if (typeof out === "string") { try { out = JSON.parse(out); } catch { return { amount: null, cofundingPercentage: null }; } }
    const o = out as { totalAmount?: unknown; cofundingPercentage?: unknown } | null;
    const amount = typeof o?.totalAmount === "string" ? parseItalianAmount(o.totalAmount) : null;
    const cofundingPercentage = typeof o?.cofundingPercentage === "string"
      ? Number(o.cofundingPercentage.replace(",", ".").replace("%", "").trim())
      : null;
    return {
      amount,
      cofundingPercentage: cofundingPercentage != null && Number.isFinite(cofundingPercentage) ? cofundingPercentage : null,
    };
  } catch {
    return { amount: null, cofundingPercentage: null };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/economics.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /workspaces/Bandi
git add scraper/src/pipeline/economics.ts scraper/tests/economics.test.ts
git commit -m "feat(scraper): add shared economics.ts (anchored amount/cofunding extraction)"
```

---

### Task 3: `economics.ts` — `escalateEconomicsToLLM` behavior tests

**Files:**
- Test: `scraper/tests/economics.test.ts` (extend)

**Interfaces:**
- Consumes: `escalateEconomicsToLLM` from Task 2, `FakeLLMProvider` from `../src/providers/fake`.
- Produces: nothing new — this task only adds test coverage the retrofit tasks (4, 8) rely on as a correctness reference.

- [ ] **Step 1: Write the failing tests**

Append to `scraper/tests/economics.test.ts`:

```typescript
import { FakeLLMProvider } from "../src/providers/fake";
import { escalateEconomicsToLLM } from "../src/pipeline/economics";
import type { LLMProvider } from "../src/providers/types";

describe("escalateEconomicsToLLM", () => {
  it("resolves both amount and cofundingPercentage from one call", async () => {
    const TEXT = "Testo ambiguo del bando.";
    const llm = new FakeLLMProvider(new Map<string, unknown>([
      [TEXT, { totalAmount: "220.000", cofundingPercentage: "20" }],
    ]));
    const result = await escalateEconomicsToLLM(TEXT, llm);
    expect(result).toEqual({ amount: 220000, cofundingPercentage: 20 });
  });

  it("tolerates a response missing cofundingPercentage (older-shaped fixture)", async () => {
    const TEXT = "Testo ambiguo del bando.";
    const llm = new FakeLLMProvider(new Map<string, unknown>([[TEXT, { totalAmount: "220.000" }]]));
    const result = await escalateEconomicsToLLM(TEXT, llm);
    expect(result).toEqual({ amount: 220000, cofundingPercentage: null });
  });

  it("returns nulls, not a thrown error, when the LLM returns nothing usable", async () => {
    const TEXT = "Testo ambiguo del bando.";
    const llm = new FakeLLMProvider(new Map<string, unknown>([[TEXT, { totalAmount: null, cofundingPercentage: null }]]));
    expect(await escalateEconomicsToLLM(TEXT, llm)).toEqual({ amount: null, cofundingPercentage: null });
  });

  it("returns nulls, not a thrown error, when the LLM call itself fails", async () => {
    const llm: LLMProvider = { name: "boom", extract: async () => { throw new Error("provider down"); } };
    expect(await escalateEconomicsToLLM("qualunque testo", llm)).toEqual({ amount: null, cofundingPercentage: null });
  });

  it("returns nulls immediately for empty text, without calling the provider", async () => {
    const llm: LLMProvider = { name: "boom", extract: async () => { throw new Error("must not be called"); } };
    expect(await escalateEconomicsToLLM("", llm)).toEqual({ amount: null, cofundingPercentage: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/economics.test.ts`
Expected: FAIL only if Task 2's implementation has a bug — since Task 2 already implemented `escalateEconomicsToLLM`, these should mostly PASS immediately. If any fails, that's a real bug in Task 2's implementation — fix `economics.ts`, don't weaken the test.

- [ ] **Step 3: Run again to confirm all pass**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/economics.test.ts`
Expected: all 13 tests in the file (8 from Task 2 + 5 here) PASS.

- [ ] **Step 4: Commit**

```bash
cd /workspaces/Bandi
git add scraper/tests/economics.test.ts
git commit -m "test(scraper): cover escalateEconomicsToLLM response/failure shapes"
```

---

### Task 4: Retrofit `er-sociale.ts` onto shared `economics.ts`

**Files:**
- Modify: `scraper/src/pipeline/er-sociale.ts`
- Modify: `scraper/tests/er-sociale.test.ts` (only if a test needs a new fixture — see Step 5)

**Interfaces:**
- Consumes: `extractAnchoredAmount`, `extractAnchoredPercentage`, `COFUNDING_SIGNAL_RE`, `escalateEconomicsToLLM` from `./economics`.
- Produces: `parseDetailErSociale` now also resolves `cofundingPercentage` (was always `null` before). `extractTotalFromProse` keeps its existing exported name/signature (thin wrapper) so existing tests are unaffected.

- [ ] **Step 1: Read the current amount-resolution block**

Run: `grep -n "TOTAL_SIGNAL_RE\|extractTotalFromProse\|escalateAmountToLLM\|AMOUNT_ONLY" /workspaces/Bandi/scraper/src/pipeline/er-sociale.ts`

Confirm line numbers match: `TOTAL_SIGNAL_RE` const, `extractTotalFromProse` function, `AMOUNT_ONLY_SCHEMA`/`AMOUNT_ONLY_INSTRUCTIONS` consts, `escalateAmountToLLM` function, and the `amount = ...` line inside `parseDetailErSociale`. (If line numbers drifted from what's shown in this plan, that's fine — edit by content match, not line number.)

- [ ] **Step 2: Replace the amount-resolution block**

Delete these from `er-sociale.ts`: the body of `extractTotalFromProse` (keep the function, change its body), `AMOUNT_ONLY_SCHEMA`, `AMOUNT_ONLY_INSTRUCTIONS`, `escalateAmountToLLM` entirely.

Replace the import line:
```typescript
import type { JsonSchema, LLMProvider } from "../providers/types";
```
with:
```typescript
import type { JsonSchema, LLMProvider } from "../providers/types";
import { extractAnchoredAmount, extractAnchoredPercentage, COFUNDING_SIGNAL_RE, escalateEconomicsToLLM } from "./economics";
```

Replace the `extractTotalFromProse` function body (keep `TOTAL_SIGNAL_RE` exactly as-is, it stays local — it's er-sociale's own calibrated phrasing) with:
```typescript
export function extractTotalFromProse(text: string): number | null {
  return extractAnchoredAmount(text, TOTAL_SIGNAL_RE);
}
```

Delete `AMOUNT_ONLY_SCHEMA`, `AMOUNT_ONLY_INSTRUCTIONS`, and the whole `escalateAmountToLLM` function (they now live in `economics.ts`).

- [ ] **Step 3: Update `parseDetailErSociale`'s amount/cofunding resolution**

Find this block inside `parseDetailErSociale`:
```typescript
  const amount = parseItalianAmount(description)
    ?? extractTotalFromProse(text ?? "")
    ?? await escalateAmountToLLM(`${description} ${text ?? ""}`.trim(), llm);
```

Replace with:
```typescript
  const combinedText = `${description} ${text ?? ""}`.trim();
  let amount = parseItalianAmount(description) ?? extractTotalFromProse(text ?? "");
  let cofundingPercentage = extractAnchoredPercentage(combinedText, COFUNDING_SIGNAL_RE);
  if (amount == null) {
    const escalated = await escalateEconomicsToLLM(combinedText, llm);
    amount = escalated.amount;
    if (cofundingPercentage == null) cofundingPercentage = escalated.cofundingPercentage;
  }
```

And change the returned object's `cofundingPercentage: null,` line to `cofundingPercentage,` (use the computed variable, not the literal `null`).

- [ ] **Step 4: Run the existing er-sociale test suite**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/er-sociale.test.ts`
Expected: all existing tests PASS unchanged (the retrofit preserves `extractTotalFromProse`'s public behavior; the LLM-escalation fixtures still use `{totalAmount: "220.000"}`/`{totalAmount: null}` shapes, which `escalateEconomicsToLLM` tolerates per Task 3's "missing cofundingPercentage" test).

If any test fails, do NOT change the test to match broken behavior — the retrofit is supposed to be behavior-preserving for everything except the new `cofundingPercentage` field. Find and fix the discrepancy in `er-sociale.ts`.

- [ ] **Step 5: Add one new test for the cofunding retrofit**

Append to `scraper/tests/er-sociale.test.ts`, inside (or near) the `"er-sociale detail parser"` describe block:

```typescript
it("resolves cofundingPercentage deterministically when the text states it", async () => {
  const fixture = JSON.stringify({
    "@id": "https://sociale.example/bandi/z", "@type": "Bando", title: "Z",
    description: "",
    text: {
      blocks: { a: { plaintext: "Le risorse messe a bando ammontano a 500.000 euro. È prevista una quota di cofinanziamento pari al 20% a carico del soggetto proponente." } },
      blocks_layout: { items: ["a"] },
    },
  });
  const d = (await parseDetailErSociale(fixture, NO_LLM))!;
  expect(d.amount).toBe(500000);
  expect(d.cofundingPercentage).toBe(20);
});
```

- [ ] **Step 6: Run tests to verify the new test passes**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/er-sociale.test.ts`
Expected: all tests PASS (previous count + 1).

- [ ] **Step 7: Run the full scraper suite and typecheck**

Run: `cd /workspaces/Bandi/scraper && npx vitest run && npm run typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 8: Commit**

```bash
cd /workspaces/Bandi
git add scraper/src/pipeline/er-sociale.ts scraper/tests/er-sociale.test.ts
git commit -m "refactor(scraper): retrofit er-sociale onto shared economics.ts, add cofundingPercentage"
```

---

### Task 5: `sport-governo.ts` — HTML→light-markup transcriber

**Files:**
- Create: `scraper/src/pipeline/sport-governo.ts`
- Test: `scraper/tests/sport-governo.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `htmlToLightMarkup(html: string): string` — Task 7 (listing) and Task 8 (detail) both call this to build `summary`/`requirements`.

- [ ] **Step 1: Write the failing tests**

```typescript
// scraper/tests/sport-governo.test.ts
import { describe, it, expect } from "vitest";
import { htmlToLightMarkup } from "../src/pipeline/sport-governo";

describe("htmlToLightMarkup", () => {
  it("transcribes a real Oratori-bando description (verified live, avvisibandi.sport.governo.it 2026-07-17)", () => {
    // Real fetched HTML (trimmed to the parts this test checks — full field is ~3.7KB).
    const html = [
      "<b>Avviso per la selezione di progetti destinati agli oratori delle aree urbane più fragili</b>",
      "",
      "<p>\n    A seguito della firma del Protocollo d'intesa tra il Ministro per lo Sport e i Giovani,\n    <strong>Andrea Abodi</strong>, e il Presidente della CEI, avvenuta il 1° luglio u.s., viene pubblicato oggi l'Avviso.\n</p>",
      "",
      "<p>\n    In particolare, le risorse saranno impiegate per:\n</p>",
      "",
      "<ul>\n    <li>la realizzazione di nuovi playground;</li>\n    <li>la riqualificazione di impianti sportivi esistenti;</li>\n</ul>",
      "",
      "<h3>Interventi ammissibili</h3>",
      "",
      "<p>\n    I progetti dovranno prevedere interventi:\n</p>",
      "",
      "<p>\n    <a href=\"mailto:impiantisticasportiva@governo.it\">\n        impiantisticasportiva@governo.it\n    </a>\n</p>",
    ].join("\n\n");

    const result = htmlToLightMarkup(html);
    const lines = result.split("\n");

    expect(lines).toContain("Avviso per la selezione di progetti destinati agli oratori delle aree urbane più fragili");
    expect(lines).toContain("A seguito della firma del Protocollo d'intesa tra il Ministro per lo Sport e i Giovani, Andrea Abodi, e il Presidente della CEI, avvenuta il 1° luglio u.s., viene pubblicato oggi l'Avviso.");
    expect(lines).toContain("- la realizzazione di nuovi playground;");
    expect(lines).toContain("- la riqualificazione di impianti sportivi esistenti;");
    expect(lines).toContain("### Interventi ammissibili");
    expect(lines).toContain("impiantisticasportiva@governo.it");
  });

  it("maps h1/h2 to '## ' (synthetic — no h1/h2 observed live, only h3)", () => {
    const html = "<h2>Finalità</h2>\n\n<p>Testo del paragrafo.</p>";
    expect(htmlToLightMarkup(html).split("\n")).toEqual(["## Finalità", "Testo del paragrafo."]);
  });

  it("groups all <li> of one <ul> under consecutive '- ' lines, in order", () => {
    const html = "<ul><li>uno</li><li>due</li><li>tre</li></ul>";
    expect(htmlToLightMarkup(html).split("\n")).toEqual(["- uno", "- due", "- tre"]);
  });

  it("strips inline formatting tags (strong/em/u/span/a) to plain text", () => {
    const html = "<p>Enti del <strong>Terzo Settore</strong> e <em>ASD</em> possono <span>partecipare</span>.</p>";
    expect(htmlToLightMarkup(html)).toBe("Enti del Terzo Settore e ASD possono partecipare.");
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToLightMarkup("")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/sport-governo.test.ts`
Expected: FAIL — `Cannot find module '../src/pipeline/sport-governo'`.

- [ ] **Step 3: Implement**

```typescript
// scraper/src/pipeline/sport-governo.ts
// Archetype "sport-governo": Dipartimento per lo Sport (avvisibandi.sport.governo.it) via direct
// fetch of server-rendered Next.js pages — the listing homepage and each notice's own page both
// embed a <script id="__NEXT_DATA__"> JSON blob with the full data, no headless Chrome needed.
// Design: docs/superpowers/specs/2026-07-17-sport-governo-archetype-design.md

function innerText(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Quill-authored description HTML (avvisibandi.sport.governo.it): a flat sequence of top-level
// blocks (p/h1-h6/ul/ol, occasionally a bare <b>) separated by blank lines. Regex-based (not a DOM
// parser) — consistent with the rest of the scraper (see stripTags in archetypes.ts) and sufficient
// for the limited, regular tag set actually observed live: p, b, strong, em, u, span, a, h3, ul, li.
export function htmlToLightMarkup(html: string): string {
  const blocks = html.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const lines: string[] = [];
  for (const block of blocks) {
    const heading = /^<h([1-6])[^>]*>([\s\S]*?)<\/h\1>$/i.exec(block);
    if (heading) {
      const level = Number(heading[1]);
      const text = innerText(heading[2]!);
      if (text) lines.push(`${level <= 2 ? "##" : "###"} ${text}`);
      continue;
    }
    const list = /^<(ul|ol)[^>]*>([\s\S]*?)<\/\1>$/i.exec(block);
    if (list) {
      const items = list[2]!.match(/<li[^>]*>[\s\S]*?<\/li>/gi) ?? [];
      for (const item of items) {
        const text = innerText(item.replace(/^<li[^>]*>|<\/li>$/gi, ""));
        if (text) lines.push(`- ${text}`);
      }
      continue;
    }
    const text = innerText(block);
    if (text) lines.push(text);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/sport-governo.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /workspaces/Bandi
git add scraper/src/pipeline/sport-governo.ts scraper/tests/sport-governo.test.ts
git commit -m "feat(scraper): sport-governo archetype — HTML to light-markup transcriber"
```

---

### Task 6: `sport-governo.ts` — `dest` → `eligibleTypes`, skip rule, tags

**Files:**
- Modify: `scraper/src/pipeline/sport-governo.ts`
- Modify: `scraper/tests/sport-governo.test.ts`

**Interfaces:**
- Consumes: `LEGAL_TYPE_SET`, `TAG_SET` from `./vocab`.
- Produces: `deriveEligibleTypes(dest: string[]): string[]`, `shouldSkipNotice(dest: string[]): boolean`, `deriveTags(title: string, description: string): string[]` — Task 7 and Task 8 call all three.

- [ ] **Step 1: Write the failing tests**

Append to `scraper/tests/sport-governo.test.ts`:

```typescript
import { deriveEligibleTypes, shouldSkipNotice, deriveTags } from "../src/pipeline/sport-governo";

describe("deriveEligibleTypes (dest -> LEGAL_TYPES, verified against 22 real notices 2026-07-17)", () => {
  it("maps sport-organization tokens", () => {
    expect(deriveEligibleTypes(["asd", "ssd"])).toEqual(
      expect.arrayContaining(["ASD - Associazione Sportiva Dilettantistica", "SSD - Società Sportiva Dilettantistica"]),
    );
  });

  it("maps eps/fed/dsa to the promozione-sportiva family", () => {
    const types = deriveEligibleTypes(["eps", "fed", "dsa"]);
    expect(types).toEqual(expect.arrayContaining([
      "EPS - Ente di Promozione Sportiva", "FSN - Federazione Sportiva Nazionale", "DSA - Disciplina Sportiva Associata",
    ]));
  });

  it("maps pa/company/ats/onlus directly", () => {
    expect(deriveEligibleTypes(["pa"])).toEqual(["Ente pubblico"]);
    expect(deriveEligibleTypes(["company"])).toEqual(["Impresa"]);
    expect(deriveEligibleTypes(["ats"])).toEqual(["Raggruppamento temporaneo / ATS"]);
    expect(deriveEligibleTypes(["onlus"])).toEqual(["ONLUS"]);
  });

  it("maps 'ets' to the broad ETS family WITHOUT duplicating ONLUS (a separate token here)", () => {
    const types = deriveEligibleTypes(["ets"]);
    expect(types).toContain("ETS - Ente del Terzo Settore");
    expect(types).toContain("Cooperativa sociale tipo A");
    expect(types).not.toContain("ONLUS");
  });

  it("maps religious/ecclesiastical dest tokens to real LEGAL_TYPES entries (corrects the initial wrong assumption — see ADR-010)", () => {
    expect(deriveEligibleTypes(["diocesi", "istituti_religiosi", "societa_vita_apostolica"]))
      .toEqual(["Ente ecclesiastico civilmente riconosciuto"]);
    expect(deriveEligibleTypes(["parrocchia", "ets_oratori"])).toEqual(["Parrocchia / Oratorio"]);
    expect(deriveEligibleTypes(["enti_ecclesiali"])).toEqual(["Ente religioso"]);
    expect(deriveEligibleTypes(["enti_altre_confessioni"])).toEqual(["Ente religioso"]);
  });

  it("returns [] for 'pf' (persona fisica — no organization equivalent)", () => {
    expect(deriveEligibleTypes(["pf"])).toEqual([]);
  });

  it("de-duplicates when multiple dest tokens map to the same type", () => {
    const types = deriveEligibleTypes(["parrocchia", "ets_oratori"]);
    expect(types).toEqual(["Parrocchia / Oratorio"]); // not duplicated
  });
});

describe("shouldSkipNotice (ADR-010)", () => {
  it("skips when dest is non-empty but maps to nothing (real case: dest: ['pf'])", () => {
    expect(shouldSkipNotice(["pf"])).toBe(true);
  });

  it("does NOT skip when dest is empty (no restriction stated, not 'restricted to something we lack')", () => {
    expect(shouldSkipNotice([])).toBe(false);
  });

  it("does NOT skip when at least one dest token maps to a real type", () => {
    expect(shouldSkipNotice(["pf", "asd"])).toBe(false);
    expect(shouldSkipNotice(["diocesi"])).toBe(false); // maps to "Ente ecclesiastico civilmente riconosciuto"
  });
});

describe("deriveTags", () => {
  it("always includes 'sport' (the whole source is sport-related)", () => {
    expect(deriveTags("Bando qualsiasi", "descrizione qualsiasi")).toContain("sport");
  });

  it("adds 'periferie' when the title mentions it", () => {
    expect(deriveTags("Sport e Periferie 2026", "")).toContain("periferie");
  });

  it("adds 'impianti sportivi' from title or description keywords", () => {
    expect(deriveTags("Fondo Perduto Impianti Sportivi - 2024", "")).toContain("impianti sportivi");
  });

  it("adds 'famiglie' when the text mentions it", () => {
    expect(deriveTags("Fondo dote per la Famiglia", "")).toContain("famiglie");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/sport-governo.test.ts`
Expected: FAIL — the three new functions don't exist yet.

- [ ] **Step 3: Implement**

Append to `scraper/src/pipeline/sport-governo.ts`:

```typescript
import { LEGAL_TYPE_SET, TAG_SET } from "./vocab";

// dest -> LEGAL_TYPES, verified against all 22 real notices (2026-07-17). Religious/ecclesiastical
// tokens map to real entries that already exist in LEGAL_TYPES ("Ente ecclesiastico civilmente
// riconosciuto" covers dioceses/religious institutes/societies of apostolic life under the 1985
// Concordato; "Parrocchia / Oratorio" is a direct match; "Ente religioso" is the generic fallback
// for non-Catholic confessions and generic "enti_ecclesiali"). "pf" (persona fisica) has no and can
// never have an equivalent — this platform matches organizations, not individuals.
const DEST_TO_LEGAL_TYPES: Record<string, readonly string[]> = {
  asd: ["ASD - Associazione Sportiva Dilettantistica"],
  ssd: ["SSD - Società Sportiva Dilettantistica"],
  eps: ["EPS - Ente di Promozione Sportiva"],
  fed: ["FSN - Federazione Sportiva Nazionale"],
  dsa: ["DSA - Disciplina Sportiva Associata"],
  ets: [
    "APS - Associazione di Promozione Sociale", "ODV - Organizzazione di Volontariato",
    "ETS - Ente del Terzo Settore", "Rete associativa ETS", "ONG / OSC",
    "Cooperativa sociale tipo A", "Cooperativa sociale tipo B", "Consorzio di cooperative sociali",
    "Impresa sociale", "Fondazione ETS", "Società di mutuo soccorso", "Ente filantropico",
  ],
  onlus: ["ONLUS"],
  pa: ["Ente pubblico"],
  company: ["Impresa"],
  ats: ["Raggruppamento temporaneo / ATS"],
  diocesi: ["Ente ecclesiastico civilmente riconosciuto"],
  istituti_religiosi: ["Ente ecclesiastico civilmente riconosciuto"],
  societa_vita_apostolica: ["Ente ecclesiastico civilmente riconosciuto"],
  provincia_vita_apostolica: ["Ente ecclesiastico civilmente riconosciuto"],
  provincia_istituto_religioso: ["Ente ecclesiastico civilmente riconosciuto"],
  parrocchia: ["Parrocchia / Oratorio"],
  ets_oratori: ["Parrocchia / Oratorio"],
  enti_ecclesiali: ["Ente religioso"],
  enti_altre_confessioni: ["Ente religioso"],
  // "pf" deliberately absent: no mapping, by design (see ADR-010).
};

export function deriveEligibleTypes(dest: string[]): string[] {
  const out = new Set<string>();
  for (const d of dest) {
    for (const t of DEST_TO_LEGAL_TYPES[d] ?? []) out.add(t);
  }
  return [...out].filter((t) => LEGAL_TYPE_SET.has(t));
}

// ADR-010: a notice whose dest is non-empty but maps to nothing represents a restriction to a
// category this platform doesn't represent (verified: only dest === ["pf"] on the real 22-notice
// corpus) — skip it so it never reads as "open to everyone" via an empty eligibleTypes. An EMPTY
// dest is a different case (no restriction stated at all) and must NOT be skipped.
export function shouldSkipNotice(dest: string[]): boolean {
  return dest.length > 0 && deriveEligibleTypes(dest).length === 0;
}

const TAG_RULES: ReadonlyArray<{ re: RegExp; tag: string }> = [
  { re: /periferie/i, tag: "periferie" },
  { re: /impiant[oi] sportiv/i, tag: "impianti sportivi" },
  { re: /famigli/i, tag: "famiglie" },
  { re: /evento|eventi/i, tag: "eventi" },
  { re: /giovan/i, tag: "giovani" },
  { re: /disabil/i, tag: "disabilità" },
];

export function deriveTags(title: string, description: string): string[] {
  const out = new Set<string>(["sport"]);
  const text = `${title} ${description}`;
  for (const rule of TAG_RULES) {
    if (rule.re.test(text)) out.add(rule.tag);
  }
  return [...out].filter((t) => TAG_SET.has(t));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/sport-governo.test.ts`
Expected: all tests PASS (5 from Task 5 + new ones from this task).

- [ ] **Step 5: Commit**

```bash
cd /workspaces/Bandi
git add scraper/src/pipeline/sport-governo.ts scraper/tests/sport-governo.test.ts
git commit -m "feat(scraper): sport-governo dest->eligibleTypes mapping, skip rule, tags"
```

---

### Task 7: `sport-governo.ts` — listing `parse()`

**Files:**
- Modify: `scraper/src/pipeline/sport-governo.ts`
- Modify: `scraper/tests/sport-governo.test.ts`

**Interfaces:**
- Consumes: `htmlToLightMarkup`, `deriveEligibleTypes`, `shouldSkipNotice`, `deriveTags` (this file, Tasks 5-6).
- Produces: `parseSportGoverno(raw: string): unknown[]` — Task 9 wires this into the `Archetype.parse` field.

- [ ] **Step 1: Write the failing test**

Append to `scraper/tests/sport-governo.test.ts`:

```typescript
import { parseSportGoverno } from "../src/pipeline/sport-governo";

// Real shape (avvisibandi.sport.governo.it, verified live 2026-07-17): the homepage embeds
// __NEXT_DATA__ with props.pageProps.notices[]. IDs/dest/titles below are the REAL values for 3 of
// the 22 real notices (descriptions trimmed for fixture readability, structure unchanged).
function nextDataHtml(notices: unknown[]): string {
  const data = { props: { pageProps: { notices, posts: [] } }, page: "/", query: {} };
  return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

describe("parseSportGoverno (listing)", () => {
  it("maps real notices to raw grant items, skipping the pf-only one", () => {
    const html = nextDataHtml([
      {
        _id: "699d5d516166f9f16884719b", title: "Sport e Periferie 2026",
        description: "<p>Al riguardo, è stato stanziato un finanziamento complessivo pari ad euro 100 milioni.</p>",
        image: "https://avvisibandi.sport.governo.it/api/static/notices/699d5d516166f9f16884719b/image.png",
        dest: ["pa"],
        schedule: { compilazione: { start: "2026-06-04T10:00:00.000Z", end: "2026-06-25T10:00:00.000Z" } },
      },
      {
        _id: "687e0a24ef7a47aa396ddbd1", title: "Fondo dote per la Famiglia - Candidatura BENEFICIARI",
        description: "<p>Candidatura riservata alle famiglie.</p>",
        image: "https://avvisibandi.sport.governo.it/api/static/notices/687e0a24ef7a47aa396ddbd1/image.png",
        dest: ["pf"],
        schedule: { compilazione: { start: "2025-01-01T00:00:00.000Z", end: "2025-02-01T00:00:00.000Z" } },
      },
      {
        _id: "696fa4cd7ab13ae68a3df7c5", title: "Avviso per la selezione di interventi infrastrutturali destinati agli ORATORI",
        description: "<p>Riservato a Diocesi e Istituti Religiosi.</p>",
        image: "https://avvisibandi.sport.governo.it/api/static/notices/696fa4cd7ab13ae68a3df7c5/image.png",
        dest: ["diocesi", "istituti_religiosi"],
        schedule: { compilazione: { start: "2026-07-16T10:00:00.000Z", end: "2026-10-16T10:00:00.000Z" } },
      },
    ]);

    const items = parseSportGoverno(html) as Array<Record<string, unknown>>;

    expect(items).toHaveLength(2); // the pf-only notice is skipped
    const periferie = items.find((i) => i.title === "Sport e Periferie 2026")!;
    expect(periferie.url).toBe("https://avvisibandi.sport.governo.it/bandi/699d5d516166f9f16884719b");
    expect(periferie.deadline).toBe("2026-06-25");
    expect(periferie.eligibleTypes).toEqual(["Ente pubblico"]);
    expect(periferie.geoScope).toBe("nazionale");
    expect(periferie.area).toBeNull();
    expect((periferie.summary as string)).toContain("finanziamento complessivo");

    const oratori = items.find((i) => (i.title as string).includes("ORATORI"))!;
    expect(oratori.eligibleTypes).toEqual(["Ente ecclesiastico civilmente riconosciuto"]);
  });

  it("returns [] on malformed input (no __NEXT_DATA__ marker)", () => {
    expect(parseSportGoverno("<html><body>not the right page</body></html>")).toEqual([]);
  });

  it("returns [] on malformed __NEXT_DATA__ JSON", () => {
    expect(parseSportGoverno('<script id="__NEXT_DATA__" type="application/json">{not json</script>')).toEqual([]);
  });

  it("derives status from schedule.compilazione.end vs today", () => {
    const past = nextDataHtml([{
      _id: "past1", title: "Bando scaduto", description: "<p>Testo.</p>",
      image: "", dest: ["pa"],
      schedule: { compilazione: { start: "2020-01-01T00:00:00.000Z", end: "2020-02-01T00:00:00.000Z" } },
    }]);
    const [item] = parseSportGoverno(past) as Array<Record<string, unknown>>;
    expect(item!.status).toBe("scaduto");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/sport-governo.test.ts`
Expected: FAIL — `parseSportGoverno` doesn't exist yet.

- [ ] **Step 3: Implement**

Append to `scraper/src/pipeline/sport-governo.ts`:

```typescript
function extractNextData(raw: string): unknown | null {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(raw);
  if (!m) return null;
  try { return JSON.parse(m[1]!); } catch { return null; }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDay(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^(\d{4}-\d{2}-\d{2})/.exec(v)?.[1] ?? null;
}

function noticeUrl(id: string): string {
  return `https://avvisibandi.sport.governo.it/bandi/${id}`;
}

function statusFrom(deadline: string | null, today: string): "aperto" | "chiuso" | "scaduto" | null {
  if (!deadline) return null;
  return deadline < today ? "scaduto" : "aperto";
}

interface RawNotice {
  _id?: unknown; title?: unknown; description?: unknown; dest?: unknown;
  schedule?: { compilazione?: { end?: unknown } };
}

// PRIMARY listing path: parse the homepage's embedded __NEXT_DATA__ straight into raw grant
// items — no LLM. Returns [] on anything unexpected, which makes extractGrants fall back to the
// LLM path (same contract as every other code-parsed archetype).
export function parseSportGoverno(raw: string): unknown[] {
  const data = extractNextData(raw) as { props?: { pageProps?: { notices?: unknown[] } } } | null;
  const notices = data?.props?.pageProps?.notices;
  if (!Array.isArray(notices)) return [];
  const today = todayIso();
  const out: unknown[] = [];
  for (const item of notices) {
    if (typeof item !== "object" || item === null) continue;
    const n = item as RawNotice;
    const id = typeof n._id === "string" ? n._id : null;
    const title = typeof n.title === "string" ? n.title : null;
    if (!id || !title) continue;
    const description = typeof n.description === "string" ? n.description : "";
    const dest = Array.isArray(n.dest) ? n.dest.filter((d): d is string => typeof d === "string") : [];
    if (shouldSkipNotice(dest)) continue;
    const deadline = isoDay(n.schedule?.compilazione?.end);
    const summary = htmlToLightMarkup(description) || null;
    out.push({
      title,
      url: noticeUrl(id),
      summary,
      deadline,
      status: statusFrom(deadline, today),
      // Unlike er-sociale/sportesalute, this source has no separate SHORT summary field safe to
      // parse whole — `description` IS the full body prose, exactly as red-herring-prone as
      // er-sociale's `text` (e.g. "di cui € 30.000.000" next to the real "100 milioni" total).
      // Passing it raw here would hand coerce()'s unguarded numOrNull the same red-herring risk
      // er-sociale's sentence-anchoring was built to prevent. Leave amount to the detail phase,
      // which resolves it safely via extractAnchoredAmount (see parseDetailSportGoverno).
      amount: null,
      area: null,
      geoScope: "nazionale",
      eligibleTypes: deriveEligibleTypes(dest),
      tags: deriveTags(title, description),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/sport-governo.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /workspaces/Bandi
git add scraper/src/pipeline/sport-governo.ts scraper/tests/sport-governo.test.ts
git commit -m "feat(scraper): sport-governo listing parser (parseSportGoverno)"
```

---

### Task 8: `sport-governo.ts` — `parseDetail()`

**Files:**
- Modify: `scraper/src/pipeline/sport-governo.ts`
- Modify: `scraper/tests/sport-governo.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 5-7, plus `extractAnchoredAmount`, `extractAnchoredPercentage`, `COFUNDING_SIGNAL_RE`, `escalateEconomicsToLLM` from `./economics`, `parseItalianAmount` from `./enrich`, `GrantAttachment`, `DetailGrant` from `./types`, `LLMProvider` from `../providers/types`.
- Produces: `parseDetailSportGoverno(raw: string, llm: LLMProvider): Promise<DetailGrant | null>` — Task 9 wires this into `Archetype.parseDetail`.

- [ ] **Step 1: Write the failing tests**

Append to `scraper/tests/sport-governo.test.ts`:

```typescript
import { parseDetailSportGoverno } from "../src/pipeline/sport-governo";
import { FakeLLMProvider } from "../src/providers/fake";
import type { LLMProvider as LLMProviderType } from "../src/providers/types";

const NO_LLM: LLMProviderType = { name: "boom", extract: async () => { throw new Error("must not be called"); } };

function detailNextDataHtml(notice: Record<string, unknown>): string {
  const data = { props: { pageProps: { notice } }, page: "/bandi/[noticeId]", query: { noticeId: notice._id } };
  return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

describe("parseDetailSportGoverno", () => {
  it("maps a real notice detail object (verified live shape, avvisibandi.sport.governo.it 2026-07-17)", async () => {
    const html = detailNextDataHtml({
      _id: "699d5d516166f9f16884719b",
      title: "Sport e Periferie 2026",
      code: "C82B7746C3",
      description: "<p>Al riguardo, è stato stanziato un finanziamento complessivo pari ad euro 100 milioni. "
        + "È, in ogni caso, prevista una quota di cofinanziamento a carico del Comune richiedente pari ad almeno il 15% del contributo.</p>",
      dest: ["pa"],
      schedule: { compilazione: { end: "2026-06-25T10:00:00.000Z" } },
      attachments: [{ name: "Testo Avviso Pubblico Sport e Periferie 2026", url: "https://avvisibandi.web.coninet.it/api/static/notices/699d5d516166f9f16884719b/attachments/x.pdf", _id: "6a15959ec3a3f49a9cdf50cb" }],
    });

    const d = (await parseDetailSportGoverno(html, NO_LLM))!;

    expect(d.deadline).toBe("2026-06-25");
    expect(d.eligibleTypes).toEqual(["Ente pubblico"]);
    expect(d.amount).toBe(100_000_000);
    expect(d.cofundingPercentage).toBe(15);
    expect(d.attachments).toEqual([
      { title: "Testo Avviso Pubblico Sport e Periferie 2026", url: "https://avvisibandi.web.coninet.it/api/static/notices/699d5d516166f9f16884719b/attachments/x.pdf", mimeType: null },
    ]);
    expect(d.requirements).toContain("Codice: C82B7746C3");
    expect(d.requirements).toContain("finanziamento complessivo");
  });

  it("omits the 'Codice:' line when code is absent", async () => {
    const html = detailNextDataHtml({
      _id: "x", title: "T", description: "<p>Testo.</p>", dest: ["pa"],
      schedule: { compilazione: { end: "2026-01-01T00:00:00.000Z" } }, attachments: [],
    });
    const d = (await parseDetailSportGoverno(html, NO_LLM))!;
    expect(d.requirements).not.toContain("Codice:");
  });

  it("drops attachments missing a name or url, never half-mapped", async () => {
    const html = detailNextDataHtml({
      _id: "x", title: "T", description: "<p>Testo.</p>", dest: ["pa"],
      schedule: {}, attachments: [{ name: "senza url" }, { url: "https://x/senza-nome.pdf" }, { name: "ok", url: "https://x/ok.pdf" }],
    });
    const d = (await parseDetailSportGoverno(html, NO_LLM))!;
    expect(d.attachments).toEqual([{ title: "ok", url: "https://x/ok.pdf", mimeType: null }]);
  });

  it("returns null on malformed input", async () => {
    expect(await parseDetailSportGoverno("<html>not the right page</html>", NO_LLM)).toBeNull();
  });

  it("escalates to the shared LLM helper when amount is unresolved deterministically", async () => {
    const AMBIGUOUS = "Contributo variabile in base ai ricavi. Nessun totale dichiarato qui.";
    const html = detailNextDataHtml({
      _id: "x", title: "T", description: `<p>${AMBIGUOUS}</p>`, dest: ["company"], schedule: {}, attachments: [],
    });
    const llm = new FakeLLMProvider(new Map<string, unknown>([[AMBIGUOUS, { totalAmount: "75.000", cofundingPercentage: null }]]));
    const d = (await parseDetailSportGoverno(html, llm))!;
    expect(d.amount).toBe(75000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/sport-governo.test.ts`
Expected: FAIL — `parseDetailSportGoverno` doesn't exist yet.

- [ ] **Step 3: Implement**

Append to `scraper/src/pipeline/sport-governo.ts`:

```typescript
import { extractAnchoredAmount, extractAnchoredPercentage, COFUNDING_SIGNAL_RE, escalateEconomicsToLLM } from "./economics";
import type { DetailGrant, GrantAttachment } from "./types";
import type { LLMProvider } from "../providers/types";

// Real phrasing observed live (2026-07-17), distinct from er-sociale's own signal words: totals
// here are introduced by "finanziata con"/"stanziato"/"dotazione di"/"ammontano a"/"finanziamento
// complessivo" — verified against all 22 real notices before writing this regex.
const SPORT_GOVERNO_TOTAL_SIGNAL_RE = /finanziat[ao] con|stanziat[oi]|stanziamento|ammontano a|dotazione di|finanziamento complessivo/i;

function attachmentsFrom(raw: unknown): GrantAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: GrantAttachment[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const a = item as Record<string, unknown>;
    if (typeof a.name !== "string" || typeof a.url !== "string") continue;
    out.push({ title: a.name, url: a.url, mimeType: null });
  }
  return out;
}

interface RawNoticeDetail extends RawNotice {
  code?: unknown;
  attachments?: unknown;
}

// DETAIL path: map the notice's own page object to a DetailGrant. Returns null on anything
// unexpected (malformed JSON, missing notice), counted as detailSkipped and retried next run.
export async function parseDetailSportGoverno(raw: string, llm: LLMProvider): Promise<DetailGrant | null> {
  const data = extractNextData(raw) as { props?: { pageProps?: { notice?: unknown } } } | null;
  const n = data?.props?.pageProps?.notice;
  if (typeof n !== "object" || n === null) return null;
  const notice = n as RawNoticeDetail;

  const title = typeof notice.title === "string" ? notice.title : "";
  const description = typeof notice.description === "string" ? notice.description : "";
  const dest = Array.isArray(notice.dest) ? notice.dest.filter((d): d is string => typeof d === "string") : [];
  const code = typeof notice.code === "string" ? notice.code : null;
  const markup = htmlToLightMarkup(description);
  const withCode = code ? `Codice: ${code}\n${markup}` : markup;

  // Unlike er-sociale (which has a separate short `description` safe to whole-string-parse before
  // falling back to sentence-anchoring on the longer `text` body), sport-governo has only ONE
  // `description` field that IS the full body — applying an unguarded whole-text parse to it would
  // reopen exactly the red-herring bug class er-sociale's sentence-anchoring exists to prevent
  // (e.g. "di cui € 30.000.000" appearing right next to the real "100 milioni" total, or an
  // unrelated per-project cap earlier in the text). So there is only ONE deterministic tier here:
  // sentence-anchored, same as er-sociale's second tier.
  const combinedText = markup;
  let amount = extractAnchoredAmount(combinedText, SPORT_GOVERNO_TOTAL_SIGNAL_RE);
  let cofundingPercentage = extractAnchoredPercentage(combinedText, COFUNDING_SIGNAL_RE);
  if (amount == null) {
    const escalated = await escalateEconomicsToLLM(combinedText, llm);
    amount = escalated.amount;
    if (cofundingPercentage == null) cofundingPercentage = escalated.cofundingPercentage;
  }

  const deadline = isoDay(notice.schedule?.compilazione?.end);

  return {
    summary: withCode || null,
    requirements: withCode || null,
    beneficiaries: dest.join(", ") || null,
    openingDate: null,
    fundingType: null,
    amount,
    minAmount: null,
    maxAmount: null,
    cofundingPercentage,
    eligibleExpenses: null,
    applicationMethod: null,
    contactInfo: null,
    deadline,
    eligibleTypes: deriveEligibleTypes(dest),
    tags: deriveTags(title, description),
    attachments: attachmentsFrom(notice.attachments),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /workspaces/Bandi/scraper && npx vitest run tests/sport-governo.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Run the full scraper suite and typecheck**

Run: `cd /workspaces/Bandi/scraper && npx vitest run && npm run typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
cd /workspaces/Bandi
git add scraper/src/pipeline/sport-governo.ts scraper/tests/sport-governo.test.ts
git commit -m "feat(scraper): sport-governo detail parser (parseDetailSportGoverno)"
```

---

### Task 9: Register `SPORT_GOVERNO_ARCHETYPE`

**Files:**
- Modify: `scraper/src/pipeline/sport-governo.ts`
- Modify: `scraper/src/pipeline/archetypes.ts`
- Test: `scraper/tests/archetypes.test.ts` (check if it exists first: `ls scraper/tests/archetypes.test.ts`)

**Interfaces:**
- Consumes: `parseSportGoverno`, `parseDetailSportGoverno` (this file), `Archetype`, `JsonSchema` types.
- Produces: `SPORT_GOVERNO_ARCHETYPE: Archetype`, registered under key `"sport-governo"` — Task 10's DB source row references this key.

- [ ] **Step 1: Add the archetype export**

Append to `scraper/src/pipeline/sport-governo.ts`:

```typescript
import type { Archetype } from "./types";
import type { JsonSchema } from "../providers/types";

// LLM fallback (used only if parse() returns [], e.g. the site's data shape changed): the body is
// the raw page HTML including the __NEXT_DATA__ script tag, so the instructions explain that shape.
const SPORT_GOVERNO_SCHEMA: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      url: { type: "string" },
      deadline: { type: "string", nullable: true },
      summary: { type: "string", nullable: true },
    },
    required: ["title", "url"],
  },
};

const SPORT_GOVERNO_INSTRUCTIONS = [
  "Il contenuto è la pagina HTML di un sito Next.js del Dipartimento per lo Sport (Governo italiano): contiene uno script con id \"__NEXT_DATA__\" il cui JSON ha props.pageProps.notices, un array di bandi.",
  "Per ogni bando estrai: title, url (costruiscila come https://avvisibandi.sport.governo.it/bandi/<_id> usando il campo _id), deadline (da schedule.compilazione.end, solo la data YYYY-MM-DD), summary (da description, testo semplice senza tag HTML).",
  "Usa null per i campi mancanti. Non inventare valori.",
].join(" ");

export const SPORT_GOVERNO_ARCHETYPE: Archetype = {
  name: "sport-governo",
  parse: parseSportGoverno,             // primary path — no LLM
  parseDetail: parseDetailSportGoverno, // detail via the notice's own page JSON — LLM only for amount/cofunding escalation
  sanitize: (html) => html,             // parsed via __NEXT_DATA__ extraction; nothing to sanitize
  chunkSize: 35_000,
  overlap: 2_000,
  boundaryTags: [],                     // no clean HTML boundary in a JSON-embedded-in-HTML page; whitespace fallback is fine
  urlSnapping: false,                   // URLs are constructed from _id, always canonical
  listing: { schema: SPORT_GOVERNO_SCHEMA, instructions: SPORT_GOVERNO_INSTRUCTIONS },
  detailRequired: false,
  detailEnabled: true,
};
```

- [ ] **Step 2: Check for an existing archetypes registry test**

Run: `ls /workspaces/Bandi/scraper/tests/archetypes.test.ts 2>&1 || echo "does not exist"`

If it exists, read it and add a case there. If not, this task doesn't need a new test file — registry wiring is exercised end-to-end by Task 10's dry-run, and `sport-governo.test.ts` already tests `parseSportGoverno`/`parseDetailSportGoverno` directly.

- [ ] **Step 3: Register in the archetype registry**

In `scraper/src/pipeline/archetypes.ts`, add the import:

```typescript
import { SPORT_GOVERNO_ARCHETYPE } from "./sport-governo";
```

And add to the `ARCHETYPES` registry object:

```typescript
export const ARCHETYPES: Record<string, Archetype> = {
  [FULL_ARCHETYPE.name]: FULL_ARCHETYPE,
  [LISTING_LIGHT_ARCHETYPE.name]: LISTING_LIGHT_ARCHETYPE,
  [SPORTESALUTE_ARCHETYPE.name]: SPORTESALUTE_ARCHETYPE,
  [ER_SOCIALE_ARCHETYPE.name]: ER_SOCIALE_ARCHETYPE,
  [SPORT_GOVERNO_ARCHETYPE.name]: SPORT_GOVERNO_ARCHETYPE,
};
```

- [ ] **Step 4: Verify resolution by name**

Run:
```bash
cd /workspaces/Bandi/scraper && node --import tsx -e '
import { resolveArchetype } from "./src/pipeline/archetypes.ts";
const a = resolveArchetype("sport-governo");
console.log(a.name, typeof a.parse, typeof a.parseDetail, a.detailEnabled);
'
```
Expected output: `sport-governo function function true`

- [ ] **Step 5: Run the full scraper suite and typecheck**

Run: `cd /workspaces/Bandi/scraper && npx vitest run && npm run typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
cd /workspaces/Bandi
git add scraper/src/pipeline/sport-governo.ts scraper/src/pipeline/archetypes.ts
git commit -m "feat(scraper): register sport-governo archetype"
```

---

### Task 10: Checkpoint — register source (disabled), preview verification

**No production writes to `grants` or scheduler activation in this task.** `grant_sources.enabled` gates `loadEnabledSources` (used by the real CLI and the cron endpoint) — since this source stays `enabled: false` until the user gives the go-ahead, the normal `--dry-run`/real CLI commands would see zero sources and do nothing. Instead, this task runs the pipeline directly against an in-memory `SourceConfig`, bypassing `loadEnabledSources` entirely, and writes results to `grants_preview` only (never `grants`).

**Files:**
- Create (scratchpad, not committed): a one-off script, e.g. `/tmp/.../scratchpad/preview-sport-governo.mjs`

- [ ] **Step 1: Register the source row (disabled)**

Run this SQL via the Supabase MCP `execute_sql` tool against project `gptsklxbkuhdfkksmqhz`:

```sql
insert into grant_sources (name, url, priority, enabled, scrape_config)
values (
  'Dipartimento per lo Sport - Avvisi e Bandi',
  'https://avvisibandi.sport.governo.it/',
  'medium',
  false,
  '{"archetype": "sport-governo", "fetchMode": "direct", "listUrl": "https://avvisibandi.sport.governo.it/", "maxPages": 1}'::jsonb
)
returning id, name, enabled;
```

Confirm the row was created with `enabled: false`. Note the returned `id` — the script in Step 2 needs it.

- [ ] **Step 2: Write and run the preview script**

Create `preview-sport-governo.mjs` in the scratchpad directory (real, complete code — replace `<SOURCE_ID>` with the id from Step 1):

```javascript
// Runs the sport-governo archetype end-to-end (listing + detail) against the REAL live site and
// writes results to grants_preview ONLY — grantToInsertRow/patchToUpdateRow are the same row
// mappers SupabaseGrantsDb uses for the real `grants` table, just pointed at a different table
// name, so this exercises the exact same shape production would.
import { createClient } from "@supabase/supabase-js";
import { runPipeline } from "/workspaces/Bandi/scraper/src/pipeline/run.ts";
import { DirectFetcher } from "/workspaces/Bandi/scraper/src/pipeline/direct-fetcher.ts";
import { getProvider } from "/workspaces/Bandi/scraper/src/providers/index.ts";
import { throttleProvider } from "/workspaces/Bandi/scraper/src/providers/throttle-provider.ts";
import { grantToInsertRow, patchToUpdateRow } from "/workspaces/Bandi/scraper/src/db/supabase-grants-db.ts";

const SOURCE_ID = "<SOURCE_ID>";
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

class PreviewGrantsDb {
  #byId = new Map(); // id -> StoredGrant, for findGrantsNeedingDetail within this one run
  async findByUrl() { return null; } // clean-slate preview every run, never treated as an update
  async findActiveByUrl() { return null; }
  async insert(grant) {
    const { data, error } = await client.from("grants_preview").insert(grantToInsertRow(grant)).select("id").single();
    if (error) throw error;
    this.#byId.set(data.id, { ...grant, id: data.id });
    console.log(`[preview] inserted "${grant.title}" (${data.id})`);
  }
  async update(id, patch) {
    const { error } = await client.from("grants_preview").update(patchToUpdateRow(patch)).eq("id", id);
    if (error) throw error;
  }
  async findProviderIdByName() { return null; }
  async updateSource() {}
  async logScrapeRun(entry) {
    console.log(`[preview] ${entry.phase}: +${entry.inserted} ~${entry.updated} =${entry.skipped} errors=${entry.errors.length} detailErrors=${entry.detailErrors.length}`);
  }
  async markDetailFetched(id, patch) {
    const { error } = await client.from("grants_preview").update({ ...patchToUpdateRow(patch), detail_fetched_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    console.log(`[preview] detail fetched for ${id}: amount=${patch.amount} cofunding=${patch.cofundingPercentage}`);
  }
  async findGrantsNeedingDetail() { return [...this.#byId.values()]; } // everything just inserted, same run
}

const source = {
  id: SOURCE_ID,
  name: "Dipartimento per lo Sport - Avvisi e Bandi",
  url: "https://avvisibandi.sport.governo.it/",
  scrapeConfig: {
    archetype: "sport-governo",
    fetchMode: "direct",
    listUrl: "https://avvisibandi.sport.governo.it/",
    maxPages: 1,
  },
};

const llm = throttleProvider(getProvider(process.env), 5000);
const results = await runPipeline([source], {
  fetcher: new DirectFetcher(),
  llm,
  db: new PreviewGrantsDb(),
  detailThrottleMs: 200,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});
console.log(JSON.stringify(results, null, 2));
```

Run it:
```bash
cd /workspaces/Bandi/scraper && node --env-file=.env --import tsx /tmp/claude-1000/-workspaces-Bandi/9b0f434a-cced-42d2-a68e-d04128640fd4/scratchpad/preview-sport-governo.mjs
```

Expected: `[preview] inserted ...` lines for ~19-21 notices (22 minus the `pf`-only skip, and possibly minus any that have expired since 2026-07-17 — expired ones still appear, just marked `scaduto`), no line for "Fondo dote per la Famiglia - Candidatura BENEFICIARI" (the skipped one), then `[preview] detail fetched for ...` lines showing resolved `amount`/`cofunding` for at least some notices, and a final `logScrapeRun` summary with `errors: []`.

If it fails with a network/parsing error: STOP. Use `superpowers:systematic-debugging` — the live site's HTML shape may have drifted from what Tasks 5-8 assumed; re-fetch and compare against the fixtures in `sport-governo.test.ts` before touching code.

- [ ] **Step 3: Inspect the resulting rows**

```sql
select title, status, amount, cofunding_percentage, eligible_types, tags, geo_scope,
       length(requirements) as req_len, jsonb_array_length(attachments) as n_attachments
from grants_preview
where source_id = '<SOURCE_ID>'
order by title;
```

Verify: `geo_scope = 'nazionale'` on every row, `eligible_types` non-empty on every row (no notice in the real 22 has an empty `dest`, so this should never be `{}`  here — if it is, something in Task 6/7's wiring regressed), `requirements` contains `## `/`### `/`- ` markup for notices whose description had headings/lists (e.g. any "Sport e Periferie" edition), at least one row has `amount` and/or `cofunding_percentage` populated (proof the economics tiers work on real text, not just fixtures).

- [ ] **Step 4: Clean up and report to the user**

Delete the preview rows so `grants_preview` doesn't accumulate stale data across sessions:
```sql
delete from grants_preview where source_id = '<SOURCE_ID>';
```

Report to the user: how many notices ingested vs skipped (and which one), sample of resolved amounts/cofunding percentages, any notice where both deterministic tiers AND the LLM escalation left `amount` null (expected for some — e.g. Sport Bonus's tax-credit-rate bandi have no fixed total, correctly deferred rather than guessed). Do NOT enable the source (`enabled: true`) or touch production `grants` — that requires the user's explicit go-ahead, same as er-sociale's activation.
