-- 0016: V2-A cross-bando vector foundations (spec 2026-07-20-strong-ai-analysis-v2-crossbando-credits-design.md Parte A).
-- Additive over V1: chunk+embed the text ALREADY extracted in grant_documents. No re-extraction.
-- Embedding: Gemini gemini-embedding-001 via :embedContent, outputDimensionality 768
-- (text-embedding-004 404s on this project — do not switch back). Index: hnsw cosine (pgvector 0.8.x).
-- The embedding cron is SEPARATE and OFF by default (needs Vault secrets embed_endpoint_url /
-- embed_cron_secret), same pattern as the scrape (0011) and extraction (0015) schedulers.
create extension if not exists vector;

alter table public.grant_documents
  add column if not exists chunked_at timestamptz,
  add column if not exists embed_claimed_at timestamptz;

-- Chunks of the extracted PDF text + their embeddings. SHARED (derive from public PDFs).
create table if not exists public.grant_document_chunks (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  document_id uuid not null references public.grant_documents(id) on delete cascade,
  chunk_index int not null,
  chunk_text text not null,
  embedding vector(768) not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
create index if not exists grant_document_chunks_grant on public.grant_document_chunks (grant_id);
create index if not exists grant_document_chunks_embedding
  on public.grant_document_chunks using hnsw (embedding vector_cosine_ops);

alter table public.grant_document_chunks enable row level security;
create policy grant_document_chunks_read on public.grant_document_chunks
  for select to authenticated using (true);

-- Cross-bando chat is per-USER (not per-grant): the working set is the user's saved grants.
create table if not exists public.cross_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists cross_chat_messages_user on public.cross_chat_messages (user_id, created_at);
alter table public.cross_chat_messages enable row level security;
create policy cross_chat_messages_select on public.cross_chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy cross_chat_messages_insert on public.cross_chat_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy cross_chat_messages_delete on public.cross_chat_messages
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Atomically claim ONE ready+unchunked document to embed (mirrors claim_pending_document, with a
-- 10-min stale-worker recovery). Returns the text so the worker chunks+embeds without a re-read.
create or replace function public.claim_document_for_embedding()
returns table (id uuid, grant_id uuid, extracted_text text)
language plpgsql security definer set search_path = '' as $$
declare claimed_id uuid;
begin
  select gd.id into claimed_id
  from public.grant_documents gd
  where gd.status = 'ready' and gd.extracted_text is not null and gd.chunked_at is null
    and (gd.embed_claimed_at is null or gd.embed_claimed_at < now() - interval '10 minutes')
  order by gd.updated_at asc
  for update skip locked
  limit 1;
  if claimed_id is null then return; end if;
  update public.grant_documents gd set embed_claimed_at = now() where gd.id = claimed_id;
  return query select gd.id, gd.grant_id, gd.extracted_text
               from public.grant_documents gd where gd.id = claimed_id;
end;
$$;

-- Similarity search scoped to a working-set of grants (spec: retrieval scoped to grant_id IN set).
-- search_path includes public so the pgvector <=> operator resolves (NOT security definer, stable).
create or replace function public.match_grant_chunks(
  query_embedding vector(768), grant_ids uuid[], match_count int
)
returns table (grant_id uuid, document_id uuid, chunk_text text, similarity float)
language sql stable set search_path = public as $$
  select c.grant_id, c.document_id, c.chunk_text,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.grant_document_chunks c
  where c.grant_id = any(grant_ids)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.trigger_embed_documents() returns void
  language plpgsql security definer set search_path = '' as $$
declare endpoint text; secret text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'embed_endpoint_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'embed_cron_secret';
  if endpoint is null or secret is null then
    raise notice 'trigger_embed_documents: missing Vault secret(s); skipping';
    return;
  end if;
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || secret),
    timeout_milliseconds := 5000
  );
end;
$$;

select cron.unschedule('embed-documents-every-2-min')
 where exists (select 1 from cron.job where jobname = 'embed-documents-every-2-min');
select cron.schedule('embed-documents-every-2-min', '*/2 * * * *', $$ select public.trigger_embed_documents(); $$);
