import * as React from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateAction {
  label: string;
  href: string;
  variant?: "default" | "outline";
}

interface EmptyStateProps {
  /** Short heading naming what is (not) here. Joins the document outline as an <h2>. */
  title: string;
  /** One line explaining what will appear here and why it matters. */
  description?: React.ReactNode;
  /** Decorative lead icon (e.g. a lucide glyph). Hidden from assistive tech. */
  icon?: React.ReactNode;
  /** Primary call to action — an empty state should always offer a way forward. */
  action?: EmptyStateAction;
  /** Optional secondary path (rendered as an outline button). */
  secondaryAction?: EmptyStateAction;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The one reusable empty state for the app. Actionable by design (§6.1):
 * a heading, an explanation in the product's own Italian, and a CTA.
 * Used for empty lists (no grants, empty Kanban) and no-working-set panels.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div className={cn("empty-state", className)}>
      {icon && (
        <div className="empty-state-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="empty-state-title">{title}</h2>
      {description && <p className="empty-state-text">{description}</p>}
      {(action || secondaryAction) && (
        <div className="empty-state-actions">
          {action && (
            <Link
              href={action.href}
              className={buttonVariants({ variant: action.variant ?? "default" })}
            >
              {action.label}
            </Link>
          )}
          {secondaryAction && (
            <Link
              href={secondaryAction.href}
              className={buttonVariants({ variant: secondaryAction.variant ?? "outline" })}
            >
              {secondaryAction.label}
            </Link>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
