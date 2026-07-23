import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for "Il mio profilo" (DEC-4 sub-nav shell).
 * Mirrors .profile-layout: a sub-nav rail placeholder + one section panel.
 */
export default function Loading() {
  return (
    <main aria-busy="true">
      <p role="status" className="sr-only">
        Caricamento del profilo in corso…
      </p>

      <div aria-hidden="true">
        <div className="page-header">
          <Skeleton className="skeleton-heading" />
        </div>
        <Skeleton className="skeleton-line" width="60%" />

        <div className="profile-layout">
          <nav className="profile-subnav">
            <ul>
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} style={{ padding: "0.5rem 0.75rem" }}>
                  <Skeleton width="80%" height="0.875rem" />
                </li>
              ))}
            </ul>
          </nav>
          <div className="profile-section-panel">
            <Skeleton className="skeleton-heading" width="40%" />
            <Skeleton className="skeleton-line" width="95%" style={{ marginTop: "1rem" }} />
            <Skeleton className="skeleton-line" width="85%" />
            <Skeleton className="skeleton-line" width="70%" />
          </div>
        </div>
      </div>
    </main>
  );
}
