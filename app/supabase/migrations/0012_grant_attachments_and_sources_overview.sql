-- 0012: attachment metadata + human-readable sources view
--
-- grants.attachments: array of {title, url, mimeType} collected by code-based detail parsers
-- (er-sociale reads them from the Plone API's "approfondimento"). Metadata only — binaries stay
-- on the source site; mirroring into Supabase Storage is a possible later step.
alter table grants add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Read-only lens over grant_sources unpacking scrape_config for the Table Editor: which
-- archetype parses each source and which fetch path it uses ("direct" = plain HTTP / API,
-- no Chrome). One source of truth (the jsonb) — this is a view, not a copy.
create or replace view sources_overview
with (security_invoker = true) as
select name,
       scrape_config->>'archetype' as archetype,
       scrape_config->>'fetchMode' as fetch_mode,
       enabled, priority, last_run_at, last_error
from grant_sources
order by name;
