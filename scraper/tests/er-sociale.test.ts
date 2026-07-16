import { describe, it, expect } from "vitest";
import { resolveArchetype } from "../src/pipeline/archetypes";
import { parseErSociale, parseDetailErSociale } from "../src/pipeline/er-sociale";
import { runPipeline } from "../src/pipeline/run";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import type { PageFetcher, RawPage, SourceConfig } from "../src/pipeline/types";
import type { LLMProvider } from "../src/providers/types";

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

  it("extracts a best-effort amount string from the description", () => {
    const items = parseErSociale(searchFixture) as Array<Record<string, unknown>>;
    expect(items[0]!.amount).toBe("1.000.000");
    expect(items[1]!.amount).toBe("600.000");
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
  it("maps the full Bando object to a DetailGrant without any LLM", () => {
    const d = parseDetailErSociale(detailFixture)!;
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

  it("returns null on malformed JSON or a non-Bando object", () => {
    expect(parseDetailErSociale("boh")).toBeNull();
    expect(parseDetailErSociale('{"@type":"Document"}')).toBeNull();
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
