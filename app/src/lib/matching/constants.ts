import type { CapacityLevel, ComplexityLevel, DimensionKey } from "./types";

export const LEGAL_TYPES = [
  "ASD - Associazione Sportiva Dilettantistica",
  "SSD - Società Sportiva Dilettantistica",
  "SSD a r.l. - Società Sportiva Dilettantistica a responsabilità limitata",
  "ASD/SSD iscritta RASD",
  "EPS - Ente di Promozione Sportiva",
  "FSN - Federazione Sportiva Nazionale",
  "DSA - Disciplina Sportiva Associata",
  "AB - Associazione Benemerita",
  "Comitato territoriale EPS/FSN",
  "Società sportiva professionistica",
  "Associazione non riconosciuta",
  "Associazione riconosciuta",
  "APS - Associazione di Promozione Sociale",
  "ODV - Organizzazione di Volontariato",
  "ETS - Ente del Terzo Settore",
  "Rete associativa ETS",
  "Ente filantropico",
  "Società di mutuo soccorso",
  "ONLUS",
  "ONG / OSC",
  "Cooperativa sociale tipo A",
  "Cooperativa sociale tipo B",
  "Consorzio di cooperative sociali",
  "Impresa sociale",
  "Fondazione ETS",
  "Fondazione di comunità",
  "Fondazione di origine bancaria",
  "Fondazione privata",
  "Fondazione pubblica",
  "Comitato",
  "Comitato organizzatore",
  "Pro Loco",
  "Ente ecclesiastico civilmente riconosciuto",
  "Parrocchia / Oratorio",
  "Ente religioso",
  "Comune",
  "Unione di Comuni",
  "Provincia / Città Metropolitana",
  "Regione",
  "Azienda pubblica di servizi alla persona",
  "Azienda sanitaria / AUSL",
  "Istituto scolastico statale",
  "Istituto scolastico paritario",
  "Università",
  "Centro di ricerca",
  "Ente di formazione accreditato",
  "Ente pubblico",
  "Ente locale",
  "Soggetto gestore impianto sportivo",
  "Gestore centro sportivo",
  "Impresa",
  "PMI",
  "Start-up innovativa",
  "Società benefit",
  "Associazione di categoria",
  "Camera di Commercio",
  "Sindacato / organizzazione datoriale",
  "Gruppo informale",
  "Raggruppamento temporaneo / ATS",
  "Partner tecnico",
  "Partner istituzionale",
  "Altro",
] as const;

export const TAGS = [
  "sport",
  "giovani",
  "scuola",
  "inclusione",
  "disabilità",
  "anziani",
  "salute",
  "outdoor",
  "welfare",
  "comunità",
  "rigenerazione urbana",
  "turismo",
  "volontariato",
  "ambiente",
  "formazione",
  "pari opportunità",
  "eventi",
  "centri estivi",
  "NEET",
  "famiglie",
  "impianti sportivi",
  "povertà educativa",
  "terzo settore",
  "co-progettazione",
  "quartieri",
  "prevenzione",
  "benessere",
  "cultura",
  "digitale",
  "innovazione",
  "occupazione",
  "educazione",
  "sostenibilità",
  "salute mentale",
  "migranti",
  "donne",
  "minori",
  "periferie",
  "servizio civile",
  "capacity building",
  "innovazione sociale",
  "housing sociale",
  "disagio giovanile",
  "contrasto povertà",
  "accessibilità",
  "comunità educante",
  "comunità educanti",
] as const;

export const WEIGHTS: Record<DimensionKey, number> = {
  themes: 28, legalForm: 22, territory: 18, capacity: 14, documents: 12, trackRecord: 6,
};

// Neutral values when the grant carries no data for a dimension (I8).
export const NEUTRAL = { themes: 19, territory: 12, capacity: 9, documents: 8 } as const;

export const DOCUMENT_KEYS = ["statuto", "bilancio", "runts", "rasd", "durc", "certificazioni"] as const;
export type DocumentKey = (typeof DOCUMENT_KEYS)[number];

// 8 compatibility groups (design §2.2). Values are short subtype tokens for display.
export const LEGAL_TYPE_GROUPS = {
  SPORTIVI: ["ASD", "SSD", "SSD a r.l.", "ASD/SSD iscritta RASD"],
  PROMOZIONE: ["EPS", "FSN", "DSA", "AB", "Comitato territoriale EPS/FSN"],
  TERZO_SETT: ["APS", "ODV", "ETS", "Rete associativa ETS", "ONLUS", "ONG/OSC"],
  COOPERATIVE: ["Coop sociale A", "Coop sociale B", "Consorzio coop", "Impresa sociale"],
  FONDAZIONI: ["Fondazione ETS", "di comunità", "bancaria", "privata", "pubblica"],
  ENTI_PUBBL: ["Comune", "Unione Comuni", "Provincia", "Regione", "Ente pubblico"],
  FORMAZIONE: ["Istituto scolastico", "Università", "Centro ricerca", "Ente formazione"],
  IMPRESE: ["Impresa", "PMI", "Start-up", "Società benefit"],
} as const;
export type LegalGroup = keyof typeof LEGAL_TYPE_GROUPS;

// Full map from each of the 62 LEGAL_TYPES to its group (or null when it fits none).
// Keyed by the exact LEGAL_TYPES string.
export const LEGAL_TYPE_TO_GROUP: Record<string, LegalGroup | null> = {
  "ASD - Associazione Sportiva Dilettantistica": "SPORTIVI",
  "SSD - Società Sportiva Dilettantistica": "SPORTIVI",
  "SSD a r.l. - Società Sportiva Dilettantistica a responsabilità limitata": "SPORTIVI",
  "ASD/SSD iscritta RASD": "SPORTIVI",
  "EPS - Ente di Promozione Sportiva": "PROMOZIONE",
  "FSN - Federazione Sportiva Nazionale": "PROMOZIONE",
  "DSA - Disciplina Sportiva Associata": "PROMOZIONE",
  "AB - Associazione Benemerita": "PROMOZIONE",
  "Comitato territoriale EPS/FSN": "PROMOZIONE",
  "Società sportiva professionistica": "SPORTIVI",
  "Associazione non riconosciuta": "TERZO_SETT",
  "Associazione riconosciuta": "TERZO_SETT",
  "APS - Associazione di Promozione Sociale": "TERZO_SETT",
  "ODV - Organizzazione di Volontariato": "TERZO_SETT",
  "ETS - Ente del Terzo Settore": "TERZO_SETT",
  "Rete associativa ETS": "TERZO_SETT",
  "Ente filantropico": "TERZO_SETT",
  "Società di mutuo soccorso": "TERZO_SETT",
  "ONLUS": "TERZO_SETT",
  "ONG / OSC": "TERZO_SETT",
  "Cooperativa sociale tipo A": "COOPERATIVE",
  "Cooperativa sociale tipo B": "COOPERATIVE",
  "Consorzio di cooperative sociali": "COOPERATIVE",
  "Impresa sociale": "COOPERATIVE",
  "Fondazione ETS": "FONDAZIONI",
  "Fondazione di comunità": "FONDAZIONI",
  "Fondazione di origine bancaria": "FONDAZIONI",
  "Fondazione privata": "FONDAZIONI",
  "Fondazione pubblica": "FONDAZIONI",
  "Comitato": "TERZO_SETT",
  "Comitato organizzatore": "TERZO_SETT",
  "Pro Loco": "TERZO_SETT",
  "Ente ecclesiastico civilmente riconosciuto": "TERZO_SETT",
  "Parrocchia / Oratorio": "TERZO_SETT",
  "Ente religioso": "TERZO_SETT",
  "Comune": "ENTI_PUBBL",
  "Unione di Comuni": "ENTI_PUBBL",
  "Provincia / Città Metropolitana": "ENTI_PUBBL",
  "Regione": "ENTI_PUBBL",
  "Azienda pubblica di servizi alla persona": "ENTI_PUBBL",
  "Azienda sanitaria / AUSL": "ENTI_PUBBL",
  "Istituto scolastico statale": "FORMAZIONE",
  "Istituto scolastico paritario": "FORMAZIONE",
  "Università": "FORMAZIONE",
  "Centro di ricerca": "FORMAZIONE",
  "Ente di formazione accreditato": "FORMAZIONE",
  "Ente pubblico": "ENTI_PUBBL",
  "Ente locale": "ENTI_PUBBL",
  "Soggetto gestore impianto sportivo": "SPORTIVI",
  "Gestore centro sportivo": "SPORTIVI",
  "Impresa": "IMPRESE",
  "PMI": "IMPRESE",
  "Start-up innovativa": "IMPRESE",
  "Società benefit": "IMPRESE",
  "Associazione di categoria": "TERZO_SETT",
  "Camera di Commercio": "ENTI_PUBBL",
  "Sindacato / organizzazione datoriale": "TERZO_SETT",
  "Gruppo informale": null,
  "Raggruppamento temporaneo / ATS": null,
  "Partner tecnico": null,
  "Partner istituzionale": null,
  "Altro": null,
};

export function groupForLegalType(type: string): LegalGroup | null {
  return LEGAL_TYPE_TO_GROUP[type] ?? null;
}

// Macro-areas over the 47 tags — predisposition for future partial match. Every tag appears once.
export const TAG_MACRO_AREAS: Record<string, string[]> = {
  sport: ["sport", "outdoor", "impianti sportivi", "eventi", "benessere"],
  giovani: ["giovani", "scuola", "educazione", "NEET", "disagio giovanile", "povertà educativa", "centri estivi", "servizio civile", "comunità educante", "comunità educanti"],
  inclusione: ["inclusione", "disabilità", "anziani", "migranti", "donne", "minori", "pari opportunità", "accessibilità", "contrasto povertà"],
  welfare: ["welfare", "salute", "salute mentale", "prevenzione", "famiglie", "housing sociale"],
  comunita: ["comunità", "quartieri", "periferie", "rigenerazione urbana", "volontariato", "terzo settore", "co-progettazione", "capacity building"],
  cultura: ["cultura", "turismo", "ambiente", "sostenibilità"],
  innovazione: ["digitale", "innovazione", "innovazione sociale", "formazione", "occupazione"],
};

// Capacity × complexity scoring matrix (design §2.4). Rows = entity capacity, cols = grant complexity.
export const CAPACITY_MATRIX: Record<CapacityLevel, Record<ComplexityLevel, number>> = {
  Bassa: { bassa: 14, media: 7, alta: 2 },
  Media: { bassa: 14, media: 14, alta: 8 },
  Alta: { bassa: 14, media: 14, alta: 14 },
};

// Verdict thresholds (design §2.9).
export const VERDICT_THRESHOLDS = { candidabile: 75, daValutare: 50, bassaPriorita: 30 } as const;

// 107 provinces grouped by their region → the complete PROVINCE_TO_REGION map (I9).
const REGION_PROVINCES: Record<string, string[]> = {
  "Abruzzo": ["AQ", "CH", "PE", "TE"],
  "Basilicata": ["MT", "PZ"],
  "Calabria": ["CS", "CZ", "KR", "RC", "VV"],
  "Campania": ["AV", "BN", "CE", "NA", "SA"],
  "Emilia-Romagna": ["BO", "FC", "FE", "MO", "PC", "PR", "RA", "RE", "RN"],
  "Friuli-Venezia Giulia": ["GO", "PN", "TS", "UD"],
  "Lazio": ["FR", "LT", "RI", "RM", "VT"],
  "Liguria": ["GE", "IM", "SP", "SV"],
  "Lombardia": ["BG", "BS", "CO", "CR", "LC", "LO", "MB", "MI", "MN", "PV", "SO", "VA"],
  "Marche": ["AN", "AP", "FM", "MC", "PU"],
  "Molise": ["CB", "IS"],
  "Piemonte": ["AL", "AT", "BI", "CN", "NO", "TO", "VB", "VC"],
  "Puglia": ["BA", "BR", "BT", "FG", "LE", "TA"],
  "Sardegna": ["CA", "NU", "OR", "SS", "SU"],
  "Sicilia": ["AG", "CL", "CT", "EN", "ME", "PA", "RG", "SR", "TP"],
  "Toscana": ["AR", "FI", "GR", "LI", "LU", "MS", "PI", "PO", "PT", "SI"],
  "Trentino-Alto Adige": ["BZ", "TN"],
  "Umbria": ["PG", "TR"],
  "Valle d'Aosta": ["AO"],
  "Veneto": ["BL", "PD", "RO", "TV", "VE", "VI", "VR"],
};

export const PROVINCE_TO_REGION: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_PROVINCES).flatMap(([region, codes]) => codes.map((c) => [c, region])),
);

export const PROVINCES = Object.keys(PROVINCE_TO_REGION) as readonly string[];

export function regionForProvince(code: string): string | null {
  return PROVINCE_TO_REGION[code] ?? null;
}
