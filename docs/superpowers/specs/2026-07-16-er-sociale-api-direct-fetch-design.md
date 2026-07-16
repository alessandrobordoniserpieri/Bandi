# Emilia-Romagna Sociale: fonte via API Plone, fetch diretto e dettaglio senza LLM

## Contesto

La fonte "Regione Emilia-Romagna - Bandi Terzo Settore" (id `2cd00bc8-058e-4909-94d8-c7d04934a869`,
url `https://sociale.regione.emilia-romagna.it/leggi-atti-bandi`) usa oggi l'archetipo di default
(`full`, estrazione LLM) e ha prodotto **5 bandi in 3 run**: la pagina HTML è un'app Volto da
~12MB, quasi tutto rumore, e l'LLM ne cava poco.

Verificato empiricamente (2026-07-16): il sito è Plone/Volto ed espone la **REST API ufficiale
Plone**, che copre sia la lista sia il dettaglio:

- **Listing**: `GET /leggi-atti-bandi/bandi/@search?portal_type=Bando&metadata_fields=...&b_size=100`
  con header `Accept: application/json` (senza header → HTTP 500). Una chiamata restituisce tutti i
  25 bandi (items_total 25 < b_size 100, nessuna paginazione necessaria) con campi strutturati:
  `title`, `@id` (url), `description`, `scadenza_bando`, `bando_state`, `destinatari`, `materie`,
  `tipologia_bando`.
- **Dettaglio**: `GET <url del bando>` con lo stesso header → oggetto completo con in più
  `apertura_bando`, `chiusura_procedimento_bando`, `riferimenti` (contatti), `text` (plaintext
  completo del bando in blocchi Slate), `approfondimento` (allegati PDF con url e content-type).

Il fetcher di produzione (`BrowserlessFetcher`) non può consumare questa API: naviga con Chrome
headless e non manda header custom; la navigazione diretta all'endpoint restituisce HTML/500.

## Decisioni

### 1. `DirectFetcher` — nuovo `PageFetcher` senza Chrome

HTTP GET semplice con `Accept: application/json` **puro** (verificato in implementazione: la
negoziazione Plone instrada un header composto `application/json, text/html;q=0.9` sulla
traversal HTML, che risponde 404 su `@search`; senza header risponde 500 — se in futuro una
fonte statica HTML avrà bisogno del fetch diretto, l'header diventerà configurabile allora).
Riusa le convenzioni di `providers/http.ts`: `defaultFetch`,
timeout 35s, `withRetry` su 429/5xx, `ProviderError` con `retryable`. Il corpo della risposta
(JSON o HTML) diventa `RawPage.html`, senza toccare il contratto esistente.

### 2. `CompositeFetcher` — dispatch per-fonte, zero modifiche a `runPipeline`

Implementa `PageFetcher`; contiene `BrowserlessFetcher` + `DirectFetcher` e sceglie **per
chiamata** leggendo `source.scrapeConfig.fetchMode`:

- `"direct"` → `DirectFetcher`
- assente / qualunque altro valore → `BrowserlessFetcher` (le 11 fonti esistenti non cambiano)

Si inietta al posto del fetcher attuale in `run-production.ts`; la firma di `runPipeline` e il
seam `PageFetcher` restano intatti (i test che mockano il fetcher non cambiano).

### 3. Config a DB: `scrape_config` unica fonte di verità

```json
{
  "archetype": "er-sociale",
  "fetchMode": "direct",
  "listUrl": "https://sociale.regione.emilia-romagna.it/leggi-atti-bandi/bandi/@search?portal_type=Bando&metadata_fields=scadenza_bando&metadata_fields=destinatari&metadata_fields=materie&metadata_fields=bando_state&metadata_fields=tipologia_bando&b_size=100"
}
```

- `url` della fonte resta la pagina umana; `listUrl` (campo già esistente in `ScrapeConfig`,
  già rispettato da `fetchPages`) punta all'endpoint API — visibile e correggibile da Supabase
  senza deploy.
- **Niente colonna dedicata** (due posti per lo stesso fatto divergono). Per la leggibilità:
  vista `sources_overview` che spacchetta il JSON in colonne
  (`name, archetype, fetch_mode, priority, last_run_at, last_error`), visibile nel Table Editor.
- La fonte viene rinominata "Regione Emilia-Romagna - Bandi Sociale (API)": puro promemoria umano,
  il codice non deduce mai comportamento dal nome.

### 4. Fix: la fase detail perde `scrapeConfig`

`run.ts:113-115` costruisce un `SourceConfig` sintetico `{id, name, url}` senza `scrapeConfig`:
qualunque dispatch per-fonte verrebbe silenziosamente ignorato nel dettaglio (fallback Browserless
per sbaglio). Fix: passare `scrapeConfig: source.scrapeConfig` (senza `listUrl`: l'url del grant
è già quello giusto — attenzione a non farsi sovrascrivere l'url del bando dal listUrl della
lista; il campo va omesso o neutralizzato nel SourceConfig sintetico).

### 5. Archetipo `er-sociale` — listing

`parse()` fa `JSON.parse` della risposta `@search` (ritorna `[]` su JSON malformato o shape
inattesa → fallback LLM come da contratto esistente) e mappa ogni item:

| Campo nostro    | Sorgente API                | Regola |
|-----------------|-----------------------------|--------|
| `title`         | `title`                     | diretto |
| `url`           | `@id`                       | diretto |
| `summary`       | `description`               | diretto |
| `deadline`      | `scadenza_bando`            | ISO datetime → `YYYY-MM-DD` |
| `status`        | `bando_state[0]`            | `inProgress`/`open` → `aperto`; `closed` → `chiuso`; altro → null |
| `area`          | — (costante)                | `"Emilia-Romagna"` |
| `geoScope`      | — (costante)                | `"regionale"` |
| `amount`        | `description`               | best-effort: prima occorrenza `/([\d.,]+)\s*euro/i` → parseItalianAmount |
| `eligibleTypes` | `destinatari`               | tabella sotto |
| `tags`          | `materie` + titolo/descr.   | tabella sotto |
| `beneficiaries` | `destinatari` join ", "     | testo umano |

Config archetipo: `sanitize` = identità (il JSON non va sanificato come HTML), `urlSnapping:
false` (niente href nel JSON; gli `@id` sono già URL canonici), `boundaryTags: []`,
`detailRequired: false`, `detailEnabled: true` (v. §6). Schema/istruzioni LLM di fallback:
versione ridotta stile sportesalute che spiega che il contenuto è JSON `@search`.

**Transcodifica `destinatari` → `eligibleTypes`** (token già puliti, match esatto case-insensitive):

- `"Enti del Terzo settore"` → lista ETS **ampia** per D.Lgs 117/2017 (le cooperative sociali e
  le imprese sociali *sono* ETS di diritto; il mapping stretto usato per sportesalute escluderebbe
  a torto una coop sociale da un bando aperto a tutti gli ETS):
  APS, ODV, ETS - Ente del Terzo Settore, Rete associativa ETS, ONLUS, ONG / OSC,
  Cooperativa sociale tipo A, Cooperativa sociale tipo B, Consorzio di cooperative sociali,
  Impresa sociale, Fondazione ETS, Società di mutuo soccorso, Ente filantropico
- `"Enti pubblici"` → Ente pubblico
- `"Partenariato pubblico/privato"` → Raggruppamento temporaneo / ATS
- `"Cittadini"`, `"Soggetti accreditati"` → nessun equivalente in LEGAL_TYPES, ignorati
- nessun match / lista vuota → `[]` (nessuna restrizione inventata)

**Transcodifica `materie` → `tags`**:

- `"Diritti e sociale"` → `welfare` (blanket-tag: l'intera sezione è il sociale regionale,
  analogo dello "sport" sempre-acceso di sportesalute)
- `"Ambiente"` → `ambiente`; `"Cultura"` → `cultura`; `"Sport"` → `sport`
- più regole keyword su titolo+descrizione (stesso stile sportesalute): povert→`contrasto povertà`,
  adolescen/giovani→`giovani`, infanzia/minori→`minori`, disabil→`disabilità`, anzian→`anziani`,
  volontariat→`volontariato`, famigli→`famiglie`, inclusion→`inclusione`

### 6. Dettaglio via API — seam `parseDetail`, niente LLM

`Archetype` guadagna `parseDetail?: (html: string) => DetailGrant | null` — speculare al `parse`
del listing. In `run.ts`, fase detail: se l'archetipo ha `parseDetail`, si usa quello sul corpo
della pagina di dettaglio; altrimenti `extractDetail` (LLM) come oggi. Le fonti esistenti non
cambiano.

`er-sociale.parseDetail` mappa dall'oggetto Bando completo:

| Campo DetailGrant | Sorgente API |
|-------------------|--------------|
| `openingDate`     | `apertura_bando` → `YYYY-MM-DD` |
| `deadline`        | `scadenza_bando` → `YYYY-MM-DD` |
| `contactInfo`     | `riferimenti` → plaintext dei blocchi Slate |
| `summary`         | `description` |
| `requirements`    | `text` → plaintext dei blocchi Slate, troncato a 5.000 caratteri |
| `beneficiaries`   | `destinatari[].title` join ", " |
| `eligibleTypes`/`tags` | stesse tabelle di transcodifica del listing |
| `attachments`     | `approfondimento[].children[]` → `{title, url, mimeType}` (v. §8) |

I 25 GET di dettaglio passano dal `DirectFetcher` (grazie al fix §4), sono throttled e
budget-aware come oggi, e **non consumano quota Gemini**.

### 7. Gemini: quasi zero, escalation mirata solo per l'importo

**Aggiornato dopo verifica su tutti i 25 bandi archiviati** (2026-07-16): i campi strutturati
coprono il matching, ma l'importo totale vive nel testo libero del corpo del bando, dove spesso
compaiono ANCHE cifre non pertinenti (limiti di spesa, soglie minime/massime di progetto) prima
del totale vero — un semplice "prima cifra vicino a euro" sbaglia (bug reale trovato: "200 euro"
invece di "390.000 euro").

Risoluzione a 3 livelli, dal più economico:
1. `description` (breve, 1-3 frasi) → `parseItalianAmount` generico, rischio basso.
2. Corpo lungo (`text`) → `extractTotalFromProse`, **ancorato** a frasi-segnale ("ammontano",
   "complessivamente", "somma complessiva", "messe a bando", "a disposizione", "destinate") —
   verificato dal vivo, **niente stem generico su "complessiv\*"**: il testo reale usa
   "complessivo" anche per soglie per-progetto ("valore minimo complessivo dei progetti... euro
   10.000,00"), che uno stem largo prenderebbe per sbaglio.
3. Solo se (1) e (2) non trovano nulla → **chiamata LLM mirata**, un solo campo, solo il
   plaintext (poche KB, mai HTML/JSON grezzo), schema minimo, istruzioni esplicite di ignorare
   limiti di spesa/soglie/ripartizioni.

Risultato sui 25 bandi reali: **20/25 risolti deterministicamente** (gratis), **5/25** con
escalation (bandi che genuinamente non dichiarano un totale complessivo, solo soglie per
progetto — corretto deferire, non indovinare).

`Archetype.parseDetail` è diventato asincrono e riceve l'`LLMProvider`, proprio per abilitare
questo pattern: un parser di codice può scalare UN campo specifico all'AI come ultima risorsa,
senza dover scegliere in blocco tra "tutto codice" e "tutto LLM" (`extractDetail` generico).
Pattern pensato per essere riusabile da futuri archetipi, non un caso singolo.

### 8. Allegati PDF: metadati subito, binari dopo

- **Subito**: colonna `attachments jsonb` su `grants` (migration) — array di
  `{title, url, mimeType}`. `DetailGrant` guadagna il campo; `markDetailFetched` lo salva.
  Niente binari in Postgres (cattiva pratica: gonfia il DB, query lente).
- **Dopo (fuori scope)**: download dei file in Supabase Storage (bucket) referenziato da DB —
  utile per link rot e OCR/analisi AI future. Vincolo noto: 1GB sul piano free.

### 9. Percorso di verifica (identico a sportesalute)

1. Test unitari su fixture JSON reali (listing + dettaglio) in `scraper/tests/`.
2. Run locale → `grants_preview` (che guadagna anch'essa `attachments jsonb`), ispezione umana.
3. Produzione e attivazione dello scheduler **solo su ok esplicito**.

## Alternative scartate

- **Browserless con `setExtraHTTPHeaders`**: probabilmente possibile (changelog Browserless), ma
  usare Chrome headless per un GET senza JS è spreco di quota, latenza e un servizio esterno in
  più che può fallire per motivi non nostri. Il fetch diretto è il default giusto per fonti-API.
- **Archetipo generico `plone-bandi`**: la piattaforma è standard PA e il riuso è probabile, ma
  si generalizza al **secondo** caso concreto, non al primo (YAGNI).
- **Colonna dedicata `fetch_mode`/`has_api`**: due fonti di verità divergono; vista
  `sources_overview` per la leggibilità.
- **Scelta del fetcher dentro `run.ts`** (due campi in `PipelineDeps`): più invasivo del
  CompositeFetcher a parità di risultato.

## Non-goals

- Download binari degli allegati (Supabase Storage) — rimandato.
- Estrazione LLM dal plaintext (spese/modalità/cofinanziamento) — decisione post-preview.
- Nessun cambiamento di comportamento per le fonti esistenti (Browserless + LLM restano il default).
- Paginazione `@search` (`b_start`): non serve con 25 item; da aggiungere solo se items_total
  supera b_size.

## Testing

- `DirectFetcher`: GET con header giusto, timeout, retry su 429/5xx, errore non-retryable su 4xx.
- `CompositeFetcher`: dispatch su `fetchMode` (direct/assente/valore ignoto), sia listing sia
  detail (verifica del fix §4 — il SourceConfig sintetico della fase detail conserva scrapeConfig
  ma non eredita il listUrl della lista).
- `er-sociale.parse`: fixture JSON reale → mapping campi, transcodifiche, date ISO, amount
  dalla descrizione, JSON malformato → `[]`.
- `er-sociale.parseDetail`: fixture oggetto Bando → openingDate/contactInfo/requirements/
  attachments; blocchi Slate mancanti → null senza crash.
- `run.ts`: con `parseDetail` presente l'LLM non viene chiamato nella fase detail (stub che
  lancia, come il test analogo del listing).
