import { describe, it, expect } from "vitest";
import { resolveArchetype, ARCHETYPES, DEFAULT_ARCHETYPE } from "../src/pipeline/archetypes";
import { FULL_ARCHETYPE, extractGrants } from "../src/pipeline/extract-grants";
import { FakeLLMProvider } from "../src/providers/fake";
import { InMemoryGrantsDb } from "./helpers/memory-db";
import type { RawPage } from "../src/pipeline/types";
import type { LLMProvider } from "../src/providers/types";

const page = (html: string): RawPage => ({ sourceId: "s1", url: "https://x/list", html });

describe("resolveArchetype", () => {
  it("returns the full archetype by default (missing key)", () => {
    expect(resolveArchetype(undefined)).toBe(FULL_ARCHETYPE);
    expect(DEFAULT_ARCHETYPE).toBe(FULL_ARCHETYPE);
  });

  it("resolves a known key to its archetype", () => {
    expect(resolveArchetype("listing-light").name).toBe("listing-light");
    expect(resolveArchetype("full")).toBe(FULL_ARCHETYPE);
  });

  it("falls back to full on an unknown key", () => {
    expect(resolveArchetype("does-not-exist")).toBe(FULL_ARCHETYPE);
  });

  it("registers the known archetypes", () => {
    expect(Object.keys(ARCHETYPES).sort()).toEqual(["full", "listing-light", "sportesalute"]);
  });
});

describe("sportesalute archetype", () => {
  // A minimal fixture shaped like the real SP Page Builder card grid: <main> with card wrappers,
  // each carrying a title_card, a labeled info block, a region label and a "button" detail link.
  const card = (title: string, href: string, region: string, deadline: string) =>
    `<div class="sppb-addon-image-layouts" data-date="${deadline}">
       <h6 class="sppb-image-layout-title coming">AVVISO IN CORSO</h6>
       <h5 class="title_card">${title}</h5>
       <div>Una descrizione lunga che deve essere scartata dalla sanitize perché gonfia il payload.</div>
       <span class="label regione-bando">${region}</span>
       <p><strong>Termine di presentazione domanda:</strong> ${deadline}<br>
          <strong>Ente promotore:</strong> Comune di Test<br>
          <strong>Destinatari:</strong> Enti del terzo settore<br>
          <strong>Risorse:</strong> Euro 100.000</p>
       <p><a href="${href}" class="button fit">Scopri di più</a></p>
     </div>`;
  const fixture = `<html><body><nav>menu</nav><main>
      <div class="listabandi cards">${card("Bando Uno", "https://ente-a.it/b1", "Lazio", "01/09/2026")}
      ${card("Bando Due", "https://ente-b.it/b2", "Lombardia", "15/10/2026")}</div>
    </main><footer>x</footer></body></html>`;

  it("pre-digests each card into one compact <li> and drops the description", () => {
    const cleaned = resolveArchetype("sportesalute").sanitize(fixture);
    expect((cleaned.match(/<li>/g) ?? []).length).toBe(2);
    expect(cleaned).toContain('href="https://ente-a.it/b1"');
    expect(cleaned).toContain("Bando Uno");
    expect(cleaned).toContain("Regione: Lazio");
    expect(cleaned).toContain("Termine di presentazione domanda: 01/09/2026");
    // The verbose description must not survive (that is the whole point of the archetype).
    expect(cleaned).not.toContain("descrizione lunga");
  });

  it("falls back to the generic sanitizer when the card structure is absent", () => {
    const cleaned = resolveArchetype("sportesalute").sanitize("<main><p>nessuna card qui</p></main>");
    expect(cleaned).not.toContain("<li>");
    expect(cleaned).toContain("nessuna card qui");
  });

  it("the code parser extracts grants deterministically (no LLM), decoding fields", () => {
    const items = resolveArchetype("sportesalute").parse!(fixture) as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Bando Uno",
      url: "https://ente-a.it/b1",
      deadline: "2026-09-01", // 01/09/2026 → ISO
      area: "Lazio",
    });
    expect(String(items[0]!.beneficiaries)).toContain("terzo settore");
    expect(String(items[0]!.amount)).toContain("100.000");
    // A trailing empty label must yield null, not a fabricated value.
    expect(resolveArchetype("sportesalute").parse!(
      fixture.replace("Euro 100.000", ""),
    )[0] as Record<string, unknown>).toMatchObject({ amount: null });
  });

  it("extractGrants uses the code parser and never calls the LLM when parse is present", async () => {
    const archetype = {
      ...FULL_ARCHETYPE,
      name: "parsed",
      parse: () => [{ title: "P", url: "https://x/p" }],
    };
    const llm: LLMProvider = {
      name: "boom",
      extract: async () => { throw new Error("LLM must not be called on the parser path"); },
    };
    const out = await extractGrants(page("<html>x</html>"), { llm, db: new InMemoryGrantsDb() }, archetype);
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://x/p");
  });

  it("exposes the trimmed schema (no 16-field bloat) and keeps detail optional", () => {
    const a = resolveArchetype("sportesalute");
    const props = (a.listing.schema.items as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props).sort()).toEqual(
      ["amount", "area", "beneficiaries", "deadline", "title", "url"],
    );
    expect(a.detailRequired).toBe(false);
    // The whole point: no per-grant detail fetching for this aggregator archetype.
    expect(a.detailEnabled).toBe(false);
    expect(a.boundaryTags).toEqual(["</li>"]);
  });
});

describe("archetype fields", () => {
  it("full carries all 16 fields, detail optional; listing-light is minimal, detail required", () => {
    const full = resolveArchetype("full");
    const light = resolveArchetype("listing-light");
    expect(full.detailRequired).toBe(false);
    expect(light.detailRequired).toBe(true);
    // Both run the detail phase (full as optional enrichment, light as essential).
    expect(full.detailEnabled).toBe(true);
    expect(light.detailEnabled).toBe(true);
    // The light listing schema exposes only title/url/deadline.
    const lightProps = (light.listing.schema.items as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(lightProps).sort()).toEqual(["deadline", "title", "url"]);
  });
});

describe("extractGrants honors the archetype", () => {
  it("uses the archetype's custom sanitize before chunking/extraction", async () => {
    let sawSanitize = false;
    const archetype = {
      ...FULL_ARCHETYPE,
      name: "custom",
      sanitize: (html: string) => { sawSanitize = true; return html; },
    };
    const llm = new FakeLLMProvider(new Map<string, unknown>([["H", [{ title: "B", url: "https://x/1" }]]]));
    const out = await extractGrants(page("H"), { llm, db: new InMemoryGrantsDb() }, archetype);
    expect(sawSanitize).toBe(true);
    expect(out).toHaveLength(1);
  });

  it("skips URL snapping when the archetype disables it", async () => {
    const html = '<p><a href="https://example.it/bando-per-x">Bando</a></p>';
    const hallucinated = "https://example.it/bando-for-x";
    const noSnap = { ...FULL_ARCHETYPE, name: "no-snap", urlSnapping: false };
    const llm = new FakeLLMProvider(new Map<string, unknown>([[html, [{ title: "B", url: hallucinated }]]]));
    const out = await extractGrants(page(html), { llm, db: new InMemoryGrantsDb() }, noSnap);
    // Without snapping the hallucinated URL is kept as-is.
    expect(out[0]!.url).toBe(hallucinated);
  });

  it("still snaps the URL under the default (full) archetype", async () => {
    const html = '<p><a href="https://example.it/bando-per-x">Bando</a></p>';
    const hallucinated = "https://example.it/bando-for-x";
    const llm = new FakeLLMProvider(new Map<string, unknown>([[html, [{ title: "B", url: hallucinated }]]]));
    const out = await extractGrants(page(html), { llm, db: new InMemoryGrantsDb() });
    expect(out[0]!.url).toBe("https://example.it/bando-per-x");
  });
});
