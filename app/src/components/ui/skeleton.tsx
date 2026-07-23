import * as React from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = React.ComponentProps<"span"> & {
  /** Convenience sizing — merged into `style`. Numbers are treated as px by React. */
  width?: number | string;
  height?: number | string;
};

/**
 * A single placeholder block used to build branded loading skeletons.
 *
 * It is decorative by definition — it stands in for content that has not
 * arrived — so it is always `aria-hidden`. The surrounding `loading.tsx`
 * owns the polite "loading" announcement for assistive technology.
 * The shimmer is a transform-driven sweep (no layout thrash) and is stilled
 * by the global `prefers-reduced-motion` rule.
 */
export function Skeleton({ className, width, height, style, ...props }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("skeleton", className)}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}
