# Scraping Pipeline

Skill per gestire la pipeline di scraping dei bandi.

## Quando usare
- Aggiunta/modifica fonti di scraping
- Debug fonti che falliscono
- Ottimizzazione pipeline di estrazione
- Gestione budget/throttle/scheduling

## Contesto

La pipeline attuale vive in `scraper/src/pipeline/` (package `bandi-scraper`,
consumato dall'app via workspace dependency). Non esiste più un monolite:
è un sistema a due fasi, orchestrato in `run.ts`.

1. **Listing phase**: `fetchPages` (Browserless o `DirectFetcher` per fonti
   API/statiche, dispatch per `scrape_config.fetchMode`) → `archetype.sanitize`
   → `extractGrants` (parametrizzato per archetipo) → `enrich` → `saveGrant`
   (dedup by URL).
2. **Detail phase**: per i bandi con `detail_fetched_at` nullo o vecchio
   (>7gg), fetch della pagina singola → `extractDetail` → `markDetailFetched`.

### Archetipi (`archetypes.ts` + moduli dedicati)
Ogni fonte sceglie una strategia via `scrape_config.archetype`:
- **`full`** (default, in `extract-grants.ts`): listing completo via LLM
  (Gemini structured JSON), detail opzionale.
- **`listing-light`**: il listing estrae solo `title/url/deadline`, il detail
  è essenziale.
- **`sportesalute`**: parser di codice dedicato per un aggregatore con
  centinaia di card (niente LLM in listing).
- **`er-sociale.ts`** e **`sport-governo.ts`**: moduli standalone con parser
  di codice/API-fetch diretto, fuori dal registro `archetypes.ts` — bypassano
  del tutto l'estrazione LLM per fonti con un'API o markup stabile.

Un archetipo sovrascrive solo ciò che varia (`sanitize`, `chunkSize`/`overlap`,
`boundaryTags`, `urlSnapping`, schema/istruzioni del listing); il nucleo
condiviso (`coerce`, validazione vocabolario, `snapToHref`, `mergeGrants`,
`parseItalianAmount`) resta comune. **Aggiungere nuovi archetipi al registro,
mai forkando l'orchestratore.**

### Budget, throttle, scheduling
- **Throttle unico** a livello provider (`throttleProvider`, `LLM_THROTTLE_MS`
  default 5s) su TUTTE le chiamate LLM (listing chunk + detail).
- **Budget di tempo** conservativo (`budget.ts`, `SCRAPE_BUDGET_MS` default
  270s): non parte una nuova fonte, un nuovo dettaglio, o un nuovo chunk
  dentro un listing se non c'è tempo per il worst-case di UNA chiamata
  (`LLM_CALL_WORST_CASE_MS`, default 120s — timeout 35s × 3 retry + backoff +
  un'attesa di throttle). Il controllo è per-chunk, non solo per-fonte.
- **Ordinamento fonti** (`loadEnabledSources`): priority-first, poi
  `last_run_at` ascending — round-robin auto-bilanciante, le fonti saltate
  per budget risalgono in cima al giro successivo.
- **Scheduling**: `pg_cron`+`pg_net` ogni 6 min (migration 0011) chiama
  `/api/cron/scrape` su Vercel (300s hard kill); un cron giornaliero in
  `vercel.json` resta come backstop.

## Fonti (stato reale, non fisso — verificare sempre con una query)

Il numero e l'elenco delle fonti in `grant_sources` cambia nel tempo (fonti
disabilitate, rinominate, o rimosse — es. Fondazione Cariplo non è più in DB,
bloccata da Cloudflare via Browserless). **Non fidarti di un numero fisso in
questo file o in `.claude/CLAUDE.md`** — se serve un elenco aggiornato, query
diretta su `grant_sources` (via Supabase MCP o `psql`), non un conteggio
scritto qui.

## Debug fonti che falliscono
1. `cd scraper && npm run scrape -- --source="<nome esatto o id>" --dry-run`
   — `--source` filtra dentro le sole fonti **enabled**; se il nome non
   combacia o la fonte è disabilitata, il comando esce silenziosamente con
   0 risultati (nessun errore) — verifica il nome esatto in `grant_sources`
   prima di sospettare un bug nella pipeline.
2. Controlla `scrape_logs`/`scrape_debug` per l'HTML grezzo/sanitizzato
   dell'ultimo run.
3. Se una fonte cambia layout, il parser di codice di un archetipo dedicato
   (`sport-governo.ts`, `er-sociale.ts`, `sportesalute` in `archetypes.ts`)
   può smettere di trovare item — `extractGrants` fa fallback automatico
   all'LLM solo se `archetype.parse` esiste ma ritorna `[]`.
