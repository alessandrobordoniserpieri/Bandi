-- 0009: Scraper V2 schema — new fields, funding_type enum, scrape_logs, partial unique, expire function.

-- 1. Create funding_type enum
CREATE TYPE funding_type AS ENUM (
  'fondo_perduto', 'prestito_agevolato', 'contributo_misto', 'garanzia', 'premio'
);

-- 2. Add new columns to grants
ALTER TABLE public.grants
  ADD COLUMN IF NOT EXISTS opening_date date,
  ADD COLUMN IF NOT EXISTS funding_type funding_type,
  ADD COLUMN IF NOT EXISTS min_amount numeric,
  ADD COLUMN IF NOT EXISTS max_amount numeric,
  ADD COLUMN IF NOT EXISTS cofunding_percentage numeric,
  ADD COLUMN IF NOT EXISTS eligible_expenses text,
  ADD COLUMN IF NOT EXISTS application_method text,
  ADD COLUMN IF NOT EXISTS contact_info text,
  ADD COLUMN IF NOT EXISTS detail_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS detail_fetch_attempts int NOT NULL DEFAULT 0;

-- 3. Drop the old UNIQUE(url) and create partial unique (excludes scaduto grants)
ALTER TABLE public.grants DROP CONSTRAINT IF EXISTS grants_url_key;
CREATE UNIQUE INDEX IF NOT EXISTS grants_url_active_unique ON public.grants (url) WHERE status != 'scaduto';

-- 4. Create scrape_logs table for observability
CREATE TABLE IF NOT EXISTS public.scrape_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.grant_sources(id) ON DELETE CASCADE,
  ran_at timestamptz NOT NULL DEFAULT now(),
  phase text NOT NULL DEFAULT 'listing',
  inserted int NOT NULL DEFAULT 0,
  updated int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  errors text[] NOT NULL DEFAULT '{}',
  detail_errors text[] NOT NULL DEFAULT '{}',
  duration_ms int
);
CREATE INDEX IF NOT EXISTS scrape_logs_source_ran ON public.scrape_logs (source_id, ran_at DESC);

-- 5. Auto-expiration function (called by pg_cron nightly at 02:00)
CREATE OR REPLACE FUNCTION public.expire_grants() RETURNS void
  LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.grants
     SET status = 'scaduto'
   WHERE deadline < CURRENT_DATE
     AND status = 'aperto';
$$;

-- 6. Disable all sources except one for gradual rollout
UPDATE public.grant_sources SET enabled = false;
UPDATE public.grant_sources SET enabled = true
 WHERE name = 'Fondazione Cariplo - Bandi';
