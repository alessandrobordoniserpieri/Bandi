import { describe, it, expect } from "vitest";
import { resolveArchetype } from "../src/pipeline/archetypes";
import { parseErSociale, parseDetailErSociale, extractTotalFromProse } from "../src/pipeline/er-sociale";
import { FakeLLMProvider } from "../src/providers/fake";
import { runPipeline } from "../src/pipeline/run";
import { extractGrants } from "../src/pipeline/extract-grants";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import type { PageFetcher, RawPage, SourceConfig } from "../src/pipeline/types";
import type { LLMProvider } from "../src/providers/types";

// For tests asserting the deterministic path never escalates.
const NO_LLM: LLMProvider = { name: "boom", extract: async () => { throw new Error("must not be called"); } };

// ISO date N days from now, so status assertions (which compare the deadline to "today") don't
// rot: item0 uses a FUTURE deadline (still applicable), item1 a PAST one (expired).
const isoInDays = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const FUTURE = isoInDays(60);
const PAST = isoInDays(-60);

// Minimal but shape-faithful @search response: metadata_fields flatten destinatari/materie to
// plain string arrays; non-Bando items (File/Link) appear when the filter is missing and must
// be skipped.
export const searchFixture = JSON.stringify({
  "@id": "https://sociale.example/@search",
  items_total: 2,
  items: [
    {
      "@id": "https://sociale.example/bandi/2025/bando-alimentare",
      "@type": "Bando",
      title: "Bando recupero alimentare 2025",
      description: "Con 1.000.000 euro di risorse per persone in condizione di povertà.",
      scadenza_bando: `${FUTURE}T10:00:00+00:00`,
      bando_state: ["inProgress", "In corso"],
      destinatari: ["Enti del Terzo settore"],
      materie: ["Diritti e sociale"],
    },
    {
      "@id": "https://sociale.example/bandi/2024/bando-adolescenza",
      "@type": "Bando",
      title: "Bando interventi per adolescenti",
      description: "600.000 euro per progetti rivolti a preadolescenti e adolescenti.",
      scadenza_bando: `${PAST}T11:00:00+00:00`,
      bando_state: ["closed", "Chiuso"],
      destinatari: ["Enti pubblici"],
      materie: ["Diritti e sociale"],
    },
    { "@id": "https://sociale.example/doc.pdf", "@type": "File", title: "un pdf" },
  ],
});

describe("er-sociale listing parser", () => {
  it("parses Bando items from the @search JSON, skipping other types", () => {
    const items = parseErSociale(searchFixture) as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Bando recupero alimentare 2025",
      url: "https://sociale.example/bandi/2025/bando-alimentare",
      deadline: FUTURE,
      status: "aperto",
      area: "Emilia-Romagna",
      geoScope: "regionale",
      beneficiaries: "Enti del Terzo settore",
    });
    // Past deadline wins over bando_state: "scaduto", not "chiuso".
    expect(items[1]).toMatchObject({ status: "scaduto", deadline: PAST });
  });

  it("marks a past application deadline 'scaduto' even when bando_state is still In corso", () => {
    const inCorsoButExpired = JSON.stringify({
      items: [{
        "@id": "https://sociale.example/bandi/x", "@type": "Bando", title: "X",
        scadenza_bando: `${PAST}T10:00:00+00:00`, bando_state: ["inProgress", "In corso"],
      }],
    });
    expect((parseErSociale(inCorsoButExpired)[0] as Record<string, unknown>).status).toBe("scaduto");
  });

  it("derives eligibleTypes with the broad ETS family (D.Lgs 117/2017)", () => {
    const items = parseErSociale(searchFixture) as Array<Record<string, unknown>>;
    const ets = items[0]!.eligibleTypes as string[];
    expect(ets).toContain("ETS - Ente del Terzo Settore");
    expect(ets).toContain("Cooperativa sociale tipo A");
    expect(ets).toContain("Fondazione ETS");
    expect(items[1]!.eligibleTypes).toEqual(["Ente pubblico"]);
  });

  it("derives tags from materie + keyword rules on title/description", () => {
    const items = parseErSociale(searchFixture) as Array<Record<string, unknown>>;
    expect(items[0]!.tags).toEqual(expect.arrayContaining(["welfare", "contrasto povertà"]));
    expect(items[1]!.tags).toEqual(expect.arrayContaining(["welfare", "giovani"]));
  });

  it("passes the raw description through as amount (extraction happens downstream in coerce)", () => {
    const items = parseErSociale(searchFixture) as Array<Record<string, unknown>>;
    expect(items[0]!.amount).toBe("Con 1.000.000 euro di risorse per persone in condizione di povertà.");
  });

  it("extractGrants (via coerce's parseItalianAmount) turns the description into a final number", async () => {
    const llm: LLMProvider = { name: "boom", extract: async () => { throw new Error("must not be called"); } };
    const out = await extractGrants(
      { sourceId: "s1", url: "https://sociale.example/@search", html: searchFixture },
      { llm, db: new InMemoryGrantsDb() },
      resolveArchetype("er-sociale"),
    );
    expect(out.find((g) => g.title.includes("alimentare"))?.amount).toBe(1000000);
    expect(out.find((g) => g.title.includes("adolescenti"))?.amount).toBe(600000);
  });

  it("returns [] on malformed or unexpected JSON (LLM fallback contract)", () => {
    expect(parseErSociale("not json")).toEqual([]);
    expect(parseErSociale('{"no":"items"}')).toEqual([]);
  });

  it("is registered with fetch-friendly settings", () => {
    const a = resolveArchetype("er-sociale");
    expect(a.name).toBe("er-sociale");
    expect(a.urlSnapping).toBe(false);
    expect(a.detailEnabled).toBe(true);
    expect(a.sanitize("{\"x\":1}")).toBe("{\"x\":1}"); // identity: JSON must not be HTML-sanitized
  });
});

// The full Bando object (detail GET on the grant's own URL): destinatari/materie become
// {title, token} objects, rich text is Volto "slate" blocks, attachments live in
// approfondimento[].children[].
export const detailFixture = JSON.stringify({
  "@id": "https://sociale.example/bandi/2025/bando-alimentare",
  "@type": "Bando",
  title: "Bando recupero alimentare 2025",
  description: "Con 1.000.000 euro di risorse.",
  apertura_bando: "2025-08-01T08:00:00",
  scadenza_bando: "2025-09-30T10:00:00+00:00",
  bando_state: ["inProgress", "In corso"],
  destinatari: [{ title: "Enti del Terzo settore", token: "Enti del Terzo settore" }],
  materie: [{ title: "Diritti e sociale", token: "Diritti e sociale" }],
  riferimenti: {
    blocks: { a: { "@type": "slate", plaintext: "Viviana Bussadori viviana@regione.example" } },
    blocks_layout: { items: ["a"] },
  },
  text: {
    blocks: { b: { "@type": "slate", plaintext: "Le spese ammissibili sono quelle direttamente imputabili." } },
    blocks_layout: { items: ["b"] },
  },
  approfondimento: [{
    children: [
      { title: "Bando definitivo.pdf", url: "https://sociale.example/allegato.pdf", mime_type: "application/pdf" },
      { title: "senza url" },
    ],
  }],
});

describe("er-sociale detail parser", () => {
  it("maps the full Bando object to a DetailGrant without any LLM", async () => {
    const d = (await parseDetailErSociale(detailFixture, NO_LLM))!;
    expect(d.openingDate).toBe("2025-08-01");
    expect(d.deadline).toBe("2025-09-30");
    expect(d.contactInfo).toContain("Bussadori");
    expect(d.requirements).toContain("spese ammissibili");
    expect(d.summary).toContain("1.000.000 euro");
    expect(d.amount).toBe(1000000);
    expect(d.beneficiaries).toBe("Enti del Terzo settore");
    expect(d.eligibleTypes).toContain("Cooperativa sociale tipo B");
    expect(d.tags).toContain("welfare");
    // Children without a url are dropped, never half-mapped.
    expect(d.attachments).toEqual([
      { title: "Bando definitivo.pdf", url: "https://sociale.example/allegato.pdf", mimeType: "application/pdf" },
    ]);
  });

  it("returns null on malformed JSON or a non-Bando object", async () => {
    expect(await parseDetailErSociale("boh", NO_LLM)).toBeNull();
    expect(await parseDetailErSociale('{"@type":"Document"}', NO_LLM)).toBeNull();
  });

  it("picks the TOTAL, not the sum of a territorial breakdown, when the source states both", async () => {
    // Real shape (Regione Emilia-Romagna, verified live): a stated total followed by a
    // territorial split. The bug this guards against: an order-sensitive regex or a
    // whole-string-must-be-a-number parser would return null here instead of the total.
    const fixtureWithBreakdown = JSON.stringify({
      "@id": "https://sociale.example/bandi/x", "@type": "Bando", title: "Avviso",
      description: "",
      text: {
        blocks: { a: {
          plaintext: "Le risorse complessivamente destinate ammontano a euro 1.371.182,26. "
            + "Ripartizione territoriale: Raggruppamento Ovest: euro 843.522,70; Raggruppamento Est: euro 527.659,58.",
        } },
        blocks_layout: { items: ["a"] },
      },
    });
    expect((await parseDetailErSociale(fixtureWithBreakdown, NO_LLM))!.amount).toBe(1371182.26);
  });

  it("encodes headings, bold-only subsection labels and bullet lists as light markup (verified live shape)", async () => {
    const fixtureWithStructure = JSON.stringify({
      "@id": "https://sociale.example/bandi/y", "@type": "Bando", title: "Avviso", description: "",
      text: {
        blocks: {
          heading: {
            plaintext: "Finalità",
            value: [{ type: "h2", children: [{ text: "Finalità" }] }],
          },
          subheading: {
            plaintext: "Ripartizione territoriale:",
            value: [{ type: "h3", children: [{ text: "Ripartizione territoriale:" }] }],
          },
          boldLabel: {
            // Real shape: the WHOLE paragraph is one bold run flanked by empty text nodes.
            plaintext: " 1 Residenzialità temporanea ",
            value: [{ type: "p", children: [
              { text: "" },
              { type: "strong", children: [{ text: "1 Residenzialità temporanea" }] },
              { text: "" },
            ] }],
          },
          partiallyBold: {
            // Only PART of the sentence is bold — must stay a plain paragraph, not a heading.
            plaintext: "Enti del Terzo Settore possono partecipare.",
            value: [{ type: "p", children: [
              { text: "Enti del " },
              { type: "strong", children: [{ text: "Terzo Settore" }] },
              { text: " possono partecipare." },
            ] }],
          },
          list: {
            plaintext: "primo punto; secondo punto",
            value: [{ type: "ul", children: [
              { type: "li", children: [{ text: "primo punto" }] },
              { type: "li", children: [{ text: "secondo punto" }] },
            ] }],
          },
        },
        blocks_layout: { items: ["heading", "subheading", "boldLabel", "partiallyBold", "list"] },
      },
    });
    const d = (await parseDetailErSociale(fixtureWithStructure, NO_LLM))!;
    const lines = d.requirements!.split("\n");
    expect(lines).toEqual([
      "## Finalità",
      "### Ripartizione territoriale:",
      "### 1 Residenzialità temporanea",
      "Enti del Terzo Settore possono partecipare.",
      "- primo punto",
      "- secondo punto",
    ]);
  });
});

describe("er-sociale end-to-end (listing + detail, LLM never called)", () => {
  it("inserts grants from @search and patches detail from each grant's JSON", async () => {
    const src: SourceConfig = {
      id: "er", name: "ER (API)", url: "https://sociale.example/bandi",
      scrapeConfig: { archetype: "er-sociale", fetchMode: "direct", listUrl: "https://sociale.example/@search" },
    };
    let call = 0;
    const fetcher: PageFetcher = {
      async fetchPages(s: SourceConfig): Promise<RawPage[]> {
        call++;
        return [{ sourceId: s.id, url: s.url, html: call === 1 ? searchFixture : detailFixture }];
      },
    };
    const llm: LLMProvider = {
      name: "boom",
      extract: async () => { throw new Error("LLM must not be called for er-sociale"); },
    };
    const db = new InMemoryGrantsDb();
    const [result] = await runPipeline([src], { llm, fetcher, db, detailThrottleMs: 0, sleep: async () => {} });

    expect(result!.errors).toEqual([]);
    expect(result!.detailErrors).toEqual([]);
    expect(db.grants).toHaveLength(2);
    const g = db.grants.find((x) => x.url.includes("bando-alimentare"))!;
    expect(g.openingDate).toBe("2025-08-01");
    expect(g.contactInfo).toContain("Bussadori");
    expect(g.attachments?.[0]?.url).toBe("https://sociale.example/allegato.pdf");
    // Only the still-open grant gets a detail fetch; the past-deadline one is "scaduto" and
    // findGrantsNeedingDetail skips it — so exactly one detail update.
    expect(db.scrapeLogs.some((l) => l.phase === "detail" && l.updated === 1)).toBe(true);
  });
});

describe("extractTotalFromProse (sentence-anchored total extraction)", () => {
  it("picks the total-signal sentence over an earlier unrelated euro mention", () => {
    const text = "Il Bando prevede il limite massimo di 200 euro per le spese in contanti. "
      + "Le risorse complessivamente a disposizione ammontano a 390.000 euro.";
    expect(extractTotalFromProse(text)).toBe(390000);
  });

  it("does not split 'N.NNN' Italian-formatted numbers into false sentence boundaries", () => {
    const text = "I progetti dovranno essere di importo pari o superiore a 20.000 euro. "
      + "Le risorse messe a bando ammontano complessivamente a 1.000.000,00 euro. Altri dettagli.";
    expect(extractTotalFromProse(text)).toBe(1000000);
  });

  it("returns null when no total-signaling phrase is present anywhere (no guessing)", () => {
    expect(extractTotalFromProse("Il contributo massimo per progetto è di 50.000 euro.")).toBeNull();
  });

  it("recognizes 'somma complessiva' (real ER phrasing, verified live) without matching unrelated 'complessivo'", () => {
    // Real case (2024, "rilevanza locale"): the total uses "complessiva" (adjective), which
    // "complessivamente" (adverb) alone doesn't cover. But "complessivo" ALSO appears elsewhere in
    // real bandi describing a PER-PROJECT threshold ("Il valore minimo complessivo dei progetti...
    // non potrà essere inferiore a euro 10.000,00") — broadening to a bare "complessiv" stem would
    // wrongly match that. "somma complessiva" is specific enough to avoid it.
    const text = "Il Bando è approvato per una somma complessiva di euro 2.692.033,10 - di cui euro 1.419.356,30 alle Fondazioni. "
      + "Il valore minimo complessivo dei progetti non potrà essere inferiore a euro 10.000,00.";
    expect(extractTotalFromProse(text)).toBe(2692033.1);
  });

  it("returns null for text with no currency mentions at all", () => {
    expect(extractTotalFromProse("Il bando è rivolto a enti del terzo settore.")).toBeNull();
  });
});

describe("er-sociale detail parser: LLM escalation for an unclear total", () => {
  const AMBIGUOUS_TEXT = "Il contributo massimo per progetto è di 50.000 euro. Nessun totale complessivo indicato qui.";

  const ambiguousFixture = JSON.stringify({
    "@id": "https://sociale.example/bandi/y", "@type": "Bando", title: "Y",
    description: "",
    text: { blocks: { a: { plaintext: AMBIGUOUS_TEXT } }, blocks_layout: { items: ["a"] } },
  });

  it("escalates to a targeted LLM call when no total-signal sentence is found in free text", async () => {
    const llm = new FakeLLMProvider(new Map<string, unknown>([
      [AMBIGUOUS_TEXT, { totalAmount: "220.000" }],
    ]));
    const d = await parseDetailErSociale(ambiguousFixture, llm);
    expect(d!.amount).toBe(220000);
  });

  it("does NOT call the LLM when a total-signal sentence already resolves the amount", async () => {
    const d = await parseDetailErSociale(detailFixture, NO_LLM);
    expect(d!.amount).toBe(1000000);
  });

  it("returns null (not a thrown error) when the LLM returns no usable total", async () => {
    const llm = new FakeLLMProvider(new Map<string, unknown>([
      [AMBIGUOUS_TEXT, { totalAmount: null }],
    ]));
    const d = await parseDetailErSociale(ambiguousFixture, llm);
    expect(d!.amount).toBeNull();
  });

  it("returns null (not a thrown error) when the LLM call itself fails", async () => {
    const llm = { name: "boom", extract: async () => { throw new Error("provider down"); } };
    const d = await parseDetailErSociale(ambiguousFixture, llm);
    expect(d!.amount).toBeNull();
  });
});
