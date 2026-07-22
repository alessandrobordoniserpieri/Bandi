-- 0019: fix a real race in credits.ts — consumeCredit() did a read-then-write from app code with
-- no locking, so two concurrent chat requests from the same user could both read the same balance,
-- both see "allowed", and both write, losing one decrement (the user gets an extra free message
-- per race instead of being stopped at 0, defeating the whole point of the monthly cap).
-- consume_credit() moves the read-modify-write into a single SECURITY DEFINER function that locks
-- the row with `for update` before deciding, so concurrent callers serialize instead of racing.
-- Same lazy-reset + free-then-paid spend order as the app code it replaces (FREE_MONTHLY_CREDITS
-- here MUST stay in sync with the constant of the same name in app/src/lib/ai/credits.ts).
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

  if v_free <= 0 and v_paid <= 0 then
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

-- Same class of vulnerability as grant_paid_credits (migration 0018): Postgres grants EXECUTE to
-- PUBLIC by default, which would let any authenticated user call consume_credit() with an
-- arbitrary p_user_id and drain (or reset) someone else's balance. The app calls this via the
-- admin client only.
revoke execute on function public.consume_credit(uuid, text, timestamptz) from public, authenticated, anon;
