// scraper/src/pipeline/types.ts
import type { GeoScope, Complexity, GrantStatus, FundingType } from "./vocab";

// Per-source scraping hints stored in grant_sources.scrape_config (jsonb). All optional:
// listUrl overrides the source url for the listing page; maxPages caps pagination (MVP: 1);
// waitFor is passed to the fetcher (CSS selector or ms) to wait before capturing HTML.
export interface ScrapeConfig {
  listUrl?: string;
  maxPages?: number;
  waitFor?: string;
}

export interface SourceConfig { id: string; name: string; url: string; scrapeConfig?: ScrapeConfig; }

export interface RawPage { sourceId: string; url: string; html: string; }

export interface ExtractedGrant {
  title: string;
  url: string;
  providerId: string | null;
  sourceId: string | null;
  deadline: string | null;        // ISO date or null
  status: GrantStatus | null;
  amount: number | null;
  cofundingRequired: number | null;
  eligibleTypes: string[];        // validated subset of LEGAL_TYPES
  tags: string[];                 // validated subset of TAGS
  area: string | null;
  geoScope: GeoScope | null;
  complexity: Complexity | null;
  requiredDocuments: string[];    // subset of DOCUMENT_KEYS
  summary: string | null;
  requirements: string | null;
  beneficiaries: string | null;
  // V2 fields — populated by detail enrichment
  openingDate: string | null;
  fundingType: FundingType | null;
  minAmount: number | null;
  maxAmount: number | null;
  cofundingPercentage: number | null;
  eligibleExpenses: string | null;
  applicationMethod: string | null;
  contactInfo: string | null;
}

export interface DetailGrant {
  summary: string | null;
  requirements: string | null;
  beneficiaries: string | null;
  openingDate: string | null;
  fundingType: FundingType | null;
  amount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  cofundingPercentage: number | null;
  eligibleExpenses: string | null;
  applicationMethod: string | null;
  contactInfo: string | null;
  deadline: string | null;
  eligibleTypes: string[];
  tags: string[];
}

export interface ScrapeLogEntry {
  sourceId: string;
  phase: "listing" | "detail";
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  detailErrors: string[];
  durationMs: number;
}

export interface StoredGrant extends ExtractedGrant { id: string; }

export interface PipelineResult {
  sourceId: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  detailErrors: string[];
}

// Seam 1: fetching (Browserless in prod → 009; fixtures in tests).
export interface PageFetcher { fetchPages(source: SourceConfig): Promise<RawPage[]>; }

// Seam 3: persistence (Supabase service_role adapter → 009; in-memory in tests).
export interface GrantsDb {
  findByUrl(normalizedUrl: string): Promise<StoredGrant | null>;
  findActiveByUrl(normalizedUrl: string): Promise<StoredGrant | null>;
  insert(grant: ExtractedGrant): Promise<void>;
  update(id: string, patch: Partial<ExtractedGrant>): Promise<void>;
  findProviderIdByName(name: string): Promise<string | null>;
  updateSource(sourceId: string, patch: { lastRunAt?: string; lastError?: string | null }): Promise<void>;
  logScrapeRun(entry: ScrapeLogEntry): Promise<void>;
  markDetailFetched(id: string, patch: Partial<ExtractedGrant>): Promise<void>;
  findGrantsNeedingDetail(sourceId: string, staleDays: number): Promise<StoredGrant[]>;
  logDebugHtml?(sourceId: string, url: string, rawHtml: string, cleanHtml: string): Promise<void>;
}
