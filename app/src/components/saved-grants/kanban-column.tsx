import { STATUS_META, statusLabel, type SavedGrantStatus } from "@/lib/saved-grants/status";
import type { SavedGrantView } from "@/lib/saved-grants/queries";
import { SavedGrantCard } from "./saved-grant-card";

// One pipeline column: a colored heading + the cards currently in that status.
export function KanbanColumn({ status, items }: { status: SavedGrantStatus; items: SavedGrantView[] }) {
  return (
    <section aria-label={statusLabel(status)} style={{ minWidth: "220px", flex: "1 0 220px" }}>
      <h2 style={{ color: STATUS_META[status].color }}>
        {statusLabel(status)} <span>({items.length})</span>
      </h2>
      {items.length === 0
        ? <p>Nessun bando.</p>
        : items.map((item) => <SavedGrantCard key={item.savedGrantId} item={item} />)}
    </section>
  );
}
