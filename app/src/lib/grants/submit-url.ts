// app/src/lib/grants/submit-url.ts
// Crowdsourcing "Segnala un bando" (§4.4). Two phases so the LLM runs once:
//   preview — fetch the page, extract the 16 fields, return them WITHOUT inserting;
//   confirm — re-validate the previewed payload against the app's own vocab (tampering can't
//             produce values the scraper itself wouldn't), dedup by normalized URL, insert
//             with source_id = null and import_mode = 'user' (admin client, grants are
//             select-only under RLS).
// Deps are injected so tests run fully offline.
import { z } from "zod";
import { extractGrants, enrich, normalizeUrl } from "bandi-scraper";
import type { ExtractedGrant, GrantsDb, LLMProvider } from "bandi-scraper";
import { LEGAL_TYPES, TAGS, DOCUMENT_KEYS } from "@/lib/matching";

export interface SubmitUrlDb {
  findGrantByUrl(normalizedUrl: string): Promise<{ id: string; title: string } | null>;
  findProviderIdByName(name: string): Promise<string | null>;
  insertGrant(row: Record<string, unknown>): Promise<{ id: string }>;
}

export interface SubmitUrlDeps {
  fetchHtml(url: string): Promise<string>;
  llm: LLMProvider;
  db: SubmitUrlDb;
}

export type PreviewResult =
  | { status: "exists"; grantId: string; title: string }
  | { status: "not_a_grant" }
  | { status: "preview"; grant: ExtractedGrant };

export type ConfirmResult =
  | { status: "exists"; grantId: string; title: string }
  | { status: "invalid" }
  | { status: "created"; grantId: string; title: string };

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const LEGAL_SET = new Set<string>(LEGAL_TYPES);
const TAG_SET = new Set<string>(TAGS);
const DOC_SET = new Set<string>(DOCUMENT_KEYS);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (max: number) => z.string().max(max).nullable().default(null);

// Mirrors ExtractedGrant. Unknown vocabulary values are filtered out (the scraper's own
// lenient behavior), structural violations reject.
export const submittedGrantSchema = z.object({
  title: z.string().trim().min(1).max(300),
  url: z.string().refine(isHttpUrl, "url non valido"),
  providerId: z.string().uuid().nullable().default(null),
  deadline: z.string().regex(ISO_DATE).nullable().default(null),
  status: z.enum(["aperto", "chiuso"]).nullable().default(null),
  amount: z.number().nonnegative().nullable().default(null),
  cofundingRequired: z.number().nonnegative().nullable().default(null),
  eligibleTypes: z.array(z.string()).default([]).transform((a) => a.filter((t) => LEGAL_SET.has(t))),
  tags: z.array(z.string()).default([]).transform((a) => a.filter((t) => TAG_SET.has(t))),
  area: text(200),
  geoScope: z.enum(["comunale", "provinciale", "regionale", "nazionale", "europeo"]).nullable().default(null),
  complexity: z.enum(["bassa", "media", "alta"]).nullable().default(null),
  requiredDocuments: z.array(z.string()).default([]).transform((a) => a.filter((d) => DOC_SET.has(d))),
  summary: text(5000),
  requirements: text(5000),
  beneficiaries: text(5000),
});

export type SubmittedGrant = z.infer<typeof submittedGrantSchema>;

// extractGrants only calls findProviderIdByName on its db (and swallows its errors); the
// other GrantsDb methods are never reached from a single-page extraction.
function extractionDb(db: SubmitUrlDb): GrantsDb {
  const never = async () => {
    throw new Error("not used during extraction");
  };
  return {
    findProviderIdByName: (name) => db.findProviderIdByName(name),
    findByUrl: never, insert: never, update: never, updateSource: never,
  } as GrantsDb;
}

export async function previewSubmittedUrl(url: string, deps: SubmitUrlDeps): Promise<PreviewResult> {
  if (!isHttpUrl(url)) throw new Error("invalid url");
  const normalized = normalizeUrl(url);

  const existing = await deps.db.findGrantByUrl(normalized);
  if (existing) return { status: "exists", grantId: existing.id, title: existing.title };

  const html = await deps.fetchHtml(url);
  const extracted = await extractGrants(
    { sourceId: "user-submit", url: normalized, html },
    { llm: deps.llm, db: extractionDb(deps.db) },
  );
  if (extracted.length === 0) return { status: "not_a_grant" };

  const grant = enrich(extracted[0]!);
  const grantUrl = normalizeUrl(grant.url);
  const byGrantUrl = await deps.db.findGrantByUrl(grantUrl);
  if (byGrantUrl) return { status: "exists", grantId: byGrantUrl.id, title: byGrantUrl.title };

  return { status: "preview", grant: { ...grant, url: grantUrl } };
}

function toInsertRow(g: SubmittedGrant, normalizedUrl: string): Record<string, unknown> {
  return {
    title: g.title,
    url: normalizedUrl,
    provider_id: g.providerId,
    deadline: g.deadline,
    status: g.status ?? "aperto",
    amount: g.amount,
    cofunding_required: g.cofundingRequired,
    eligible_types: g.eligibleTypes,
    tags: g.tags,
    area: g.area,
    geo_scope: g.geoScope,
    complexity: g.complexity,
    required_documents: g.requiredDocuments,
    summary: g.summary,
    requirements: g.requirements,
    beneficiaries: g.beneficiaries,
    source_id: null,
    import_mode: "user",
  };
}

export async function confirmSubmittedGrant(payload: unknown, db: SubmitUrlDb): Promise<ConfirmResult> {
  const parsed = submittedGrantSchema.safeParse(payload);
  if (!parsed.success) return { status: "invalid" };

  const grant = parsed.data;
  const normalized = normalizeUrl(grant.url);
  const existing = await db.findGrantByUrl(normalized);
  if (existing) return { status: "exists", grantId: existing.id, title: existing.title };

  const { id } = await db.insertGrant(toInsertRow(grant, normalized));
  return { status: "created", grantId: id, title: grant.title };
}
