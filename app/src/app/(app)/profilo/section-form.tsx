// app/src/app/(app)/profilo/section-form.tsx
"use client";
import { useActionState, type ReactNode } from "react";
import { updateProfileSection, type ProfileActionState } from "@/lib/profile/actions";
import type { SectionKey } from "@/lib/profile/constants";

export function SectionForm(
  { section, children }: { section: SectionKey; children: ReactNode },
) {
  const bound = updateProfileSection.bind(null, section);
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(bound, undefined);
  return (
    <form action={action}>
      {children}
      {state && "error" in state && <p role="alert">{state.error}</p>}
      {state && "ok" in state && <p>Salvato.</p>}
      <button type="submit" disabled={pending}>Salva sezione</button>
    </form>
  );
}
