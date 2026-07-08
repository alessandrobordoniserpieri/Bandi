// app/src/components/grants/history-badge.tsx
import type { HistoryBadge as HistoryBadgeData, HistoryBadgeKind } from "@/lib/matching";

const COLOR: Record<HistoryBadgeKind, string> = {
  gia_finanziato: "#16a34a", // verde
  gia_candidato: "#2563eb", // blu
  conosce_erogatore: "#6b7280", // grigio
};

// §2.8 specific-history badge (NOT scored): "Già finanziato" / "Già candidato" /
// "Conosce l'erogatore". Rendered in the card slot and the detail.
export function HistoryBadge({ badge }: { badge: HistoryBadgeData }) {
  return (
    <span data-history={badge.kind} style={{ color: COLOR[badge.kind], fontWeight: 600 }}>
      {badge.label}
    </span>
  );
}
