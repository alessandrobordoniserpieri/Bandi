// THROWAWAY preview route — renders GrantCard with mock data, no auth, for visual review only.
// Not committed. Delete along with the temporary /preview allowance in proxy-session.ts.
import { GrantCard } from "@/components/grants/grant-card";
import type { MatchedGrant } from "@/lib/grants/match-list";
import type { Verdict } from "@/lib/matching";

function mock(
  id: string,
  title: string,
  provider: string | null,
  score: number,
  verdict: Verdict,
  deadline: { days: number; color: "verde" | "giallo" | "rosso" | "nero"; label: string },
  amount: number | null,
  history?: { kind: string; label: string } | null,
): MatchedGrant {
  return {
    grant: {
      id, title, providerId: "p", eligibleTypes: [], tags: [], requiredDocuments: [],
      url: "https://example.it",
    },
    providerName: provider,
    match: {
      score, baseScore: score, verdict, breakdown: [], bonuses: [],
      indicators: {
        deadline,
        cofunding: { required: null, color: "grigio", label: "n/d" },
        economic: {
          ratio: null,
          level: amount != null ? "alla_tua_portata" : "da_verificare",
          label: amount != null ? "alla tua portata" : "da verificare",
          amount, budgetKnown: amount != null,
        },
      },
      historyBadge: history ?? null, missingDocuments: [], documentsKnown: false, actions: [],
    },
  } as unknown as MatchedGrant;
}

const cards: MatchedGrant[] = [
  mock("g1", "Bando per lo sport di base e la rigenerazione degli impianti sportivi 2026", "Fondazione Cariplo", 87, "Candidabile",
    { days: 42, color: "verde", label: "scade tra 42 giorni" }, 50000,
    { kind: "gia_finanziato", label: "Già finanziato da questo ente" }),
  mock("g2", "Contributi per progetti di inclusione sociale e contrasto alla povertà educativa", "Regione Emilia-Romagna", 64, "Da preparare",
    { days: 12, color: "giallo", label: "scade tra 12 giorni" }, 30000),
  mock("g3", "Avviso pubblico per il terzo settore — welfare di comunità", "Compagnia di San Paolo", 51, "Da valutare",
    { days: 90, color: "verde", label: "scade tra 90 giorni" }, null),
  mock("g4", "Bando cultura e periferie", null, 33, "Bassa priorità",
    { days: 4, color: "rosso", label: "scade tra 4 giorni" }, 15000),
  mock("g5", "Premio innovazione digitale per enti no-profit", "Fondazione TIM", 18, "Non compatibile",
    { days: 0, color: "nero", label: "scaduto" }, 100000),
];

export default function GrantCardPreview() {
  return (
    <main className="min-h-dvh bg-surface px-6 py-10 text-text">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold">Anteprima grant card (redesign shadcn)</h1>
          <p className="text-sm text-text-muted">Dati finti · pagina temporanea /preview · non committata</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-text-secondary">Densità: card</h2>
          {cards.map((c) => <GrantCard key={c.grant.id} matched={c} density="card" />)}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-text-secondary">Densità: compact</h2>
          {cards.map((c) => <GrantCard key={c.grant.id} matched={c} density="compact" />)}
        </section>
      </div>
    </main>
  );
}
