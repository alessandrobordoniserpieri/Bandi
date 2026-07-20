# Analisi AI "forte" dei bandi (V1: singolo bando, long-context) — design

> Progettato con `superpowers:brainstorming` + `grilling` in coppia (interrogatorio relentless,
> una decisione alla volta con raccomandazione). Ogni decisione qui sotto è stata confermata
> esplicitamente dall'utente. Prezzi OCR/finestre di contesto verificati live il 2026-07-20.

## Contesto

Oggi la piattaforma:
- mostra i PDF dei bandi come **link di rimando** — `grants.attachments` è jsonb di soli metadati
  `{title, url, mimeType}`, i binari **non vengono mai scaricati** (restano sul sito della fonte);
- ha già un'**analisi AI rapida** (`/api/ai/analyze` → `analyze-grant.ts`) che gira **solo sui 16
  campi strutturati** del DB (titolo, importo, requisiti testuali, ecc.), **non legge i PDF**.
  Ritorna JSON strutturato a 4 sezioni (`analysisSchema`: punti di forza / rischi / suggerimenti /
  passi successivi), con quota oraria per-utente in `user_settings`
  (`ai_calls_count` / `ai_calls_window_start`), login + profilo obbligatori;
- **non ha** pgvector, embeddings né chunking da nessuna parte;
- ha il provider LLM astratto (`getProvider`, `LLMProvider.extract({html, schema, instructions})`,
  Gemini default) — interfaccia **solo-testo**.

Questa feature aggiunge un secondo livello di analisi che **legge il contenuto reale dei PDF** e
apre una **chat** consulenziale, personalizzata sul profilo dell'ente.

## Scope di V1 (e cosa è esplicitamente V2)

- **V1 = singolo bando, long-context, SENZA vector store.** Un bando tipico del terzo settore
  (1–5 allegati, requisiti di ~700–11.000 caratteri) sta comodamente nella finestra di Gemini 2.5
  Flash (~1M token). Il RAG a vettori guadagna il suo costo solo quando il corpus sfora il
  contesto — non è questo il caso. Il "risparmio da condivisione" (fare il lavoro una volta e
  riusarlo per tutti) si ottiene **cachando il testo estratto per bando in Postgres**, non
  vettorizzando: i vettori NON servono per quello.
- **V2 (documento separato):** chat **cross-bando** (confronta/interroga molti bandi insieme) →
  lì il corpus esplode oltre il contesto e i vettori diventano necessari. **V2 riusa al 100%
  l'estrazione di V1** (chunk+embed sopra il testo già estratto). Più il **layer crediti**
  trasversale. Vedi `2026-07-20-strong-ai-analysis-v2-crossbando-credits-design.md`.

Il pezzo costoso/fragile della feature **non sono gli embeddings** — è **estrarre testo pulito dai
PDF** (download, OCR degli scansionati, allegati grossi). Progettando l'estrazione come seam
autonomo e riusabile in V1, V2 diventa **additivo, non un rifacimento**.

## Decisioni (tutte confermate)

### 1. Due tier di analisi

L'analisi rapida esistente **resta invariata** come default istantaneo (16 campi DB, nessun PDF).
L'**"analisi forte"** è un **opt-in nuovo** che:
1. innesca l'estrazione del testo dei PDF del bando (asincrona, vedi §3);
2. produce un'analisi ricca — **stesso schema a 4 sezioni** (`analysisSchema`), ma **fondata sul
   testo reale degli allegati** invece che sui soli campi DB;
3. **sblocca la chat** (§5).

Motivazione (anche marketing): value ladder free→premium, gratificazione immediata al primo
impatto (la rapida è istantanea), lo stato bloccato/sbloccato è di per sé una CTA, e il tier
gratuito resta sostenibile perché l'estrazione costosa è gated dietro intenzione esplicita.

### 2. Trigger: on-demand pigro, condiviso

L'estrazione parte **solo quando un utente chiede l'analisi forte** di un dato bando. Il **primo**
utente autenticato la innesca; il risultato è **condiviso** — tutti gli altri ne beneficiano senza
ri-estrarre. Non si pre-estrae nulla proattivamente: la maggior parte dei bandi non verrà mai
analizzata in forte, pre-estrarli tutti sarebbe spreco di banda/CPU/storage e appesantirebbe lo
scraper (già stretto sul budget di 300s).

### 3. Esecuzione asincrona (riuso del pattern scraper)

L'estrazione **non** gira dentro la richiesta HTTP (su Vercel una function non può continuare a
lavorare dopo aver risposto). Riusa il pattern **pg_cron + pg_net + status-row** già in produzione
per lo scraper (migration 0011):
- il click utente scrive/aggiorna le righe `grant_documents` a `status='pending'`;
- un job Supabase schedulato raccoglie le righe pending e chiama un endpoint Vercel dedicato
  (`maxDuration` fino a 300s) che fa download + estrazione;
- è un **cron separato** da quello dello scraper → resta **spento** finché l'utente non dà l'ok
  all'accensione (come lo scraper). La build e i test di V1 non richiedono che sia acceso.

### 4. Motore di estrazione: libreria + OCR fallback, dietro seam `OcrProvider`

Nessuna dipendenza PDF/OCR esiste oggi. Pipeline (approccio **B**, copre tutto da subito):
1. **Libreria** (es. `unpdf`/`pdfjs` in Node) estrae il layer di testo — funziona sulla
   maggioranza dei PDF (generati da Word);
2. se la libreria restituisce ~zero testo (**PDF scansionato**), fallback su **OCR**: si
   **rasterizzano le pagine PDF in immagini** e si passano a un OCR;
3. l'OCR sta dietro un **seam `OcrProvider`** (interfaccia, come già fate per l'LLM), così il
   motore concreto è sostituibile.

**Default OCR: OCR.space (free tier, zero-billing)** — a volume V1 (~1.500 pagine scansionate/mese,
stima generosa) si resta gratis o quasi (~0,75–2$/mese ovunque). OCR "specializzato" (Mistral OCR,
Textract Forms a $65/1000, ABBYY) **scartato**: fa estrazione *strutturata* (tabelle/form) che qui
non serve — a noi basta "tirami fuori le parole", la fascia commodity ~$1,50/1000 identica ovunque.
Alternative dietro lo stesso seam: Google Cloud Vision (più accurato, richiede billing GCP),
Tesseract self-hosted (gratis ma fragile in serverless: bundle/memoria/rasterizzazione).

**NON si passa dall'LLM per l'OCR** (scelta esplicita dell'utente).

### 5. La chat: contesto, persistenza, troncamento

**Contesto (assemblato da NOI a ogni turno — l'LLM è stateless):**
1. system prompt: ruolo + **profilo dell'ente** (con enfasi "prestaci molta attenzione") + istruzioni;
2. **testo PDF estratto** del bando (artefatto **condiviso**);
3. **storico** conversazione (finestra recente, vedi troncamento);
4. la nuova domanda.

**Separazione privacy non negoziabile:** il **testo PDF estratto** è condiviso (uno per bando, in
`grant_documents`); il **profilo dell'ente** è privato del singolo utente, **iniettato a
query-time** e **mai** salvato dentro l'artefatto condiviso. Il profilo di un utente non finisce
mai nel materiale visto da un altro.

**Persistenza (scelta B):** la conversazione è **salvata per-utente** (`chat_messages`, RLS),
riprendibile tra sessioni/dispositivi — coerente col posizionamento premium del tier forte.

**Troncamento (best-practice verificata):** il metro è il **budget di token**, non il conteggio
turni. All'LLM si manda: profilo+PDF (cachati via prompt caching) + **finestra recente** di storico
limitata a **~8.000 token OPPURE ultimi ~8 scambi (16 messaggi), il primo che scatta**; i turni
più vecchi si scartano. **Nel DB resta l'intera conversazione** (l'utente la rivede tutta) — si
separa "cosa l'utente vede" (tutto) da "cosa si spedisce all'LLM" (finestra recente, economica).
Il **prompt caching** del blocco stabile profilo+PDF è la vera leva di costo (–50/–90% per
chiamata). Upgrade futuro documentato: sostituire lo scarto-secco col **riassunto** dei turni
vecchi (ibrido best-practice) quando le chat diventano molto lunghe.

**Caso limite:** bando con allegati enormi (centinaia di pagine) che sfora anche così → V1 applica
un **cap sul testo spedito + avviso** ("documenti molto voluminosi, analisi parziale"). È
esattamente il caso che in V2 giustifica i vettori.

### 6. Auto-attivazione UI: polling, no refresh manuale

La chat si attiva **da sola**: mentre lo stato è `pending`, la pagina **polla** un endpoint di
stato leggero a intervallo **> 4s** (proposta ~8–10s) finché `status=ready`, poi sostituisce da
sola il blocco con la chat. Più un **check di stato al load** (utente che se ne va e torna → vede
subito la chat se pronta). Nessun refresh manuale. (Upgrade in-stack futuro: Supabase Realtime per
il push istantaneo — si sostituisce senza toccare il resto.)

### 7. Modello dati

**Granularità: una riga per documento.** `grant_documents(grant_id, attachment_url, extracted_text,
status, ocr_used, error, …)`. Gestisce il **successo parziale** (3 PDF ok, 1 scansionato in OCR, 1
fallito), sai cosa è andato storto, ri-estrai solo il file rotto, e in **V2 i chunk/embedding si
attaccano naturalmente alla riga per-documento**. La readiness "bando pronto" è un **aggregato**
derivato dalle righe.

**Freschezza:** estrazione chiavata su **`(grant_id, attachment_url)`**. Nuovo URL → nuova riga,
estratta alla prossima richiesta. URL sparito → riga orfana ignorata. **Assunzione "stesso URL =
stesso contenuto"** (non si ri-scarica per rilevare modifiche in-place: raro, e un bando revisionato
di solito pubblica URL nuovo o è una *nuova edizione* → nuovo `grant_id`, estrazione fresca
automatica via dedup esistente). Escape hatch: bottone **"ri-analizza"** che forza la ri-estrazione.

**Disaccoppiamento:** lo **scraper NON tocca `grant_documents`**. Lo scraper possiede solo
`grants`+`attachments`; l'estrazione è innescata dall'**app** e il worker legge `grants.attachments`
per sapere quali PDF scaricare. Nessun accoppiamento nuovo nel pipeline di scraping.

`chat_messages(id, grant_id, user_id, role, content, created_at, …)` con RLS owner-only.

Nuove migration app (0014+): `grant_documents`, `chat_messages`, colonne rate-limit (§8), e lo
scheduler pg_cron dedicato all'estrazione (spento di default).

### 8. Accesso e rate-limit: tre secchielli separati

**Login + profilo obbligatori** per il tier forte (riuso del pattern di `/api/ai/analyze`).

Tre limiti **distinti e indipendenti** (numeri di partenza, configurabili):
1. **Analisi rapida:** quota oraria esistente, **invariata**;
2. **Chat (costo ricorrente):** nuovo contatore per-utente, **~30 messaggi/ora**;
3. **Estrazione (anti-abuso, è condivisa):** cap giornaliero per-utente sui **nuovi** bandi
   estratti, **~15/giorno**.

Tenerli separati li rende tarabili e non mescola il tier gratuito leggero col forte costoso.

**Seam di entitlement:** il controllo "questo utente può fare questa azione?" è **un'unica
funzione** che oggi risponde in base ai contatori di rate-limit e domani in base al **saldo
crediti** (V2) — cambiando solo dentro quella funzione. La porta ai crediti resta aperta a costo
zero (vedi spec V2).

### 9. Layout: tre stati + due fallimenti

Nella pagina di dettaglio bando, **sotto** il pannello dell'analisi rapida:
- **Stato 1 — Analisi rapida (default, esistente):** invariata, istantanea. Sotto, card "Analisi forte".
- **Stato 2a — CTA:** card con proposta di valore + bottone "Avvia analisi forte".
- **Stato 2b — In preparazione:** "Stiamo leggendo i documenti del bando — ~1 minuto. Puoi restare
  o tornare più tardi." + avanzamento; la pagina polla; la chat **non c'è ancora** (la sua comparsa
  È il segnale di pronto).
- **Stato 3 — Sbloccato:** analisi ricca (4 sezioni, badge "basata sui documenti ufficiali") + chat
  (storico persistito, input, 3–4 prompt suggeriti, nota "tiene conto del tuo profilo") + feedback
  rate-limit.
- **Fallimento totale:** nessun testo estraibile (tutti scansionati+OCR fallito o niente allegati)
  → "questo bando non ha documenti leggibili automaticamente", chat non offerta.
- **Fallimento parziale:** "alcuni allegati non erano leggibili" e si procede con ciò che c'è.

## Componenti e seam (unità isolate)

- `PdfTextExtractor` — dato un `attachment_url`: scarica → prova libreria → se scansionato,
  rasterizza + `OcrProvider`. Ritorna `{text, ocrUsed}` o un errore tipizzato. Testabile con fake.
- `OcrProvider` (seam) — `ocr(imageBytes) → text`. Default `OcrSpaceProvider`. Swappable.
- Worker di estrazione (endpoint Vercel chiamato da pg_cron) — legge righe `pending`, orchestra
  `PdfTextExtractor` per documento, scrive `extracted_text`/`status`/`error`.
- `buildStrongAnalysisDocument` — assembla profilo + testo PDF estratto per l'analisi ricca (riusa
  la forma di `buildAnalysisDocument`).
- `buildChatPrompt` — assembla system(profilo, enfasi) + PDF + finestra storico + domanda,
  applicando il troncamento a budget-token.
- `checkEntitlement(userId, action)` (seam) — oggi rate-limit, domani crediti.
- Route: `POST /api/ai/strong/prepare` (innesca), `GET /api/ai/strong/status` (polling),
  `POST /api/ai/strong/chat` (turno di chat). Tutte auth+profilo.

## Non-goal di V1

- Niente pgvector / embeddings / chunking (→ V2).
- Niente chat cross-bando (→ V2).
- Niente crediti/paywall (→ V2; ma il seam di entitlement è già predisposto).
- Niente rilevamento automatico di modifiche PDF in-place (assunzione "stesso URL = stesso
  contenuto" + bottone "ri-analizza").
- Niente Supabase Realtime (polling in V1; Realtime è l'upgrade in-stack).
- Niente riassunto dello storico chat (scarto-secco in V1; riassunto è l'upgrade).

## Rischi e mitigazioni

- **PDF scansionati** → coperti da OCR (fallback) da subito; fallimento onesto se anche l'OCR fallisce.
- **Estrazione > 300s** (bandi con molti/grossi PDF) → il worker processa per-documento e può
  spezzare su più giri di cron; lo stato resta `pending` finché non completa.
- **Costo LLM chat** → prompt caching del blocco profilo+PDF + finestra storico limitata.
- **Abuso estrazione** → cap giornaliero per-utente.
- **Free tier OCR.space esaurito** → swap del provider dietro il seam, nessun rifacimento.
