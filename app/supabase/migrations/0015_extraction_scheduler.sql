-- 0015: extraction worker scheduler + atomic claim RPC (spec 2026-07-20-strong-ai-analysis-rag-v1-design.md §3).
-- claim_pending_document(): atomically claims ONE grant_documents row to process — either a fresh
-- 'pending' row, or a 'processing' row stuck for >10min (a worker that died mid-run without ever
-- marking ready/failed). FOR UPDATE SKIP LOCKED means two concurrent cron firings never claim the
-- same row (no app-level compare-and-swap needed).
-- trigger_extract_documents() + the schedule below mirror migration 0011 exactly: a SEPARATE cron
-- job from the scraper's, safe/inert until its own Vault secrets exist (extract_endpoint_url,
-- extract_cron_secret) — "spento di default" per spec §3, same as the scrape scheduler.
--
-- SECRETS: same mechanism as 0011. Before (or after) applying, store them once:
--   select vault.create_secret('https://<your-app>.vercel.app/api/cron/extract-documents', 'extract_endpoint_url');
--   select vault.create_secret('<the CRON_SECRET value>', 'extract_cron_secret');
-- Until both exist the job runs but the POST is skipped with a notice, so applying this migration
-- first is safe.

create or replace function public.claim_pending_document()
returns table (id uuid, attachment_url text)
language plpgsql
security definer set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  select gd.id into claimed_id
  from public.grant_documents gd
  where gd.status = 'pending'
     or (gd.status = 'processing' and gd.updated_at < now() - interval '10 minutes')
  order by gd.created_at asc
  for update skip locked
  limit 1;

  if claimed_id is null then
    return;
  end if;

  update public.grant_documents gd
  set status = 'processing', updated_at = now()
  where gd.id = claimed_id;

  return query select gd.id, gd.attachment_url from public.grant_documents gd where gd.id = claimed_id;
end;
$$;

create or replace function public.trigger_extract_documents() returns void
  language plpgsql security definer set search_path = '' as $$
declare
  endpoint text;
  secret   text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'extract_endpoint_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'extract_cron_secret';
  if endpoint is null or secret is null then
    raise notice 'trigger_extract_documents: missing Vault secret(s) extract_endpoint_url / extract_cron_secret; skipping';
    return;
  end if;
  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

-- Every minute: the UI polls targeting ~1 minute readiness (spec §6), so the scheduler must be
-- at least this responsive. Each firing is a cheap fire-and-forget POST; the route itself is a
-- fast no-op when there is nothing pending.
select cron.unschedule('extract-documents-every-minute')
 where exists (select 1 from cron.job where jobname = 'extract-documents-every-minute');

select cron.schedule('extract-documents-every-minute', '* * * * *', $$ select public.trigger_extract_documents(); $$);
