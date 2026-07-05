# ADR-008 — The app consumes the scraper as a library (one-directional)

## Status
Accepted (branch 009).

## Context
Branch 009 puts the pipeline into production. The Vercel cron route
(`app/src/app/api/cron/scrape/route.ts`) has to run `runProductionScrape`, which lives in the
`scraper/` package. ADR-002 established that the scraper is a separate bounded context and
**must not import from `app/`**. The recap phrased this as "no import between app/ and
scraper/", which would forbid the cron route from calling the pipeline at all.

## Decision
Refine the boundary to **one direction**: the scraper still never imports `app/`, but the app
may consume the scraper as a normal library.

- The scraper exposes a single public entrypoint `scraper/src/index.ts` (`runProductionScrape`,
  `runPipeline`, key types). Nothing else in the app reaches into scraper internals.
- The app depends on it as `"bandi-scraper": "file:../scraper"` and lists it in
  `transpilePackages` so Next's App Router transpiles its raw TypeScript and bundles it into
  the route handler.
- Because the package sits outside `app/`, `next.config.ts` sets `turbopack.root` and
  `outputFileTracingRoot` to the repository root so the bundler resolves the sibling and traces
  its files into the serverless function.

The scraper stays self-contained: its own tests, its own vocabulary copy (ADR-002), no
knowledge of the app.

## Consequences
- Switching or extending the pipeline is a scraper-only change; the app just calls the public
  entrypoint.
- **Deployment (manual):** on Vercel the project **Root Directory must be the repository root**
  so both `app/` and `scraper/` are present in the build context (the cron function bundles the
  scraper source). Required env vars: `AI_PROVIDER` + the active provider key, `SUPABASE_URL`
  (or `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `BROWSERLESS_API_KEY`,
  `CRON_SECRET`. The cron schedule lives in `vercel.json` (`0 3 */2 * *`, every 48h).
- The `file:` dependency is reproducible on a fresh clone (`cd app && npm install` symlinks the
  sibling); it is recorded in `app/package-lock.json`. A future move to npm workspaces is
  possible but was intentionally avoided here to keep the change scoped.
