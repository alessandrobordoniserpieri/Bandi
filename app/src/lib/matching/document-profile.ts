import type { ClientProfile, Grant, DocumentProfile } from "./types";
import { isSportEntity } from "./helpers";

export function clientDocumentProfile(
  client: ClientProfile,
  grant: Grant | null = null,
): DocumentProfile {
  const docs = client.documentFiles || [];
  const hay = `${client.documents || ""} ${client.statuteStatus || ""} ${client.financialReports || ""} ${client.registryRunts || ""} ${client.registryRasd || ""} ${client.registryOther || ""} ${client.rasdNumber || ""} ${client.sportBody || ""} ${client.projectHistory || ""} ${client.fundedProjects || ""} ${client.reportingHistory || ""} ${docs.map((doc) => `${doc.name} ${doc.text || ""}`).join(" ")}`.toLowerCase();

  const checks = [
    {
      key: "statuto",
      label: "Statuto",
      required: true,
      re: /statuto|atto costitutivo|riforma sport|codice del terzo settore/,
    },
    {
      key: "rendiconti",
      label: "Bilancio/rendiconto",
      required: true,
      re: /bilancio|rendiconto|rendicontazione|conto economico|bilancio sociale/,
    },
    {
      key: "registri",
      label: "RUNTS/RASD o registri",
      required:
        isSportEntity(client.type) || /aps|odv|ets/i.test(client.type),
      re: /runts|rasd|registro nazionale|registro unico|iscritt|affiliazione|coni|sport e salute/,
    },
    {
      key: "progetti",
      label: "Relazione/progetti",
      required: Boolean(grant),
      re: /relazione|progetto|formulario|iniziativa|attività realizzata|beneficiari|risultati/,
    },
    {
      key: "budget",
      label: "Budget/preventivo",
      required: Boolean(grant?.cofunding || grant?.amount),
      re: /budget|preventivo|piano finanziario|quadro economico|cofinanziamento|risorse proprie/,
    },
    {
      key: "partner",
      label: "Partner/accordi",
      required: grant?.complexity === "Alta",
      re: /partner|partenariat|accordo|protocollo|lettera di adesione|rete|co-progettazione|coprogettazione/,
    },
    {
      key: "amministrativi",
      label: "DURC/assicurazioni/DSAN",
      required: false,
      re: /durc|dsan|assicuraz|dichiarazione sostitutiva|privacy|tracciabilità/,
    },
    {
      key: "finanziamenti",
      label: "Storico finanziamenti",
      required: false,
      re: /finanziat|contributo|bando vinto|graduatoria|ammesso al contributo|erogazione/,
    },
  ];

  const required = checks.filter((check) => check.required);
  const found = checks
    .filter((check) => check.re.test(hay))
    .map((check) => check.label);
  const missingRequired = required
    .filter((check) => !check.re.test(hay))
    .map((check) => check.label);

  const requiredScore = required.length
    ? Math.round(
        ((required.length - missingRequired.length) / required.length) * 75,
      )
    : 75;

  const bonus = Math.min(
    25,
    found.filter((label) => !required.some((check) => check.label === label))
      .length *
      6 +
      Math.min(10, docs.length * 2),
  );

  const score = Math.max(0, Math.min(100, requiredScore + bonus));

  const label =
    score >= 80
      ? "Fascicolo pronto"
      : score >= 55
        ? "Fascicolo utilizzabile, da integrare"
        : "Fascicolo da completare";

  return { score, label, found, missing: missingRequired, totalDocs: docs.length };
}

export function clientHasDocumentSignal(
  client: ClientProfile,
  label: string,
): boolean {
  const hay =
    `${client.documents || ""} ${client.statuteStatus || ""} ${client.financialReports || ""} ${client.registryRunts || ""} ${client.registryRasd || ""} ${client.rasdNumber || ""} ${client.sportBody || ""} ${(client.documentFiles || []).map((d) => `${d.name} ${d.text || ""}`).join(" ")}`.toLowerCase();

  const checks: Record<string, boolean> = {
    statuto: /statuto|aggiornato riforma|cts|runts/.test(hay),
    "atto costitutivo": /atto costitutivo/.test(hay),
    "bilancio/rendiconto": /bilancio|rendiconto|rendicont/.test(hay),
    RUNTS: /runts|iscritto/.test(hay),
    RASD: /rasd|registro nazionale|sport e salute/.test(hay),
    DURC: /durc/.test(hay),
    "preventivo/budget":
      /budget|preventivo|piano finanziario|quadro economico/.test(hay),
    partenariati: /partner|accordo|protocollo|partenariat/.test(hay),
    "relazione progetto": /relazione|progetto|formulario|domanda/.test(hay),
  };

  return (
    checks[label] ??
    new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(hay)
  );
}
