"use client"; // Error boundaries must be Client Components (Next.js 16)

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";

export default function ScadenzeError({
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
        title="Non è stato possibile caricare le scadenze"
        description="Non siamo riusciti a recuperare le scadenze dei tuoi bandi salvati. Riprova tra un momento."
        onRetry={retry}
      />
    </main>
  );
}
