import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for "Assistente" (the cross-grant chat).
 * Mirrors the panel: header, a note/credits line, and a chat transcript area.
 */
export default function Loading() {
  return (
    <main aria-busy="true">
      <p role="status" className="sr-only">
        Caricamento dell&apos;assistente in corso…
      </p>

      <div aria-hidden="true">
        <div className="page-header">
          <Skeleton className="skeleton-heading" />
          <Skeleton className="skeleton-text" style={{ marginTop: "0.5rem" }} />
        </div>

        <section className="strong-panel">
          <Skeleton className="skeleton-line" width="60%" style={{ marginBottom: "0.75rem" }} />
          <Skeleton className="skeleton-badge" width="14rem" style={{ marginBottom: "1.25rem" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Skeleton className="skeleton-block" height="3.5rem" width="75%" />
            <Skeleton className="skeleton-block" height="4.5rem" width="85%" style={{ alignSelf: "flex-end" }} />
            <Skeleton className="skeleton-block" height="3rem" width="65%" />
          </div>

          <Skeleton className="skeleton-block" height="4rem" style={{ marginTop: "1.25rem" }} />
        </section>
      </div>
    </main>
  );
}
