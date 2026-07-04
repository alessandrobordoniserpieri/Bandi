// app/src/components/profile/section-documents.tsx
"use client";
import { groupForLegalType } from "@/lib/matching";
import type { ProfileRow } from "@/lib/profile/schema";
import { CheckboxField, TextField } from "./fields";

export function SectionDocuments(
  { defaultValue, legalType }: { defaultValue?: Partial<ProfileRow>; legalType?: string },
) {
  const d = defaultValue ?? {};
  const isSport = legalType ? groupForLegalType(legalType) === "SPORTIVI" : false;
  return (
    <>
      <CheckboxField name="doc_statuto" label="Statuto aggiornato" defaultChecked={d.doc_statuto} />
      <CheckboxField name="doc_bilancio" label="Bilancio approvato" defaultChecked={d.doc_bilancio} />
      <CheckboxField name="doc_runts" label="Iscrizione RUNTS" defaultChecked={d.doc_runts} />
      <CheckboxField name="doc_durc" label="DURC" defaultChecked={d.doc_durc} />
      <CheckboxField name="doc_certificazioni" label="Certificazioni" defaultChecked={d.doc_certificazioni} />
      {isSport && (
        <>
          <CheckboxField name="doc_rasd" label="Iscrizione RASD" defaultChecked={d.doc_rasd} />
          <TextField name="sport_body" label="Organismo sportivo di affiliazione"
            defaultValue={d.sport_body ?? ""} />
          <TextField name="rasd_number" label="Numero RASD" defaultValue={d.rasd_number ?? ""} />
        </>
      )}
    </>
  );
}
