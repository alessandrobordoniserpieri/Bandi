import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CrossChatPanel } from "@/components/grants/cross-chat-panel";

export default async function AssistentePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  return (
    <main>
      <div className="page-header">
        <h1>Assistente bandi</h1>
        <p>Confronta e interroga i tuoi bandi salvati con una chat basata sul testo reale dei documenti.</p>
      </div>
      <section className="strong-panel">
        <CrossChatPanel />
      </section>
    </main>
  );
}
