import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || "127.0.0.1";
const REFRESH_MS = 6 * 60 * 60 * 1000;
const MAX_DETAIL_PAGES_PER_SOURCE = 16;
const APP_DB_FILE = join(ROOT, "data", "app-database.json");

const sources = [
  ["Dipartimento per lo Sport - Bandi e avvisi", "https://www.sport.governo.it/it/bandi-e-avvisi/"],
  ["Piattaforma Avvisi e Bandi Sport", "https://avvisibandi.sport.governo.it/"],
  ["Sport e Salute - Bandi", "https://bandi.sportesalute.eu/"],
  ["Ministero del Lavoro - Terzo Settore", "https://www.lavoro.gov.it/temi-e-priorita/terzo-settore-e-responsabilita-sociale-imprese"],
  ["Ministero del Lavoro - Notizie", "https://www.lavoro.gov.it/notizie"],
  ["Italia Domani - Bandi PNRR", "https://www.italiadomani.gov.it/content/sogei-ng/it/it/catalogo-open-data/bandi-avvisi.html"],
  ["Regione Emilia-Romagna - Tutti i bandi", "https://bandi.regione.emilia-romagna.it/"],
  ["Regione Emilia-Romagna - Sport", "https://www.regione.emilia-romagna.it/sport/bandi"],
  ["Regione Emilia-Romagna - Sociale", "https://sociale.regione.emilia-romagna.it/leggi-atti-bandi/bandi"],
  ["Regione Emilia-Romagna - Terzo Settore", "https://sociale.regione.emilia-romagna.it/terzo-settore/progetti-finanziati"],
  ["Infobandi CSVnet", "https://infobandi.csvnet.it/"],
  ["Obiettivo Europa - Sport", "https://www.obiettivoeuropa.com/bandi/aperti/settore/sport/pagina/1/"],
  ["Obiettivo Europa - Inclusione sociale", "https://www.obiettivoeuropa.com/bandi/aperti/settore/inclusione-sociale-e-solidarieta/pagina/1/"],
  ["Con i Bambini", "https://www.conibambini.org/bandi-e-iniziative/"],
  ["Fondazione con il Sud", "https://www.fondazioneconilsud.it/bandi/"],
  ["Fondazione Cariplo - Bandi", "https://www.fondazionecariplo.it/it/bandi.html"],
  ["Compagnia di San Paolo - Bandi", "https://www.compagniadisanpaolo.it/it/contributi/"],
  ["Open Fundraising", "https://openfundraising.it/"],
  ["Granter", "https://granter.it/"],
  ["AssoBandi", "https://www.assobandi.com/"],
  ["ConfiniOnline - Bandi", "https://www.confinionline.it/it/Principale/bandi.aspx"],
  ["AgevolaPro - Terzo Settore", "https://agevolapro.net/"],
  ["Bandi e Agevolazioni - No Profit", "https://www.bandieagevolazioni.it/bandi-noprofit"],
  ["Incentivi.gov.it", "https://www.incentivi.gov.it/"],
  ["Invitalia - Incentivi", "https://www.invitalia.it/cosa-facciamo/creiamo-nuove-aziende"],
  ["EACEA Funding Opportunities", "https://www.eacea.ec.europa.eu/grants_en"],
  ["Creative Europe", "https://culture.ec.europa.eu/creative-europe/calls"],
  ["CERV Programme", "https://commission.europa.eu/funding-tenders/find-funding/eu-funding-programmes/citizens-equality-rights-and-values-programme_en"],
  ["Fondazione TIM", "https://www.fondazionetim.it/"],
  ["Enel Cuore", "https://www.enelcuore.it/"],
  ["Fondazione Vodafone Italia", "https://www.fondazionevodafone.it/"],
  ["UniCredit Foundation", "https://www.unicreditfoundation.org/"]
];

const tags = ["sport","giovani","scuola","inclusione","disabilità","anziani","salute","outdoor","welfare","comunità","rigenerazione urbana","turismo","volontariato","ambiente","formazione","pari opportunità","eventi","centri estivi","NEET","famiglie","impianti sportivi","povertà educativa","terzo settore","co-progettazione","quartieri","prevenzione","benessere","cultura","digitale","innovazione","occupazione","educazione","sostenibilità","salute mentale","migranti","donne","minori","periferie","servizio civile","capacity building","innovazione sociale","housing sociale","disagio giovanile","contrasto povertà","accessibilità","comunità educante"];
const legalTypes = [
  "ASD","Associazione Sportiva Dilettantistica",
  "SSD","Società Sportiva Dilettantistica","SSD a r.l.","SSD ARL",
  "RASD","ASD/SSD iscritta RASD",
  "EPS","Ente di Promozione Sportiva",
  "FSN","Federazione Sportiva Nazionale",
  "DSA","Disciplina Sportiva Associata",
  "Associazione Benemerita",
  "Comitato territoriale",
  "Associazione non riconosciuta",
  "Associazione riconosciuta",
  "APS","Associazione di Promozione Sociale",
  "ODV","Organizzazione di Volontariato",
  "ETS","Ente del Terzo Settore",
  "Rete associativa",
  "Ente filantropico",
  "Società di mutuo soccorso",
  "ONLUS",
  "ONG","OSC",
  "Cooperativa sociale",
  "Cooperativa sociale tipo A",
  "Cooperativa sociale tipo B",
  "Consorzio di cooperative sociali",
  "Impresa sociale",
  "Fondazione",
  "Fondazione ETS",
  "Fondazione di comunità",
  "Fondazione di origine bancaria",
  "Fondazione privata",
  "Fondazione pubblica",
  "Comitato",
  "Pro Loco",
  "Ente ecclesiastico",
  "Parrocchia",
  "Oratorio",
  "Ente religioso",
  "Comune",
  "Unione di Comuni",
  "Provincia",
  "Città Metropolitana",
  "Regione",
  "Azienda pubblica di servizi alla persona",
  "Azienda sanitaria",
  "AUSL",
  "Istituto scolastico",
  "Scuola",
  "Università",
  "Centro di ricerca",
  "Ente di formazione",
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
  "Sindacato",
  "Gruppo informale",
  "ATS",
  "Raggruppamento temporaneo"
];
let cache = { at: 0, payload: { grants: [], errors: [], sourcesChecked: 0 } };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS") return options(res);
    if (url.pathname === "/api/health") return json(res, { ok: true, app: "BANDI-SCANNER", at: new Date().toISOString() });
    if (url.pathname === "/api/auto-grants") return json(res, await autoGrants());
    if (url.pathname === "/api/database" && req.method === "GET") return json(res, await readAppDatabase());
    if (url.pathname === "/api/database" && req.method === "POST") return json(res, await writeAppDatabase(await readJsonBody(req)));
    const path = url.pathname === "/" ? "/grant-radar-matching.html" : url.pathname;
    const file = join(ROOT, path.replace(/^\/+/, ""));
    const body = await readFile(file);
    res.writeHead(200, { "content-type": contentType(file) });
    res.end(body);
  } catch (err) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Risorsa non trovata");
  }
});

if (process.argv.includes("--collect")) {
  await collectToFile();
} else {
  server.listen(PORT, HOST, () => {
    console.log(`BANDI-SCANNER disponibile su http://${HOST}:${PORT}/`);
  });
}

async function readAppDatabase() {
  try {
    const raw = await readFile(APP_DB_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { schemaVersion: 3, clients: [], grants: [], sources: [], matchHistory: [], autoScan: { lastRun: "", lastCount: 0, lastError: "" }, updatedAt: "", savedAt: "" };
  }
}

async function writeAppDatabase(payload) {
  const safe = {
    schemaVersion: payload.schemaVersion || 3,
    clients: Array.isArray(payload.clients) ? payload.clients : [],
    grants: Array.isArray(payload.grants) ? payload.grants : [],
    sources: Array.isArray(payload.sources) ? payload.sources : [],
    matchHistory: Array.isArray(payload.matchHistory) ? payload.matchHistory.slice(0, 500) : [],
    autoScan: payload.autoScan || { lastRun: "", lastCount: 0, lastError: "" },
    updatedAt: payload.updatedAt || new Date().toISOString(),
    savedAt: new Date().toISOString()
  };
  await mkdir(join(ROOT, "data"), { recursive: true });
  await writeFile(APP_DB_FILE, JSON.stringify(safe, null, 2));
  return { ok: true, savedAt: safe.savedAt, counts: { clients: safe.clients.length, grants: safe.grants.length, sources: safe.sources.length, matchHistory: safe.matchHistory.length } };
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000_000) throw new Error("Payload troppo grande");
  }
  return JSON.parse(body || "{}");
}

async function autoGrants() {
  if (Date.now() - cache.at < REFRESH_MS) return cache.payload;
  const results = await Promise.allSettled(sources.map(([name, url]) => scanSource(name, url)));
  const grants = [];
  const errors = [];
  for (const result of results) {
    if (result.status === "fulfilled") grants.push(...result.value);
    else errors.push(result.reason?.message || "Fonte non raggiungibile");
  }
  const unique = dedupe(grants).slice(0, 240);
  cache = { at: Date.now(), payload: { grants: unique, errors, sourcesChecked: sources.length } };
  return cache.payload;
}

async function collectToFile() {
  const payload = await autoGrants();
  const outDir = join(ROOT, "data");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "auto-grants.json"), JSON.stringify({ ...payload, generatedAt: new Date().toISOString() }, null, 2));
  console.log(`Raccolta completata: ${payload.grants.length} bandi/opportunità, ${payload.errors.length} fonti con errori.`);
}

async function scanSource(name, url) {
  const html = await fetchText(url, 12000);
  const candidates = extractCandidates(html, name, url).slice(0, MAX_DETAIL_PAGES_PER_SOURCE);
  const detailed = await Promise.all(candidates.map(candidate => enrichCandidate(candidate, name)));
  return detailed.filter(Boolean);
}

function extractCandidates(html, provider, baseUrl) {
  const text = stripHtml(html);
  const pageTitle = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || provider);
  const candidates = isLikelyGrant(pageTitle, baseUrl) && relevance(`${pageTitle} ${text.slice(0, 1200)}`) >= 5
    ? [makeGrant(pageTitle, baseUrl, text, provider)]
    : [];

  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html))) {
    const title = clean(stripHtml(match[2]));
    if (title.length < 8 || title.length > 180 || /^(home|privacy|contatti|cookie|login)$/i.test(title)) continue;
    if (isNoiseTitle(title)) continue;
    const href = match[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    const url = new URL(href, baseUrl).href;
    if (!isLikelyGrant(title, url)) continue;
    const localText = clean(`${title} ${text.slice(Math.max(0, match.index - 500), match.index + 1200)}`);
    if (relevance(localText) >= 3) candidates.push(makeGrant(title, url, localText, provider));
  }
  return candidates.sort((a, b) => relevance(`${b.title} ${b.summary}`) - relevance(`${a.title} ${a.summary}`)).slice(0, 20);
}

async function enrichCandidate(candidate, provider) {
  try {
    if (candidate.url && /^https?:\/\//i.test(candidate.url)) {
      const detailHtml = await fetchText(candidate.url, 9000);
      const detailText = stripHtml(detailHtml);
      if (relevance(`${candidate.title} ${detailText.slice(0, 2500)}`) >= 3) {
        return makeGrant(candidate.title, candidate.url, detailText, provider);
      }
    }
  } catch {
    return candidate;
  }
  return candidate;
}

function makeGrant(title, url, text, provider) {
  const lower = text.toLowerCase();
  const foundTags = tags.filter(tag => lower.includes(tag));
  const foundTypes = legalTypes.filter(type => new RegExp(`\\b${escapeRegex(type)}\\b`, "i").test(text));
  const normalized = clean(text);
  const digest = summarizeGrant(normalized);
  const deadline = inferDeadline(text);
  return {
    title: clean(title),
    provider,
    url,
    status: inferStatus(lower, deadline),
    deadline,
    area: inferArea(text, provider),
    amount: inferAmount(text),
    cofunding: inferCofunding(text),
    tags: foundTags.length ? foundTags : ["terzo settore"],
    eligibleTypes: foundTypes,
    summary: digest.summary,
    requirements: digest.requirements,
    expenses: digest.expenses,
    beneficiaries: digest.beneficiaries,
    detail: digest.detail
  };
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, {
    signal: controller.signal,
    headers: { "user-agent": "BANDI-SCANNER/1.0 beta local monitoring tool" }
  });
  clearTimeout(timer);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function summarizeGrant(text) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(clean).filter(isUsefulSentence);
  const summary = bestSentences(sentences, ["obiettivo","finalità","intende","sostiene","finanzia","contributo","progetti","iniziative"], 3);
  const requirements = bestSentences(sentences, ["possono","beneficiari","richiedenti","ammessi","requisiti","iscritti","runts","asd","ssd","aps","ets","odv","domanda","presentare"], 4);
  const expenses = bestSentences(sentences, ["spese","ammissibili","costi","attività","interventi","finanziabili","realizzazione"], 3);
  const deadline = bestSentences(sentences, ["scadenza","entro","presentazione","domande","ore"], 2);
  const amounts = bestSentences(sentences, ["dotazione","risorse","euro","contributo massimo","finanziamento","cofinanziamento"], 3);
  const evaluation = bestSentences(sentences, ["valutazione","criteri","punteggio","premialità","graduatoria","selezione","impatto","partenariato"], 3);
  const documents = bestSentences(sentences, ["allegati","documentazione","statuto","bilancio","rendiconto","dichiarazione","modulistica","formulario"], 3);
  return {
    summary: summary || text.slice(0, 360),
    requirements: requirements || text.slice(0, 700),
    expenses,
    beneficiaries: requirements,
    detail: [
      deadline ? `Scadenze e procedura: ${deadline}` : "",
      amounts ? `Risorse economiche: ${amounts}` : "",
      expenses ? `Spese/attività: ${expenses}` : "",
      evaluation ? `Criteri di valutazione: ${evaluation}` : "",
      documents ? `Documenti richiesti: ${documents}` : ""
    ].filter(Boolean).join("\n")
  };
}

function bestSentences(sentences, keywords, limit) {
  return sentences
    .map(sentence => ({ sentence, score: sentenceScore(sentence, keywords) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.sentence)
    .join(" ");
}

function sentenceScore(sentence, keywords) {
  const lower = sentence.toLowerCase();
  return keywords.reduce((total, keyword) => total + (lower.includes(keyword) ? 1 : 0), 0);
}

function relevance(text) {
  const lower = text.toLowerCase();
  const grantSignals = ["bando","avviso","call","contribut","finanziament","grant","fondo","sostegno","agevolaz","domanda","scadenza","manifestazione di interesse","voucher","incentiv","erogazion"];
  const targetSignals = ["sport","sociale","terzo settore","non profit","nonprofit","ets","aps","odv","asd","ssd","eps","volontariato","inclusione","welfare","giovani","disabilità","fondazione","associazione","cooperativa sociale","impresa sociale"];
  return grantSignals.filter(k => lower.includes(k)).length * 2 + targetSignals.filter(k => lower.includes(k)).length;
}

function inferStatus(lower, deadline = "") {
  if (deadline && new Date(deadline + "T23:59:59") < new Date()) return "Chiuso";
  if (lower.includes("in uscita")) return "In uscita";
  if (lower.includes("ricorrente")) return "Ricorrente";
  if (lower.includes("aperto") || lower.includes("domande") || lower.includes("scadenza")) return "Aperto";
  if (lower.includes("chiuso") || lower.includes("scaduto")) return "Chiuso";
  if (deadline) return "Aperto";
  return "Da verificare";
}

function inferDeadline(text) {
  const dates = extractCandidateDates(text);
  if (!dates.length) return "";
  const now = new Date();
  dates.sort((a, b) => b.score - a.score || Number(b.future) - Number(a.future) || Math.abs(a.time - now) - Math.abs(b.time - now));
  return dates[0].iso;
}

function extractCandidateDates(text = "") {
  const months = { gennaio:"01", febbraio:"02", marzo:"03", aprile:"04", maggio:"05", giugno:"06", luglio:"07", agosto:"08", settembre:"09", ottobre:"10", novembre:"11", dicembre:"12" };
  const dates = [];
  const push = (day, month, year, index) => {
    const d = Number(day);
    const m = Number(month);
    const y = Number(year);
    if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2020 || y > 2035) return;
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const time = new Date(iso + "T12:00:00").getTime();
    if (!Number.isFinite(time)) return;
    const context = text.slice(Math.max(0, index - 110), index + 160).toLowerCase();
    const positive = ["scadenza","scade","entro","presentazione","domanda","domande","candidatura","chiusura","termine","deadline","ore"].filter(k => context.includes(k)).length;
    const negative = ["pubblicato","avviso del","graduatoria","approvato","rendicontazione","evento","edizione","notizia"].filter(k => context.includes(k)).length;
    const future = time >= new Date().setHours(0,0,0,0);
    const score = positive * 8 + (future ? 5 : -3) - negative * 5;
    dates.push({ iso, time, future, score });
  };
  for (const match of text.matchAll(/\b([0-3]?\d)[/. -]([01]?\d)[/. -](20\d{2})\b/g)) push(match[1], match[2], match[3], match.index || 0);
  for (const match of text.toLowerCase().matchAll(/\b([0-3]?\d)\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(20\d{2})\b/g)) push(match[1], months[match[2]], match[3], match.index || 0);
  return dates;
}

function inferArea(text, provider) {
  const lower = `${text} ${provider}`.toLowerCase();
  const areas = ["Emilia-Romagna","Lombardia","Piemonte","Liguria","Valle d'Aosta","Veneto","Friuli-Venezia Giulia","Toscana","Lazio","Marche","Umbria","Abruzzo","Molise","Campania","Puglia","Basilicata","Calabria","Sicilia","Sardegna"];
  return areas.find(area => lower.includes(area.toLowerCase())) || "Italia";
}

function inferAmount(text) {
  const match = text.match(/(?:€|euro)\s?([0-9][0-9.\s]{2,})/i) || text.match(/([0-9][0-9.\s]{2,})\s?(?:€|euro)/i);
  return match ? match[1].replace(/\s/g, "") : "";
}

function inferCofunding(text) {
  const match = text.match(/cofinanziamento[^0-9%]{0,40}([0-9]{1,2}\s?%)/i);
  return match ? match[1].replace(/\s/g, "") : "";
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.url || item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isNoiseTitle(title) {
  return /nomina|presidente|componente commissione|qualifiche professionali|privacy|cookie|contatti|newsletter/i.test(title)
    && !/bando|avviso|contribut|finanziament|fondo/i.test(title);
}

function isLikelyGrant(title, url) {
  const value = `${title} ${url}`.toLowerCase();
  if (/\/it\/?$|\/notizie\/?$|\/bandi-e-avvisi\/?$|\/bandi\/?$|\/contributi\/?$|\/bandi-e-iniziative\/?$/.test(new URL(url).pathname)) {
    return false;
  }
  return /bando|bandi|avviso|avvisi|contribut|finanziament|fondo|fondi|agevolaz|manifestazione-di-interesse|opportunit|sport-e-periferie|dote-famiglia|8xmille|erasmus/.test(value);
}

function isUsefulSentence(sentence) {
  if (sentence.length < 35 || sentence.length > 420) return false;
  return !/vai al contenuto|vai alla navigazione|seguici su|esplora la sezione|cerca ministro|governo italiano/i.test(sentence);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function json(res, payload) {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(payload));
}

function options(res) {
  res.writeHead(204, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end();
}

function contentType(file) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  }[extname(file)] || "application/octet-stream";
}
