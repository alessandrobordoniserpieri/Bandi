import { describe, it, expect } from "vitest";
import { extractAnchoredAmount, extractAnchoredPercentage, COFUNDING_SIGNAL_RE, escalateEconomicsToLLM } from "../src/pipeline/economics";
import { FakeLLMProvider } from "../src/providers/fake";
import type { LLMProvider } from "../src/providers/types";

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

describe("escalateEconomicsToLLM", () => {
  it("resolves both amount and cofundingPercentage from one call", async () => {
    const TEXT = "Testo ambiguo del bando.";
    const llm = new FakeLLMProvider(new Map<string, unknown>([
      [TEXT, { totalAmount: "220.000", cofundingPercentage: "20" }],
    ]));
    const result = await escalateEconomicsToLLM(TEXT, llm);
    expect(result).toEqual({ amount: 220000, cofundingPercentage: 20 });
  });

  it("tolerates a response missing cofundingPercentage (older-shaped fixture)", async () => {
    const TEXT = "Testo ambiguo del bando.";
    const llm = new FakeLLMProvider(new Map<string, unknown>([[TEXT, { totalAmount: "220.000" }]]));
    const result = await escalateEconomicsToLLM(TEXT, llm);
    expect(result).toEqual({ amount: 220000, cofundingPercentage: null });
  });

  it("returns nulls, not a thrown error, when the LLM returns nothing usable", async () => {
    const TEXT = "Testo ambiguo del bando.";
    const llm = new FakeLLMProvider(new Map<string, unknown>([[TEXT, { totalAmount: null, cofundingPercentage: null }]]));
    expect(await escalateEconomicsToLLM(TEXT, llm)).toEqual({ amount: null, cofundingPercentage: null });
  });

  it("returns nulls, not a thrown error, when the LLM call itself fails", async () => {
    const llm: LLMProvider = { name: "boom", extract: async () => { throw new Error("provider down"); } };
    expect(await escalateEconomicsToLLM("qualunque testo", llm)).toEqual({ amount: null, cofundingPercentage: null });
  });

  it("returns nulls immediately for empty text, without calling the provider", async () => {
    const llm: LLMProvider = { name: "boom", extract: async () => { throw new Error("must not be called"); } };
    expect(await escalateEconomicsToLLM("", llm)).toEqual({ amount: null, cofundingPercentage: null });
  });

  // Real bug (verified live against regione.emilia-romagna.it/sport/bandi, 2026-07-20): Gemini
  // does NOT reliably answer totalAmount in Italian thousands-grouped notation. Real observed raw
  // strings for the SAME field: "1.000.000" (Italian, no decimals), "1.000.000,00" (Italian, with
  // decimals), "546700"/"100000" (plain digits), and "250000.00"/"150000.00" (decimal-point, no
  // grouping) — the last kind was silently inflated 100x (parseItalianAmount treats every "." as
  // a thousands separator), turning a real €150.000 bando into a saved 15.000.000.
  it("parses a bare decimal-point total (2-digit fraction, no thousands grouping) without inflating it 100x", async () => {
    const TEXT = "Testo ambiguo del bando.";
    const llm = new FakeLLMProvider(new Map<string, unknown>([[TEXT, { totalAmount: "150000.00" }]]));
    expect((await escalateEconomicsToLLM(TEXT, llm)).amount).toBe(150000);
  });

  it("still parses Italian thousands-grouped totals correctly (no regression)", async () => {
    const TEXT = "Testo ambiguo del bando.";
    const llm = new FakeLLMProvider(new Map<string, unknown>([[TEXT, { totalAmount: "1.000.000" }]]));
    expect((await escalateEconomicsToLLM(TEXT, llm)).amount).toBe(1000000);
  });

  it("still parses Italian thousands-grouped totals with a comma decimal tail (no regression)", async () => {
    const TEXT = "Testo ambiguo del bando.";
    const llm = new FakeLLMProvider(new Map<string, unknown>([[TEXT, { totalAmount: "1.000.000,00" }]]));
    expect((await escalateEconomicsToLLM(TEXT, llm)).amount).toBe(1000000);
  });

  it("parses a plain unformatted integer total", async () => {
    const TEXT = "Testo ambiguo del bando.";
    const llm = new FakeLLMProvider(new Map<string, unknown>([[TEXT, { totalAmount: "546700" }]]));
    expect((await escalateEconomicsToLLM(TEXT, llm)).amount).toBe(546700);
  });
});
