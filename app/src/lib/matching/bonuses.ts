import type { EntityProfile, Grant, BonusItem } from "./types";

export function computeBonuses(profile: EntityProfile, grant: Grant): BonusItem[] {
  const items: BonusItem[] = [];
  const hasPartners = Boolean(profile.publicPartners || profile.privatePartners);

  // Partner bonus: proxy — high-complexity grants are the partnership-driven ones.
  if (hasPartners && grant.complexity === "alta") {
    items.push({ key: "partner", label: "Partnership utili per un bando complesso", value: 5 });
  }

  // Cofunding: manageable (+3) vs unsustainable (-5).
  const required = grant.cofundingRequired;
  const capacity = profile.cofundingCapacity;
  if (required != null && capacity != null) {
    if (capacity >= required) {
      items.push({ key: "cofunding", label: "Cofinanziamento gestibile", value: 3 });
    } else if (required > 20) {
      items.push({ key: "cofunding", label: "Cofinanziamento insostenibile", value: -5 });
    }
  }
  return items;
}
