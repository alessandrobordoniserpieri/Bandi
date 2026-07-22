-- 0017: V2-B(A) credits foundations (spec V2 Parte B — infrastructure only, no payment provider).
-- Two-pool balance, forward-compatible with Stripe later WITHOUT a schema change:
--   free_balance  = monthly free allowance (non-cumulative; reset lazily in app code each period)
--   paid_balance  = purchased / manually-granted credits (NEVER reset)
-- Spend order (app code): free first, then paid. checkEntitlement('chat_message') consults this
-- balance instead of the hourly bucket (spec: "0 crediti = stop"). Ledger records every movement.
create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  free_balance int not null default 0,
  free_period_start timestamptz,
  paid_balance int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_credits enable row level security;
-- Owner may READ their balance; all writes go through the app's service-role client (bypasses RLS).
create policy user_credits_select on public.user_credits
  for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta int not null,           -- negative = spend, positive = grant/top-up
  reason text not null,         -- 'chat_message' | 'monthly_free_grant' | 'manual_topup' | ...
  created_at timestamptz not null default now()
);
create index if not exists credit_transactions_user on public.credit_transactions (user_id, created_at);
alter table public.credit_transactions enable row level security;
create policy credit_transactions_select on public.credit_transactions
  for select to authenticated using ((select auth.uid()) = user_id);

-- Manual top-up path used BEFORE Stripe exists (spec decision A: "un modo per accreditare crediti
-- manualmente"). SECURITY DEFINER so it can be called with an admin/service context; adds to the
-- never-reset paid pool and records the movement.
create or replace function public.grant_paid_credits(p_user_id uuid, p_amount int, p_reason text default 'manual_topup')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be positive';
  end if;
  insert into public.user_credits (user_id, paid_balance)
  values (p_user_id, p_amount)
  on conflict (user_id) do update set paid_balance = public.user_credits.paid_balance + excluded.paid_balance,
                                      updated_at = now();
  insert into public.credit_transactions (user_id, delta, reason) values (p_user_id, p_amount, p_reason);
end;
$$;
