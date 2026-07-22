-- 0021: consume_credit() (migration 0019) silently reset free_balance to 100 on a new calendar
-- month but never recorded that grant in credit_transactions — contradicting migration 0017's own
-- stated invariant that the ledger "records every movement" (accredito iniziale free, acquisti,
-- consumi). A user reviewing their history would see spends with no matching credit for where the
-- monthly free balance came from. Re-create the function with a ledger row for the reset itself.
create or replace function public.consume_credit(p_user_id uuid, p_reason text, p_now timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free_balance      int;
  v_free_period_start timestamptz;
  v_paid_balance      int;
  v_needs_reset       boolean;
  v_free              int;
  v_paid              int;
  free_monthly_credits constant int := 100;
begin
  insert into public.user_credits (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select free_balance, free_period_start, paid_balance
    into v_free_balance, v_free_period_start, v_paid_balance
  from public.user_credits
  where user_id = p_user_id
  for update;

  v_needs_reset := v_free_period_start is null
    or to_char(v_free_period_start, 'YYYY-MM') <> to_char(p_now, 'YYYY-MM');
  v_free := case when v_needs_reset then free_monthly_credits else v_free_balance end;
  v_paid := v_paid_balance;

  if v_needs_reset then
    insert into public.credit_transactions (user_id, delta, reason)
    values (p_user_id, free_monthly_credits, 'monthly_free_grant');
  end if;

  if v_free <= 0 and v_paid <= 0 then
    -- The reset above (if any) still needs to be persisted even when the resulting balance is
    -- immediately exhausted (free_monthly_credits could theoretically be 0) — write it, then stop.
    update public.user_credits
    set free_balance = v_free,
        paid_balance = v_paid,
        free_period_start = case when v_needs_reset then p_now else free_period_start end,
        updated_at = now()
    where user_id = p_user_id;
    return false;
  end if;

  if v_free > 0 then
    v_free := v_free - 1;
  else
    v_paid := v_paid - 1;
  end if;

  update public.user_credits
  set free_balance = v_free,
      paid_balance = v_paid,
      free_period_start = case when v_needs_reset then p_now else free_period_start end,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.credit_transactions (user_id, delta, reason) values (p_user_id, -1, p_reason);
  return true;
end;
$$;

revoke execute on function public.consume_credit(uuid, text, timestamptz) from public, authenticated, anon;
