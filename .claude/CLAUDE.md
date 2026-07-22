# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Italian platform matching public/private grants (bandi) to third-sector entity profiles (associations, cooperatives, foundations, ETS). Calculates compatibility scores (0-100) across 6 dimensions. Monorepo with two workspaces: a Next.js web app and a scraper package.

## Commands

```bash
# Install (from repo root)
npm install

# App (Next.js 16)
cd app && npm run dev          # dev server
cd app && npm run build        # production build
cd app && npm test             # run all app tests (vitest)
cd app && npx vitest run src/lib/matching  # run tests in a directory

# Scraper
cd scraper && npm test         # run all scraper tests (vitest)
cd scraper && npx vitest run tests/extract-grants.test.ts  # single test file
cd scraper && npm run typecheck  # tsc --noEmit
cd scraper && npm run scrape -- --source="Regione Emilia-Romagna - Bandi Sociale (API)"  # manual run — name must match grant_sources.name exactly (and be enabled), or the run silently does nothing
cd scraper && npm run scrape -- --dry-run  # extract without writing to DB
```

## Architecture

### Monorepo layout

- `app/` — Next.js 16 (React 19) web app, deployed to Vercel (Hobby plan, `maxDuration: 300`). Root dir for Vercel = `app/`.
- `scraper/` — `bandi-scraper` npm package consumed by the app via workspace dependency. No separate deployment; runs inside the app's API routes.
- Root `package.json` — workspace config only (`"workspaces": ["app", "scraper"]`).

### Scraper pipeline (`scraper/src/pipeline/`)

Two-phase pipeline. Scheduling is by Supabase `pg_cron` + `pg_net` every 6 min (migration 0011), which POSTs the existing Vercel endpoint (`/api/cron/scrape`); execution stays on Vercel (Node, 300s). A daily Vercel cron in `vercel.json` remains as a backstop.

1. **Listing phase**: `fetchPages` (Browserless) → `archetype.sanitize` → `extractGrants` (archetype-parameterized, Gemini structured JSON) → `enrich` → `saveGrant` (dedup by URL)
2. **Detail phase**: for grants with `detail_fetched_at` null or stale (>7d), fetch individual pages → `extractDetail` → `markDetailFetched`.

**Archetypes** (`archetypes.ts`): extraction strategy per site-family, selected by `scrape_config.archetype` (default `full`). An archetype overrides only what varies — `sanitize`, `chunkSize`/`overlap`, `boundaryTags`, `urlSnapping`, listing schema/instructions — while the nucleus (`coerce`, vocabulary validation, `snapToHref`, `mergeGrants`, `parseItalianAmount`) is shared. `full` (A) = full listing, optional detail; `listing-light` (B) = title/url/deadline only, detail essential. Add new archetypes to the registry, never by forking the orchestrator.

**Throttle**: a single provider-level gate (`throttleProvider`, `LLM_THROTTLE_MS` default 5s) spaces ALL LLM calls (listing chunks + detail), not just the detail phase.

**Time budget** (`budget.ts`): a conservative wall-clock budget (`SCRAPE_BUDGET_MS` default 270s) enforced in `runPipeline` — never start a source, a chunk within a listing extraction, or a detail call unless one worst-case LLM call still fits, so a call can't straddle Vercel's 300s kill. Worst case (`LLM_CALL_WORST_CASE_MS`, default 120s) is derived from the real retry math: 35s per-call timeout × 3 retries + backoff + one throttle wait. Skipped work is picked up next run; a truncation is logged.

**Source ordering** (`loadEnabledSources`): priority-first (`priority` enum high→medium→low, default medium), `last_run_at` ascending (nulls first) as the in-band tiebreaker — a self-balancing round-robin so budget-skipped sources rise to the top next run.

Key seams (interfaces in `types.ts`): `PageFetcher`, `LLMProvider`, `GrantsDb` — all dependency-injected, with in-memory fakes for tests.

### LLM providers (`scraper/src/providers/`)

Pluggable via `AI_PROVIDER` env var. Gemini is the production default. Adapters: `gemini.ts`, `anthropic.ts`, `openai.ts`, `groq.ts`, `openai-compat.ts`. All implement `LLMProvider.extract()`. Gemini uses `response_schema` (OpenAPI-3.0 subset) — nullable fields must use `nullable: true`, never `type: ["string", "null"]`.

### Matching engine (`app/src/lib/matching/`)

6-dimension scoring: themes, legal-form, territory, capacity, documents, track-record. Each dimension has its own file in `dimensions/`. Bonuses and indicators modify the raw score. Final verdict (`verdict.ts`): `Storico` if the grant is closed; else by score against `VERDICT_THRESHOLDS` (`constants.ts`) — `Candidabile`/`Da preparare` (split by whether all required documents are ready) above the top threshold, then `Da valutare`, `Bassa priorità`, `Non compatibile` descending.

### AI analysis (analisi AI forte — `app/src/lib/ai/`)

Three layers, built incrementally as V1 / V2-A / V2-B; all share the same `checkEntitlement()` seam (see below) and the same LLM provider (`getProvider`, same providers as the scraper).

- **V1 — quick analysis + strong analysis + per-grant chat**: `/api/ai/analyze` always returns a quick analysis, and silently upgrades to a richer one when the grant's `grant_documents` (attached PDFs) are ready — no separate "strong" endpoint. PDF text comes from `pdf-text-extractor.ts`, falling back to OCR (`ocr-provider.ts`, OCR.space) for scanned PDFs; extraction runs as a background worker (`/api/cron/extract-documents`, RPC-based claim with `FOR UPDATE SKIP LOCKED`, off by default until the Vault secrets `extract_endpoint_url`/`extract_cron_secret` are set). Combined document text is capped at `MAX_DOCUMENT_TEXT_CHARS` (1M chars) with a truncation warning surfaced to the LLM. Per-grant advisory chat lives at `/api/ai/strong/chat` (`chat.ts`, history in `chat_messages`, scoped by grant+user).
- **V2-A — cross-bando chat**: `/api/ai/strong/cross-chat` (`cross-chat.ts`) answers questions across the user's **saved_grants** (the "working set"), via pgvector retrieval over `grant_document_chunks` (`match_grant_chunks` RPC, `<=>` cosine distance, `hnsw` index). Chunks are produced by `chunk-text.ts` and embedded by a background worker (`/api/cron/embed-documents`) using `gemini-embedding-001` (`:embedContent`, `outputDimensionality: 768` — NOT `text-embedding-004`, which 404s on this project). UI at `/assistente`.
- **V2-B — credits**: chat messages (`chat_message` action, both per-grant and cross-bando) are metered by a monthly credit balance instead of an hourly rate limit — `credits.ts` (`user_credits`: `free_balance` + `paid_balance` two-pool model, `free_balance` lazily reset per calendar month, never accumulates; `paid_balance` only changes via manual top-up, never resets; spend order is free-then-paid). `quick_analysis` and `extraction` remain hourly/daily rate limits. `GET /api/ai/credits` returns the caller's balance for the UI badge in both chat panels.

**Entitlement seam** (`entitlement.ts`): `checkEntitlement(supabase, userId, action, now?)` is the single seam every AI-consuming route calls before spending a unit — it dispatches internally to either the rate-limit table columns (`quick_analysis`, `extraction`) or `credits.ts` (`chat_message`), so routes never know which mechanism is behind an action.

**Security note**: writes to `user_credits`/`credit_transactions` must go through the service-role/admin client — the user's own RLS grant is SELECT-only by design (financial-safety pattern). `grant_paid_credits()` is `SECURITY DEFINER`; its EXECUTE grant is explicitly revoked from `public`/`authenticated`/`anon` (migration `0018`) since Postgres grants EXECUTE to PUBLIC by default. **Every `SECURITY DEFINER` function needs this revoke** — a 2026-07-22 review found 4 more (`claim_pending_document`, `trigger_extract_documents`, `claim_document_for_embedding`, `trigger_embed_documents`) that were missing it since creation (migrations 0015/0016), fixed in migration `0020`. When adding a new `SECURITY DEFINER` function, revoke EXECUTE from `public`/`authenticated`/`anon` in the same migration that creates it — don't rely on a later audit to catch it.

### Supabase

- **Project ID**: `gptsklxbkuhdfkksmqhz` (EU region)
- **Migrations**: `app/supabase/migrations/` (0001-0021)
- **Key tables**: `grants`, `grant_sources`, `grant_providers`, `profiles`, `user_settings`, `saved_grants`, `scrape_logs`, `scrape_debug`, `grant_documents`, `chat_messages`, `grant_document_chunks`, `cross_chat_messages`, `user_credits`, `credit_transactions`
- **RLS**: enabled on all user-facing tables; `user_credits`/`credit_transactions` are SELECT-only for the owner, writes via admin client only
- **pg_cron**: `expire_grants()` runs daily to mark past-deadline grants as `scaduto`; `cleanup-scrape-debug` purges debug HTML older than 3 days; scrape scheduling every 6 min (migration 0011, see below)

### Cron routes (`app/src/app/api/cron/`)

Protected by `CRON_SECRET` header. All routes use `Cache-Control: no-store` to prevent Vercel caching.
- `/api/cron/scrape` — grant scraping, triggered every 6 min by `pg_cron`+`pg_net` (daily Vercel cron in `vercel.json` remains as a backstop)
- `/api/cron/digest` — weekly email digest (Mondays 07:00 via Resend)
- `/api/cron/extract-documents` — worker di estrazione testo PDF per l'analisi forte (Piano 3/6, spento finché i Vault secret `extract_endpoint_url`/`extract_cron_secret` non sono impostati)
- `/api/cron/embed-documents` — worker che genera gli embedding (`gemini-embedding-001`) dei chunk di testo estratti, per la chat cross-bando (V2-A)

## Conventions

- UI language: Italian
- Code/comments language: English
- Italian legal context: Codice Terzo Settore, D.Lgs 117/2017
- 63 legal entity types (`LEGAL_TYPES` in `vocab.ts`), 47 thematic tags, 14 grant sources in DB (only a handful enabled at a time — check `grant_sources.enabled` directly, this count drifts)
- Next.js 16 has breaking changes vs training data — read `app/node_modules/next/dist/docs/` before modifying app code

## Environment variables

App: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`

Scraper (also needed in app for cron): `AI_PROVIDER` (default: gemini), `GEMINI_API_KEY`, `BROWSERLESS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

Scraper tuning (optional, sensible defaults): `LLM_THROTTLE_MS` (5000), `SCRAPE_BUDGET_MS` (270000), `LLM_CALL_WORST_CASE_MS` (120000 — derived from 35s timeout × 3 retries + backoff + one throttle wait; raise it if `LLM_THROTTLE_MS` is tuned up).

App (analisi forte, Piano 2+): `OCR_SPACE_API_KEY` (free tier, registrazione su https://ocr.space/ocrapi — necessaria solo per bandi con PDF scansionati); `GEMINI_API_KEY` è riusata per gli embedding (`gemini-embedding-001`), nessuna chiave separata richiesta per V2-A.
