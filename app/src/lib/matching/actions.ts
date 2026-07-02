import type { ClientProfile, Grant } from "./types";
import type { MatchContext } from "./calculate-match";
import {
  isSportEntity,
  isClosedGrant,
  inferGrantEvaluationCriteria,
} from "./helpers";

export function buildMatchActions(
  client: ClientProfile,
  grant: Grant,
  ctx: MatchContext,
): string[] {
  const actions: string[] = [];

  if (!ctx.areaHit)
    actions.push(
      "Verificare domicilio operativo, sedi secondarie o partner territoriali ammessi.",
    );

  if (ctx.capacityGap < 0)
    actions.push(
      "Rafforzare capofila, rendicontazione o partenariato prima di candidare.",
    );

  if (ctx.documentProfile?.missing?.length)
    actions.push(
      `Completare fascicolo: ${ctx.documentProfile.missing.slice(0, 3).join(", ")}.`,
    );
  else if (
    !/disponibile|aggiornato|iscritto|ultim|bilancio sociale|accredit/i.test(
      ctx.adminReadiness,
    )
  )
    actions.push(
      "Caricare statuto, bilanci/rendiconti e prove di iscrizione ai registri.",
    );

  if (isSportEntity(client.type) && client.registryRasd !== "Iscritto")
    actions.push(
      "Completare il controllo RASD sul Registro nazionale prima della candidatura sportiva.",
    );

  if (
    !(client.publicPartners || client.privatePartners) &&
    grant.complexity !== "Bassa"
  )
    actions.push(
      "Costruire almeno un partner coerente con territorio e destinatari.",
    );

  if (
    !ctx.sharedCriteria.length &&
    inferGrantEvaluationCriteria(grant).length
  )
    actions.push(
      "Confrontare i criteri del bando con progetti già finanziati o relazioni caricate.",
    );

  if (Number.isFinite(ctx.days) && ctx.days < 8 && !isClosedGrant(grant))
    actions.push(
      "Valutare candidatura rapida solo se documenti e budget sono già pronti.",
    );

  if (isClosedGrant(grant))
    actions.push(
      "Usare il bando come storico, non come opportunità candidabile.",
    );

  return actions.slice(0, 4);
}
