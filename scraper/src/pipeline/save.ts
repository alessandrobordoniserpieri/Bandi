// scraper/src/pipeline/save.ts
import type { ExtractedGrant, GrantsDb } from "./types";
import { normalizeUrl, decide } from "./dedup";

export async function saveGrant(
  grant: ExtractedGrant,
  db: GrantsDb,
): Promise<"inserted" | "updated" | "skipped"> {
  const normalized = normalizeUrl(grant.url);
  const toStore: ExtractedGrant = { ...grant, url: normalized };

  // Check for an active (non-scaduto) record first — matches the partial unique index.
  const active = await db.findActiveByUrl(normalized);
  if (active) {
    const decision = decide(toStore, active);
    if (decision.action === "update") {
      await db.update(active.id, decision.patch);
      return "updated";
    }
    return "skipped";
  }

  // No active record — check if a scaduto/chiuso record exists for edition-aware dedup.
  const existing = await db.findByUrl(normalized);
  const decision = decide(toStore, existing);
  if (decision.action === "insert") {
    await db.insert(toStore);
    return "inserted";
  }
  return "skipped";
}
