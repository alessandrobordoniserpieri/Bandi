import { describe, it, expect } from "vitest";
import {
  confirmSubmittedGrant, previewSubmittedUrl, submittedGrantSchema,
  type SubmitUrlDb, type SubmitUrlDeps,
} from "../submit-url";
import { FakeLLMProvider } from "bandi-scraper";

class MemoryDb implements SubmitUrlDb {
  inserted: Record<string, unknown>[] = [];
  constructor(private existing: Record<string, { id: string; title: string }> = {}) {}
  async findGrantByUrl(url: string) { return this.existing[url] ?? null; }
  async findProviderIdByName() { return null; }
  async insertGrant(row: Record<string, unknown>) {
    this.inserted.push(row);
    return { id: `new-${this.inserted.length}` };
  }
}

const extractedItem = {
  title: "Bando Segnalato", url: "https://Esempio.it/bando/?utm_source=x",
  tags: ["sport", "tag-inventato"], eligibleTypes: ["ONLUS"],
  deadline: "2026-11-30", amount: 10000,
};

function deps(db: SubmitUrlDb, extraction: unknown = [extractedItem]): SubmitUrlDeps {
  return {
    fetchHtml: async () => "<html>pagina</html>",
    llm: new FakeLLMProvider(new Map([["pagina", extraction]])),
    db,
  };
}

describe("previewSubmittedUrl", () => {
  it("returns exists (no fetch/insert) when the URL is already in grants", async () => {
    const db = new MemoryDb({ "https://esempio.it/bando": { id: "g9", title: "Già presente" } });
    const res = await previewSubmittedUrl("https://Esempio.it/bando?utm_source=x", deps(db));
    expect(res).toEqual({ status: "exists", grantId: "g9", title: "Già presente" });
    expect(db.inserted).toHaveLength(0);
  });

  it("returns not_a_grant (no insert) when the extraction is empty", async () => {
    const db = new MemoryDb();
    const res = await previewSubmittedUrl("https://esempio.it/pagina-generica", deps(db, []));
    expect(res).toEqual({ status: "not_a_grant" });
    expect(db.inserted).toHaveLength(0);
  });

  it("returns the extracted preview with a normalized URL and filtered vocab, without inserting", async () => {
    const db = new MemoryDb();
    const res = await previewSubmittedUrl("https://esempio.it/bando", deps(db));
    expect(res.status).toBe("preview");
    if (res.status === "preview") {
      expect(res.grant.url).toBe("https://esempio.it/bando"); // tracking param + trailing slash gone
      expect(res.grant.tags).toEqual(["sport"]); // invalid tag dropped by the scraper coerce
      expect(res.grant.title).toBe("Bando Segnalato");
    }
    expect(db.inserted).toHaveLength(0);
  });

  it("rejects a non-http URL", async () => {
    await expect(previewSubmittedUrl("javascript:alert(1)", deps(new MemoryDb()))).rejects.toThrow();
  });
});

describe("confirmSubmittedGrant", () => {
  const payload = {
    title: "Bando Segnalato", url: "https://esempio.it/bando",
    tags: ["sport"], eligibleTypes: ["ONLUS"], deadline: "2026-11-30", amount: 10000,
  };

  it("inserts with import_mode user, source_id null, default status, normalized url", async () => {
    const db = new MemoryDb();
    const res = await confirmSubmittedGrant(payload, db);
    expect(res.status).toBe("created");
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({
      title: "Bando Segnalato", url: "https://esempio.it/bando",
      import_mode: "user", source_id: null, status: "aperto",
      tags: ["sport"], eligible_types: ["ONLUS"],
    });
  });

  it("returns exists without inserting when the URL is already present (no duplicates)", async () => {
    const db = new MemoryDb({ "https://esempio.it/bando": { id: "g1", title: "Bando Segnalato" } });
    const res = await confirmSubmittedGrant(payload, db);
    expect(res).toEqual({ status: "exists", grantId: "g1", title: "Bando Segnalato" });
    expect(db.inserted).toHaveLength(0);
  });

  it("rejects a structurally invalid payload without inserting", async () => {
    const db = new MemoryDb();
    for (const bad of [
      { ...payload, title: "" },
      { ...payload, url: "non-un-url" },
      { ...payload, deadline: "31 dicembre" },
      { ...payload, amount: -5 },
      "una stringa",
    ]) {
      expect((await confirmSubmittedGrant(bad, db)).status).toBe("invalid");
    }
    expect(db.inserted).toHaveLength(0);
  });

  it("filters unknown vocabulary instead of storing it", () => {
    const parsed = submittedGrantSchema.parse({
      ...payload, tags: ["sport", "finto"], eligibleTypes: ["ONLUS", "TipoFinto"],
      requiredDocuments: ["statuto", "doc-finto"],
    });
    expect(parsed.tags).toEqual(["sport"]);
    expect(parsed.eligibleTypes).toEqual(["ONLUS"]);
    expect(parsed.requiredDocuments).toEqual(["statuto"]);
  });
});
