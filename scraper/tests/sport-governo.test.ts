import { describe, it, expect } from "vitest";
import { htmlToLightMarkup, deriveEligibleTypes, shouldSkipNotice, deriveTags, parseSportGoverno } from "../src/pipeline/sport-governo";

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

describe("deriveEligibleTypes (dest -> LEGAL_TYPES, verified against 22 real notices 2026-07-17)", () => {
  it("maps sport-organization tokens", () => {
    expect(deriveEligibleTypes(["asd", "ssd"])).toEqual(
      expect.arrayContaining(["ASD - Associazione Sportiva Dilettantistica", "SSD - Società Sportiva Dilettantistica"]),
    );
  });

  it("maps eps/fed/dsa to the promozione-sportiva family", () => {
    const types = deriveEligibleTypes(["eps", "fed", "dsa"]);
    expect(types).toEqual(expect.arrayContaining([
      "EPS - Ente di Promozione Sportiva", "FSN - Federazione Sportiva Nazionale", "DSA - Disciplina Sportiva Associata",
    ]));
  });

  it("maps pa/company/ats/onlus directly", () => {
    expect(deriveEligibleTypes(["pa"])).toEqual(["Ente pubblico"]);
    expect(deriveEligibleTypes(["company"])).toEqual(["Impresa"]);
    expect(deriveEligibleTypes(["ats"])).toEqual(["Raggruppamento temporaneo / ATS"]);
    expect(deriveEligibleTypes(["onlus"])).toEqual(["ONLUS"]);
  });

  it("maps 'ets' to the broad ETS family WITHOUT duplicating ONLUS (a separate token here)", () => {
    const types = deriveEligibleTypes(["ets"]);
    expect(types).toContain("ETS - Ente del Terzo Settore");
    expect(types).toContain("Cooperativa sociale tipo A");
    expect(types).not.toContain("ONLUS");
  });

  it("maps religious/ecclesiastical dest tokens to real LEGAL_TYPES entries (corrects the initial wrong assumption — see ADR-010)", () => {
    expect(deriveEligibleTypes(["diocesi", "istituti_religiosi", "societa_vita_apostolica"]))
      .toEqual(["Ente ecclesiastico civilmente riconosciuto"]);
    expect(deriveEligibleTypes(["parrocchia", "ets_oratori"])).toEqual(["Parrocchia / Oratorio"]);
    expect(deriveEligibleTypes(["enti_ecclesiali"])).toEqual(["Ente religioso"]);
    expect(deriveEligibleTypes(["enti_altre_confessioni"])).toEqual(["Ente religioso"]);
  });

  it("returns [] for 'pf' (persona fisica — no organization equivalent)", () => {
    expect(deriveEligibleTypes(["pf"])).toEqual([]);
  });

  it("de-duplicates when multiple dest tokens map to the same type", () => {
    const types = deriveEligibleTypes(["parrocchia", "ets_oratori"]);
    expect(types).toEqual(["Parrocchia / Oratorio"]); // not duplicated
  });
});

describe("shouldSkipNotice (ADR-010)", () => {
  it("skips when dest is non-empty but maps to nothing (real case: dest: ['pf'])", () => {
    expect(shouldSkipNotice(["pf"])).toBe(true);
  });

  it("does NOT skip when dest is empty (no restriction stated, not 'restricted to something we lack')", () => {
    expect(shouldSkipNotice([])).toBe(false);
  });

  it("does NOT skip when at least one dest token maps to a real type", () => {
    expect(shouldSkipNotice(["pf", "asd"])).toBe(false);
    expect(shouldSkipNotice(["diocesi"])).toBe(false); // maps to "Ente ecclesiastico civilmente riconosciuto"
  });
});

describe("deriveTags", () => {
  it("always includes 'sport' (the whole source is sport-related)", () => {
    expect(deriveTags("Bando qualsiasi", "descrizione qualsiasi")).toContain("sport");
  });

  it("adds 'periferie' when the title mentions it", () => {
    expect(deriveTags("Sport e Periferie 2026", "")).toContain("periferie");
  });

  it("adds 'impianti sportivi' from title or description keywords", () => {
    expect(deriveTags("Fondo Perduto Impianti Sportivi - 2024", "")).toContain("impianti sportivi");
  });

  it("adds 'famiglie' when the text mentions it", () => {
    expect(deriveTags("Fondo dote per la Famiglia", "")).toContain("famiglie");
  });
});

// Real shape (avvisibandi.sport.governo.it, verified live 2026-07-17): the homepage embeds
// __NEXT_DATA__ with props.pageProps.notices[]. IDs/dest/titles below are the REAL values for 3 of
// the 22 real notices (descriptions trimmed for fixture readability, structure unchanged).
function nextDataHtml(notices: unknown[]): string {
  const data = { props: { pageProps: { notices, posts: [] } }, page: "/", query: {} };
  return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

describe("parseSportGoverno (listing)", () => {
  it("maps real notices to raw grant items, skipping the pf-only one", () => {
    const html = nextDataHtml([
      {
        _id: "699d5d516166f9f16884719b", title: "Sport e Periferie 2026",
        description: "<p>Al riguardo, è stato stanziato un finanziamento complessivo pari ad euro 100 milioni.</p>",
        image: "https://avvisibandi.sport.governo.it/api/static/notices/699d5d516166f9f16884719b/image.png",
        dest: ["pa"],
        schedule: { compilazione: { start: "2026-06-04T10:00:00.000Z", end: "2026-06-25T10:00:00.000Z" } },
      },
      {
        _id: "687e0a24ef7a47aa396ddbd1", title: "Fondo dote per la Famiglia - Candidatura BENEFICIARI",
        description: "<p>Candidatura riservata alle famiglie.</p>",
        image: "https://avvisibandi.sport.governo.it/api/static/notices/687e0a24ef7a47aa396ddbd1/image.png",
        dest: ["pf"],
        schedule: { compilazione: { start: "2025-01-01T00:00:00.000Z", end: "2025-02-01T00:00:00.000Z" } },
      },
      {
        _id: "696fa4cd7ab13ae68a3df7c5", title: "Avviso per la selezione di interventi infrastrutturali destinati agli ORATORI",
        description: "<p>Riservato a Diocesi e Istituti Religiosi.</p>",
        image: "https://avvisibandi.sport.governo.it/api/static/notices/696fa4cd7ab13ae68a3df7c5/image.png",
        dest: ["diocesi", "istituti_religiosi"],
        schedule: { compilazione: { start: "2026-07-16T10:00:00.000Z", end: "2026-10-16T10:00:00.000Z" } },
      },
    ]);

    const items = parseSportGoverno(html) as Array<Record<string, unknown>>;

    expect(items).toHaveLength(2); // the pf-only notice is skipped
    const periferie = items.find((i) => i.title === "Sport e Periferie 2026")!;
    expect(periferie.url).toBe("https://avvisibandi.sport.governo.it/bandi/699d5d516166f9f16884719b");
    expect(periferie.deadline).toBe("2026-06-25");
    expect(periferie.eligibleTypes).toEqual(["Ente pubblico"]);
    expect(periferie.geoScope).toBe("nazionale");
    expect(periferie.area).toBeNull();
    expect((periferie.summary as string)).toContain("finanziamento complessivo");

    const oratori = items.find((i) => (i.title as string).includes("ORATORI"))!;
    expect(oratori.eligibleTypes).toEqual(["Ente ecclesiastico civilmente riconosciuto"]);
  });

  it("returns [] on malformed input (no __NEXT_DATA__ marker)", () => {
    expect(parseSportGoverno("<html><body>not the right page</body></html>")).toEqual([]);
  });

  it("returns [] on malformed __NEXT_DATA__ JSON", () => {
    expect(parseSportGoverno('<script id="__NEXT_DATA__" type="application/json">{not json</script>')).toEqual([]);
  });

  it("derives status from schedule.compilazione.end vs today", () => {
    const past = nextDataHtml([{
      _id: "past1", title: "Bando scaduto", description: "<p>Testo.</p>",
      image: "", dest: ["pa"],
      schedule: { compilazione: { start: "2020-01-01T00:00:00.000Z", end: "2020-02-01T00:00:00.000Z" } },
    }]);
    const [item] = parseSportGoverno(past) as Array<Record<string, unknown>>;
    expect(item!.status).toBe("scaduto");
  });
});
