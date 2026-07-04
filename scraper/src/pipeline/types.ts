// scraper/src/pipeline/types.ts
import type { GeoScope, Complexity, GrantStatus } from "./vocab";

export interface SourceConfig { id: string; name: string; url: string; }

export interface RawPage { sourceId: string; url: string; html: string; }

// The 16 extracted fields: all nullable except title/url; arrays default to [].
export interface ExtractedGrant {
  title: string;
  url: string;
  providerId: string | null;
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
}

export interface StoredGrant extends ExtractedGrant { id: string; }

export interface PipelineResult {
  sourceId: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// Seam 1: fetching (Browserless in prod → 009; fixtures in tests).
export interface PageFetcher { fetchPages(source: SourceConfig): Promise<RawPage[]>; }

// Seam 3: persistence (Supabase service_role adapter → 009; in-memory in tests).
export interface GrantsDb {
  findByUrl(normalizedUrl: string): Promise<StoredGrant | null>;
  insert(grant: ExtractedGrant): Promise<void>;
  update(id: string, patch: Partial<ExtractedGrant>): Promise<void>;
  findProviderIdByName(name: string): Promise<string | null>;
  updateSource(sourceId: string, patch: { lastRunAt?: string; lastError?: string | null }): Promise<void>;
}
