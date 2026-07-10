import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import { getGrant } from "@/lib/grants/queries";
import { getSavedGrantByGrantId } from "@/lib/saved-grants/queries";
import { SaveButton } from "@/components/saved-grants/save-button";
import { AIAnalysisPanel } from "@/components/grants/ai-analysis-panel";
import { calculateMatch } from "@/lib/matching";
import { DeadlineBadge } from "@/components/grants/deadline-badge";
import { VerdictBadge } from "@/components/grants/verdict-badge";
import { AmountBadge } from "@/components/grants/amount-badge";
import { HistoryBadge } from "@/components/grants/history-badge";
import { ScoreBreakdown } from "@/components/grants/score-breakdown";
import { DocumentChecklist } from "@/components/grants/document-checklist";

const FUNDING_TYPE_LABELS: Record<string, string> = {
  fondo_perduto: "Fondo perduto",
  prestito_agevolato: "Prestito agevolato",
  contributo_misto: "Contributo misto",
  garanzia: "Garanzia",
  premio: "Premio",
};
function fundingTypeLabel(type: string): string {
  return FUNDING_TYPE_LABELS[type] ?? type;
}

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
  const saved = await getSavedGrantByGrantId(grant.id);
  const match = calculateMatch(rowToEntityProfile(profile as ProfileRow), grant);

  return (
    <main>
      <div className="page-header">
        <h1>{grant.title}</h1>
        {providerName && <p>{providerName}</p>}
      </div>

      <div className="detail-hero">
        <div className="detail-score-block" aria-label={`Punteggio di compatibilità: ${match.score} su 100`}>
          <div className="detail-score-number">
            <strong>{match.score}</strong>
            <span>/100</span>
          </div>
          <div className="score-bar">
            <div className="score-bar-fill" data-verdict={match.verdict} style={{ width: `${match.score}%` }} />
          </div>
        </div>
        <div className="detail-hero-badges">
          <VerdictBadge verdict={match.verdict} />
          {match.historyBadge && <HistoryBadge badge={match.historyBadge} />}
        </div>
      </div>

      <section className="detail-section">
        <h2>Indicatori</h2>
        <p>Scadenza: <DeadlineBadge indicator={match.indicators.deadline} /></p>
        <p>Cofinanziamento: {match.indicators.cofunding.label}</p>
        <p>Importo: <AmountBadge indicator={match.indicators.economic} /></p>
        {!match.indicators.economic.budgetKnown && (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            Aggiungi il budget annuale nel{" "}
            <a href="/profilo">tuo profilo (sezione capacità)</a> per valutare la coerenza economica.
          </p>
        )}
      </section>

      <section className="detail-section">
        <h2>Punteggio per dimensione</h2>
        <ScoreBreakdown breakdown={match.breakdown} />
      </section>

      <section className="detail-section">
        <h2>Documenti</h2>
        <DocumentChecklist missing={match.missingDocuments} />
      </section>

      {grant.summary && (
        <section className="detail-section">
          <h2>Sintesi</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>{grant.summary}</p>
        </section>
      )}

      {(grant.fundingType || grant.minAmount != null || grant.maxAmount != null || grant.cofundingPercentage != null) && (
        <section className="detail-section">
          <h2>Dettagli economici</h2>
          <dl className="detail-fields">
            {grant.fundingType && <><dt>Tipo di finanziamento</dt><dd>{fundingTypeLabel(grant.fundingType)}</dd></>}
            {grant.minAmount != null && <><dt>Importo minimo</dt><dd>€ {grant.minAmount.toLocaleString("it-IT")}</dd></>}
            {grant.maxAmount != null && <><dt>Importo massimo</dt><dd>€ {grant.maxAmount.toLocaleString("it-IT")}</dd></>}
            {grant.cofundingPercentage != null && <><dt>Cofinanziamento richiesto</dt><dd>{grant.cofundingPercentage}%</dd></>}
          </dl>
        </section>
      )}

      {grant.requirements && (
        <section className="detail-section">
          <h2>Requisiti</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>{grant.requirements}</p>
        </section>
      )}
      {grant.beneficiaries && (
        <section className="detail-section">
          <h2>Destinatari</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>{grant.beneficiaries}</p>
        </section>
      )}
      {grant.eligibleExpenses && (
        <section className="detail-section">
          <h2>Spese ammissibili</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>{grant.eligibleExpenses}</p>
        </section>
      )}
      {grant.applicationMethod && (
        <section className="detail-section">
          <h2>Modalità di presentazione</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>{grant.applicationMethod}</p>
        </section>
      )}
      {grant.contactInfo && (
        <section className="detail-section">
          <h2>Contatti</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>{grant.contactInfo}</p>
        </section>
      )}
      {grant.openingDate && (
        <section className="detail-section">
          <h2>Data di apertura</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{grant.openingDate}</p>
        </section>
      )}

      <section className="detail-section" style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <SaveButton grantId={grant.id} initialStatus={saved?.status ?? null} />
        <a href={grant.url} target="_blank" rel="noopener noreferrer" className="btn-primary">
          Apri bando originale
        </a>
      </section>

      <AIAnalysisPanel grantId={grant.id} />
    </main>
  );
}
