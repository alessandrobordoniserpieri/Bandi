"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  /** Heading naming the problem. Falls back to a branded default. */
  title?: string;
  /** One line explaining what happened and reassuring the user. */
  description?: React.ReactNode;
  /** Decorative lead icon. Hidden from assistive tech. */
  icon?: React.ReactNode;
  /** Recovery handler wired to Next's error-boundary retry (`unstable_retry`/`reset`). */
  onRetry: () => void;
  /** Label for the recovery control. */
  retryLabel?: string;
  className?: string;
}

/**
 * The one reusable error state, used by every route's `error.tsx`.
 *
 * Accessibility: the region is `role="alert"` so it is announced, and focus
 * moves to the heading on mount so keyboard/screen-reader users land on the
 * recovery context rather than being stranded where the failed content was.
 * Copy names the problem and the control names its action (craft-floor).
 */
export function ErrorState({
  title = "Qualcosa è andato storto",
  description = "Si è verificato un errore imprevisto. Riprova tra un momento.",
  icon,
  onRetry,
  retryLabel = "Riprova",
  className,
}: ErrorStateProps) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className={cn("error-state", className)} role="alert">
      {icon && (
        <div className="error-state-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="error-state-title" ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      {description && <p className="error-state-text">{description}</p>}
      <div className="error-state-actions">
        <Button type="button" onClick={onRetry}>
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}
