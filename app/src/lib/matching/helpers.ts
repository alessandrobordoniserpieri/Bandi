import type { Grant } from "./types";

export function deadlineDays(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline + "T23:59:59").getTime() - Date.now()) / 86400000);
}

export function isClosedGrant(grant: Grant): boolean {
  if (grant.status === "chiuso" || grant.status === "scaduto") return true;
  const days = deadlineDays(grant.deadline);
  // <= 0: a just-passed deadline ceils to -0/0; a future "closes today" deadline
  // yields 1 (end-of-day anchor), so 0 means the deadline has passed.
  return days != null && days <= 0;
}
