import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for "Crediti & piano" (DEC-6): the stats row (free/paid/
 * total) plus the two-mechanics explanation card.
 */
export default function Loading() {
  return (
    <main aria-busy="true">
      <p role="status" className="sr-only">
        Caricamento del saldo crediti in corso…
      </p>

      <div aria-hidden="true">
        <div className="page-header">
          <Skeleton className="skeleton-heading" />
          <Skeleton className="skeleton-text" style={{ marginTop: "0.5rem" }} />
        </div>

        <div className="stats-row">
          <Skeleton height="2.5rem" width="9rem" />
          <Skeleton height="2.5rem" width="9rem" />
          <Skeleton height="2.5rem" width="9rem" />
        </div>

        <div className="settings-card">
          <Skeleton className="skeleton-line" width="50%" style={{ marginBottom: "0.75rem" }} />
          <Skeleton className="skeleton-text" style={{ marginBottom: "0.5rem" }} />
          <Skeleton className="skeleton-text" style={{ marginBottom: "0.5rem" }} />
          <Skeleton className="skeleton-text" width="80%" />
        </div>
      </div>
    </main>
  );
}
