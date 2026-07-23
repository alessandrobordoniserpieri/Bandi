import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the grant detail page.
 * Mirrors the layout: title header, score hero (number + bar + badges),
 * and a stack of detail sections.
 */
export default function Loading() {
  return (
    <main aria-busy="true">
      <p role="status" className="sr-only">
        Caricamento del bando in corso…
      </p>

      <div aria-hidden="true">
        <div className="page-header">
          <Skeleton className="skeleton-heading" width="24rem" />
          <Skeleton className="skeleton-text" style={{ marginTop: "0.5rem" }} />
        </div>

        <div className="detail-hero">
          <div className="detail-score-block">
            <Skeleton width="3.5rem" height="2.5rem" />
            <Skeleton className="score-bar" height="0.25rem" style={{ marginTop: "0.5rem" }} />
          </div>
          <div className="detail-hero-badges">
            <Skeleton className="skeleton-badge" width="7rem" />
            <Skeleton className="skeleton-badge" width="6rem" />
          </div>
        </div>

        <div className="detail-body">
          {["18rem", "22rem", "16rem"].map((w, i) => (
            <section key={i} className="detail-section">
              <Skeleton height="1.25rem" width="10rem" style={{ marginBottom: "0.75rem" }} />
              <Skeleton className="skeleton-line" width={w} />
              <Skeleton className="skeleton-line" width="60%" style={{ marginTop: "0.5rem" }} />
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
