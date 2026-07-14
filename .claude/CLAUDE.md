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
cd scraper && npm run scrape -- --source="Regione Emilia-Romagna - Bandi Terzo Settore"  # manual run
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

**Time budget** (`budget.ts`): a conservative wall-clock budget (`SCRAPE_BUDGET_MS` default 270s) enforced in `runPipeline` — never start a source or detail call unless one worst-case LLM call still fits, so a call can't straddle Vercel's 300s kill. Skipped work is picked up next run; a truncation is logged.

**Source ordering** (`loadEnabledSources`): priority-first (`priority` enum high→medium→low, default medium), `last_run_at` ascending (nulls first) as the in-band tiebreaker — a self-balancing round-robin so budget-skipped sources rise to the top next run.

Key seams (interfaces in `types.ts`): `PageFetcher`, `LLMProvider`, `GrantsDb` — all dependency-injected, with in-memory fakes for tests.

### LLM providers (`scraper/src/providers/`)

Pluggable via `AI_PROVIDER` env var. Gemini is the production default. Adapters: `gemini.ts`, `anthropic.ts`, `openai.ts`, `groq.ts`, `openai-compat.ts`. All implement `LLMProvider.extract()`. Gemini uses `response_schema` (OpenAPI-3.0 subset) — nullable fields must use `nullable: true`, never `type: ["string", "null"]`.

### Matching engine (`app/src/lib/matching/`)

6-dimension scoring: themes, legal-form, territory, capacity, documents, track-record. Each dimension has its own file in `dimensions/`. Bonuses and indicators modify the raw score. Final verdict: one of 5 levels (ottimo/buono/discreto/basso/insufficiente).

### Supabase

- **Project ID**: `gptsklxbkuhdfkksmqhz` (EU region)
- **Migrations**: `app/supabase/migrations/` (0001-0009)
- **Key tables**: `grants`, `grant_sources`, `grant_providers`, `profiles`, `user_settings`, `saved_grants`, `scrape_logs`, `scrape_debug`
- **RLS**: enabled on all user-facing tables
- **pg_cron**: `expire_grants()` runs daily to mark past-deadline grants as `scaduto`; `cleanup-scrape-debug` purges debug HTML older than 3 days

### Cron routes (`app/src/app/api/cron/`)

Protected by `CRON_SECRET` header. Both routes use `Cache-Control: no-store` to prevent Vercel caching.
- `/api/cron/scrape` — daily grant scraping
- `/api/cron/digest` — weekly email digest (Mondays 07:00 via Resend)

## Conventions

- UI language: Italian
- Code/comments language: English
- Italian legal context: Codice Terzo Settore, D.Lgs 117/2017
- 63 legal entity types (`LEGAL_TYPES` in `vocab.ts`), 47 thematic tags, 12 grant sources in DB
- Next.js 16 has breaking changes vs training data — read `app/node_modules/next/dist/docs/` before modifying app code

## Environment variables

App: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`

Scraper (also needed in app for cron): `AI_PROVIDER` (default: gemini), `GEMINI_API_KEY`, `BROWSERLESS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

Scraper tuning (optional, sensible defaults): `LLM_THROTTLE_MS` (5000), `SCRAPE_BUDGET_MS` (270000), `LLM_CALL_WORST_CASE_MS` (40000).
