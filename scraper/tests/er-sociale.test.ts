import { describe, it, expect } from "vitest";
import { resolveArchetype } from "../src/pipeline/archetypes";
import { parseErSociale } from "../src/pipeline/er-sociale";

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
      scadenza_bando: "2025-09-30T10:00:00+00:00",
      bando_state: ["inProgress", "In corso"],
      destinatari: ["Enti del Terzo settore"],
      materie: ["Diritti e sociale"],
    },
    {
      "@id": "https://sociale.example/bandi/2024/bando-adolescenza",
      "@type": "Bando",
      title: "Bando interventi per adolescenti",
      description: "600.000 euro per progetti rivolti a preadolescenti e adolescenti.",
      scadenza_bando: "2024-10-03T11:00:00+00:00",
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
      deadline: "2025-09-30",
      status: "aperto",
      area: "Emilia-Romagna",
      geoScope: "regionale",
      beneficiaries: "Enti del Terzo settore",
    });
    expect(items[1]).toMatchObject({ status: "chiuso", deadline: "2024-10-03" });
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
