-- 0013: grant_type classification — distinguishes co-progettazioni (Terzo Settore co-designs a
-- public plan, still funded — e.g. "Una giustizia più inclusiva", 1.371.182,26 €) from ordinary
-- bandi. "amministrativo" (proroga/rettifica/errata corrige) is classified by the scraper but
-- never persisted: decide() skips those at ingest (scraper/src/pipeline/dedup.ts), so this
-- column only ever holds 'bando' or 'co_progettazione'. No CHECK constraint, validated app-side
-- (same convention as status/funding_type).
alter table grants add column if not exists grant_type text not null default 'bando';
