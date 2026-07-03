import type { Grant } from "./types";

export function deadlineDays(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline + "T23:59:59").getTime() - Date.now()) / 86400000);
}

export function isClosedGrant(grant: Grant): boolean {
  if (grant.status === "chiuso") return true;
  const days = deadlineDays(grant.deadline);
  return days != null && days < 0;
}
