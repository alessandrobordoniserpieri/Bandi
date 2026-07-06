-- 0006_saved_grant_status_fn.sql — branch 010. Atomic "set saved-grant status" that, on the
-- first transition to 'finanziato', also appends a track-record row to the owner's profile
-- (§7) and flips track_record_written. Both writes happen in one transaction (the function
-- body), so it is all-or-nothing (I6). security invoker → the caller's RLS applies.

create or replace function public.set_saved_grant_status(
  p_saved_grant_id uuid,
  p_status public.saved_grant_status
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_saved public.saved_grants%rowtype;
  v_grant public.grants%rowtype;
  v_kind public.provider_kind;
begin
  update public.saved_grants
     set status = p_status
   where id = p_saved_grant_id
  returning * into v_saved;

  if not found then
    raise exception 'saved grant % not found or not permitted', p_saved_grant_id;
  end if;

  if p_status = 'finanziato' and not v_saved.track_record_written then
    select * into v_grant from public.grants where id = v_saved.grant_id;
    if found then
      select kind into v_kind from public.grant_providers where id = v_grant.provider_id;

      -- project_history rows are stored snake_case (see parseProjectHistory).
      update public.profiles
         set project_history = coalesce(project_history, '[]'::jsonb) || jsonb_build_object(
               'grant_name', v_grant.title,
               'provider_id', v_grant.provider_id,
               'year', extract(year from now())::int,
               'outcome', 'finanziato',
               'amount', v_grant.amount,
               'kind', v_kind
             )
       where user_id = v_saved.user_id;

      update public.saved_grants
         set track_record_written = true
       where id = p_saved_grant_id;
    end if;
  end if;
end;
$$;
