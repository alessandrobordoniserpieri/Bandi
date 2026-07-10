// scraper/tests/helpers/memory-db.ts
import type { GrantsDb, StoredGrant, ExtractedGrant, ScrapeLogEntry } from "../../src/pipeline/types";

export class InMemoryGrantsDb implements GrantsDb {
  grants: StoredGrant[] = [];
  sources: Record<string, { lastRunAt?: string; lastError?: string | null }> = {};
  scrapeLogs: ScrapeLogEntry[] = [];
  providers: Record<string, string>; // name → id
  private seq = 0;

  constructor(providers: Record<string, string> = {}) { this.providers = providers; }

  async findByUrl(url: string): Promise<StoredGrant | null> {
    return this.grants.find((g) => g.url === url) ?? null;
  }
  async findActiveByUrl(url: string): Promise<StoredGrant | null> {
    return this.grants.find((g) => g.url === url && g.status !== "scaduto") ?? null;
  }
  async insert(grant: ExtractedGrant): Promise<void> {
    this.grants.push({ ...grant, id: `g${++this.seq}` });
  }
  async update(id: string, patch: Partial<ExtractedGrant>): Promise<void> {
    const g = this.grants.find((x) => x.id === id);
    if (g) Object.assign(g, patch);
  }
  async findProviderIdByName(name: string): Promise<string | null> {
    return this.providers[name] ?? null;
  }
  async updateSource(sourceId: string, patch: { lastRunAt?: string; lastError?: string | null }): Promise<void> {
    this.sources[sourceId] = { ...this.sources[sourceId], ...patch };
  }
  async logScrapeRun(entry: ScrapeLogEntry): Promise<void> {
    this.scrapeLogs.push(entry);
  }
  async markDetailFetched(id: string, patch: Partial<ExtractedGrant>): Promise<void> {
    const g = this.grants.find((x) => x.id === id);
    if (g) Object.assign(g, patch);
  }
  async findGrantsNeedingDetail(sourceId: string, _staleDays: number): Promise<StoredGrant[]> {
    return this.grants.filter(
      (g) => g.sourceId === sourceId && g.status !== "scaduto",
    );
  }
}
