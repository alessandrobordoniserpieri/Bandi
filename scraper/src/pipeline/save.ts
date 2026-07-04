// scraper/src/pipeline/save.ts
import type { ExtractedGrant, GrantsDb } from "./types";
import { normalizeUrl, decide } from "./dedup";

export async function saveGrant(
  grant: ExtractedGrant,
  db: GrantsDb,
): Promise<"inserted" | "updated" | "skipped"> {
  // Normalize the url first so it is both the dedup lookup key and the value
  // that gets persisted — later reruns must find the same normalized url.
  const normalized = normalizeUrl(grant.url);
  const toStore: ExtractedGrant = { ...grant, url: normalized };
  const existing = await db.findByUrl(normalized);
  const decision = decide(toStore, existing);
  if (decision.action === "insert") {
    await db.insert(toStore);
    return "inserted";
  }
  if (decision.action === "update") {
    // existing is guaranteed non-null when action is "update" (see decide()).
    await db.update(existing!.id, decision.patch);
    return "updated";
  }
  return "skipped";
}
