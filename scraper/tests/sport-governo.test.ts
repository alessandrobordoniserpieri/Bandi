import { describe, it, expect } from "vitest";
import { htmlToLightMarkup } from "../src/pipeline/sport-governo";

describe("htmlToLightMarkup", () => {
  it("transcribes a real Oratori-bando description (verified live, avvisibandi.sport.governo.it 2026-07-17)", () => {
    // Real fetched HTML (trimmed to the parts this test checks — full field is ~3.7KB).
    const html = [
      "<b>Avviso per la selezione di progetti destinati agli oratori delle aree urbane più fragili</b>",
      "",
      "<p>\n    A seguito della firma del Protocollo d'intesa tra il Ministro per lo Sport e i Giovani,\n    <strong>Andrea Abodi</strong>, e il Presidente della CEI, avvenuta il 1° luglio u.s., viene pubblicato oggi l'Avviso.\n</p>",
      "",
      "<p>\n    In particolare, le risorse saranno impiegate per:\n</p>",
      "",
      "<ul>\n    <li>la realizzazione di nuovi playground;</li>\n    <li>la riqualificazione di impianti sportivi esistenti;</li>\n</ul>",
      "",
      "<h3>Interventi ammissibili</h3>",
      "",
      "<p>\n    I progetti dovranno prevedere interventi:\n</p>",
      "",
      "<p>\n    <a href=\"mailto:impiantisticasportiva@governo.it\">\n        impiantisticasportiva@governo.it\n    </a>\n</p>",
    ].join("\n\n");

    const result = htmlToLightMarkup(html);
    const lines = result.split("\n");

    expect(lines).toContain("Avviso per la selezione di progetti destinati agli oratori delle aree urbane più fragili");
    expect(lines).toContain("A seguito della firma del Protocollo d'intesa tra il Ministro per lo Sport e i Giovani, Andrea Abodi, e il Presidente della CEI, avvenuta il 1° luglio u.s., viene pubblicato oggi l'Avviso.");
    expect(lines).toContain("- la realizzazione di nuovi playground;");
    expect(lines).toContain("- la riqualificazione di impianti sportivi esistenti;");
    expect(lines).toContain("### Interventi ammissibili");
    expect(lines).toContain("impiantisticasportiva@governo.it");
  });

  it("maps h1/h2 to '## ' (synthetic — no h1/h2 observed live, only h3)", () => {
    const html = "<h2>Finalità</h2>\n\n<p>Testo del paragrafo.</p>";
    expect(htmlToLightMarkup(html).split("\n")).toEqual(["## Finalità", "Testo del paragrafo."]);
  });

  it("groups all <li> of one <ul> under consecutive '- ' lines, in order", () => {
    const html = "<ul><li>uno</li><li>due</li><li>tre</li></ul>";
    expect(htmlToLightMarkup(html).split("\n")).toEqual(["- uno", "- due", "- tre"]);
  });

  it("strips inline formatting tags (strong/em/u/span/a) to plain text", () => {
    const html = "<p>Enti del <strong>Terzo Settore</strong> e <em>ASD</em> possono <span>partecipare</span>.</p>";
    expect(htmlToLightMarkup(html)).toBe("Enti del Terzo Settore e ASD possono partecipare.");
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToLightMarkup("")).toBe("");
  });
});
