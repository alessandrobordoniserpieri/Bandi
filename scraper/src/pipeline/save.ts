// scraper/src/pipeline/save.ts
import type { ExtractedGrant, GrantsDb } from "./types";
import { normalizeUrl, decide, resolveSourceId } from "./dedup";

// docs/superpowers/specs/2026-07-20-source-id-detail-priority-attribution.md
export interface DetailAttributionContext {
  detailEnabledBySource: Map<string, boolean>; // currently-enabled sources only
  incomingDetailEnabled: boolean; // the archetype.detailEnabled of the source running right now
}

export async function saveGrant(
  grant: ExtractedGrant,
  db: GrantsDb,
  detailContext: DetailAttributionContext,
): Promise<"inserted" | "updated" | "skipped"> {
  const normalized = normalizeUrl(grant.url);
  const toStore: ExtractedGrant = { ...grant, url: normalized };

  // Check for an active (non-scaduto) record first — matches the partial unique index.
  const active = await db.findActiveByUrl(normalized);
  if (active) {
    toStore.sourceId = resolveSourceId(
      toStore.sourceId, active, detailContext.detailEnabledBySource, detailContext.incomingDetailEnabled,
    );
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
