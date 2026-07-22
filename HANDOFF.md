# BANDI-SCANNER — Handoff scraping (sessione 2026-07-14)

Documento di consegna sullo **scraping**. Raccoglie vincoli, problemi/fix,
assunzioni sulla pipeline, decisioni architetturali e lavoro aperto, come
capiti e decisi in questa sessione (grilling incluso).

> **Aggiornamento — 2026-07-22.** Questo documento resta scaduto su due punti
> chiave della sezione 4/5 sotto, superati da lavoro successivo (vedi
> `.claude/CLAUDE.md` per l'architettura corrente, sempre tenuta aggiornata):
> - **Runtime fuori da Vercel (GitHub Actions)**: **non implementato, e superato**
>   da una soluzione diversa — `pg_cron`+`pg_net` (migration `0011`) invoca
>   `/api/cron/scrape` ogni **6 minuti**, l'esecuzione resta su Vercel (300s) ma
>   il collo di bottiglia "1 cron/giorno su Hobby" è risolto senza uscire da Vercel.
> - **Distillazione a lista-card**: non implementata come step generico; **risolta
>   diversamente** dal sistema di **archetipi** (`archetypes.ts`) — ogni fonte
>   "listing-completo" (es. sportesalute) ha un `sanitize`/parse dedicato invece di
>   una distillazione condivisa.
>
> Il resto (vincoli, problemi/fix, assunzioni fase 1/2) è ancora valido come
> riferimento storico. Questo file copre solo lo **scraping**; l'analisi AI
> (V1 quick/strong + V2-A chat cross-bando + V2-B crediti) è documentata in
> `.claude/CLAUDE.md`, non qui.

> **Stato del codice al momento della scrittura**
> - Su **main**: PR #44 (chunking), #45 (overlap+dedup), #48 (chunking robusto +
>   guardia update DB). L'estrattore su main è **ancora a 16 campi**.
> - Sul branch `claude/scraper-v2-deploy-verify-55uegc` (NON ancora mergiato):
>   commit `44410f3` — **prompt di discovery leggero** (solo `title/url/deadline`),
>   skip scaduti con data odierna, fix typecheck.
> - Le idee di **distillazione a lista-link** e **runner GitHub Actions** sono
>   **decise ma NON ancora implementate**: il codice manda tuttora l'HTML
>   sanitizzato intero (in chunk), non un elenco distillato.
>
> **Aggiornamento — PR #52 (implementata):** molte delle decisioni qui sotto sono
> ora in codice. Sistema di **archetipi** (`full` / `listing-light`, registro in
> `scraper/src/pipeline/archetypes.ts`), **throttle unico** a livello provider su
> tutte le chiamate LLM, **budget di tempo conservativo** (270s) con log di run
> troncato, **ordinamento fonti** per `priority` + `last_run_at` (migration `0010`),
> **scheduler** Supabase `pg_cron`+`pg_net` ogni 6 min → endpoint Vercel (migration
> `0011`). Timeout per-chiamata LLM 60s→35s. Debito: etichettare ogni fonte col suo
> archetipo. Restano NON implementati: distillazione a lista-link e runner GitHub Actions.

---

## 1. Vincoli tecnici (numeri reali)

| Vincolo | Valore | Dove / note |
|---|---|---|
| Timeout funzione Vercel | **300s** hard cap (Hobby) | `app/src/app/api/cron/scrape/route.ts` (`maxDuration = 300`) |
| Cron Vercel | **1 volta/giorno** su Hobby (no sub-giornaliero) | `app/vercel.json` (`0 3 * * *`) |
| Timeout per chiamata LLM | **60s** + 3 retry backoff | `scraper/src/providers/http.ts` (`DEFAULT_TIMEOUT_MS`), `retry.ts` |
| Throttle fase detail | **7s** tra un bando e l'altro | `scraper/src/pipeline/run.ts` (`DETAIL_THROTTLE_MS`) |
| Gemini free tier | **10 RPM · 250 RPD · 250K TPM** | collo di bottiglia = RPM/RPD, non i token |
| Gemini paid Tier 1 | 1.000 RPM · 10.000 RPD · 1M TPM | ~0,30$/1M token input |
| Context window (input) | Gemini **1M** · DeepSeek 64–128K · GLM 128K | **l'input non è mai stato il limite vero** |
| Cap output | ~8K (DeepSeek/GLM) · configurabile (Gemini) | **è questo il vincolo reale** per estrazioni ricche |
| `MAX_CHARS` | **RIMOSSO** | era un troncamento a 80K in `sanitize-html.ts`; sostituito dal chunking (PR #44) |
| Chunk | dimensione **35K**, overlap **5K**, tagli su confini semantici | `CHUNK_SIZE`, `OVERLAP`, `BOUNDARY_TAGS` in `extract-grants.ts` |
| Fetch pagine | Browserless (headless Chrome) | `browserless-fetcher.ts` |
| Supabase | **non è un collo di bottiglia** | scritture piccole; `scrape_debug` (HTML grande) ripulito da pg_cron ogni 3 giorni |

### Nota chiave sui vincoli
La context window in ingresso **non è mai stata il problema** (Gemini ha 1M
token; una pagina pulita ≈ 43K). I muri veri sono:
1. **Vercel 300s** (tempo di risposta) + cron giornaliero su Hobby.
2. **Timeout 60s per chiamata** su input grande e rumoroso.
3. **Gemini free tier**: 10 RPM (→ min 6s tra chiamate) e 250 RPD (quota giornaliera).
4. **Cap di output** (~8K su modelli economici) su pagine con molti bandi.

---

## 2. Problemi trovati e fix applicati

| Problema | Causa | Fix | Rif |
|---|---|---|---|
| Cron restituiva risposta cachata (0 bandi, 14s, nessuna API esterna) | Vercel cachava la GET | `Cache-Control: no-store` sulle route cron | PR #39 |
| Ogni estrazione falliva con HTTP 400 | Gemini `response_schema` rifiuta `type: ["string","null"]` | campi nullable con `nullable: true` | — |
| URL relativi scartati (Emilia-Romagna) | `coerce()` accettava solo URL assoluti | `resolveUrl()` con `new URL(raw, pageUrl)` | PR #41 |
| Logging cieco su 0 risultati | catch-and-return-`[]` silenzioso | log diagnostici in `extractGrants` | PR #40 |
| **sportesalute "gemini: errore di rete"** | **non** limite token: **timeout 60s** su HTML grande+rumoroso + muro 300s | chunking (#44), overlap+dedup (#45), tagli semantici + merge (#48) | #44/#45/#48 |
| Update DB che sbiancava campi | `diffGrant` patchava anche `null`/`""`/`[]` in ingresso | guardia: mai sovrascrivere un valore esistente con vuoto | PR #48 (`dedup.ts`) |
| Prompt estraeva anche gli scaduti | il prompt non diceva di scartarli; l'LLM non sapeva la data odierna | prompt inietta **OGGI** + esclude chiuso/scaduto/terminato/concluso/archiviato o scadenza passata | `44410f3` (branch) |
| Typecheck rosso (preesistente) | `m[1]` possibly-undefined; fake LLM nei test senza `name` | guardia in `collectHrefs` + `name` nei fake | `44410f3` (branch) |

### La lezione più importante
Il chunking **curava il sintomo sbagliato**: spezzavamo la pagina per battere il
**timeout**, non per farla stare nel modello. Fuori da Vercel (timeout nostro) e
con discovery leggera, il chunking dell'input **serve raramente**; resta utile
solo per **limitare l'output** su pagine con centinaia di bandi, tagliando su
righe/blocchi atomici così da non spezzare mai un bando.

---

## 3. Assunzioni sulla pipeline (listing vs detail)

Pipeline a **due fasi** (`run.ts`):

- **Fase 1 — Listing / Discovery**: fetch → `sanitizeHtml` → `extractGrants`.
  - **Assunzione (nuova, decisa)**: la discovery deve solo **scoprire i bandi**
    (nome + link + scadenza), non arricchirli. Prompt e schema resi **leggeri**
    (`44410f3`, branch). L'LLM **filtra** cosa è un bando e **scarta gli scaduti**.
- **Fase 2 — Detail / Enrichment**: per i bandi che ne hanno bisogno, fetch della
  pagina del singolo bando → `extractDetail` (16 campi ricchi) → `markDetailFetched`.
  - `findGrantsNeedingDetail` **già esclude** `status = "scaduto"`
    (`supabase-grants-db.ts`) → nessun bando scaduto riceve mai una chiamata detail.
  - Il throttle tra i bandi è ora un **gate unico a livello provider** (vedi PR #52).

### Scoperte empiriche (misurate sulla pagina reale sportesalute, 1MB)
- Sanitizzato: **191K char (~48K token)**; distillato ad **ancore+href: ~7.9K token**;
  distillato con **contesto-card: ~18.7K token** → **una sola chiamata**, niente chunk input.
- **L'ancora è sempre "Scopri di più"** → distillare la sola ancora è inutile:
  serve il **contesto della card** (titolo + un pezzo di descrizione).
- La card **contiene già** scadenza, ente, destinatari, importo, regione, tema.
- **214 card** reali (`Ente promotore` ×214), **206/214** con chiusura **a data**
  (→ serve passare OGGI), 1 con parola-stato; le parole-stato **sopravvivono** al sanitizer.
- **È un aggregatore**: i 214 link puntano a **214 domini esterni diversi** → una
  fase detail "classica" richiederebbe 214 fetch su 214 layout: costosa e in parte inutile.
- **Firehose misto**: molti item NON sono bandi da terzo settore (es. contributi
  amianto per privati, gare d'appalto, concessioni). 189/214 avevano destinatari
  "associazioni/sportive", ma non tutti sono rilevanti → **serve un filtro di rilevanza**.

### Distinzione emersa tra fonti
- **"Listing-completo"** (aggregatori tipo sportesalute): il bando è già tutto in
  lista → conviene estrarre lì e **saltare/limitare il detail**.
- **"Listing-magro"** (es. Emilia-Romagna): la lista ha solo titolo+link → discovery
  leggera + detail sulla pagina del bando.

---

## 4. Decisioni architetturali prese

1. **Runtime FUORI da Vercel → GitHub Actions** (budget 6h). Elimina sia i 300s sia
   il cron-giornaliero-Hobby; il codice gira `npm run scrape` con throttle rispettato.
   *(Deciso, non ancora implementato.)*
2. **Gemini free tier come budget rigido** (250 RPD). In test bastano **3-4 fonti**;
   se serve si **riducono le fonti**, non si paga. Paid = upgrade da un clic più avanti.
3. **Discovery leggera + detail ricco**: fase 1 estrae solo `title/url/deadline`;
   i 16 campi restano al detail. *(Implementato su branch `44410f3`.)*
4. **Skip scaduti in discovery**: l'LLM esclude dall'output i bandi chiusi/scaduti
   (parola-stato **o** scadenza < OGGI). Data odierna iniettata nel prompt.
   Micro-decisione: bandi **già scaduti** → **non inserirli** (opzione a). *(Implementato.)*
5. **Ruolo del chunking cambiato**: non più per input/timeout, ma solo per **limitare
   l'output** su pagine con tanti bandi; si taglia su **righe/blocchi atomici** (confini
   semantici) → **non spezza mai un bando**.
6. **Guardia update DB**: mai sbiancare un campo esistente con `null`/`""`/`[]`
   (una ri-estrazione fallita non deve cancellare dati). *(Implementato, PR #48.)*
7. **Scelta del provider secondaria**: DeepSeek / GLM / Gemini-paid sono tutti
   economici e integrabili via `openai-compat.ts`. La cosa che conta è **uscire dal
   free tier** quando serve, non quale provider.

---

## 5. Cosa resta da fare / problemi aperti

### Da implementare (deciso ma non fatto)
- [ ] **Runner GitHub Actions**: workflow schedulato che lancia lo scrape fuori da Vercel.
- [ ] **Distillazione a lista-card**: oggi il codice manda ancora l'HTML sanitizzato
      intero in chunk. Va introdotta la distillazione (card + href) come input della discovery.
- [ ] **Mergiare il branch** `claude/scraper-v2-deploy-verify-55uegc` (`44410f3`,
      discovery leggera) su main.

### Decisioni di design ancora aperte (grilling da riprendere)
- [ ] **Fonti aggregatore / listing-completo**: saltare il detail o catturare qualche
      campo extra già in lista? (sportesalute = 214 domini esterni → detail classico infeasible).
- [ ] **Filtro di rilevanza**: istruire l'LLM a tenere solo i bandi rilevanti per il
      terzo settore, scartando gare/concessioni/contributi per privati.
- [ ] **Cap detail per-run (cold start)**: il primo giro trova tutto nuovo → ~1 chiamata
      per bando può sforare i 250 RPD. Serve un tetto per-run + ripresa multi-giorno.
- [ ] **Identità dei bandi inline** (senza URL proprio): rompe il dedup per URL. Chiave
      sintetica (`hash(source_id + titolo + scadenza)`)? Rimandato finché non entra una fonte inline (opzione c).

### Problemi noti non risolti
- [ ] **Fondazione Cariplo**: bloccata da Cloudflare anti-bot su Browserless. La sua
      source nel DB è temporaneamente puntata a **sportesalute.eu** per test → **da ripristinare**.
- [ ] **Rate limit Gemini free**: chiamate troppo ravvicinate → 429. Va gestito col throttle.
- [ ] **Rigenerare i tipi Supabase** (`mapping.ts` usa cast `as Record<string, unknown>`).

### Prossimo passo consigliato
Riprendere il grilling dal punto "fonti aggregatore vs listing-magro", poi
implementare distillazione + runner GitHub Actions, quindi abilitare 3-4 fonti in test.
