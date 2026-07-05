// Shared authorization for the cron endpoint(s). The scheduler (Vercel Cron) sends
// `Authorization: Bearer <CRON_SECRET>`; we compare in constant time to avoid a timing oracle.
export function isAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false; // misconfigured: never authorize
  const expected = `Bearer ${secret}`;
  if (!authHeader || authHeader.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= authHeader.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
