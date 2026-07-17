import { describe, it, expect } from "vitest";
import { extractAnchoredAmount, extractAnchoredPercentage, COFUNDING_SIGNAL_RE } from "../src/pipeline/economics";

const TOTAL_SIGNAL_RE = /ammontano|complessivamente|somma complessiva|messe a bando|a disposizione|destinate/i;

describe("extractAnchoredAmount", () => {
  it("picks the signal-sentence amount over an earlier unrelated euro mention", () => {
    const text = "Il Bando prevede il limite massimo di 200 euro per le spese in contanti. "
      + "Le risorse complessivamente a disposizione ammontano a 390.000 euro.";
    expect(extractAnchoredAmount(text, TOTAL_SIGNAL_RE)).toBe(390000);
  });

  it("returns null when no signal-matching sentence is present", () => {
    expect(extractAnchoredAmount("Il contributo massimo per progetto è di 50.000 euro.", TOTAL_SIGNAL_RE)).toBeNull();
  });

  it("works with a different signal regex (sport-governo phrasing)", () => {
    const sportGovernoSignal = /finanziat[ao] con|stanziat[oi]|stanziamento|ammontano a|dotazione di|finanziamento complessivo/i;
    const text = "Al riguardo, è stato stanziato un finanziamento complessivo pari ad euro 100 milioni, di cui € 30.000.000 per nuovi impianti. "
      + "I contributi massimi attribuibili sono i seguenti: importo massimo di euro 3.000.000,00.";
    expect(extractAnchoredAmount(text, sportGovernoSignal)).toBe(100_000_000);
  });
});

describe("extractAnchoredPercentage", () => {
  it("picks a cofunding percentage anchored to 'quota di cofinanziamento'", () => {
    const text = "È, in ogni caso, prevista una quota di cofinanziamento a carico del Comune richiedente pari ad almeno il 15% del contributo.";
    expect(extractAnchoredPercentage(text, COFUNDING_SIGNAL_RE)).toBe(15);
  });

  it("picks a cofunding percentage anchored to 'compartecipazione'", () => {
    const text = "L'iniziativa prevede una quota di compartecipazione del 15% da parte dei beneficiari.";
    expect(extractAnchoredPercentage(text, COFUNDING_SIGNAL_RE)).toBe(15);
  });

  it("ignores an unrelated percentage in the same text (tax-credit rate, not cofunding)", () => {
    // Real confounder (Sport Bonus): a 65% tax-credit rate has nothing to do with cofunding, and
    // must not be picked up just because it's the only "%" in the text.
    const text = "I soggetti che possono effettuare tali erogazioni sono esclusivamente le imprese, "
      + "a cui è riconosciuto un credito di imposta pari al 65% del versamento effettuato.";
    expect(extractAnchoredPercentage(text, COFUNDING_SIGNAL_RE)).toBeNull();
  });

  it("returns null when no percentage is present at all", () => {
    expect(extractAnchoredPercentage("Il bando è rivolto a enti pubblici.", COFUNDING_SIGNAL_RE)).toBeNull();
  });
});
