import type { ClientProfile, Grant, BreakdownItem } from "./types";
import type { MatchContext } from "./calculate-match";
import { hasCompatibleLegalType, isClosedGrant, deadlineLabel } from "./helpers";

export function buildMatchBreakdown(
  client: ClientProfile,
  grant: Grant,
  ctx: MatchContext,
): BreakdownItem[] {
  const hasPartners = Boolean(
    client.publicPartners || client.privatePartners,
  );
  const hasAdmin =
    /disponibile|aggiornato|iscritto|ultim|bilancio sociale|accredit/i.test(
      ctx.adminReadiness,
    );
  const docScore = Math.round(
    ((ctx.documentProfile?.score || 0) / 100) * 14,
  );
  const historyScore = Math.min(
    21,
    (client.fundedProjects || client.reportingHistory ? 6 : 0) +
      Math.min(8, (client.documentFiles || []).length * 2) +
      ((client.fundingTypes || []).length ? 5 : 0) +
      Math.min(8, (ctx.sharedCriteria || []).length * 4),
  );
  const deadlineScore = isClosedGrant(grant)
    ? 0
    : Number.isFinite(ctx.days) && ctx.days < 8
      ? 3
      : Number.isFinite(ctx.days) && ctx.days <= 45
        ? 8
        : 6;

  const legalOk =
    !grant.eligibleTypes.length ||
    hasCompatibleLegalType(client.type, grant.eligibleTypes);

  return [
    {
      label: "Temi",
      value: ctx.tagScore,
      max: 32,
      note: ctx.shared.length
        ? `${ctx.shared.length} temi condivisi`
        : "temi deboli",
    },
    {
      label: "Forma",
      value: legalOk ? 18 : 0,
      max: 18,
      note: legalOk ? "ammessa" : "da verificare",
    },
    {
      label: "Territorio",
      value: ctx.areaHit ? 14 : 3,
      max: 14,
      note: ctx.areaHit ? "compatibile" : "fuori area",
    },
    {
      label: "Capacità",
      value:
        ctx.capacityGap >= 0
          ? 12
          : Math.max(0, 12 + ctx.capacityGap * 4),
      max: 12,
      note: ctx.capacityGap >= 0 ? "adeguata" : "sotto soglia",
    },
    {
      label: "Partner",
      value: hasPartners
        ? grant.complexity === "Alta"
          ? 10
          : 6
        : 0,
      max: 10,
      note: hasPartners ? "presenti" : "da costruire",
    },
    {
      label: "Documenti",
      value: Math.max(hasAdmin ? 6 : 0, docScore),
      max: 14,
      note:
        ctx.documentProfile?.label ||
        (hasAdmin ? "assetto pronto" : "mancano prove"),
    },
    {
      label: "Storico",
      value: historyScore,
      max: 21,
      note: historyScore ? "dati storici utili" : "storico scarso",
    },
    {
      label: "Scadenza",
      value: deadlineScore,
      max: 8,
      note: isClosedGrant(grant) ? "chiuso" : deadlineLabel(grant.deadline),
    },
  ];
}
