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
    status: row.status,
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
  };
  return { grant, providerName: row.provider?.name ?? null };
}
