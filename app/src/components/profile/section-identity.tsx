// app/src/components/profile/section-identity.tsx
"use client";
import { LEGAL_TYPES } from "@/lib/matching";
import type { ProfileRow } from "@/lib/profile/schema";
import { TextField, SelectField } from "./fields";

export function SectionIdentity({ defaultValue }: { defaultValue?: Partial<ProfileRow> }) {
  const d = defaultValue ?? {};
  return (
    <>
      <TextField name="name" label="Nome ente" defaultValue={d.name ?? ""} required />
      <SelectField name="legal_type" label="Tipo legale" options={LEGAL_TYPES}
        defaultValue={d.legal_type ?? ""} required />
      <TextField name="founded_year" label="Anno di fondazione" type="number"
        defaultValue={d.founded_year ? String(d.founded_year) : ""} />
      <TextField name="tax_code" label="CF / P.IVA" defaultValue={d.tax_code ?? ""} />
      <TextField name="website" label="Sito web" defaultValue={d.website ?? ""} />
    </>
  );
}
