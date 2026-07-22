-- 0020: close the same EXECUTE-to-PUBLIC hole already fixed twice for the credits functions
-- (0018 grant_paid_credits, 0019 consume_credit), found by a self-review pass to still be open
-- on four SECURITY DEFINER worker functions from V1/V2-A. Postgres grants EXECUTE to PUBLIC on
-- function creation by default, and Supabase exposes every public-schema function as an RPC — so
-- any caller (even anon, unauthenticated) could call these directly:
--   - claim_pending_document() / claim_document_for_embedding(): repeatedly re-claim documents,
--     starving the real cron worker (retrieval/extraction quality degrades or stalls indefinitely).
--   - trigger_extract_documents() / trigger_embed_documents(): fire the cron job on demand
--     (cost/DoS: burns LLM/OCR/embedding quota outside the schedule).
-- These are internal worker primitives; only the app's cron routes (via service_role) call them.
revoke execute on function public.claim_pending_document() from public, authenticated, anon;
revoke execute on function public.trigger_extract_documents() from public, authenticated, anon;
revoke execute on function public.claim_document_for_embedding() from public, authenticated, anon;
revoke execute on function public.trigger_embed_documents() from public, authenticated, anon;
