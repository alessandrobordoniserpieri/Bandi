import { Skeleton } from "@/components/ui/skeleton";
import { SAVED_STATUSES } from "@/lib/saved-grants/status";

/**
 * Loading skeleton for "I miei bandi" (the Kanban board).
 * Mirrors the board: one column per pipeline status, each with a header chip
 * and a couple of card placeholders.
 */
export default function Loading() {
  return (
    <main aria-busy="true">
      <p role="status" className="sr-only">
        Caricamento dei bandi salvati in corso…
      </p>

      <div aria-hidden="true">
        <div className="page-header">
          <Skeleton className="skeleton-heading" />
        </div>

        <div className="kanban-board">
          {SAVED_STATUSES.map((status, colIndex) => (
            <section key={status} className="kanban-column">
              <div className="kanban-column-header" data-status={status}>
                <Skeleton width="8rem" height="0.875rem" />
              </div>
              {Array.from({ length: colIndex % 2 === 0 ? 2 : 1 }).map((_, i) => (
                <div key={i} className="skeleton-block skeleton-grant-card" style={{ marginBottom: "0.625rem" }}>
                  <div className="skeleton-grant-body">
                    <Skeleton className="skeleton-line" width="90%" />
                    <div className="skeleton-badge-row">
                      <Skeleton className="skeleton-badge" width="5rem" />
                      <Skeleton className="skeleton-badge" width="4rem" />
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
