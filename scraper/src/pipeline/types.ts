// scraper/src/pipeline/types.ts
import type { GeoScope, Complexity, GrantStatus, FundingType } from "./vocab";
import type { GrantType } from "./grant-type";
import type { JsonSchema, LLMProvider } from "../providers/types";

// Per-source scraping hints stored in grant_sources.scrape_config (jsonb). All optional:
// listUrl overrides the source url for the listing page; maxPages caps pagination (MVP: 1);
// waitFor is passed to the fetcher (CSS selector or ms) to wait before capturing HTML;
// archetype selects the extraction strategy from the registry (default "full");
// fetchMode selects the fetch path: "direct" = plain HTTP (API/static sources, no Chrome),
// anything else/absent = Browserless rendering (the default).
export interface ScrapeConfig {
  listUrl?: string;
  maxPages?: number;
  waitFor?: string;
  archetype?: string;
  fetchMode?: string;
}

// An extraction strategy for a family of sites. The pipeline nucleus (coerce, vocabulary
// validation, URL snapping, dedup/merge, Italian-amount parsing) is shared across all archetypes;
// an archetype only supplies the parts that genuinely vary from site family to site family. New
// archetypes are added to the registry in archetypes.ts, never by forking the orchestrator.
export interface Archetype {
  name: string;
  // HTML cleaning. Must be kept coherent with boundaryTags (the chunker splits on those closing
  // tags) and with urlSnapping (which needs href="..." to survive cleaning).
  sanitize: (html: string) => string;
  chunkSize: number;
  overlap: number;
  // Closing tags the chunker may split on, so a grant is never cut mid-record. Declared explicitly
  // per archetype: an archetype with a custom sanitize that drops these must pass a coherent list
  // (or [] to fall back to whitespace splitting) rather than silently losing the guarantee.
  boundaryTags: string[];
  // When true, a hallucinated URL is snapped to the closest same-domain href in the page. Requires
  // sanitize to preserve href attributes.
  urlSnapping: boolean;
  // Optional deterministic code parser for perfectly-structured pages: returns raw grant items
  // (same shape the LLM would) straight from the HTML, so extractGrants can skip the LLM entirely.
  // Returning [] (e.g. the page was redesigned) makes extractGrants fall back to the LLM path.
  parse?: (html: string) => unknown[];
  // Optional code-first parser for the DETAIL page (same spirit as parse for the listing): given
  // the raw body of a grant's own page, returns the DetailGrant or null. Async and receives the
  // LLMProvider so an implementation can escalate ONE narrowly-scoped field to a targeted LLM
  // call as a last resort (see er-sociale.ts's amount resolution) instead of choosing between
  // "100% code" and "100% LLM" — most fields still resolve deterministically; the general-purpose
  // extractDetail (all fields, one big schema) is not called when parseDetail is present.
  parseDetail?: (html: string, llm: LLMProvider) => Promise<DetailGrant | null>;
  // The listing-page extraction. "full" pulls all 16 fields; "listing-light" pulls only title/url/
  // deadline and leaves the rest to the detail phase.
  listing: { schema: JsonSchema; instructions: string };
  // True when the listing is intentionally light and the detail phase is essential (archetype B).
  detailRequired: boolean;
  // Whether the pipeline runs the per-grant detail phase at all. Some listings are self-contained
  // AND link to many unrelated external sites (e.g. "bandi altri enti" aggregators): fetching a
  // detail page per grant is pointless and expensive, so the archetype opts out entirely.
  detailEnabled: boolean;
}

export interface SourceConfig { id: string; name: string; url: string; scrapeConfig?: ScrapeConfig; }

export interface RawPage { sourceId: string; url: string; html: string; }

// Attachment metadata collected by code-based detail parsers (e.g. er-sociale via Plone API).
// Only metadata: binaries stay on the source site (Storage mirroring is a possible later step).
export interface GrantAttachment { title: string; url: string; mimeType: string | null; }

export interface ExtractedGrant {
  title: string;
  url: string;
  providerId: string | null;
  sourceId: string | null;
  deadline: string | null;        // ISO date or null
  status: GrantStatus | null;
  // Classified once by enrich() from title+summary. Stored value is always "bando" or
  // "co_progettazione" — "amministrativo" causes decide() to skip the insert (see dedup.ts) and
  // is never persisted. Deliberately excluded from dedup.ts's diff KEYS: a grant's type is fixed
  // at first classification and never silently changed by the update path.
  grantType: GrantType;
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
  // Optional: only code-based detail parsers populate it (LLM detail returns []).
  attachments?: GrantAttachment[];
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
  // Applicant-side documents (statuto/bilancio/runts/rasd/durc/certificazioni) derived from the
  // detail prose. PARTIAL: empty means "not found in prose", not "none required" — the app treats
  // an empty checklist as unknown, never as "you have everything".
  requiredDocuments: string[];
  attachments: GrantAttachment[];
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
