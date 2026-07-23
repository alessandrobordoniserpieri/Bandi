import type { SavedGrantView } from "@/lib/saved-grants/queries";

// DEC-13: the three urgency buckets for the Scadenze agenda. No calendar —
// a flat list grouped by how soon action is needed.
export type UrgencyBucket = "questa-settimana" | "questo-mese" | "oltre";

export interface UrgencyGroup {
  bucket: UrgencyBucket;
  label: string;
  items: SavedGrantView[];
}

const BUCKET_LABELS: Record<UrgencyBucket, string> = {
  "questa-settimana": "Questa settimana",
  "questo-mese": "Questo mese",
  oltre: "Oltre",
};

// Half-open windows on `deadlineIndicator().days`: [0,7) this week, [7,30) this
// month. Everything else — 30+ days out, no deadline (null), or already past
// (negative, a closed grant still tracked in the pipeline) — falls into "Oltre",
// the catch-all least-urgent bucket.
function bucketFor(days: number | null): UrgencyBucket {
  if (days != null && days >= 0 && days < 7) return "questa-settimana";
  if (days != null && days >= 7 && days < 30) return "questo-mese";
  return "oltre";
}

/**
 * Groups saved grants by deadline urgency (DEC-13 §5.10), sorted ascending by
 * deadline within each group (missing deadlines sort last). Empty groups are
 * omitted so the page never renders a hollow "Oltre (0)" section.
 */
export function groupByUrgency(items: SavedGrantView[]): UrgencyGroup[] {
  const sorted = [...items].sort((a, b) => {
    const da = a.deadline.days ?? Number.POSITIVE_INFINITY;
    const db = b.deadline.days ?? Number.POSITIVE_INFINITY;
    return da - db;
  });

  const buckets: Record<UrgencyBucket, SavedGrantView[]> = {
    "questa-settimana": [],
    "questo-mese": [],
    oltre: [],
  };
  for (const item of sorted) {
    buckets[bucketFor(item.deadline.days)].push(item);
  }

  return (Object.keys(BUCKET_LABELS) as UrgencyBucket[])
    .map((bucket) => ({ bucket, label: BUCKET_LABELS[bucket], items: buckets[bucket] }))
    .filter((group) => group.items.length > 0);
}
