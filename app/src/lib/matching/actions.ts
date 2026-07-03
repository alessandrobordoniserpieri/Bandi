import type { Grant, BreakdownItem } from "./types";
import { isClosedGrant } from "./helpers";

export function buildActions(
  grant: Grant,
  breakdown: BreakdownItem[],
  missingDocuments: string[],
): string[] {
  const actions: string[] = [];
  if (missingDocuments.length) {
    actions.push(`Per candidarti ti manca: ${missingDocuments.join(", ")}.`);
  }
  const territory = breakdown.find((b) => b.key === "territory");
  if (territory && territory.value === 0) {
    actions.push("Verifica se il bando ammette enti fuori dal suo ambito territoriale.");
  }
  const capacity = breakdown.find((b) => b.key === "capacity");
  if (capacity && capacity.value <= 2) {
    actions.push("Il bando è complesso per la tua capacità gestionale: valuta un partner capofila.");
  }
  if (isClosedGrant(grant)) {
    actions.push("Bando chiuso: usalo come riferimento storico, non è candidabile.");
  }
  return actions.slice(0, 4);
}
