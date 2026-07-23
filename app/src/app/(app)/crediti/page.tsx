import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreditBalance } from "@/lib/ai/credits";
import { CreditsSummary } from "@/components/credits/credits-summary";

export const dynamic = "force-dynamic";

// "Crediti & piano" (DEC-6, concept §5.7): the real balance behind the
// sidebar widget, plus the explanation of the two separate mechanics (chat
// spends credits; quick analysis + document prep are a daily rate-limit).
export default async function CreditiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const balance = await getCreditBalance(supabase, user.id);

  return (
    <main>
      <div className="page-header">
        <h1>Crediti &amp; piano</h1>
        <p>Il tuo saldo per la chat con l&apos;assistente AI e come funzionano i limiti giornalieri.</p>
      </div>
      <CreditsSummary balance={balance} />
    </main>
  );
}
