-- 0018: security fix — grant_paid_credits was executable by any authenticated user (default
-- PostgreSQL PUBLIC execute grant on function creation), meaning a logged-in user could call
-- supabase.rpc('grant_paid_credits', {p_user_id: <own id>, p_amount: 999999}) and self-credit.
-- Restrict to service_role / postgres only — the app must call this via the admin client.
revoke execute on function public.grant_paid_credits(uuid, int, text) from public, authenticated, anon;
