import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState as BaseEmptyState } from "@/components/ui/empty-state";

/**
 * Empty state for the "Esplora bandi" list — a no-results state (filters matched
 * nothing). Built on the shared EmptyState primitive so it is actionable:
 * a way to widen the search and, when relevant, a nudge to complete the profile.
 */
export function EmptyState({
  profileComplete,
  novita = false,
}: {
  profileComplete: boolean;
  /** True when the "novità" (last 7 days) scope is active, so the empty result
   *  isn't mistaken for a broken list (DEC-1). */
  novita?: boolean;
}) {
  if (novita) {
    return (
      <BaseEmptyState
        icon={<SearchX size={24} aria-hidden="true" />}
        title="Nessuna novità negli ultimi 7 giorni"
        description="Nessun bando scoperto di recente corrisponde. Rimuovi il filtro novità per vedere tutti i bandi."
        action={{ label: "Mostra tutti i bandi", href: "/", variant: "outline" }}
      />
    );
  }
  return (
    <BaseEmptyState
      icon={<SearchX size={24} aria-hidden="true" />}
      title="Nessun bando corrisponde ai filtri attuali"
      description={
        profileComplete ? (
          "Prova ad allargare o azzerare i filtri per vedere più opportunità."
        ) : (
          <>
            Prova ad allargare i filtri, oppure{" "}
            <Link href="/profilo">completa il tuo profilo</Link> per sbloccare più corrispondenze.
          </>
        )
      }
      action={{ label: "Azzera i filtri", href: "/", variant: "outline" }}
    />
  );
}
