import { describe, it, expect } from "vitest";
import { deriveRequiredDocuments } from "../src/pipeline/documents";

describe("deriveRequiredDocuments (prose -> DOCUMENT_KEYS checklist)", () => {
  it("extracts runts from real ER Sociale phrasing (verified live 2026-07-17)", () => {
    const text = "Possono partecipare gli Enti del Terzo Settore iscritti al RUNTS - Registro Unico Nazionale del Terzo Settore.";
    expect(deriveRequiredDocuments(text)).toEqual(["runts"]);
  });

  it("extracts rasd from real Sport events phrasing (verified live 2026-07-17)", () => {
    const text = "Le ASD/SSD devono risultare iscritte al Registro nazionale delle attività sportive dilettantistiche (RASD).";
    expect(deriveRequiredDocuments(text)).toEqual(["rasd"]);
  });

  it("extracts statuto and bilancio", () => {
    const text = "Alla domanda vanno allegati lo statuto dell'ente e l'ultimo bilancio approvato.";
    expect(deriveRequiredDocuments(text).sort()).toEqual(["bilancio", "statuto"]);
  });

  it("extracts durc from the full expansion", () => {
    const text = "È richiesto il DURC (Documento Unico di Regolarità Contributiva) in corso di validità.";
    expect(deriveRequiredDocuments(text)).toEqual(["durc"]);
  });

  it("extracts bilancio also from 'rendiconto'", () => {
    expect(deriveRequiredDocuments("Allegare il rendiconto economico dell'ultimo esercizio.")).toEqual(["bilancio"]);
  });

  it("returns [] when the prose mentions no known document (checklist stays empty → 'non disponibili')", () => {
    const text = "L'avviso finanzia interventi infrastrutturali negli oratori delle aree urbane più fragili.";
    expect(deriveRequiredDocuments(text)).toEqual([]);
  });

  it("returns [] on empty input", () => {
    expect(deriveRequiredDocuments("")).toEqual([]);
  });

  it("de-duplicates repeated mentions", () => {
    expect(deriveRequiredDocuments("Statuto ... lo statuto ... nuovamente statuto")).toEqual(["statuto"]);
  });
});
