import { statusLabel, type SavedGrantStatus } from "@/lib/saved-grants/status";
import type { SavedGrantView } from "@/lib/saved-grants/queries";
import { SavedGrantCard } from "./saved-grant-card";

export function KanbanColumn({ status, items }: { status: SavedGrantStatus; items: SavedGrantView[] }) {
  return (
    <section className="kanban-column" aria-label={statusLabel(status)}>
      <div className="kanban-column-header" data-status={status}>
        {statusLabel(status)} <span className="kanban-column-count">({items.length})</span>
      </div>
      {items.length === 0
        ? <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", padding: "0.5rem 0.75rem" }}>Nessun bando.</p>
        : items.map((item) => <SavedGrantCard key={item.savedGrantId} item={item} />)}
    </section>
  );
}
