"use client";
import { useState } from "react";
import { useActionState } from "react";
import { createProfile, type ProfileActionState } from "@/lib/profile/actions";
import { SectionIdentity } from "@/components/profile/section-identity";
import { SectionTerritory } from "@/components/profile/section-territory";
import { SectionThemes } from "@/components/profile/section-themes";
import { SectionContacts } from "@/components/profile/section-contacts";
import { OnboardingComplete } from "./onboarding-complete";
import { Button } from "@/components/ui/button";

// DEC-12: 4 required onboarding sections — contacts joins identity/territory/
// themes as mandatory (needed to acquire the customer's contact data).
const STEPS = ["Identità", "Territorio", "Temi e attività", "Contatti"];

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(
    createProfile, undefined,
  );

  // DEC-12: on success, replace the form with the honest completion screen
  // (real percent + what's still missing) instead of redirecting straight to
  // "Esplora bandi" as if the profile were fully done.
  if (state && "ok" in state && state.ok) {
    return <OnboardingComplete percent={state.percent ?? 0} />;
  }

  return (
    <form action={action}>
      <div className="wizard-progress">
        {STEPS.map((_, i) => (
          <div key={i} className={`wizard-step${i < step ? " done" : ""}${i === step ? " active" : ""}`} />
        ))}
      </div>
      <p className="wizard-step-label">Passo {step + 1} di {STEPS.length}: <strong>{STEPS[step]}</strong></p>
      <div hidden={step !== 0}><SectionIdentity /></div>
      <div hidden={step !== 1}><SectionTerritory /></div>
      <div hidden={step !== 2}><SectionThemes /></div>
      <div hidden={step !== 3}><SectionContacts /></div>
      {state && "error" in state && <p role="alert" className="form-feedback" data-type="error">{state.error}</p>}
      <div className="wizard-actions">
        {step > 0 && <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>Indietro</Button>}
        {step < STEPS.length - 1
          ? <Button type="button" onClick={() => setStep(step + 1)}>Avanti</Button>
          : <Button type="submit" disabled={pending}>
              {pending ? "Salvataggio…" : "Crea profilo"}
            </Button>}
      </div>
    </form>
  );
}
