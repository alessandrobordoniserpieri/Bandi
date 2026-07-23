import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSavedGrants } from "@/lib/saved-grants/queries";
import { CrossChatPanel } from "@/components/grants/cross-chat-panel";
import { EmptyState } from "@/components/ui/empty-state";

export default async function AssistentePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  // The assistant reasons over the user's saved grants (the working set).
  // With none saved there is nothing to interrogate — show the way in.
  const savedGrants = await getSavedGrants();

  return (
    <main>
      <div className="page-header">
        <h1>Assistente bandi</h1>
        <p>Confronta e interroga i tuoi bandi salvati con una chat basata sul testo reale dei documenti.</p>
      </div>
      {savedGrants.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare size={24} aria-hidden="true" />}
          title="Nessun bando da interrogare, per ora"
          description="Salva dei bandi e preparane i documenti: l'assistente potrà poi rispondere a domande trasversali sul testo reale dei tuoi bandi."
          action={{ label: "Esplora bandi", href: "/" }}
        />
      ) : (
        <section className="strong-panel">
          <CrossChatPanel />
        </section>
      )}
    </main>
  );
}
