// app/src/app/(app)/onboarding/wizard.tsx
"use client";
import { useState } from "react";
import { useActionState } from "react";
import { createProfile, type ProfileActionState } from "@/lib/profile/actions";
import { SectionIdentity } from "@/components/profile/section-identity";
import { SectionTerritory } from "@/components/profile/section-territory";
import { SectionThemes } from "@/components/profile/section-themes";

const STEPS = ["Identità", "Territorio", "Temi e attività"];

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(
    createProfile, undefined,
  );
  return (
    <form action={action}>
      <p>Passo {step + 1} di {STEPS.length}: <strong>{STEPS[step]}</strong></p>
      <div hidden={step !== 0}><SectionIdentity /></div>
      <div hidden={step !== 1}><SectionTerritory /></div>
      <div hidden={step !== 2}><SectionThemes /></div>
      {state && "error" in state && <p role="alert">{state.error}</p>}
      <div>
        {step > 0 && <button type="button" onClick={() => setStep(step - 1)}>Indietro</button>}
        {step < STEPS.length - 1
          ? <button type="button" onClick={() => setStep(step + 1)}>Avanti</button>
          : <button type="submit" disabled={pending}>Completa e vai alla Dashboard</button>}
      </div>
    </form>
  );
}
