import type { ClientProfile, Grant, MatchResult, BreakdownItem } from "./types";
import { CAPACITY_SCORE } from "./constants";
import {
  hasCompatibleLegalType,
  isSportEntity,
  textOverlap,
  deadlineDays,
  isClosedGrant,
  inferGrantEvaluationCriteria,
} from "./helpers";
import { clientDocumentProfile } from "./document-profile";
import { buildMatchBreakdown } from "./breakdown";
import { buildMatchActions } from "./actions";

export interface MatchContext {
  tagScore: number;
  shared: string[];
  areaHit: boolean;
  capacityGap: number;
  adminReadiness: string;
  sharedCriteria: string[];
  days: number;
  documentProfile: ReturnType<typeof clientDocumentProfile>;
}

export function calculateMatch(
  client: ClientProfile,
  grant: Grant,
): MatchResult {
  let score = 0;
  const plus: string[] = [];
  const minus: string[] = [];

  // Tags: max 32pt
  const clientSignalTags = [
    ...new Set([...(client.tags || []), ...(client.documentTags || [])]),
  ];
  const shared = clientSignalTags.filter((t) =>
    (grant.tags || []).includes(t),
  );
  const tagMax = Math.max(
    3,
    grant.tags.length || clientSignalTags.length || 1,
  );
  const tagScore = Math.min(32, Math.round((shared.length / tagMax) * 32));
  score += tagScore;
  shared.length
    ? plus.push(`${shared.length} tag coerenti`)
    : minus.push("pochi temi in comune");

  // Legal type: +18 or -10
  if (
    !grant.eligibleTypes.length ||
    hasCompatibleLegalType(client.type, grant.eligibleTypes)
  ) {
    score += 18;
    plus.push("forma giuridica ammessa");
  } else {
    score -= 10;
    minus.push("forma giuridica non evidente");
  }

  // Territory: +14 or -8
  const clientTerritory = [
    client.city,
    client.province,
    client.region,
    client.area,
    client.operationalSite,
  ]
    .filter(Boolean)
    .join(" ");
  const areaHit =
    textOverlap(clientTerritory, grant.area) ||
    grant.area.toLowerCase().includes("italia") ||
    grant.geoScope === "Nazionale" ||
    grant.geoScope === "Europeo";
  if (areaHit) {
    score += 14;
    plus.push("territorio compatibile");
  } else {
    score -= 8;
    minus.push("territorio da verificare");
  }

  // Capacity: +12 or -6/-12
  const capacityGap =
    (CAPACITY_SCORE[client.capacity] ?? 2) -
    (CAPACITY_SCORE[grant.minCapacity] ?? 2);
  if (capacityGap >= 0) {
    score += 12;
    plus.push("capacità adeguata");
  } else {
    score -= grant.complexity === "Alta" ? 12 : 6;
    minus.push("capacità sotto la soglia");
  }

  // Partners: +6/+10 or -5
  if (client.publicPartners || client.privatePartners) {
    score += grant.complexity === "Alta" ? 10 : 6;
    plus.push("partnership utili");
  } else if (grant.complexity !== "Bassa") {
    score -= 5;
    minus.push("partnership da costruire");
  }

  // Admin readiness: +9 or nothing
  const adminReadiness = [
    client.statuteStatus,
    client.financialReports,
    client.registryRunts,
    client.registryRasd,
    client.registryOther,
    client.rasdCheckStatus,
    client.rasdNumber,
    client.sportBody,
    client.documents,
  ].join(" ");
  if (
    /disponibile|aggiornato|iscritto|ultim|bilancio sociale|accredit/i.test(
      adminReadiness,
    )
  ) {
    score += 9;
    plus.push("assetto amministrativo documentato");
  } else {
    minus.push("documenti non mappati");
  }

  // Document profile: +7/+3 or -6
  const documentProfile = clientDocumentProfile(client, grant);
  if (documentProfile.score >= 80) {
    score += 7;
    plus.push("fascicolo documentale pronto");
  } else if (documentProfile.score >= 55) {
    score += 3;
    plus.push("fascicolo documentale utilizzabile");
  } else {
    score -= 6;
    minus.push(
      `fascicolo incompleto${documentProfile.missing.length ? `: ${documentProfile.missing.slice(0, 2).join(", ")}` : ""}`,
    );
  }

  // Track record: funded projects +6
  if (client.fundedProjects || client.reportingHistory) {
    score += 6;
    plus.push("storico progettuale utile");
  }

  // Track record: document files up to +8
  if ((client.documentFiles || []).length) {
    score += Math.min(8, (client.documentFiles || []).length * 2);
    plus.push("documenti caricati e analizzati");
  }

  // Track record: funding types +5
  if ((client.fundingTypes || []).length) {
    score += 5;
    plus.push("storico finanziamenti letto dai documenti");
  }

  // Track record: shared criteria up to +8
  const grantCriteria = inferGrantEvaluationCriteria(grant);
  const sharedCriteria = (client.winningCriteria || []).filter((c) =>
    grantCriteria.some((g) => textOverlap(c, g) || c === g),
  );
  if (sharedCriteria.length) {
    score += Math.min(8, sharedCriteria.length * 4);
    plus.push("criteri vincenti già presenti nello storico");
  }

  // Cofunding bonus: +5 or -4
  if (client.cofunding || /0\s*%|nessun/i.test(grant.cofunding)) {
    score += 5;
    plus.push("cofinanziamento gestibile");
  } else if (grant.cofunding) {
    score -= 4;
    minus.push("cofinanziamento da valutare");
  }

  // Deadline: -30 closed, -10 <8d, +4 <=45d, +6 in uscita
  const days = deadlineDays(grant.deadline);
  if (isClosedGrant(grant)) {
    score -= 30;
    minus.push("bando chiuso: resta solo storico");
  } else if (Number.isFinite(days) && days < 8) {
    score -= 10;
    minus.push("scadenza molto vicina");
  } else if (Number.isFinite(days) && days <= 45) {
    score += 4;
    plus.push("scadenza gestibile");
  } else if (grant.status === "In uscita" || grant.status === "Ricorrente") {
    score += 6;
    plus.push("tempo per prepararsi");
  }

  // Priority bonus
  if (client.priority >= 8) score += 4;

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  const ctx: MatchContext = {
    tagScore,
    shared,
    areaHit,
    capacityGap,
    adminReadiness,
    sharedCriteria,
    days,
    documentProfile,
  };

  const breakdown = buildMatchBreakdown(client, grant, ctx);
  const actions = buildMatchActions(client, grant, ctx);

  return {
    score: finalScore,
    plus,
    minus,
    sharedTags: shared,
    breakdown,
    actions,
    client,
    grant,
  };
}
