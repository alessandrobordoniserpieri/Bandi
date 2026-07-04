// app/src/components/profile/section-themes.tsx
"use client";
import { TAGS } from "@/lib/matching";
import type { ProfileRow } from "@/lib/profile/schema";
import { MultiCheckbox, TextArea } from "./fields";
import { BENEFICIARY_OPTIONS } from "@/lib/profile/constants";

export function SectionThemes({ defaultValue }: { defaultValue?: Partial<ProfileRow> }) {
  const d = defaultValue ?? {};
  return (
    <>
      <MultiCheckbox name="themes" legend="Temi (almeno uno) *"
        options={TAGS} defaultValues={d.themes ?? []} />
      <TextArea name="activity_description" label="Descrizione attività"
        defaultValue={d.activity_description ?? ""} />
      <MultiCheckbox name="beneficiaries" legend="Destinatari principali"
        options={[...BENEFICIARY_OPTIONS]} defaultValues={d.beneficiaries ?? []} />
    </>
  );
}
