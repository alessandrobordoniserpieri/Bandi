// app/src/lib/ai/credits.ts
// V2-B(A) credit ledger (spec V2 Parte B, scope: infrastructure only, no payment processor yet).
// Two pools per user: free_balance (monthly allowance, reset lazily on first touch of a new
// calendar month, never accumulates across months) and paid_balance (manual top-ups via
// grant_paid_credits(), never reset). Spend order: free first, then paid.
//
// Writes always go through the ADMIN client (RLS on user_credits grants the user's own client
// SELECT only — see migration 0017 — a user-scoped client must never be able to increment its own
// balance).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const FREE_MONTHLY_CREDITS = 100;

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7); // "YYYY-MM"
}

interface CreditRow {
  free_balance: number;
  free_period_start: string | null;
  paid_balance: number;
}

// Resolves the FREE pool as of `now`, applying the lazy monthly reset without writing anything.
function resolveFree(data: CreditRow | null, now: Date): { free: number; needsReset: boolean } {
  const needsReset = !data?.free_period_start || monthKey(new Date(data.free_period_start)) !== monthKey(now);
  return { free: needsReset ? FREE_MONTHLY_CREDITS : data!.free_balance, needsReset };
}

export interface CreditBalance {
  free: number;
  paid: number;
  total: number;
}

// Read-only: what the user would see (or spend from) right now, including a not-yet-persisted
// reset. Safe to call from the user's own client (SELECT is allowed by RLS).
export async function getCreditBalance(
  admin: SupabaseClient<Database>,
  userId: string,
  now: Date = new Date(),
): Promise<CreditBalance> {
  const { data } = await admin
    .from("user_credits")
    .select("free_balance, free_period_start, paid_balance")
    .eq("user_id", userId)
    .maybeSingle();

  const { free } = resolveFree(data, now);
  const paid = data?.paid_balance ?? 0;
  return { free, paid, total: free + paid };
}

// Atomically spends 1 credit (free pool first, then paid) and records the movement. Returns
// { allowed: false } and writes nothing when both pools are empty.
export async function consumeCredit(
  admin: SupabaseClient<Database>,
  userId: string,
  reason: string,
  now: Date = new Date(),
): Promise<{ allowed: boolean }> {
  const { data } = await admin
    .from("user_credits")
    .select("free_balance, free_period_start, paid_balance")
    .eq("user_id", userId)
    .maybeSingle();

  const { free: resolvedFree, needsReset } = resolveFree(data, now);
  let free = resolvedFree;
  let paid = data?.paid_balance ?? 0;

  if (free <= 0 && paid <= 0) return { allowed: false };

  if (free > 0) free -= 1;
  else paid -= 1;

  const row = {
    user_id: userId,
    free_balance: free,
    paid_balance: paid,
    free_period_start: needsReset ? now.toISOString() : data!.free_period_start,
    updated_at: now.toISOString(),
  };

  const { error } = data
    ? await admin.from("user_credits").update(row).eq("user_id", userId)
    : await admin.from("user_credits").insert(row);
  if (error) return { allowed: false };

  await admin.from("credit_transactions").insert({ user_id: userId, delta: -1, reason });
  return { allowed: true };
}
