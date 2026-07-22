# Full-app review — 2026-07-22

Whole-application review requested after V1 (PR #61) and V2 (PR #62) shipped:
Standards + Spec code review (mattpocock-skills `code-review` methodology, 4
parallel subagents by subsystem) plus a live functional pass against the real
Supabase/Gemini/OCR.space/Browserless stack (superpowers verification —
evidence before claiming things work). This doc is the record of what was
checked, what was found, and what was fixed.

## Method

- **Static review**: 4 parallel `general-purpose` subagents, one per
  subsystem, each comparing current code against its originating spec/plan
  in `docs/superpowers/{specs,plans}/` and against this repo's documented
  conventions (`.claude/CLAUDE.md`) plus the Fowler smell baseline.
  Subsystems: scraper pipeline; matching engine + auth/profile/dashboard;
  V1 strong AI analysis; V2-A cross-chat + V2-B credits.
- **Live testing**: real dev server against the production Supabase project
  (`gptsklxbkuhdfkksmqhz`) with real Gemini/OCR.space/Browserless keys, driven
  via a headless-Chromium Playwright script. Covered: login, dashboard/
  matching scores, grant detail + strong analysis (real Gemini output grounded
  on real extracted PDF text), per-grant chat, save-grant, cross-bando chat
  (`/assistente`, real pgvector retrieval), credits badge + live decrement on
  both chat surfaces. Scraper: unit suite (298→299 tests, fake fetchers) plus
  two real dry-runs against live sources (an API-direct-fetch source and a
  code-parser HTML source).
- Everything reported below as a **finding** was independently confirmed
  (read the actual code/SQL/live data), not taken on the subagents' word.

## What works (verified live, not just by test suite)

- Auth (login/session, Next.js 16 cookie handling) — correct.
- Matching engine — 6-dimension score renders correctly on real saved
  profile + real grants; verdict labels (`Da valutare`, `Bassa priorità`)
  match the actual 6-level `verdict.ts` logic.
- V1 strong analysis — real Gemini output grounded on real extracted PDF
  text, rendered correctly (Punti di forza / Rischi / Suggerimenti / Passi
  successivi).
- V1 per-grant chat — real reply, credit correctly decremented 100→99.
- V2-A cross-bando chat (`/assistente`) — real pgvector retrieval across
  saved grants, correct source attribution, credit decremented 99→98.
- V2-B credits badge — shown correctly on both chat surfaces, shared balance
  across per-grant and cross-bando chat.
- Scraper — both a direct-API-fetch source (`er-sociale`) and a code-parser
  HTML source (`sport-governo`) ran live successfully end to end (fetch →
  parse → dedup/update). Full unit suite green (299 tests).
- Security: RLS is real and owner-scoped everywhere checked; no
  `dangerouslySetInnerHTML`; no user-text path with a realistic injection
  risk found.

## Findings and fixes

### Fixed this pass

1. **[Security, high] 4 `SECURITY DEFINER` worker functions had no EXECUTE
   lockdown** — `claim_pending_document`, `trigger_extract_documents`
   (migration 0015, V1), `claim_document_for_embedding`,
   `trigger_embed_documents` (migration 0016, V2-A). Postgres grants EXECUTE
   to PUBLIC (including `anon`, i.e. unauthenticated) by default; any caller
   could have called these RPCs directly to starve the real cron workers
   (repeatedly re-claim documents, or fire the cron on demand). Same bug
   class already fixed twice for the credits functions (`grant_paid_credits`
   0018, `consume_credit` 0019) — these four were missed. **Fixed**:
   migration `0020`, verified via `information_schema.routine_privileges`
   that only `postgres`/`service_role` retain EXECUTE. `.claude/CLAUDE.md`
   updated with an explicit convention: revoke EXECUTE in the same migration
   that creates any future `SECURITY DEFINER` function.

2. **[Data integrity, medium] Credit ledger incomplete** — `consume_credit()`
   silently reset the free balance to 100 on a new month but never logged
   that grant in `credit_transactions`, contradicting migration 0017's own
   stated invariant ("records every movement"). **Fixed**: migration `0021`
   adds a `monthly_free_grant` ledger row on reset.

3. **[Correctness, medium] Scraper budget worst-case miscalibrated** —
   `LLM_CALL_WORST_CASE_MS` defaulted to 40s, but the real worst case for one
   throttled LLM call (35s per-attempt timeout × 3 retries + backoff + one
   throttle wait) is ~111.5s — the budget's "one call still fits" guarantee
   was calibrated to less than half the real number, risking a call
   straddling Vercel's 300s hard kill. **Fixed**: default raised to 120s in
   both `run.ts` and `run-production.ts`, with the derivation documented
   inline and in CLAUDE.md.

4. **[Correctness, medium] Budget only checked once per source, not per
   chunk** — a large listing page needing several LLM chunk calls only had
   its first chunk's worst-case time guaranteed by the pre-source budget
   check; chunks 2..N ran unconditionally (unlike the detail loop, which
   already re-checks per item via `throttledLoop`'s `shouldStop`). **Fixed**:
   `extractGrants`/`extractFromChunks` now accept a `shouldStop` callback,
   wired to the same budget check in `run.ts`, with a new test
   (`extract-grants.test.ts`) confirming it actually stops mid-chunk-loop.

5. **[Standards/Spec, medium] `/api/ai/analyze` bypassed the entitlement
   seam** — every other AI route calls `checkEntitlement()`, but this one
   still called `consumeAnalysisQuota()` from a separate, near-duplicate
   `rate-limit.ts` module (same table/columns, same logic, just not the same
   function) — a documented architecture invariant ("checkEntitlement is the
   single seam every AI-consuming route calls," CLAUDE.md + spec §8) broken
   by one holdout. Currently harmless (both cap at 10/hour) but a latent
   drift trap. **Fixed**: route now calls `checkEntitlement(..., "quick_analysis")`;
   `rate-limit.ts` deleted (dead code, zero other callers); tests updated.

6. **[Docs] Stale/wrong facts across 3 docs**, all corrected:
   - `.claude/CLAUDE.md`: verdict system documented as 5 generic Italian
     adjectives (`ottimo/buono/discreto/basso/insufficiente`) — the actual
     code (`verdict.ts`) has 6 specific states (`Candidabile`/`Da preparare`/
     `Da valutare`/`Bassa priorità`/`Non compatibile`/`Storico`), now
     documented with the real branching logic.
   - `.claude/CLAUDE.md`: "12 grant sources" — actually 14 rows in
     `grant_sources` (most disabled at any given time); the example manual
     scrape command referenced a source name (`Regione Emilia-Romagna -
     Bandi Terzo Settore`) that no longer exists — it was renamed to
     `Regione Emilia-Romagna - Bandi Sociale (API)` when it moved to direct
     API fetch. The CLI silently does nothing (exit 0, no output) on a name
     that doesn't match an *enabled* source — this cost real debugging time
     during this review and is now called out explicitly in the doc.
   - `.claude/skills/scraping-pipeline.md`: described a legacy monolith
     (`grant-radar-server.mjs`, "35 fonti", "attualmente tutte 32 fonti
     falliscono") that no longer exists at all — rewritten to describe the
     real archetype-based pipeline.
   - `HANDOFF.md`: the Fondazione Cariplo item said its source row was
     "temporarily pointed at sportesalute.eu for testing, needs restoring" —
     verified against the live DB that the row doesn't exist at all anymore
     (deleted, undocumented). Corrected, plus marked two other HANDOFF open
     items (Gemini 429 handling, stale Supabase types) as actually resolved,
     verified against current code.
   - Migration `0016`'s own comment named the wrong embedding model
     (`text-embedding-004`, which 404s) — fixed to `gemini-embedding-001`.

### Known, not fixed (judgement calls / out of scope for this pass)

- **Fondazione Cariplo has no source row at all** (see above) — re-adding it
  needs a real decision on how to get past its Cloudflare block on
  Browserless, not a code fix. Left as an open item in HANDOFF.md.
- **`isDocumentTextTruncated()` is dead code** — written for V1 so a route
  could surface a "this analysis is partial" notice to the UI, but nothing
  calls it; the truncation warning only reaches the LLM prompt, not the
  user. Minor spec gap (§5), not wired up this pass — flagged for a future
  small UI addition rather than fixed blind.
- **`chat_calls_count`/`chat_calls_window_start` columns are orphaned** —
  added in migration 0014 for V1's original hourly chat limit, unused since
  chat moved to credits (V2-B). No runtime effect; left in place rather than
  a drop-column migration with unclear value.
- **No currently-*enabled* source exercises the generic Gemini LLM listing
  extraction path live** — all 3 enabled sources (`er-sociale`,
  `sport-governo` ×2) use dedicated code-parsers; the `full`/`listing-light`/
  `sportesalute` LLM-driven archetypes are only exercised by disabled
  sources and the unit suite (fake providers). Confirmed via a live dry-run
  against the disabled `sportesalute` source, which is enabled=false so the
  CLI correctly found nothing to run — not re-enabled as part of this review
  (a production data change, not a code fix). Worth knowing if a future bug
  shows up only in that path.
- **Month-boundary UTC assumption** — `getCreditBalance()` (JS) computes the
  reset month via `Date.toISOString()` (always UTC); `consume_credit()` (SQL)
  via `to_char(..., 'YYYY-MM')`, evaluated in the session's Postgres
  `TimeZone` GUC. Not verified whether that GUC is pinned to UTC on this
  project — if it isn't, balance display and actual spend could disagree for
  up to the timezone offset around a month boundary. Not fixed (would need
  either an explicit `AT TIME ZONE 'utc'` in the SQL or confirming the
  project default) — flagged, not chased further this pass.
- A few Standards-axis judgement calls (duplicated FormData-reader helpers,
  a `notes` field without the zod cap other free-text fields have, the
  `parseItalianAmount` "milioni" heuristic calibrated on one source) — no
  functional risk found, not acted on.

## Verification

- `cd app && npx tsc --noEmit` — clean.
- `cd app && npx vitest run` — 395/395.
- `cd scraper && npx tsc --noEmit` — clean.
- `cd scraper && npx vitest run` — 299/299 (298 + 1 new test for the
  per-chunk budget stop).
- Migrations `0020`/`0021` applied directly to the live project
  (`gptsklxbkuhdfkksmqhz`) via the Supabase MCP tools; EXECUTE grants
  re-verified via `information_schema.routine_privileges` after applying.
- Live browser pass (see "What works" above) re-run was not repeated after
  the `/api/ai/analyze` entitlement-seam fix specifically — that fix is a
  like-for-like swap of two already-equivalent, already-tested functions,
  covered by the updated `analyze-route.test.ts`, not a re-verified live
  click-through.
