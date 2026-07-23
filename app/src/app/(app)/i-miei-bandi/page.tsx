import { redirect } from "next/navigation";
import { Bookmark } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSavedGrants } from "@/lib/saved-grants/queries";
import { SAVED_STATUSES, SAVED_GRANTS_SLOT_LIMIT } from "@/lib/saved-grants/status";
import { KanbanColumn } from "@/components/saved-grants/kanban-column";
import { SlotCounter } from "@/components/saved-grants/slot-counter";
import { EmptyState } from "@/components/ui/empty-state";

export default async function IMieiBandiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const items = await getSavedGrants();

  return (
    <main>
      <div className="page-header">
        <h1>I miei bandi</h1>
        <SlotCounter count={items.length} limit={SAVED_GRANTS_SLOT_LIMIT} />
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={<Bookmark size={24} aria-hidden="true" />}
          title="Non hai ancora salvato bandi"
          description="Qui trovi i bandi che segui, organizzati per fase. Apri un bando che ti interessa e premi «Salva» per aggiungerlo alla tua bacheca."
          action={{ label: "Esplora bandi", href: "/" }}
        />
      ) : (
        <div className="kanban-board">
          {SAVED_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              items={items.filter((item) => item.status === status)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
