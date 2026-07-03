create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create table public.grant_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind provider_kind not null,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.grant_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  scrape_config jsonb not null default '{}',
  enabled boolean not null default false,
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.grants (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  provider_id uuid references public.grant_providers(id) on delete set null,
  deadline date,
  status grant_status not null default 'aperto',
  amount numeric,
  cofunding_required numeric,
  eligible_types text[] not null default '{}',
  tags text[] not null default '{}',
  area text,
  geo_scope geo_scope,
  complexity complexity_level,
  required_documents text[] not null default '{}',
  summary text,
  requirements text,
  url text unique not null,
  beneficiaries text,
  source_id uuid references public.grant_sources(id) on delete set null,
  raw jsonb,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  -- section 1
  name text, legal_type text, founded_year int, tax_code text, website text,
  -- section 2
  province text, region text, municipality text, operating_scope text,
  operating_provinces text[] not null default '{}',
  -- section 3
  themes text[] not null default '{}', activity_description text,
  beneficiaries text[] not null default '{}',
  -- section 4 (capacity answers)
  stable_staff text, dedicated_admin boolean, funded_projects_3y text,
  reporting_experience text, annual_budget text, eu_project boolean,
  -- section 5 (documents)
  doc_statuto boolean not null default false, doc_bilancio boolean not null default false,
  doc_runts boolean not null default false, doc_rasd boolean not null default false,
  doc_durc boolean not null default false, doc_certificazioni boolean not null default false,
  sport_body text, rasd_number text,
  -- section 6
  public_partners boolean not null default false, public_partners_detail text,
  private_partners boolean not null default false, private_partners_detail text,
  networks text, coprogettazione boolean not null default false,
  -- section 7
  project_history jsonb not null default '[]',
  public_funds boolean not null default false, private_funds boolean not null default false,
  eu_funds boolean not null default false, cofunding_capacity int,
  income_sources text[] not null default '{}',
  -- section 8
  contact_name text, contact_role text, contact_email text, contact_phone text, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.saved_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid not null references public.grants(id) on delete cascade,
  status saved_grant_status not null default 'salvato',
  notes text,
  track_record_written boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, grant_id)
);

create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  alert_threshold int not null default 50,
  alert_frequency alert_frequency not null default 'weekly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.grants (provider_id);
create index on public.grants (source_id);
create index on public.saved_grants (grant_id);
-- (profiles.user_id, user_settings.user_id already indexed by their UNIQUE constraint;
--  saved_grants.user_id is covered by the leftmost prefix of unique(user_id, grant_id))

create trigger trg_grants_updated before update on public.grants for each row execute function public.set_updated_at();
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_saved_grants_updated before update on public.saved_grants for each row execute function public.set_updated_at();
create trigger trg_user_settings_updated before update on public.user_settings for each row execute function public.set_updated_at();
