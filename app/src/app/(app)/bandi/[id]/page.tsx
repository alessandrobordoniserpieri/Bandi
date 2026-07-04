// app/src/app/(app)/bandi/[id]/page.tsx
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import { getGrant } from "@/lib/grants/queries";
import { calculateMatch } from "@/lib/matching";
import { DeadlineBadge } from "@/components/grants/deadline-badge";
import { VerdictBadge } from "@/components/grants/verdict-badge";
import { ScoreBreakdown } from "@/components/grants/score-breakdown";
import { DocumentChecklist } from "@/components/grants/document-checklist";

export default async function BandoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  const view = await getGrant(id);
  if (!view) notFound();

  const { grant, providerName } = view;
  const match = calculateMatch(rowToEntityProfile(profile as ProfileRow), grant);

  return (
    <main>
      <h1>{grant.title}</h1>
      {providerName && <p>{providerName}</p>}

      <p>
        <strong>{match.score}</strong>/100{" "}
        <VerdictBadge verdict={match.verdict} />
      </p>

      <section>
        <h2>Indicatori</h2>
        <p>Scadenza: <DeadlineBadge indicator={match.indicators.deadline} /></p>
        <p>Cofinanziamento: {match.indicators.cofunding.label}</p>
        <p>Importo: {grant.amount != null ? `€ ${grant.amount.toLocaleString("it-IT")}` : "non specificato"}</p>
      </section>

      <section>
        <h2>Punteggio per dimensione</h2>
        <ScoreBreakdown breakdown={match.breakdown} />
      </section>

      <section>
        <h2>Documenti</h2>
        <DocumentChecklist missing={match.missingDocuments} />
      </section>

      {grant.summary && (<section><h2>Sintesi</h2><p>{grant.summary}</p></section>)}
      {grant.requirements && (<section><h2>Requisiti</h2><p>{grant.requirements}</p></section>)}
      {grant.beneficiaries && (<section><h2>Destinatari</h2><p>{grant.beneficiaries}</p></section>)}

      <section>
        <button type="button" disabled title="In arrivo">Salva</button>{" "}
        <button type="button" disabled title="In arrivo">Analisi AI approfondita</button>{" "}
        <a href={grant.url} target="_blank" rel="noopener noreferrer">Apri bando originale</a>
      </section>
    </main>
  );
}
