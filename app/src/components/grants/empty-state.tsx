import Link from "next/link";

export function EmptyState({ profileComplete }: { profileComplete: boolean }) {
  return (
    <div className="empty-state">
      <p>Nessun bando corrisponde ai filtri attuali.</p>
      <p>Prova ad allargare i filtri.</p>
      {!profileComplete && (
        <p>
          Oppure <Link href="/profilo">completa il tuo profilo</Link> per sbloccare più corrispondenze.
        </p>
      )}
    </div>
  );
}
