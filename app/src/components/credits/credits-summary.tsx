import type { CreditBalance } from "@/lib/ai/credits";

interface CreditsSummaryProps {
  balance: CreditBalance;
}

/**
 * "Crediti & piano" page body (DEC-6, concept §5.7): the real balance
 * (free/paid/total, no raw `free_balance`/`paid_balance` tokens on screen —
 * §6.3) plus the explanation of the two distinct mechanics so the two never
 * get confused: chat spends credits, quick analysis + document prep are a
 * separate daily rate-limit.
 */
export function CreditsSummary({ balance }: CreditsSummaryProps) {
  return (
    <>
      <div className="stats-row">
        <div className="stat-item">
          <span>Gratuiti questo mese</span>
          <strong>{balance.free}</strong>
        </div>
        <div className="stat-item">
          <span>Acquistati</span>
          <strong>{balance.paid}</strong>
        </div>
        <div className="stat-item">
          <span>Totale disponibile</span>
          <strong>{balance.total}</strong>
        </div>
      </div>

      <section className="settings-card" aria-labelledby="credits-mechanics-heading">
        <h2 id="credits-mechanics-heading">Come funzionano crediti e limiti</h2>
        <p>
          La <strong>chat con l&apos;assistente AI</strong> — sul singolo bando o cross-bando —
          consuma <strong>crediti</strong>: una quota gratuita si rinnova ogni mese (non si
          accumula da un mese all&apos;altro) e, quando finisce, si passa ai crediti acquistati.
        </p>
        <p>
          <strong>Analisi rapida</strong> e <strong>preparazione documenti</strong> non consumano
          crediti: hanno un <strong>limite giornaliero</strong> separato, indipendente dal saldo
          qui sopra.
        </p>
        <p>
          Attenzione: <strong>salvare un bando non</strong> è come prepararne i documenti. La
          preparazione scatta solo sui PDF nuovi — se un altro utente ha già preparato lo stesso
          bando, per te è gratuita.
        </p>
      </section>
    </>
  );
}
