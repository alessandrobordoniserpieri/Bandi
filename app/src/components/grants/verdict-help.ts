import type { Verdict } from "@/lib/matching";

// Explanatory copy for each verdict badge — what it means and what to do next.
// Concept §6.3: verdicts previously had no actionable context, and "Non compatibile"
// was a bare label with no next step.
export const VERDICT_HELP: Record<Verdict, string> = {
  Candidabile:
    "Il profilo soddisfa i criteri principali del bando: puoi candidarti subito.",
  "Da preparare":
    "Compatibilità alta, ma mancano documenti richiesti: completali per poterti candidare.",
  "Da valutare":
    "Compatibilità parziale: valuta con attenzione se conviene investire tempo nella candidatura.",
  "Bassa priorità":
    "Compatibilità bassa: valuta prima altri bandi più in linea con il tuo profilo.",
  "Non compatibile":
    "Il profilo non soddisfa i criteri principali di questo bando. Aggiorna il profilo o cerca altri bandi più in linea con il tuo ambito.",
  Storico:
    "Bando chiuso: resta visibile per riferimento, ma non è più candidabile.",
};
