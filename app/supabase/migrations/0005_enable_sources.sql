-- 0005_enable_sources.sql — branch 009. Activates the 12 MVP grant_sources (seeded in 0004
-- with enabled=false) and gives each a starting scrape_config. maxPages caps pagination per
-- run (MVP fetches the listing page only); per-source selectors are refined during manual
-- integration once the real DOM is known.

update public.grant_sources
   set enabled = true,
       scrape_config = coalesce(scrape_config, '{}'::jsonb) || '{"maxPages": 1}'::jsonb
 where name in (
   'Sport e Salute - Bandi',
   'Fondazione CON IL SUD - Bandi',
   'Regione Emilia-Romagna - Bandi Terzo Settore',
   'Fondazione Cariplo - Bandi',
   'Compagnia di San Paolo - Bandi',
   'CSVnet - Bandi',
   'Info-cooperazione - Bandi',
   'Terzo Settore - Bandi nazionali',
   'Fondazione CRT - Bandi',
   'CONI - Contributi',
   'Europa - Funding & Tenders',
   'Erasmus+ Sport'
 );
