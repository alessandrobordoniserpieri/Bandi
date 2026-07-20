# Analisi AI forte V1 — Piano 1: Fondamenta dati + entitlement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare lo strato dati (tabelle `grant_documents` e `chat_messages`, contatori rate-limit)
e il seam di entitlement su cui poggia tutta la feature "analisi forte" V1.

**Architecture:** Una sola migration additiva (0014) aggiunge due tabelle nuove + colonne su
`user_settings`, seguendo le convenzioni RLS esistenti (owner-only per i dati privati, read-only
condiviso per i dati derivati da PDF pubblici). Il seam `checkEntitlement` generalizza il pattern
di `consumeAnalysisQuota` a tre secchielli indipendenti dietro un'unica funzione, così i crediti
(V2) potranno sostituirlo senza toccare le route.

**Tech Stack:** Supabase Postgres (migrations SQL in `app/supabase/migrations/`), TypeScript,
vitest, `@supabase/supabase-js`.

## Global Constraints

- Lingua UI: italiano. Codice e commenti: inglese.
- Next.js 16 (breaking changes vs training data) — leggere `app/node_modules/next/dist/docs/`
  prima di toccare codice app.
- Le migration sono **additive e idempotenti** (`add column if not exists`, `create table if not
  exists`), stessa convenzione di 0009–0013.
- RLS abilitata su ogni tabella user-facing. Owner-only = policy `(select auth.uid()) = user_id`
  per select/insert/update/delete (pattern da `0003_rls.sql`).
- Nessun `CHECK` sugli enum applicativi (status/role): validati app-side, come `grant_type`/`status`.
- **Lo scraper NON tocca `grant_documents`** (disaccoppiamento da spec §7).
- Spec di riferimento: `docs/superpowers/specs/2026-07-20-strong-ai-analysis-rag-v1-design.md`.

---

## Roadmap V1 (6 piani sequenziali, ognuno software testabile a sé)

1. **Fondamenta dati + entitlement** ← *questo piano*. Migration 0014, types, seam `checkEntitlement`.
2. **Estrazione PDF + seam OCR.** `OcrProvider` (+ `OcrSpaceProvider`), `PdfTextExtractor`
   (libreria → rasterizzazione → OCR fallback), dipendenze PDF. Testabile in isolamento.
3. **Worker asincrono di estrazione.** Endpoint che processa le righe `pending`, transizioni di
   stato; migration scheduler pg_cron (spento di default).
4. **Analisi forte (generazione).** `buildStrongAnalysisDocument`, route `prepare` (innesca) +
   `status` (polling), riuso di `analysisSchema`/`analyzeGrant`.
5. **Chat backend.** `buildChatPrompt` + troncamento budget-token, route chat (turno), persistenza
   su `chat_messages`, entitlement.
6. **UI.** Card "analisi forte", 3 stati + 2 fallimenti, hook di polling, componente chat.

I piani 2–6 verranno scritti con la stessa skill man mano, ciascuno nel proprio file
`docs/superpowers/plans/2026-07-20-strong-ai-v1-0N-*.md`.

---

## File Structure (Piano 1)

- Create: `app/supabase/migrations/0014_strong_ai_analysis_foundations.sql` — DDL: `grant_documents`,
  `chat_messages`, colonne rate-limit su `user_settings`, RLS.
- Modify: `app/src/lib/supabase/database.types.ts` — rigenerato dallo schema aggiornato.
- Create: `app/src/lib/ai/entitlement.ts` — seam `checkEntitlement` + logica dei tre secchielli.
- Create: `app/src/lib/ai/__tests__/entitlement.test.ts` — test unitari del seam.

---

## Task 1: Migration 0014 — schema fondamenta

**Files:**
- Create: `app/supabase/migrations/0014_strong_ai_analysis_foundations.sql`

**Interfaces:**
- Produces (tabelle/colonne consumate dai piani successivi):
  - `grant_documents(id uuid, grant_id uuid, attachment_url text, extracted_text text null,
    status text, ocr_used boolean, error text null, created_at timestamptz, updated_at timestamptz)`,
    `unique(grant_id, attachment_url)`. `status ∈ {'pending','processing','ready','failed'}` (validato app-side).
  - `chat_messages(id uuid, grant_id uuid, user_id uuid, role text, content text, created_at timestamptz)`.
    `role ∈ {'user','assistant'}` (validato app-side).
  - `user_settings` nuove colonne: `chat_calls_count int`, `chat_calls_window_start timestamptz`,
    `extraction_count int`, `extraction_window_start timestamptz`.

- [ ] **Step 1: Scrivere la migration**

Create `app/supabase/migrations/0014_strong_ai_analysis_foundations.sql`:

```sql
-- 0014: fondamenta "analisi forte" V1 (spec 2026-07-20-strong-ai-analysis-rag-v1-design.md).
-- (a) grant_documents: testo estratto dai PDF, UNA riga per allegato (grant_id, attachment_url),
--     CONDIVISO tra utenti (deriva da PDF pubblici). Popolato dal worker dell'app, MAI dallo
--     scraper (disaccoppiamento, spec §7). status valida app-side: pending/processing/ready/failed.
-- (b) chat_messages: conversazione persistita PER-UTENTE (privata, owner RLS). role: user/assistant.
-- (c) user_settings: due nuovi secchielli rate-limit indipendenti (chat orario, estrazione
--     giornaliera) accanto a quello esistente dell'analisi rapida (ai_calls_*).

create table if not exists public.grant_documents (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  attachment_url text not null,
  extracted_text text,
  status text not null default 'pending',
  ocr_used boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grant_id, attachment_url)
);
create index if not exists grant_documents_grant on public.grant_documents (grant_id);
create index if not exists grant_documents_status on public.grant_documents (status);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_user_grant on public.chat_messages (user_id, grant_id, created_at);

alter table public.user_settings
  add column if not exists chat_calls_count int not null default 0,
  add column if not exists chat_calls_window_start timestamptz,
  add column if not exists extraction_count int not null default 0,
  add column if not exists extraction_window_start timestamptz;

-- RLS. grant_documents = catalogo condiviso derivato da PDF pubblici: lettura a ogni autenticato,
-- scrittura solo service_role (bypass RLS) — stesso schema di public.grants.
alter table public.grant_documents enable row level security;
create policy grant_documents_read on public.grant_documents
  for select to authenticated using (true);

-- chat_messages = dato privato: CRUD limitato al proprietario (pattern da 0003_rls.sql).
alter table public.chat_messages enable row level security;
create policy chat_messages_select on public.chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy chat_messages_delete on public.chat_messages
  for delete to authenticated using ((select auth.uid()) = user_id);
```

- [ ] **Step 2: Applicare la migration a un branch Supabase di sviluppo**

Applicare via CLI Supabase (o MCP `apply_migration` su un branch di sviluppo, MAI diretto su prod):

Run: `cd app && npx supabase db push` (o, se si usa un branch effimero, `supabase branches create`).
Expected: `grant_documents`, `chat_messages` create; nuove colonne su `user_settings`; nessun errore.

- [ ] **Step 3: Verificare lo schema applicato**

Run (psql/SQL editor):
```sql
select table_name, column_name from information_schema.columns
where table_name in ('grant_documents','chat_messages')
   or (table_name='user_settings' and column_name like '%chat_calls%' or column_name like '%extraction%')
order by table_name, ordinal_position;
```
Expected: elenco colonne come da Step 1. RLS attiva:
```sql
select relname, relrowsecurity from pg_class where relname in ('grant_documents','chat_messages');
```
Expected: `relrowsecurity = true` per entrambe.

- [ ] **Step 4: Commit**

```bash
git add app/supabase/migrations/0014_strong_ai_analysis_foundations.sql
git commit -m "feat(db): grant_documents + chat_messages + rate-limit columns (strong AI analysis V1 foundations)"
```

---

## Task 2: Rigenerare i tipi TypeScript

**Files:**
- Modify: `app/src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: i tipi `Database["public"]["Tables"]["grant_documents"]` e `["chat_messages"]`, più le
  nuove colonne su `user_settings`, usati dai piani 2–6.

- [ ] **Step 1: Rigenerare i tipi dallo schema aggiornato**

Run: `cd app && npx supabase gen types typescript --project-id gptsklxbkuhdfkksmqhz > src/lib/supabase/database.types.ts`
(oppure `--local` se si genera dal branch locale.)
Expected: il file ora contiene `grant_documents` e `chat_messages` nelle `Tables`.

- [ ] **Step 2: Verificare che il typecheck app passi**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore (i nuovi tipi sono additivi, nulla di esistente si rompe).

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/supabase/database.types.ts
git commit -m "chore(db): regenerate database.types.ts for grant_documents/chat_messages"
```

---

## Task 3: Seam di entitlement (tre secchielli dietro un'unica funzione)

**Files:**
- Create: `app/src/lib/ai/entitlement.ts`
- Test: `app/src/lib/ai/__tests__/entitlement.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient<Database>` (client dell'utente, RLS applicata), schema `user_settings`
  con le colonne del Task 1.
- Produces:
  - `type EntitlementAction = "quick_analysis" | "chat_message" | "extraction"`
  - `async function checkEntitlement(supabase, userId, action, now?): Promise<{ allowed: boolean }>`
    — oggi consulta il contatore del secchiello corrispondente; in V2 diventerà un check sul saldo
    crediti (stessa firma). Le finestre: `quick_analysis`/`chat_message` orarie, `extraction`
    giornaliera.

- [ ] **Step 1: Scrivere il primo test (chat: consente entro il limite, blocca oltre)**

Create `app/src/lib/ai/__tests__/entitlement.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { checkEntitlement, LIMITS } from "../entitlement";

// Minimal in-memory fake of the Supabase query builder subset entitlement uses:
// from("user_settings").select(...).eq("user_id", id).maybeSingle()  → { data }
// from("user_settings").insert(row)                                   → { error: null }
// from("user_settings").update(row).eq("user_id", id)                → { error: null }
function fakeSupabase(initial: Record<string, unknown> | null) {
  let row = initial;
  const api = {
    from() { return api; },
    select() { return api; },
    eq() { return api; },
    maybeSingle() { return Promise.resolve({ data: row }); },
    insert(r: Record<string, unknown>) { row = { ...r }; return Promise.resolve({ error: null }); },
    update(r: Record<string, unknown>) { row = { ...(row ?? {}), ...r }; return { eq: () => Promise.resolve({ error: null }) }; },
    _row: () => row,
  };
  return api;
}

const NOW = new Date("2026-07-20T12:00:00Z");

describe("checkEntitlement — chat_message (hourly bucket)", () => {
  it("allows a call when under the hourly limit and increments the counter", async () => {
    const sb = fakeSupabase({ chat_calls_count: 0, chat_calls_window_start: NOW.toISOString() });
    const res = await checkEntitlement(sb as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(true);
    expect((sb as never as { _row: () => Record<string, number> })._row().chat_calls_count).toBe(1);
  });

  it("blocks a call once the hourly limit is reached", async () => {
    const sb = fakeSupabase({ chat_calls_count: LIMITS.chat_message.max, chat_calls_window_start: NOW.toISOString() });
    const res = await checkEntitlement(sb as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/lib/ai/__tests__/entitlement.test.ts`
Expected: FAIL — `Cannot find module '../entitlement'`.

- [ ] **Step 3: Implementare il seam (minimo per far passare)**

Create `app/src/lib/ai/entitlement.ts`:

```typescript
// app/src/lib/ai/entitlement.ts
// Single entitlement seam for the "strong AI analysis" feature. Three INDEPENDENT rate-limit
// buckets (quick analysis, chat, extraction) behind ONE function, generalizing the pattern of
// rate-limit.ts. V2 (crediti) will swap the body to consult a credit balance — same signature,
// callers (routes) never change. Spec §8.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type EntitlementAction = "quick_analysis" | "chat_message" | "extraction";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Starting values (spec §8) — easily configurable. countCol/windowCol map each bucket to its
// user_settings columns; quick_analysis reuses the existing ai_calls_* columns unchanged.
export const LIMITS: Record<EntitlementAction, { max: number; windowMs: number; countCol: string; windowCol: string }> = {
  quick_analysis: { max: 10, windowMs: HOUR, countCol: "ai_calls_count",     windowCol: "ai_calls_window_start" },
  chat_message:   { max: 30, windowMs: HOUR, countCol: "chat_calls_count",   windowCol: "chat_calls_window_start" },
  extraction:     { max: 15, windowMs: DAY,  countCol: "extraction_count",   windowCol: "extraction_window_start" },
};

export async function checkEntitlement(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: EntitlementAction,
  now: Date = new Date(),
): Promise<{ allowed: boolean }> {
  const { max, windowMs, countCol, windowCol } = LIMITS[action];
  const { data } = await supabase
    .from("user_settings")
    .select(`${countCol}, ${windowCol}`)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    const { error } = await supabase.from("user_settings").insert({
      user_id: userId, [countCol]: 1, [windowCol]: now.toISOString(),
    } as never);
    return { allowed: !error };
  }

  const row = data as Record<string, unknown>;
  const count = typeof row[countCol] === "number" ? (row[countCol] as number) : 0;
  const windowStart = typeof row[windowCol] === "string" ? Date.parse(row[windowCol] as string) : 0;
  const expired = now.getTime() - windowStart >= windowMs;

  if (!expired && count >= max) return { allowed: false };

  const { error } = await supabase
    .from("user_settings")
    .update((expired
      ? { [countCol]: 1, [windowCol]: now.toISOString() }
      : { [countCol]: count + 1 }) as never)
    .eq("user_id", userId);
  return { allowed: !error };
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/lib/ai/__tests__/entitlement.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Aggiungere test per il reset della finestra e per il secchiello giornaliero**

Append to `app/src/lib/ai/__tests__/entitlement.test.ts`:

```typescript
describe("checkEntitlement — window reset & daily bucket", () => {
  it("resets the counter to 1 when the hourly window has expired", async () => {
    const old = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const sb = fakeSupabase({ chat_calls_count: LIMITS.chat_message.max, chat_calls_window_start: old });
    const res = await checkEntitlement(sb as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(true);
    expect((sb as never as { _row: () => Record<string, number> })._row().chat_calls_count).toBe(1);
  });

  it("extraction uses a 24h window, not 1h (still blocked after 2h at the cap)", async () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const sb = fakeSupabase({ extraction_count: LIMITS.extraction.max, extraction_window_start: twoHoursAgo });
    const res = await checkEntitlement(sb as never, "u1", "extraction", NOW);
    expect(res.allowed).toBe(false); // 2h < 24h → window NOT expired → still capped
  });

  it("creates the settings row on first use when none exists", async () => {
    const sb = fakeSupabase(null);
    const res = await checkEntitlement(sb as never, "u1", "chat_message", NOW);
    expect(res.allowed).toBe(true);
    expect((sb as never as { _row: () => Record<string, number> })._row().chat_calls_count).toBe(1);
  });
});
```

- [ ] **Step 6: Eseguire tutti i test entitlement**

Run: `cd app && npx vitest run src/lib/ai/__tests__/entitlement.test.ts`
Expected: PASS (5 test).

- [ ] **Step 7: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 8: Commit**

```bash
git add app/src/lib/ai/entitlement.ts app/src/lib/ai/__tests__/entitlement.test.ts
git commit -m "feat(ai): checkEntitlement seam — three independent rate-limit buckets (credits-ready)"
```

---

## Self-Review (Piano 1)

- **Copertura spec:** §7 modello dati per-documento → Task 1 (`grant_documents`, unique
  `(grant_id, attachment_url)`, status). Persistenza chat §5 → Task 1 (`chat_messages`, owner RLS).
  §8 tre secchielli + seam entitlement → Task 3. Disaccoppiamento scraper §7 → nessuna scrittura
  scraper su `grant_documents` (documentato nella migration). Coperto.
- **Placeholder:** nessun TBD/TODO; tutto il codice (SQL, TS, test) è completo.
- **Consistenza tipi:** `EntitlementAction`, `LIMITS`, `checkEntitlement(supabase, userId, action,
  now?)` usati identici tra `entitlement.ts` e il suo test. Le colonne SQL del Task 1
  (`chat_calls_count`, `extraction_count`, …) combaciano con `LIMITS[*].countCol/windowCol`.
- **Fuori scope (corretto):** l'estrazione, l'OCR, le route e la UI sono nei piani 2–6.
