-- 0011: Scrape scheduler — Supabase pg_cron + pg_net drive the scrape.
--
-- Vercel Hobby caps cron at once/day; we want the scrape to run frequently so the time-budgeted
-- pipeline can cover many sources across the day (each run picks up where the last left off via
-- priority + last_run_at ordering and null detail_fetched_at). So the SCHEDULER lives here in
-- Supabase and just fires an HTTP POST at the existing Vercel endpoint every 6 minutes; the
-- EXECUTION stays on Vercel (Node, 300s). 6 minutes > the 300s hard limit, so two runs never
-- overlap and no DB lock is needed.
--
-- Migrating to Vercel Pro later (native sub-daily cron) = `select cron.unschedule('scrape-every-6-min');`
-- here + add the schedule to vercel.json. Nothing in the scraper code depends on Supabase as caller.
--
-- SECRETS: this migration reads the endpoint URL and the CRON_SECRET from Supabase Vault so no
-- secret is committed. Before (or after) applying, store them once:
--
--   select vault.create_secret('https://<your-app>.vercel.app/api/cron/scrape', 'scrape_endpoint_url');
--   select vault.create_secret('<the CRON_SECRET value>', 'scrape_cron_secret');
--
-- (Re-run create_secret / use vault.update_secret to change them.) Until both exist the job runs
-- but the POST is skipped with a notice, so applying this migration first is safe.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- One-shot trigger: POST the Vercel scrape endpoint with the Bearer CRON_SECRET the route expects.
-- Kept as a function so the cron body stays readable and the Vault lookups live in one place.
CREATE OR REPLACE FUNCTION public.trigger_scrape() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  endpoint text;
  secret   text;
BEGIN
  SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name = 'scrape_endpoint_url';
  SELECT decrypted_secret INTO secret   FROM vault.decrypted_secrets WHERE name = 'scrape_cron_secret';
  IF endpoint IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'trigger_scrape: missing Vault secret(s) scrape_endpoint_url / scrape_cron_secret; skipping';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    timeout_milliseconds := 5000  -- fire-and-forget: the run itself is async on Vercel
  );
END;
$$;

-- Every 6 minutes. Unschedule any prior definition first so re-running the migration is idempotent.
SELECT cron.unschedule('scrape-every-6-min')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scrape-every-6-min');

SELECT cron.schedule('scrape-every-6-min', '*/6 * * * *', $$ SELECT public.trigger_scrape(); $$);
