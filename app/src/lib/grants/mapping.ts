import type { Grant, ProviderKind } from "@/lib/matching";
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
    status: row.status as Grant["status"],
    amount: row.amount,
    cofundingRequired: row.cofunding_required,
    cofundingPercentage: (row as Record<string, unknown>).cofunding_percentage as number | null ?? null,
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
    openingDate: (row as Record<string, unknown>).opening_date as string | null ?? null,
    fundingType: (row as Record<string, unknown>).funding_type as Grant["fundingType"] ?? null,
    minAmount: (row as Record<string, unknown>).min_amount as number | null ?? null,
    maxAmount: (row as Record<string, unknown>).max_amount as number | null ?? null,
    eligibleExpenses: (row as Record<string, unknown>).eligible_expenses as string | null ?? null,
    applicationMethod: (row as Record<string, unknown>).application_method as string | null ?? null,
    contactInfo: (row as Record<string, unknown>).contact_info as string | null ?? null,
  };
  return { grant, providerName: row.provider?.name ?? null };
}
