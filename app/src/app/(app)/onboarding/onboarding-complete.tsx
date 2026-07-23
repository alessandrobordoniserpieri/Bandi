// app/src/app/(app)/onboarding/onboarding-complete.tsx
// DEC-12 (concept §5.9): honest onboarding completion screen. Replaces the old
// "Completa e vai a Esplora bandi" CTA — which implied the profile was done
// after only 3 of 8 sections — with the real completion percent and a named
// list of what's still missing, plus a double CTA.
"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CompletionBar } from "@/components/profile/completion-bar";
import { SECTION_META } from "@/lib/profile/constants";

// The 4 sections the wizard just collected (identity, territory, themes,
// contacts) are never listed as "missing" here — only the 4 that stay
// optional post-onboarding, in the order they'd be tackled in /profilo.
const STILL_MISSING = ["capacity", "documents", "partnerships", "history"] as const;

export function OnboardingComplete({ percent }: { percent: number }) {
  const missingLabels = STILL_MISSING.map((key) => SECTION_META[key].label);
  // The wizard form is swapped for this screen in place (no navigation), so
  // move focus to the heading to make sure screen reader users get an
  // announcement of the outcome instead of silence.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  return (
    <div className="onboarding-complete">
      <h2 ref={headingRef} tabIndex={-1}>Profilo creato</h2>
      <p>
        Il tuo profilo è al <strong>{percent}%</strong>. Puoi già esplorare i bandi: il
        matching migliora quando completi anche il resto.
      </p>
      <CompletionBar percent={percent} />
      <p className="onboarding-complete-missing">
        Ti manca ancora: {missingLabels.join(", ")}.
      </p>
      <div className="wizard-actions">
        <Button asChild variant="outline">
          <Link href="/">Lo faccio dopo</Link>
        </Button>
        <Button asChild>
          <Link href="/profilo">Completa ora</Link>
        </Button>
      </div>
    </div>
  );
}
