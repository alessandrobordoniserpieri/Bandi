import type { UrgencyGroup } from "@/lib/scadenze/group";
import { AgendaRow } from "./agenda-row";

// One urgency section of the Scadenze agenda (DEC-13) — a heading naming the
// bucket ("Questa settimana" / "Questo mese" / "Oltre") plus its rows.
export function UrgencyGroupSection({ group }: { group: UrgencyGroup }) {
  return (
    <section className="agenda-group" aria-labelledby={`agenda-${group.bucket}`}>
      <h2 id={`agenda-${group.bucket}`} className="agenda-group-title">
        {group.label} <span className="agenda-group-count">({group.items.length})</span>
      </h2>
      <ul className="agenda-list">
        {group.items.map((item) => (
          <AgendaRow key={item.savedGrantId} item={item} />
        ))}
      </ul>
    </section>
  );
}
