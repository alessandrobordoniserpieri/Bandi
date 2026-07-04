// app/src/components/profile/section-contacts.tsx
"use client";
import type { ProfileRow } from "@/lib/profile/schema";
import { TextField, TextArea } from "./fields";

export function SectionContacts({ defaultValue }: { defaultValue?: Partial<ProfileRow> }) {
  const d = defaultValue ?? {};
  return (
    <>
      <TextField name="contact_name" label="Referente" defaultValue={d.contact_name ?? ""} />
      <TextField name="contact_role" label="Ruolo" defaultValue={d.contact_role ?? ""} />
      <TextField name="contact_email" label="Email" type="email" defaultValue={d.contact_email ?? ""} />
      <TextField name="contact_phone" label="Telefono" defaultValue={d.contact_phone ?? ""} />
      <TextArea name="notes" label="Note" defaultValue={d.notes ?? ""} />
    </>
  );
}
