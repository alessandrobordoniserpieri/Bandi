import type { Attachment, Grant, GrantType, ProviderKind } from "@/lib/matching";
import type { Tables } from "@/lib/supabase/database.types";

export type GrantRow = Tables<"grants">;
export type GrantRowWithProvider = GrantRow & {
  provider: { name: string; kind: ProviderKind } | null;
};
export type GrantView = { grant: Grant; providerName: string | null };

export function mapGrantRow(row: GrantRowWithProvider): GrantView {
  const grant: Grant = {
    id: row.id,
    title: row.title,
    providerId: row.provider_id,
    providerKind: row.provider?.kind ?? null,
    deadline: row.deadline,
    status: row.status,
    grantType: (row.grant_type as GrantType | undefined) ?? "bando",
    amount: row.amount,
    cofundingRequired: row.cofunding_required,
    cofundingPercentage: row.cofunding_percentage,
    eligibleTypes: row.eligible_types,
    tags: row.tags,
    area: row.area,
    geoScope: row.geo_scope,
    complexity: row.complexity,
    requiredDocuments: row.required_documents,
    summary: row.summary ?? "",
    requirements: row.requirements ?? "",
    url: row.url,
    beneficiaries: row.beneficiaries ?? "",
    openingDate: row.opening_date,
    fundingType: row.funding_type,
    minAmount: row.min_amount,
    maxAmount: row.max_amount,
    eligibleExpenses: row.eligible_expenses,
    applicationMethod: row.application_method,
    contactInfo: row.contact_info,
    attachments: parseAttachments(row.attachments),
  };
  return { grant, providerName: row.provider?.name ?? null };
}

// row.attachments is jsonb (typed as `Json` — string | number | boolean | null | object | array).
// Narrow it defensively rather than casting: a malformed row must degrade to [], never crash the
// detail page.
function parseAttachments(raw: GrantRow["attachments"]): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const out: Attachment[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { title, url, mimeType } = item as Record<string, unknown>;
    if (typeof title !== "string" || typeof url !== "string") continue;
    out.push({ title, url, mimeType: typeof mimeType === "string" ? mimeType : null });
  }
  return out;
}
