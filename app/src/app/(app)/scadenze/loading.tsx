import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for "Scadenze" (the urgency agenda).
 * Mirrors the real layout: header, then 2 urgency sections each with a
 * heading placeholder and a couple of row placeholders (title + badge row).
 */
export default function Loading() {
  return (
    <main aria-busy="true">
      <p role="status" className="sr-only">
        Caricamento delle scadenze in corso…
      </p>

      <div aria-hidden="true">
        <div className="page-header">
          <Skeleton className="skeleton-heading" />
          <Skeleton className="skeleton-text" style={{ marginTop: "0.5rem" }} />
        </div>

        <div className="agenda">
          {Array.from({ length: 2 }).map((_, groupIndex) => (
            <section key={groupIndex} className="agenda-group">
              <Skeleton width="8rem" height="1rem" style={{ marginBottom: "0.625rem" }} />
              <ul className="agenda-list">
                {Array.from({ length: groupIndex === 0 ? 2 : 1 }).map((_, i) => (
                  <li key={i} className="skeleton-block agenda-row" style={{ display: "block" }}>
                    <Skeleton className="skeleton-line" width="65%" />
                    <div className="skeleton-badge-row">
                      <Skeleton className="skeleton-badge" />
                      <Skeleton className="skeleton-badge" width="5.5rem" />
                      <Skeleton className="skeleton-badge" width="4.5rem" />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
