// app/src/lib/profile/schema.ts
import { z } from "zod";
import {
  LEGAL_TYPES, TAGS, PROVINCES, regionForProvince,
  type EntityProfile, type ProjectHistoryRow,
} from "@/lib/matching";
import type { Tables } from "@/lib/supabase/database.types";
import {
  BENEFICIARY_OPTIONS, OPERATING_SCOPE_OPTIONS, OUTCOME_OPTIONS,
  COFUNDING_OPTIONS, INCOME_SOURCE_OPTIONS,
} from "./constants";

export type ProfileRow = Tables<"profiles">;

// zod enums from the matching vocabularies (readonly string[] → mutable copy).
const legalTypeEnum = z.enum([...LEGAL_TYPES] as [string, ...string[]]);
const tagEnum = z.enum([...TAGS] as [string, ...string[]]);
const provinceEnum = z.enum([...PROVINCES] as [string, ...string[]]);

const optionalText = z.string().trim().max(500).optional().or(z.literal(""));

export const identitySchema = z.object({
  name: z.string().trim().min(1),
  legal_type: legalTypeEnum,
  founded_year: z.coerce.number().int().min(1800).max(2100).optional(),
  tax_code: optionalText,
  website: optionalText,
});

export const territorySchema = z.object({
  province: provinceEnum,
  municipality: optionalText,
  operating_scope: z.enum([...OPERATING_SCOPE_OPTIONS]).optional().or(z.literal("")),
  operating_provinces: z.array(provinceEnum).default([]),
});

export const themesSchema = z.object({
  themes: z.array(tagEnum).min(1),
  activity_description: optionalText,
  beneficiaries: z.array(z.enum([...BENEFICIARY_OPTIONS])).default([]),
});

export const capacitySchema = z.object({
  stable_staff: z.enum(["0-2", "3-10", "11-30", "30+"]),
  dedicated_admin: z.boolean(),
  funded_projects_3y: z.enum(["0", "1-2", "3-5", "5+"]),
  reporting_experience: z.enum(["mai", "qualche_volta", "regolarmente"]),
  annual_budget: z.enum(["<20k", "20-100k", "100-500k", ">500k"]),
  eu_project: z.boolean(),
});

export const documentsSchema = z.object({
  doc_statuto: z.boolean().default(false),
  doc_bilancio: z.boolean().default(false),
  doc_runts: z.boolean().default(false),
  doc_rasd: z.boolean().default(false),
  doc_durc: z.boolean().default(false),
  doc_certificazioni: z.boolean().default(false),
  sport_body: optionalText,
  rasd_number: optionalText,
});

export const partnershipsSchema = z.object({
  public_partners: z.boolean().default(false),
  public_partners_detail: optionalText,
  private_partners: z.boolean().default(false),
  private_partners_detail: optionalText,
  networks: optionalText,
  coprogettazione: z.boolean().default(false),
});

const historyRowSchema = z.object({
  grant_name: z.string().trim().min(1),
  // NOT FK-constrained inside jsonb (design plan §"project_history jsonb row shape"):
  // provider_id is an opaque reference, not guaranteed to be a well-formed UUID.
  provider_id: z.string().nullable().default(null),
  year: z.coerce.number().int().min(1900).max(2100).nullable().default(null),
  outcome: z.enum([...OUTCOME_OPTIONS]),
  amount: z.coerce.number().nonnegative().nullable().default(null),
  kind: z.enum(["pubblico", "privato", "eu"]).nullable().default(null),
});

export const historySchema = z.object({
  project_history: z.array(historyRowSchema).default([]),
  public_funds: z.boolean().default(false),
  private_funds: z.boolean().default(false),
  eu_funds: z.boolean().default(false),
  cofunding_capacity: z.coerce
    .number().int()
    .refine((n) => (COFUNDING_OPTIONS as readonly number[]).includes(n), "cofunding non valido")
    .nullable().default(null),
  income_sources: z.array(z.enum([...INCOME_SOURCE_OPTIONS])).default([]),
});

export const contactsSchema = z.object({
  contact_name: optionalText,
  contact_role: optionalText,
  contact_email: z.string().trim().email().optional().or(z.literal("")),
  contact_phone: optionalText,
  notes: optionalText,
});

export function deriveRegion(province: string): string {
  return regionForProvince(province) ?? "";
}

export function parseProjectHistory(json: unknown): ProjectHistoryRow[] {
  if (!Array.isArray(json)) return [];
  const out: ProjectHistoryRow[] = [];
  for (const raw of json) {
    const r = historyRowSchema.safeParse(raw);
    if (!r.success) continue;
    out.push({
      grantName: r.data.grant_name,
      providerId: r.data.provider_id,
      year: r.data.year,
      outcome: r.data.outcome,
      amount: r.data.amount,
      kind: r.data.kind,
    });
  }
  return out;
}

// Are all 6 capacity answers present? (dedicated_admin / eu_project are bool|null.)
function hasAllCapacityAnswers(r: ProfileRow): boolean {
  return (
    !!r.stable_staff && r.dedicated_admin !== null && !!r.funded_projects_3y &&
    !!r.reporting_experience && !!r.annual_budget && r.eu_project !== null
  );
}

function buildCapacity(row: ProfileRow): EntityProfile["capacity"] {
  if (!hasAllCapacityAnswers(row)) return null;
  return {
    stableStaff: row.stable_staff as "0-2" | "3-10" | "11-30" | "30+",
    dedicatedAdmin: row.dedicated_admin as boolean,
    fundedProjects3y: row.funded_projects_3y as "0" | "1-2" | "3-5" | "5+",
    reportingExperience: row.reporting_experience as "mai" | "qualche_volta" | "regolarmente",
    annualBudget: row.annual_budget as "<20k" | "20-100k" | "100-500k" | ">500k",
    euProject: row.eu_project as boolean,
  };
}

export function rowToEntityProfile(row: ProfileRow): EntityProfile {
  const fundingTypesReceived: EntityProfile["fundingTypesReceived"] = [];
  if (row.public_funds) fundingTypesReceived.push("pubblico");
  if (row.private_funds) fundingTypesReceived.push("privato");
  if (row.eu_funds) fundingTypesReceived.push("eu");

  return {
    legalType: row.legal_type ?? "",
    province: row.province ?? "",
    region: row.region ?? "",
    operatingProvinces: row.operating_provinces ?? [],
    themes: row.themes ?? [],
    capacity: buildCapacity(row),
    documents: {
      statuto: row.doc_statuto, bilancio: row.doc_bilancio, runts: row.doc_runts,
      rasd: row.doc_rasd, durc: row.doc_durc, certificazioni: row.doc_certificazioni,
    },
    publicPartners: row.public_partners,
    privatePartners: row.private_partners,
    projectHistory: parseProjectHistory(row.project_history),
    fundingTypesReceived,
    cofundingCapacity: row.cofunding_capacity,
  };
}
