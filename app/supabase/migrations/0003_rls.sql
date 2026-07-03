-- Enable RLS on every table
alter table public.profiles        enable row level security;
alter table public.saved_grants    enable row level security;
alter table public.user_settings   enable row level security;
alter table public.grants          enable row level security;
alter table public.grant_providers enable row level security;
alter table public.grant_sources   enable row level security;

-- Owner-scoped tables: full CRUD limited to the row owner.
create policy profiles_select on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_insert on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy profiles_delete on public.profiles for delete to authenticated using ((select auth.uid()) = user_id);

create policy saved_select on public.saved_grants for select to authenticated using ((select auth.uid()) = user_id);
create policy saved_insert on public.saved_grants for insert to authenticated with check ((select auth.uid()) = user_id);
create policy saved_update on public.saved_grants for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saved_delete on public.saved_grants for delete to authenticated using ((select auth.uid()) = user_id);

create policy settings_select on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy settings_insert on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy settings_update on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy settings_delete on public.user_settings for delete to authenticated using ((select auth.uid()) = user_id);

-- Shared read-only catalogs: any authenticated user reads; only service_role writes
-- (service_role bypasses RLS, so no write policy is created → writes are denied to anon/authenticated).
create policy grants_read on public.grants for select to authenticated using (true);
create policy providers_read on public.grant_providers for select to authenticated using (true);
-- grant_sources: no policy for authenticated → only service_role (bypass) can touch it.
