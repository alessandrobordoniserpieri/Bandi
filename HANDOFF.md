# BANDI-SCANNER — Handoff Document (2026-07-10)

## Cos'è il progetto

Piattaforma web italiana per il matching tra bandi pubblici/privati e profili di enti (associazioni, cooperative, fondazioni, ETS). Un utente registra il proprio ente con ~40 campi, e il sistema calcola automaticamente la compatibilità (0-100) con ogni bando disponibile.

## Stack attuale (in produzione)

| Componente | Tecnologia |
|---|---|
| Frontend | Next.js 16 (React 19, Turbopack) |
| Hosting | Vercel (piano Hobby, root dir = `app/`) |
| Database | Supabase (Postgres + Auth + RLS), regione EU |
| Scraper | Pacchetto npm locale `bandi-scraper` (workspace monorepo) |
| LLM scraping | Gemini 2.5 Flash (default), con adapter per Anthropic/OpenAI |
| Page rendering | Browserless.io (headless Chrome) |
| Email | Resend (digest settimanale) |

## Struttura del monorepo

```
Bandi/
├── app/                    # Next.js web app
│   ├── src/app/            # App Router pages + API routes
│   ├── src/lib/            # Core libraries (matching, grants, ai, alerts)
│   ├── src/components/     # React components
│   ├── supabase/migrations/ # DB migrations (0001-0009)
│   └── vercel.json         # Cron jobs config
├── scraper/                # bandi-scraper package
│   ├── src/pipeline/       # extract → detail → dedup → save
│   ├── src/db/             # Supabase adapter
│   └── tests/
├── .claude/                # Claude Code config + skills
├── .agents/                # Superpowers plugin (skills, hooks)
└── docs/                   # ADR, plans, stato progetto
```

## Feature implementate (PRs mergiati su main)

| # | Branch | Cosa fa |
|---|---|---|
| #5 | matching-v2 | Matching engine 6 dimensioni, 100pt, 5 verdetti |
| #6-#8 | supabase-schema, auth, profile | DB 6 tabelle + RLS, auth, profilo ~40 campi |
| #9-#12 | scraper, dashboard, cron | Scraper pipeline, grant display, cron scheduling |
| #13-#16 | saved-grants, PWA, email | Kanban 4 stati, PWA, digest settimanale |
| #17-#20 | AI analysis, monorepo | Analisi AI on-demand, fix Vercel monorepo |
| #21-#24 | PR fixes | 429 handling, impeccable skill install |
| #25-#28 | UX redesign | OKLCH design system, a11y, score-bar, density toggle |
| #29 | vercel.json fix | Cron jobs registrati correttamente |
| #30 | API middleware fix | `/api/*` bypassa session redirect |
| #31 | Gemini schema fix | `nullable: true` al posto di `type: ["string","null"]` |
| #32 | **Scraper V2** | Detail enrichment, edition-aware dedup, 10 nuovi campi |
| direct push | maxDuration fix | `maxDuration: 600 → 300` per piano Hobby Vercel |

## Ultimo lavoro: Scraper V2 (PR #32, questa sessione)

### Cosa è cambiato

- **Pipeline a due fasi**: listing extraction → detail page enrichment con 7s tra chiamate Gemini
- **Dedup edition-aware**: bandi scaduti con nuova deadline = nuovo record; stessa deadline = skip
- **10 nuovi campi grant**: `opening_date`, `funding_type`, `min_amount`, `max_amount`, `cofunding_percentage`, `eligible_expenses`, `application_method`, `contact_info`, `detail_fetched_at`, `detail_fetch_attempts`
- **Tabella `scrape_logs`** per observability
- **Funzione `expire_grants()`** per pg_cron auto-expiration
- **Bug fix cofunding**: separati `cofundingRequired` (€) e `cofundingPercentage` (%) in indicatori e bonus
- **Pagina dettaglio bando**: nuove sezioni (dettagli economici, spese ammissibili, modalità presentazione, contatti, data apertura)
- **Cron**: schedule giornaliero, `maxDuration: 300` (limite Hobby Vercel)

### Migrazioni DB applicate

- `0008_scraper_v2_enum.sql` — aggiunge `'scaduto'` a `grant_status` enum
- `0009_scraper_v2_schema.sql` — 10 colonne + partial unique index + `scrape_logs` + `expire_grants()` + disabilita tutte le source tranne Fondazione Cariplo

### File principali toccati (42 file, +2185 righe)

**Scraper (nuovi):** `extract-detail.ts`, `throttle.ts`
**Scraper (modificati):** `vocab.ts`, `types.ts`, `extract-grants.ts`, `dedup.ts`, `save.ts`, `run.ts`, `supabase-grants-db.ts`, `run-production.ts`, `index.ts`
**App (modificati):** `matching/types.ts`, `matching/helpers.ts`, `matching/indicators.ts`, `matching/bonuses.ts`, `grants/mapping.ts`, `ai/analyze-grant.ts`, `cron/scrape/route.ts`, `bandi/[id]/page.tsx`, `vercel.json`

### Problemi risolti in questa sessione

1. **Vercel preview deploy failed** — il vecchio branch (`378be7f`) aveva solo un commit di setup su codice antico. Fix: codice V2 completato e mergiato.
2. **`maxDuration: 600` invalido** — piano Hobby Vercel accetta max 300s. Fix: abbassato a 300.
3. **Enum PostgreSQL in stessa transazione** — `ALTER TYPE ADD VALUE` e `CREATE INDEX ... WHERE status != 'scaduto'` non possono stare nella stessa migration. Fix: split in due file (0008 + 0009).

## Stato dei test (fresco, 2026-07-10)

- Scraper: **88/88 test passano** (14 file)
- App: **256/256 test passano** (43 file)
- Build produzione: **pulito** (exit 0)

## Stato Vercel

Il commit `d1f89f3` (fix maxDuration) è l'ultimo su `origin/main`. Vercel dovrebbe effettuare il deploy automatico. Se non lo vedi nel dashboard, forza un redeploy manuale.

## Cosa manca / prossimi passi

1. **Verificare il deploy Vercel** — confermare che il build passa con `maxDuration: 300`
2. **Abilitare source gradualmente** — al momento solo Fondazione Cariplo è attiva nel DB. Abilitare le altre fonte una alla volta dopo aver verificato che la prima funziona.
3. **pg_cron per auto-expiration** — la funzione `expire_grants()` esiste, ma il job pg_cron va schedulato manualmente in Supabase (`SELECT cron.schedule('expire-grants', '0 2 * * *', 'SELECT expire_grants()')`)
4. **Rigenerare i tipi Supabase** — `mapping.ts` usa `as Record<string, unknown>` cast perché i generated types non includono ancora le colonne V2
5. **Considerare upgrade a Vercel Pro** — 300s potrebbe non bastare per 12+ fonti con detail enrichment; con Pro si arriva a 900s

## Design documents (ancora validi)

- `bandi-scanner-v2-definitive.html` — tutte le 30 decisioni di design
- `bandi-scanner-v2-roadmap.html` — specifica funzionale, 15 branch, criteri di accettazione

## Supabase project

- **Project ID:** `gptsklxbkuhdfkksmqhz`
- **Regione:** EU
- **Migrazioni applicate:** 0001-0009

## Skill Superpowers da usare

Workflow per ogni branch:
```
1. /writing-plans                  → piano dettagliato
2. /subagent-driven-development    → esecuzione con sub-agent
   ↳ /test-driven-development     → test first
   ↳ /systematic-debugging        → se qualcosa fallisce
   ↳ /verification-before-completion → prima di chiudere
3. /requesting-code-review         → review
4. /finishing-a-development-branch → commit, push, PR, merge
```

## File rinominati in questa sessione

| Vecchio nome | Nuovo nome | Motivo |
|---|---|---|
| `CHANGELOG.txt` | `old-CHANGELOG-beta.txt` | Changelog della beta monolitica, obsoleto |
| `README-beta.txt` | `old-README-beta-node.txt` | README della beta con Node.js, obsoleto |
| `LEGGIMI - BANDI-SCANNER Beta.txt` | `old-launcher-script-macos.txt` | Era uno script shell macOS, non un readme |
| `README-node.xml` | `old-Info-plist-macos.xml` | Era un Info.plist Apple, non un README |
| `grant-radar-matching.html` | `old-grant-radar-monolith.html` | App monolitica 225KB, sostituita dall'app Next.js |
| `bandi-scanner-design-doc.html` | `old-design-doc-v1.html` | Design doc v1, sostituito da v2-definitive |
| `PROMPT-NUOVA-SESSIONE.md` | `old-PROMPT-NUOVA-SESSIONE.md` | Prompt iniziale vecchio, sostituito da questo HANDOFF |
