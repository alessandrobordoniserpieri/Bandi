// Single home for the wordmark. Definitive Italian name decided in DEC-9
// (docs/redesign-ui-ux-concept.md §5.12): "Combacia" — keep the string here and nowhere else.

export const BRAND_NAME = "Combacia";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={className ? `app-brand ${className}` : "app-brand"}>
      {BRAND_NAME}
    </span>
  );
}
