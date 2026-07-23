import Link from "next/link";
import type { SavedGrantView } from "@/lib/saved-grants/queries";
import { VerdictBadge } from "@/components/grants/verdict-badge";
import { DeadlineBadge } from "@/components/grants/deadline-badge";
import { StatusBadge } from "@/components/saved-grants/status-badge";

// One row of the Scadenze agenda (DEC-13): title → provider → verdetto +
// stato pipeline + scadenza. Mirrors the Kanban card's title/provider
// hierarchy (§5.10 reuses the same at-a-glance cues, no 6-dimension detail).
export function AgendaRow({ item }: { item: SavedGrantView }) {
  return (
    <li className="agenda-row">
      <div className="agenda-row-main">
        <h3 className="agenda-row-title">
          <Link href={`/bandi/${item.grant.id}`}>{item.grant.title}</Link>
        </h3>
        {item.providerName && <p className="agenda-row-provider">{item.providerName}</p>}
      </div>
      <div className="agenda-row-badges">
        {item.verdict && <VerdictBadge verdict={item.verdict} />}
        <StatusBadge status={item.status} />
        <DeadlineBadge indicator={item.deadline} />
      </div>
    </li>
  );
}
