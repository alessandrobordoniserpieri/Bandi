import type { ClientProfile, Grant } from "./types";

export function legalTypeKey(value = ""): string {
  return String(value)
    .toLowerCase()
    .replace(/societa/g, "società")
    .replace(/associazione sportiva dilettantistica/g, "asd")
    .replace(/società sportiva dilettantistica/g, "ssd")
    .replace(/associazione di promozione sociale/g, "aps")
    .replace(/organizzazione di volontariato/g, "odv")
    .replace(/ente del terzo settore/g, "ets")
    .replace(/ente di promozione sportiva/g, "eps")
    .replace(/federazione sportiva nazionale/g, "fsn")
    .replace(/disciplina sportiva associata/g, "dsa")
    .replace(/[^a-z0-9àèéìòù]/g, "");
}

export function hasCompatibleLegalType(
  clientType = "",
  eligibleTypes: string[] = [],
): boolean {
  const client = legalTypeKey(clientType);
  return eligibleTypes.some((type) => {
    const eligible = legalTypeKey(type);
    return (
      client === eligible ||
      client.includes(eligible) ||
      eligible.includes(client)
    );
  });
}

export function isSportEntity(type = ""): boolean {
  return /asd|ssd|sport|eps|fsn|dsa|coni|rasd/i.test(type);
}

export function textOverlap(a = "", b = ""): boolean {
  const aw = String(a)
    .toLowerCase()
    .split(/[\s,;/.-]+/)
    .filter((w) => w.length > 3);
  const bw = String(b)
    .toLowerCase()
    .split(/[\s,;/.-]+/)
    .filter((w) => w.length > 3);
  return aw.some((w) => bw.includes(w));
}

export function deadlineDays(value: string): number {
  if (!value) return Infinity;
  return Math.ceil(
    (new Date(value + "T23:59:59").getTime() - Date.now()) / 86400000,
  );
}

export function isClosedGrant(grant: Grant): boolean {
  return grant.status === "Chiuso" || deadlineDays(grant.deadline) < 0;
}

export function isOpenGrant(grant: Grant): boolean {
  return !isClosedGrant(grant);
}

export function deadlineLabel(value: string): string {
  const days = deadlineDays(value);
  if (!value) return "senza scadenza";
  if (days < 0) return `scaduto da ${Math.abs(days)} giorni`;
  if (days === 0) return "scade oggi";
  return `scade tra ${days} giorni`;
}

export function matchSignals(
  text: string,
  rules: [string, RegExp][],
): string[] {
  return rules.filter(([, re]) => re.test(text)).map(([label]) => label);
}

export function inferGrantEvaluationCriteria(grant: Grant): string[] {
  const text =
    `${grant.title || ""} ${grant.summary || ""} ${grant.requirements || ""} ${grant.detail || ""} ${grant.notes || ""}`.toLowerCase();
  return matchSignals(text, [
    ["impatto sociale", /impatto|indicatori|beneficiari|risultati attesi|monitoraggio/],
    ["partenariato", /partenariat|rete|accordo|coprogettazione|co-progettazione/],
    ["cofinanziamento", /cofinanziamento|quota a carico|risorse proprie/],
    ["innovazione", /innovazion|sperimentazion|replicabil|scalabil/],
    ["capacità amministrativa", /rendicont|bilancio|esperienza|curriculum|gestione/],
    ["inclusione", /inclusion|fragil|disabil|povertà|welfare|giovani|minori/],
    ["urgenza territoriale", /perifer|aree interne|territorio|comunità|quartiere/],
  ]);
}

export function inferGrantRequestedDocuments(grant: Grant): string[] {
  const text =
    `${grant.requirements || ""} ${grant.detail || ""} ${grant.notes || ""}`.toLowerCase();
  return matchSignals(text, [
    ["statuto", /statuto/],
    ["atto costitutivo", /atto costitutivo/],
    ["bilancio/rendiconto", /bilancio|rendiconto|conto consuntivo|rendicontazione/],
    ["RUNTS", /runts/],
    ["RASD", /rasd|registro attività sportive|registro nazionale attività sportive/],
    ["DURC", /durc/],
    ["preventivo/budget", /preventivo|budget|piano finanziario|quadro economico/],
    ["partenariati", /lettera di partenariato|accordo|protocollo|partner/],
    ["relazione progetto", /relazione|progetto|formulario|domanda/],
  ]);
}
