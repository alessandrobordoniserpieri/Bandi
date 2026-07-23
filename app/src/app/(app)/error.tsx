"use client"; // Error boundaries must be Client Components (Next.js 16)

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";

/**
 * Root error boundary for the authenticated app shell — covers "Esplora bandi"
 * (the home segment) and any route without its own error.tsx. The sidebar
 * layout stays mounted; only the content area shows this state.
 *
 * Next.js 16.2 forwards `unstable_retry` (re-fetch + re-render); older `reset`
 * (re-render only) is kept as a fallback so the retry works on either.
 */
export default function AppError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = unstable_retry ?? reset ?? (() => {});

  return (
    <main>
      <ErrorState
        icon={<AlertTriangle size={24} aria-hidden="true" />}
        title="Non è stato possibile caricare questa pagina"
        description="Si è verificato un errore imprevisto. Puoi riprovare: spesso è un problema temporaneo."
        onRetry={retry}
      />
    </main>
  );
}
