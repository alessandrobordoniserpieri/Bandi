-- 0014: fondamenta "analisi forte" V1 (spec 2026-07-20-strong-ai-analysis-rag-v1-design.md).
-- (a) grant_documents: testo estratto dai PDF, UNA riga per allegato (grant_id, attachment_url),
--     CONDIVISO tra utenti (deriva da PDF pubblici). Popolato dal worker dell'app, MAI dallo
--     scraper (disaccoppiamento, spec §7). status valida app-side: pending/processing/ready/failed.
-- (b) chat_messages: conversazione persistita PER-UTENTE (privata, owner RLS). role: user/assistant.
-- (c) user_settings: due nuovi secchielli rate-limit indipendenti (chat orario, estrazione
--     giornaliera) accanto a quello esistente dell'analisi rapida (ai_calls_*).

create table if not exists public.grant_documents (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  attachment_url text not null,
  extracted_text text,
  status text not null default 'pending',
  ocr_used boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grant_id, attachment_url)
);
create index if not exists grant_documents_grant on public.grant_documents (grant_id);
create index if not exists grant_documents_status on public.grant_documents (status);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_user_grant on public.chat_messages (user_id, grant_id, created_at);

alter table public.user_settings
  add column if not exists chat_calls_count int not null default 0,
  add column if not exists chat_calls_window_start timestamptz,
  add column if not exists extraction_count int not null default 0,
  add column if not exists extraction_window_start timestamptz;

-- RLS. grant_documents = catalogo condiviso derivato da PDF pubblici: lettura a ogni autenticato,
-- scrittura solo service_role (bypass RLS) — stesso schema di public.grants.
alter table public.grant_documents enable row level security;
create policy grant_documents_read on public.grant_documents
  for select to authenticated using (true);

-- chat_messages = dato privato: CRUD limitato al proprietario (pattern da 0003_rls.sql).
alter table public.chat_messages enable row level security;
create policy chat_messages_select on public.chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy chat_messages_delete on public.chat_messages
  for delete to authenticated using ((select auth.uid()) = user_id);
