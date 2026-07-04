// app/src/components/profile/section-partnerships.tsx
"use client";
import type { ProfileRow } from "@/lib/profile/schema";
import { CheckboxField, TextField, TextArea } from "./fields";

export function SectionPartnerships({ defaultValue }: { defaultValue?: Partial<ProfileRow> }) {
  const d = defaultValue ?? {};
  return (
    <>
      <CheckboxField name="public_partners" label="Partner pubblici" defaultChecked={d.public_partners} />
      <TextField name="public_partners_detail" label="Quali partner pubblici"
        defaultValue={d.public_partners_detail ?? ""} />
      <CheckboxField name="private_partners" label="Partner privati" defaultChecked={d.private_partners} />
      <TextField name="private_partners_detail" label="Quali partner privati"
        defaultValue={d.private_partners_detail ?? ""} />
      <TextArea name="networks" label="Reti / consorzi di appartenenza" defaultValue={d.networks ?? ""} />
      <CheckboxField name="coprogettazione" label="Esperienza di co-progettazione"
        defaultChecked={d.coprogettazione} />
    </>
  );
}
