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

Two-phase pipeline triggered by Vercel cron (`GET /api/cron/scrape`, daily 03:00 UTC):

1. **Listing phase**: `fetchPages` (Browserless headless Chrome) → `sanitizeHtml` (strip noise, 80K char cap) → `extractGrants` (Gemini 2.5 Flash structured JSON) → `enrich` → `saveGrant` (dedup by URL)
2. **Detail phase**: for grants missing detail data, fetch individual pages → `extractDetail` → `markDetailFetched`. 7s throttle between Gemini calls.

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
