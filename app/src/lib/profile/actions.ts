// app/src/lib/profile/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  identitySchema, territorySchema, themesSchema, capacitySchema,
  documentsSchema, partnershipsSchema, historySchema, contactsSchema,
  deriveRegion,
} from "./schema";
import type { SectionKey } from "./constants";
import type { TablesInsert } from "@/lib/supabase/database.types";

export type ProfileActionState = { error: string } | { ok: true } | undefined;

const GENERIC_ERROR = "Controlla i campi e riprova.";

// Not exported on purpose: a "use server" module may only export async Server
// Actions (Next.js build rule). These sync helpers stay module-private.
// ---- FormData readers -------------------------------------------------------
function str(fd: FormData, k: string): string | undefined {
  const v = fd.get(k);
  return typeof v === "string" && v !== "" ? v : undefined;
}
function bool(fd: FormData, k: string): boolean {
  return fd.get(k) === "on" || fd.get(k) === "true";
}
function list(fd: FormData, k: string): string[] {
  return fd.getAll(k).filter((v): v is string => typeof v === "string" && v !== "");
}

// Build the raw (pre-validation) object for a section from FormData.
function readSection(section: SectionKey, fd: FormData): unknown {
  switch (section) {
    case "identity":
      return { name: str(fd, "name"), legal_type: str(fd, "legal_type"),
        founded_year: str(fd, "founded_year"), tax_code: str(fd, "tax_code"),
        website: str(fd, "website") };
    case "territory":
      return { province: str(fd, "province"), municipality: str(fd, "municipality"),
        operating_scope: str(fd, "operating_scope"),
        operating_provinces: list(fd, "operating_provinces") };
    case "themes":
      return { themes: list(fd, "themes"),
        activity_description: str(fd, "activity_description"),
        beneficiaries: list(fd, "beneficiaries") };
    case "capacity":
      return { stable_staff: str(fd, "stable_staff"),
        dedicated_admin: bool(fd, "dedicated_admin"),
        funded_projects_3y: str(fd, "funded_projects_3y"),
        reporting_experience: str(fd, "reporting_experience"),
        annual_budget: str(fd, "annual_budget"),
        eu_project: bool(fd, "eu_project") };
    case "documents":
      return { doc_statuto: bool(fd, "doc_statuto"), doc_bilancio: bool(fd, "doc_bilancio"),
        doc_runts: bool(fd, "doc_runts"), doc_rasd: bool(fd, "doc_rasd"),
        doc_durc: bool(fd, "doc_durc"), doc_certificazioni: bool(fd, "doc_certificazioni"),
        sport_body: str(fd, "sport_body"), rasd_number: str(fd, "rasd_number") };
    case "partnerships":
      return { public_partners: bool(fd, "public_partners"),
        public_partners_detail: str(fd, "public_partners_detail"),
        private_partners: bool(fd, "private_partners"),
        private_partners_detail: str(fd, "private_partners_detail"),
        networks: str(fd, "networks"), coprogettazione: bool(fd, "coprogettazione") };
    case "history": {
      let history: unknown = [];
      const raw = str(fd, "project_history");
      if (raw) { try { history = JSON.parse(raw); } catch { history = []; } }
      return { project_history: history,
        public_funds: bool(fd, "public_funds"), private_funds: bool(fd, "private_funds"),
        eu_funds: bool(fd, "eu_funds"), cofunding_capacity: str(fd, "cofunding_capacity"),
        income_sources: list(fd, "income_sources") };
    }
    case "contacts":
      return { contact_name: str(fd, "contact_name"), contact_role: str(fd, "contact_role"),
        contact_email: str(fd, "contact_email"), contact_phone: str(fd, "contact_phone"),
        notes: str(fd, "notes") };
  }
}

// Validate one section → a partial DB row (or an error). Derives region for territory.
function validateSection(section: SectionKey, raw: unknown):
  | { ok: true; patch: Partial<TablesInsert<"profiles">> }
  | { ok: false; error: string } {
  const schemas = {
    identity: identitySchema, territory: territorySchema, themes: themesSchema,
    capacity: capacitySchema, documents: documentsSchema, partnerships: partnershipsSchema,
    history: historySchema, contacts: contactsSchema,
  } as const;
  const parsed = schemas[section].safeParse(raw);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };

  // Coalesce undefined -> null so clearing an optional field (empty string in
  // the form, mapped to undefined by `str()`) is actually written: supabase-js
  // `.update()` drops `undefined` keys entirely, which would silently no-op a
  // field the user just blanked out. Arrays/booleans are never undefined here
  // (they carry zod `.default()`s), so this only affects optional scalars.
  const patch: Partial<TablesInsert<"profiles">> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    (patch as Record<string, unknown>)[k] = v === undefined ? null : v;
  }
  if (section === "territory") {
    patch.region = deriveRegion((parsed.data as { province: string }).province);
  }
  return { ok: true, patch };
}

export async function createProfile(
  _prev: ProfileActionState, formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const patch: Partial<TablesInsert<"profiles">> = { user_id: user.id };
  for (const section of ["identity", "territory", "themes"] as const) {
    const res = validateSection(section, readSection(section, formData));
    if (!res.ok) return { error: res.error };
    Object.assign(patch, res.patch);
  }

  // user_id is always set above; the cast only narrows the (statically)
  // optional field back to required — every other key was already checked
  // against real `profiles` columns when `patch` was built.
  const { error } = await supabase.from("profiles").insert(patch as TablesInsert<"profiles">);
  if (error) return { error: "Impossibile creare il profilo. Riprova." };
  redirect("/");
}

export async function updateProfileSection(
  section: SectionKey, _prev: ProfileActionState, formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const res = validateSection(section, readSection(section, formData));
  if (!res.ok) return { error: res.error };

  const { error } = await supabase
    .from("profiles")
    .update(res.patch)
    .eq("user_id", user.id);
  if (error) return { error: "Salvataggio non riuscito. Riprova." };

  revalidatePath("/profilo");
  return { ok: true };
}
