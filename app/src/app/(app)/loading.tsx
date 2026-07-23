import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for "Esplora bandi" (the grants-list home).
 * Mirrors the real layout: header, stats row, filter bar, then a list of
 * grant-card rows (score block + title/provider/badges).
 */
export default function Loading() {
  return (
    <main aria-busy="true">
      <p role="status" className="sr-only">
        Caricamento dei bandi in corso…
      </p>

      <div aria-hidden="true">
        <div className="page-header">
          <Skeleton className="skeleton-heading" />
          <Skeleton className="skeleton-text" style={{ marginTop: "0.5rem" }} />
        </div>

        <div className="stats-row">
          <Skeleton width="7rem" height="1.5rem" />
          <Skeleton width="7rem" height="1.5rem" />
          <Skeleton width="6rem" height="1.5rem" />
        </div>

        <Skeleton className="skeleton-block" height="2.5rem" style={{ marginBottom: "1.5rem" }} />

        <div className="skeleton-grant-list">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-grant-card">
              <Skeleton className="skeleton-grant-score" />
              <div className="skeleton-grant-body">
                <Skeleton className="skeleton-line" width="70%" />
                <Skeleton className="skeleton-line" width="40%" />
                <div className="skeleton-badge-row">
                  <Skeleton className="skeleton-badge" />
                  <Skeleton className="skeleton-badge" width="4.5rem" />
                  <Skeleton className="skeleton-badge" width="5.5rem" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
