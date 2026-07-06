import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSavedGrants } from "@/lib/saved-grants/queries";
import { SAVED_STATUSES } from "@/lib/saved-grants/status";
import { KanbanColumn } from "@/components/saved-grants/kanban-column";

export default async function IMieiBandiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const items = await getSavedGrants();

  return (
    <main>
      <h1>I miei bandi</h1>
      {items.length === 0 && (
        <p>Non hai ancora salvato bandi. Apri un bando e premi «Salva».</p>
      )}
      <div style={{ display: "flex", gap: "1rem", overflowX: "auto" }}>
        {SAVED_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            items={items.filter((item) => item.status === status)}
          />
        ))}
      </div>
    </main>
  );
}
