-- 0007_ai_analysis.sql — branch 011.
-- (a) grants.import_mode distinguishes scraped grants from user-submitted ones (§4.4):
--     crowdsourced inserts (submit-url) use 'user' with source_id = null.
-- (b) user_settings gains the AI-analysis rate-limit window (max N calls per hour per user,
--     enforced by /api/ai/analyze; owner RLS already covers these columns).

alter table public.grants
  add column import_mode text not null default 'scraper'
  check (import_mode in ('scraper', 'user'));

alter table public.user_settings
  add column ai_calls_count int not null default 0,
  add column ai_calls_window_start timestamptz;
