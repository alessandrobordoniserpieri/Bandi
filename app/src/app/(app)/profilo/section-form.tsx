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
    <form action={action} className="profile-form">
      {children}
      <div className="form-actions">
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>Salva sezione</button>
        {state && "error" in state && <span className="form-feedback" data-type="error" role="alert">{state.error}</span>}
        {state && "ok" in state && <span className="form-feedback" data-type="success">Salvato.</span>}
      </div>
    </form>
  );
}
