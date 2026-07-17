# Dipartimento per lo Sport (avvisibandi.sport.governo.it): nuovo archetipo, fetch diretto, escalation economica condivisa

## Contesto

Fonte nuova, non ancora registrata: `https://avvisibandi.sport.governo.it/` (Dipartimento per lo
Sport, Presidenza del Consiglio dei Ministri — distinto da "Sport e Salute", già scrapato con
l'archetipo `sportesalute`). 22 bandi totali, nessuna paginazione necessaria.

Verificato empiricamente (2026-07-17): è un Next.js con dati incorporati nell'HTML via
`<script id="__NEXT_DATA__">`, niente Chrome headless necessario — stesso `fetchMode: "direct"`
già costruito per `er-sociale` (ADR di riferimento implicito: quella scelta architetturale).

- **Listing**: `GET /` → `props.pageProps.notices[]` (22 item): `_id`, `title`, `description`
  (HTML vero, editor Quill: `<h3>`, `<ul><li>`, `<strong>`, `<p>`), `image`, `dest` (categorie
  beneficiari), `schedule` (~16 fasi di workflow, keyed by nome fase).
- **Dettaglio**: `GET /bandi/<_id>` → **pagina pubblica reale**, univoca per bando (individuata
  leggendo il bundle JS: il bottone "Dettagli" chiama `router.push("/bandi/"+id)"`; i tentativi
  iniziali su `/avviso/`, `/notice/`, `/bando/` erano il pattern sbagliato). Risponde 200 senza
  autenticazione. `props.pageProps.notice` (singolare) ha tutti i campi del listing più `code`
  (es. "ORATORI 2026", assente nel listing), `attachments[]` (`{name, url, _id}`), `faq[]`, e
  molti campi da backoffice/workflow interno irrilevanti per noi (§ Non-goals).

## Decisioni

### 1. Registrazione fonte

Nuova riga `grant_sources`, stesso schema di `scrape_config` già usato per `er-sociale`:

```json
{
  "archetype": "sport-governo",
  "fetchMode": "direct",
  "listUrl": "https://avvisibandi.sport.governo.it/",
  "maxPages": 1
}
```

`url` = homepage umana (stesso valore di `listUrl`, non essendoci una pagina "umana" diversa
dall'API). `priority: "medium"` (default, come le altre fonti). `geoScope: "nazionale"`,
`area: null` (fonte ministeriale, non regionale).

### 2. Archetipo `sport-governo` — listing, zero LLM

`parse()` estrae il JSON `__NEXT_DATA__` da `raw` (rigetta con `[]` se il marker non c'è o il
JSON è malformato → fallback LLM come da contratto esistente di ogni archetipo), legge
`props.pageProps.notices`, mappa ogni notice:

| Campo nostro    | Sorgente                     | Regola |
|-----------------|-------------------------------|--------|
| `title`         | `title`                       | diretto |
| `url`           | `_id`                          | `https://avvisibandi.sport.governo.it/bandi/${_id}` — pagina reale, non un anchor sintetico |
| `summary`       | `description`                  | HTML → markup leggero (§4) |
| `deadline`      | `schedule.compilazione.end`    | ISO datetime → `YYYY-MM-DD` |
| `status`        | (derivato)                     | `deadline < oggi` → `scaduto`, `deadline` presente e futura → `aperto`, `deadline` assente/non parsabile → `null` (nessuno stato inventato) — niente stato esplicito in questa fonte, a differenza di `bando_state` in er-sociale |
| `area`          | — (costante)                   | `null` |
| `geoScope`      | — (costante)                   | `"nazionale"` |
| `eligibleTypes` | `dest`                         | tabella §3 |
| `tags`          | — (costante) + titolo/descr.   | `"sport"` sempre presente + regole keyword |
| `beneficiaries` | `dest` (etichette leggibili)   | join ", " |

**Regola di scarto (ADR-010)**: se `dest.length > 0` e `deriveEligibleTypes(dest).length === 0`
(nessuna categoria mappata — sui 22 bandi reali, solo `dest: ["pf"]`/persona fisica), il bando
**non viene emesso**. Se `dest` è vuoto (nessuna categorizzazione, non "categorizzato come non
nostro"), il
bando resta — stesso principio di "nessuna restrizione inventata" già in uso.

Config archetipo: `sanitize` = identità (non è HTML da sanificare, è JSON incorporato),
`urlSnapping: false`, `boundaryTags: []`, `detailRequired: false`, `detailEnabled: true` (§5).

### 3. Transcodifica `dest` → `eligibleTypes`

Match esatto sui token (non case-insensitive su prosa libera, sono enum puliti):

| `dest` token | `eligibleTypes` |
|---|---|
| `asd` | ASD - Associazione Sportiva Dilettantistica |
| `ssd` | SSD - Società Sportiva Dilettantistica |
| `eps` | EPS - Ente di Promozione Sportiva |
| `fed` | FSN - Federazione Sportiva Nazionale |
| `dsa` | DSA - Disciplina Sportiva Associata |
| `ets` | APS, ODV, ETS - Ente del Terzo Settore, Rete associativa ETS, ONG / OSC, Cooperativa sociale tipo A/B, Consorzio di cooperative sociali, Impresa sociale, Fondazione ETS, Società di mutuo soccorso, Ente filantropico (famiglia ETS ampia per D.Lgs 117/2017, stesso ragionamento di er-sociale — ma **`onlus` è un token separato qui**, quindi non duplicato in questa riga) |
| `onlus` | ONLUS |
| `pa` | Ente pubblico |
| `company` | Impresa |
| `ats` | Raggruppamento temporaneo / ATS |
| `diocesi`, `istituti_religiosi`, `societa_vita_apostolica`, `provincia_vita_apostolica`, `provincia_istituto_religioso` | Ente ecclesiastico civilmente riconosciuto (esiste già in `LEGAL_TYPES` — dioceti/istituti religiosi/società di vita apostolica sono legalmente enti ecclesiastici civilmente riconosciuti ex Concordato 1985; **correzione 2026-07-17**: la bozza iniziale li dava per non mappabili, era un errore, vedi ADR-010) |
| `parrocchia`, `ets_oratori` | Parrocchia / Oratorio |
| `enti_ecclesiali` | Ente religioso |
| `enti_altre_confessioni` | Ente religioso (confessioni non cattoliche — stesso tipo generico, non essendoci una categoria dedicata) |
| `pf` | nessun equivalente (persona fisica — candidatura individuale, non di un ente; unico caso reale che attiva lo scarto ADR-010 sui 22 bandi verificati) |

**`tags`**: `"sport"` sempre (fonte interamente sportiva, come `sportesalute`) + regole keyword
su titolo+descrizione: periferie→`periferie`, impiant\* sportiv\*→`impianti sportivi`,
famigli\*→`famiglie`, evento/eventi→`eventi`, giovan\*→`giovani`, disabil\*→`disabilità`.

### 4. Testo ricco: HTML → markup leggero

`description` è HTML Quill vero (non blocchi Slate come er-sociale) — più semplice: i titoli
sono `<h3>` reali, non paragrafi interamente in grassetto, quindi **non serve** l'euristica
`isFullyBoldParagraph` di er-sociale. Trascrittore a **regex mirate** (coerente con il resto
della pipeline: nessuna dipendenza DOM/cheerio è mai stata introdotta nello scraper, es.
`stripTags` in `archetypes.ts`), non un parser DOM vero — il markup Quill osservato è limitato e
regolare (solo `p, b, strong, ul, li, h3, a, span, em, u, br`), un regex mirato per tag basta:

- `<h1>`/`<h2>` → riga `## ...`; `<h3>`+ → riga `### ...`
- `<ul><li>...</li></ul>` → una riga `- ...` per `<li>`
- `<p>` → riga di testo semplice
- `<b>`/`<strong>`/`<em>`/`<u>`/`<span>`/`<a>` → solo il testo, tag scartati (nessun bold-as-heading da rilevare qui)

Riusa lo stesso contratto di output di `slateText` (righe `## `/`### `/`- `/testo semplice) che
il componente `Prose` dell'app già sa renderizzare — nessuna modifica lato frontend.

`code` (es. "ORATORI 2026"), quando presente, diventa la prima riga di `requirements`/`summary`
("Codice: ..."); stesso trattamento di CUP/CLP in er-sociale. Se assente, nessuna riga aggiunta
(mai "Codice: null" o simili).

### 5. Dettaglio — `parseDetail`, allegati, niente LLM per la struttura

`GET /bandi/<_id>` → `props.pageProps.notice`. Stessi campi del listing (ri-derivati dallo
stesso `description`/`dest`/`schedule`) più:

| Campo `DetailGrant` | Sorgente |
|---|---|
| `attachments` | `notice.attachments[]` → `{title: name, url, mimeType: null}` (la fonte non espone un mime-type; non lo inventiamo) |
| `requirements` | come `summary` del listing ma con `code` in testa (§4) |

Ignorati deliberatamente (§ Non-goals): `faq`, `form`, `backoffice`, `reporting`,
`reporting_attachments`, `payments`, `anticipation`, `visible`, `privacy`, `config`, `createdAt`/
`updatedAt`/`__v`.

### 6. Escalation economica condivisa (ADR-009)

`amount` e `cofundingPercentage` risolti da `escalateEconomicsToLLM` (nuovo modulo condiviso,
sostituisce l'attuale `escalateAmountToLLM` locale a er-sociale — vedi ADR-009 per il
ragionamento completo su scope ed esclusioni).

**Solo in fase di dettaglio**, e con **un solo** livello deterministico (non due, a differenza di
er-sociale): questa fonte non ha un campo `description` breve e sicuro distinto dal corpo lungo
(er-sociale sì: `description` è un riassunto di 1-3 frasi, `text` è il corpo lungo dove vivono le
cifre-esca) — qui `description` **è** il corpo intero, esattamente rischioso quanto il `text`
lungo di er-sociale (es. "di cui € 30.000.000" accanto al vero totale "100 milioni"). Un parse
non ancorato a frase sull'intero `description` in fase di listing o come "tier 1" riaprirebbe
esattamente il bug che l'ancoraggio a frase di er-sociale previene — quindi **niente estrazione
di `amount` in fase di listing** (resta `null`, risolto solo dal dettaglio) e un solo livello
deterministico in dettaglio: `extractAnchoredAmount` ancorato a frasi-segnale proprie di questa
fonte, diverse da er-sociale ("finanziata con **50 milioni di euro**" vs "le risorse ammontano
a") — **ricalibrate e verificate sui 22 bandi reali** prima di scrivere il regex finale (stessa
rigidità usata per er-sociale: verifica dal vivo, non frasi indovinate). Livello deterministico
per `cofundingPercentage`: regex "N%" ancorata a "cofinanziamento/compartecipazione/quota" (visto
in chiaro: "quota di compartecipazione del 15%").

## Alternative scartate

- **Solo listing, niente fase di dettaglio**: la `description` del listing è già completa, ma si
  perderebbero `attachments` (PDF) e `code`; con 22 elementi il risparmio di richieste è
  irrilevante. Scartata.
- **Archetipo generico `full` (Browserless + LLM)**: butterebbe via un JSON pulito e gratuito per
  pagare token su qualcosa di deterministico, e perderebbe la precisione della mappatura
  `dest → eligibleTypes` (l'LLM dovrebbe indovinarla dal prosa). Scartata.
- **Ingerire i bandi con `dest` non mappabile (es. `pf`) lasciando `eligibleTypes: []`**: vedi
  ADR-010 — collide con la semantica esistente di `[]` come "aperto a tutti". Scartata.
- **Far estrarre all'LLM anche `fundingType`/`minAmount`/`maxAmount`/`eligibleExpenses`/
  `applicationMethod`**: vedi ADR-009 — `min`/`max` sono le cifre-esca che l'estrazione
  dell'`amount` deve evitare, gli altri sono solo display. Scartata.

## Non-goals

- Ingestione di `posts` (bacheca news/annunci, non bandi) — fuori scope.
- Campi di dettaglio non legati al matching: `faq`, `form` (definizione dei campi del modulo di
  candidatura), `backoffice`, `reporting*`, `payments`, `anticipation`, `privacy`, `config`.
- Paginazione: non serve con 22 item in un'unica risposta.
- Filtro per data allo scrape: i bandi scaduti (es. edizioni 2023/2024) restano ingeriti e
  marcati `scaduto`, stessa convenzione di piattaforma — solo il bando con `dest: ["pf"]` (ADR-010)
  viene scartato, mai per scadenza.
- Attivazione dello scheduler in produzione senza ok esplicito — stesso protocollo di er-sociale.

## Testing

- Fixture reali: fetch una volta i 22 `notices` + i rispettivi `/bandi/<_id>`, salvate come
  fixture di test (non richieste di rete nei test).
- `parse()`: mapping campi, regola di scarto (dest tutto-non-mappato → skip; dest vuoto → non
  skip), transcodifica `dest`, derivazione `status` da `schedule.compilazione.end` vs oggi.
- Trascrittore HTML→markup leggero: h3→`###`, ul/li→`- `, p→testo semplice, tag inline scartati
  correttamente su description reali (non solo casi sintetici).
- `parseDetail()`: `attachments`, `code` in testa a `requirements`, campi irrilevanti ignorati
  senza crash su shape inattesa.
- `escalateEconomicsToLLM`: con `FakeLLMProvider`, sia per `sport-governo` sia retrofit dei test
  esistenti di `er-sociale` sul nuovo nome/forma condivisa.
- Percorso di verifica identico a er-sociale: dry-run → `grants_preview` → ok esplicito prima di
  qualunque scrittura su `grants` di produzione o attivazione scheduler.
