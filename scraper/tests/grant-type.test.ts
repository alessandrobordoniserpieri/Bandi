import { describe, it, expect } from "vitest";
import { classifyGrantType } from "../src/pipeline/grant-type";

describe("classifyGrantType", () => {
  // Real titles in production (2026-07-18).
  it("classifies the real 'Una giustizia più inclusiva' co-progettazione notice", () => {
    const title = "Avviso pubblico per l'individuazione e il coinvolgimento di Enti del Terzo " +
      "Settore disponibili alla co-progettazione nell'ambito del Piano \"Una giustizia più inclusiva\"";
    expect(classifyGrantType(title, null)).toBe("co_progettazione");
  });
  it("classifies the real 'selezione di eventi' notice as an ordinary bando", () => {
    expect(classifyGrantType(
      "Avviso di selezione di eventi di rilevanza nazionale e internazionale  - 2026", null,
    )).toBe("bando");
  });
  it("classifies the real ORATORI notice as an ordinary bando", () => {
    expect(classifyGrantType(
      "Avviso per la selezione di interventi infrastrutturali destinati agli ORATORI delle aree urbane più fragili",
      null,
    )).toBe("bando");
  });

  // Administrative notices — anchored to the START of the title.
  it("classifies a proroga notice (no 'avviso' prefix) as amministrativo", () => {
    expect(classifyGrantType(
      "Proroga dei termini per la presentazione delle domande - Avviso ORATORI 2026", null,
    )).toBe("amministrativo");
  });
  it("classifies an 'avviso di rettifica' notice as amministrativo", () => {
    expect(classifyGrantType(
      "Avviso di rettifica del bando \"Eventi sportivi 2026\"", null,
    )).toBe("amministrativo");
  });
  it("classifies an errata corrige notice as amministrativo", () => {
    expect(classifyGrantType("Errata corrige - Avviso pubblico eventi 2026", null)).toBe("amministrativo");
  });
  it("classifies an 'avviso di differimento' notice as amministrativo", () => {
    expect(classifyGrantType("Avviso di differimento termini bando cultura 2026", null)).toBe("amministrativo");
  });

  // The anchoring is deliberate: a REAL bando that merely mentions "proroga" mid-title (not as
  // its subject) must NOT be discarded — only a notice whose subject IS the modification.
  it("does NOT classify a bando as amministrativo when 'proroga' appears mid-title, not at the start", () => {
    expect(classifyGrantType(
      "Sostegno agli impianti sportivi: possibile proroga dei termini in caso di forza maggiore", null,
    )).toBe("bando");
  });

  // Ambiguous case: "manifestazione di interesse" can precede a co-progettazione or be a plain
  // procedural notice. Per design, ambiguous → co_progettazione (visible + labeled), never
  // amministrativo (irreversible discard) — scarting is riskier than mislabeling.
  it("classifies an ambiguous 'manifestazione di interesse' as co_progettazione, not amministrativo", () => {
    expect(classifyGrantType(
      "Manifestazione di interesse per la selezione di partner nell'ambito del progetto Comunità Educante",
      null,
    )).toBe("co_progettazione");
  });

  // co_progettazione must also be detected from the summary alone, when the title is bland —
  // title/summary are both available already at listing time.
  it("classifies via the summary when the title alone gives no signal", () => {
    expect(classifyGrantType(
      "Avviso pubblico 2026",
      "Il presente avviso invita alla co-progettazione di servizi socio-educativi.",
    )).toBe("co_progettazione");
  });

  // Separator variants: hyphen, space, or none between "co" and "progettazione"/"programmazione".
  it("matches 'co progettazione' (space) and 'coprogrammazione' (no separator)", () => {
    expect(classifyGrantType("Invito alla co progettazione di servizi", null)).toBe("co_progettazione");
    expect(classifyGrantType("Avviso di coprogrammazione territoriale", null)).toBe("co_progettazione");
  });

  it("does NOT match 'coprogettazione' as a substring of an unrelated word like 'ecoprogettazione'", () => {
    expect(classifyGrantType("Bando per progetti di ecoprogettazione dei prodotti", null)).toBe("bando");
  });

  it("defaults to bando when nothing matches and summary is null", () => {
    expect(classifyGrantType("Contributo per l'acquisto di attrezzature sportive", null)).toBe("bando");
  });
});
