// Single home for the wordmark. "BANDI-SCANNER" is a placeholder; the definitive
// Italian name is decided in F4 (DEC-9), so keep the string here and nowhere else.

export const BRAND_NAME = "BANDI-SCANNER";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={className ? `app-brand ${className}` : "app-brand"}>
      {BRAND_NAME}
    </span>
  );
}
