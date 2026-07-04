# BANDI-SCANNER v2 — Stato del progetto e handoff

> **Snapshot:** `main` @ `f5949b6` · 7 branch su 16 mergiati (PR #5–#11) · app **156/156** test verdi · scraper **33/33** test verdi (offline)
> **Data:** 2026-07-04 · **Fine Fase 2 (feature core) + inizio Fase 3 (scraping).**
> **Prossimo branch:** `feat/008-ai-adapters` (dipende da 007, già in `main`).

Questo file è il punto di ripartenza per una nuova sessione. Leggilo per intero, poi segui la sezione **"Come procedere nella prossima sessione"**.

---

## 0. Fonti di verità (leggi in quest'ordine)

1. **`bandi-scanner-v2-definitive.html`** — la soluzione: cosa deve fare l'app, i 16 campi, il matching, le 4 pagine, lo stack. **Single source of truth per il COSA.**
2. **`bandi-scanner-v2-roadmap.html`** — i 16 branch (`#b001`…`#b015`): per ognuno "Cosa e perché", file da creare, test, criteri di accettazione, dipendenze, invarianti I1–I10, ADR. **Single source of truth per il COME/quando.**
3. `docs/adr/00xx-*.md` — le decisioni architetturali già prese (ADR-001…ADR-007).
4. `docs/superpowers/plans/*.md` — i piani di implementazione dettagliati dei branch già fatti (utili come riferimento di stile).
5. `.superpowers/sdd/progress.md` — ledger di avanzamento dell'ULTIMO branch lavorato (è scratch git-ignored, viene sovrascritto a ogni branch).

> ⚠️ **Discrepanza di stack risolta:** il vecchio `.claude/CLAUDE.md` dice "Stack target: Cloudflare Workers + Pages". Il **doc definitivo §6 dice Next.js su Vercel + Supabase**, ed è quello che abbiamo seguito (l'utente ha stabilito che definitive/roadmap HTML sono la fonte di verità). **Abbiamo costruito Next.js 16 + Supabase, NON Cloudflare.** Continua così.

---

## 1. Il processo (com'è stato fatto — replicalo identico)

Ogni branch segue questo ciclo, usando le **Superpowers skills** in `.agents/skills/` (identiche a quelle in `.claude/skills/`):

1. **`writing-plans`** → scrivi un piano dettagliato in `docs/superpowers/plans/YYYY-MM-DD-<nome>-<NNN>.md` (task bite-sized, codice completo, test con valori attesi esatti, self-review contro la spec). Committa il piano.
2. **`subagent-driven-development`** → esegui task-per-task:
   - crea il **ledger** `.superpowers/sdd/progress.md`;
   - per ogni task: `scripts/task-brief PLAN N` → dispatch **implementer** (subagent `general-purpose`) in **TDD** con il brief + interfacce + report path;
   - a implementer DONE: `scripts/review-package BASE HEAD` → dispatch **task reviewer** (subagent) con due verdetti (spec compliance + code quality);
   - findings **Critical/Important** → dispatch **fix subagent** → **re-review**; **Minor** → registra nel ledger per il review finale;
   - marca il task completo nel ledger, passa al successivo **senza fermarti**.
3. **Review whole-branch finale su Opus** (`requesting-code-review/code-reviewer.md`) col package `merge-base main HEAD` → un **unico** fix subagent con l'intera lista dei findings → re-review.
4. **`finishing-a-development-branch`** → verifica finale (test + tsc + build) → **push** `-u origin` → **PR** → **merge in `main`** (merge-as-you-go) → sync `main` locale → prossimo branch.

**Modelli (regola di costo):** implementer/reviewer su **sonnet** (floor affidabile); **whole-branch review finale su opus** (sempre); task di sola trascrizione potrebbero usare haiku ma qui si è usato sonnet per sicurezza. **Sempre specificare il modello nel dispatch.**

**Script helper** (in `.agents/skills/subagent-driven-development/scripts/`): `task-brief`, `review-package`, `sdd-workspace`. Gli artefatti (brief, report, diff) passano come **file**, non incollati nel contesto.

**Regole ferree:**
- Commit trailer (sempre, due righe): `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01FgqJCdCzFAsEQDUDZGnEWE`.
- PR body termina con `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- `git config user.email` = `noreply@anthropic.com`, `user.name` = `Claude`.
- **Mai** committare `.env.local`, `SUPABASE_SERVICE_ROLE_KEY`, o `node_modules`. Solo `NEXT_PUBLIC_*` sono esposti al browser.
- **Mai** mettere l'identificativo modello (`claude-opus-4-8`) in commit/PR/codice.
- Codice/commenti in **inglese**, UI/prompt in **italiano**.
- **`cd app`** per i comandi Next; **`cd scraper`** per lo scraper. **Nessun import** tra `app/` e `scraper/`.

**Attenzione operativa:** il **limite di sessione** ha colpito due volte i subagent (branch 005 Task 6, branch 007 Task 6) — entrambe le volte il subagent aveva **committato prima di morire**; ho verificato lo stato io (git log + run test) e proseguito, invece di ri-eseguire. Task banali (seed, doc, verifica) si possono fare **inline** dal controller per non sprecare dispatch.

---

## 2. Cosa è stato fatto (branch 001–007, tutti in `main`)

| Branch | PR | Cosa | Test |
|---|---|---|---|
| **002** matching-engine | #5 | Motore di scoring: 6 dimensioni = 100 (temi 28, forma legale 22, territorio 18, capacità 14, documenti 12, track record 6), bonus/indicatori, verdetti, invarianti I1–I10. `app/src/lib/matching/` | ~72 |
| **001** supabase-schema | #6 | 6 tabelle Postgres + RLS + 7 enum + 71 erogatori + 12 fonti (enabled=false). `app/supabase/migrations/0001..0004`. Tipi generati `database.types.ts` | — |
| **003** auth-flow | #7 | Supabase Auth (login/signup/logout/delete account), `@supabase/ssr`, **`proxy.ts`** (Next 16, ex middleware), route group `(auth)`/`(app)` | 83 |
| **004** profile-crud | #8 | Profilo 8 sezioni (~40 campi) + onboarding 3 step + % completamento + mapping `profiles`↔`EntityProfile`. `app/src/lib/profile/`, `app/src/components/profile/`, `app/(app)/{onboarding,profilo}` | ~125 |
| **005** grant-display | #9 | Card bando + dettaglio §5.3 (breakdown, indicatori, checklist) + seed dev 17 bandi + ADR-006. `app/src/lib/grants/{mapping,queries,match-list}`, `app/src/components/grants/`, `app/(app)/bandi/[id]`, `app/supabase/seed-dev/grants.sql` | ~138 |
| **006** dashboard | #10 | Dashboard `/` (bandi aperti per score + contatori) + Nuovi bandi (7 giorni) + filtri/sort in URL. `app/src/lib/grants/filters.ts`, `filter-bar.tsx`, `empty-state.tsx` | 156 |
| **007** scraper-infra | #11 | Package `scraper/` indipendente: seam `LLMProvider`/`PageFetcher`/`GrantsDb`, pipeline 5 stadi (fetch→extract→enrich→dedup→save) + `runPipeline`, fake, vocab copiato, ADR-002. **Offline** | 33 |

**Struttura chiave attuale:**
```
app/src/
  lib/matching/     (002) — calculateMatch, dimensions, constants (LEGAL_TYPES 62, TAGS 47), types
  lib/supabase/     (001/003) — client/server/admin/proxy-session, database.types.ts
  lib/profile/      (004) — schema (zod + rowToEntityProfile), completion, actions, constants
  lib/grants/       (005/006) — mapping, queries, match-list, filters
  components/profile/ components/grants/
  app/(auth)/{login,signup}  app/(app)/{page(dashboard),nuovi-bandi,bandi/[id],onboarding,profilo}
  proxy.ts
scraper/src/
  providers/{types(LLMProvider seam),fake}
  pipeline/{types,vocab,extract-grants,enrich,dedup,save,run}
  tests/  (offline, 33 test)
docs/adr/0001..0007  docs/superpowers/plans/*
```

---

## 3. Decisioni prese FUORI dalla roadmap (o che la interpretano)

Queste sono deviazioni consapevoli e documentate — tienile presenti:

1. **Stack Next.js, non Cloudflare** (vedi §0): seguito il doc definitivo, non il vecchio CLAUDE.md.
2. **Next.js 16 breaking changes** adattati: `middleware.ts`→**`proxy.ts`**; `cookies()` **async**; `searchParams`/`params` sono **Promise** (da `await`); un modulo `"use server"` esporta **solo funzioni async**.
3. **Branch 004:** aggiunto il selettore **`kind`** (tipo fondo) nello storico progetti — era omesso dal piano, ma completa un input che il matching consuma. Deciso di aggiungerlo (la domanda interattiva all'utente era fallita per errore tool). *Se non lo volevi, è un `<select>` isolato e rimovibile.*
4. **Branch 005:** aggiunta una lista `/bandi` minimale + link nav come **scaffold** (non nella roadmap) per ospitare la card prima della Dashboard.
5. **Branch 006:** **ritirato** lo scaffold `/bandi` + il suo link nav (la Dashboard reale su `/` lo supersede), riallineando al **modello a 4 pagine §5.1** (Dashboard, Nuovi bandi, I miei bandi, Il mio profilo). Il dettaglio `/bandi/[id]` resta.
6. **Branch 007:** l'interfaccia `PageFetcher` è in `pipeline/types.ts` (non un file `fetch-page.ts` separato come da roadmap); `GrantsDb` è una **seam iniettata** con adapter Supabase reale **rinviato a 009**; il **vocabolario è duplicato** in `scraper/src/pipeline/vocab.ts` (regola del contesto separato, ADR-002) — verificato **byte-identico** all'app.
7. **Merge-as-you-go:** ogni branch → PR → merge in `main` subito (scelta dell'utente), non accumulo di branch.

---

## 4. Gap noti e carry-forward (da affrontare nei branch giusti)

- **Branch 006 → futuro:**
  - `FilterBar` ha input numerici **uncontrolled** (`defaultValue`) + `router.push` a ogni tasto → renderli **controllati + debounce**;
  - `parseFilters` **non valida** `verdetto`/`geo` contro le union (degrada innocuo, ma un token invalido sopravvive alla ri-serializzazione);
  - il contatore **"Totale"** conta l'insieme aperto, non la lista filtrata → rietichettare "Totale aperti".
- **Branch 007 → 008/009:**
  - **nessun guard automatico** contro il **drift del vocabolario** app↔scraper (sync manuale per ADR-002) → valutare uno step CI `diff` (o un test che confronta le due liste);
  - l'**adapter Supabase `GrantsDb`** (009) deve fare **coalesce `null → ""`** dei campi testo (`summary`/`requirements`/`beneficiaries`) e **default `providerKind`** mappando `ExtractedGrant` → `Grant` (i tipi dell'app li vogliono non-null).
- **Generale:** il seed bandi ha scadenze **relative a "oggi" 2026-07-04** → col tempo i colori scadenza derivano (inerente a una fixture dev). I bandi reali arriveranno con lo scraping (009).
- **CI:** non risultano check GitHub configurati (le PR mergiano senza CI). Le verifiche sono locali (vitest/tsc/next build).

---

## 5. Cosa manca (branch 008–015)

| Branch | Cosa | Dip. | Size |
|---|---|---|---|
| **008** `feat/008-ai-adapters` | Adapter reali dietro `LLMProvider`: **Gemini** (default, free) + Anthropic + Groq + OpenAI + `index.ts` che legge `AI_PROVIDER`. Ancora testabili con risposte registrate | 007 | M |
| **009** `feat/009-sources-cron` | Config delle **12 fonti** + **Vercel Cron** + **Browserless** (il `PageFetcher` reale) + l'adapter **Supabase `GrantsDb`** service_role. Attiva le `grant_sources` (enabled=true) | 008 | M |
| **010** `feat/010-saved-grants` | Pagina **"I miei bandi"**: pipeline personale a 4 stati; spostare su "Esito: Finanziato" **auto-popola il track record** (§7 profilo). Attiva il bottone "Salva" del dettaglio | 005 | M |
| **011** `feat/011-ai-analysis` | **Analisi AI on-demand** sul dettaglio + **segnala URL** (crowdsourcing §4.4). Attiva il bottone "Analisi AI" | 005, 008 | M |
| **012** `feat/012-email-alerts` | **Digest settimanale** via Resend (bandi sopra soglia score, default 50; riusa `buildMatchedGrants`) | 006 | M |
| **013** `feat/013-storico-matching` | Match a **due livelli** + **badge storico** (Già finanziato / Già candidato / Conosce l'erogatore) — riempie lo slot nella `grant-card` | 002, 005, 010 | M |
| **014** `feat/014-economic-coherence` | **Indicatore coerenza economica** (importo colorato) — riempie l'altro slot nella `grant-card` | 002, 005 | S |
| **015** `feat/015-pwa-mobile` | **PWA** + rifinitura mobile (ADR-006 desktop-first già posato) | 006 | S |

Le spec complete sono nella roadmap: `#b008`…`#b015` (leggi il blocco `<div class="branch" id="bNNN">`).

---

## 6. Come procedere nella prossima sessione

**Passo 0 — orientati (5 min):**
```bash
cd /home/user/Bandi
git checkout main && git pull origin main        # deve stare a f5949b6 o oltre
git log --oneline --merges -8                     # conferma PR #5–#11
cd app && npx vitest run | tail -3                # atteso 156/156
cd ../scraper && npm test | tail -3               # atteso 33/33
```
Leggi: questo file, poi il blocco `#b008` in `bandi-scanner-v2-roadmap.html`, poi §4.3 del doc definitivo (seam AI). Guarda `scraper/src/providers/{types,fake}.ts` per la seam già pronta.

**Passo 1 — branch 008 (`feat/008-ai-adapters`), stesso processo del §1:**
```bash
git checkout -b feat/008-ai-adapters
# usa writing-plans → piano in docs/superpowers/plans/<data>-ai-adapters-008.md
```
Punti chiave del 008 (dalla roadmap + coerenza col 007):
- 4 adapter che implementano `LLMProvider` (`extract({html,schema,instructions}) → Promise<unknown>`), errori come `ProviderError` (retryable). Vivono in `scraper/src/providers/{gemini,anthropic,groq,openai}.ts`.
- `scraper/src/providers/index.ts` legge `process.env.AI_PROVIDER` → restituisce l'adapter (default gemini).
- **Testabilità:** ogni adapter dev'essere testato **senza rete** — inietta un HTTP client / usa risposte registrate (fixture di chiamate), come il fake del 007. Nessuna chiave API nei test.
- Rispetta la seam minima (ADR-002): niente metodi extra.
- Ricorda il carry-forward: valuta il **guard anti-drift vocabolario** e prepara il terreno per l'adapter `GrantsDb` (che però è del 009).

**Passo 2 — chiudi il branch:** review whole-branch su Opus → fix → verifica (`cd scraper && npm test && npm run typecheck`) → push → PR → merge → sync → branch 009.

**Nota utente:** l'utente ha detto ripetutamente e con enfasi di **usare sempre le skill e i subagent** delle Superpowers (`.agents/skills/`). Non saltare i passaggi di review. Merge-as-you-go.

---

## 7. Riferimenti rapidi

- Skills: `.agents/skills/` (= `.claude/skills/`). Le principali: `writing-plans`, `subagent-driven-development`, `requesting-code-review`, `finishing-a-development-branch`, `test-driven-development`.
- Piani già fatti (riferimento di stile): `docs/superpowers/plans/`.
- ADR: `docs/adr/0001..0007`.
- Progetto Supabase reale: applicato via MCP tools (`apply_migration`/`execute_sql`) — le migration in `app/supabase/migrations/` sono la fonte di verità in git.
- Seed dev bandi: `app/supabase/seed-dev/grants.sql` (dev-only, si applica via MCP `execute_sql`, non è una migration).
