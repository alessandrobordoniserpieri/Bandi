# Classificazione `grant_type`: co-progettazioni etichettate, avvisi amministrativi scartati

## Contesto

Due esigenze emerse dai dati reali in produzione, apparentemente lo stesso problema ma in realtà
distinte:

1. **Avvisi rumore.** Proroghe, rettifiche, errata corrige, revoche: modifiche amministrative a
   bandi già esistenti, non nuove opportunità. L'utente non le vuole ("non voglio avvisi in
   generale").
2. **Co-progettazioni.** Es. "Avviso pubblico … alla co-progettazione nell'ambito del Piano *Una
   giustizia più inclusiva*" (importo reale **1.371.182,26 €**, scadenza 2026-09-10). Sono
   opportunità *finanziate* ma di natura diversa: l'ETS co-progetta un piano pubblico invece di
   ricevere un contributo per un proprio progetto.

Fatto che smonta l'ipotesi iniziale "filtro avvisi senza soldi": **l'importo non è un segnale**.
La co-progettazione ha 1,37M; e per l'archetipo `sport-governo` l'importo si risolve solo nella
fase detail (a listing è `null`). Inoltre **tutti** i titoli del dominio iniziano con "Avviso"
(bando ≡ avviso, sinonimi nel Codice del Terzo Settore), quindi la parola "avviso" è inutile come
discriminante. Il segnale affidabile è la **natura del titolo**, disponibile già a listing.

Verificato sui 3 titoli attualmente in produzione (2026-07-18):

| Titolo (troncato) | Importo | Tipo atteso |
|---|---|---|
| "Avviso pubblico … alla **co-progettazione** … *Una giustizia*…" | 1.371.182,26 € | `co_progettazione` |
| "Avviso di selezione di eventi di rilevanza nazionale…" | 7.500.000 € | `bando` |
| "Avviso per la selezione di interventi … **ORATORI**…" | 50.000.000 € | `bando` |

## Decisioni di prodotto (già confermate)

- **Co-progettazioni → dentro, ma etichettate.** Entrano nel sistema con un tipo esplicito,
  mostrato in UI, così l'utente ne riconosce la natura. Serve un campo di classificazione in
  tabella (reversibile, alimenta anche un filtro UI).
- **Avvisi amministrativi → fuori, scartati a ingest.** Come i bandi scaduti (policy only-open,
  ADR-011): non entrano proprio, nessun record inutile in DB, nessuna fase detail sprecata.
- **UI co-progettazioni → badge + filtro lista.** Badge "Co-progettazione" su card e scheda, più
  un toggle nella lista per mostrarle/nasconderle.

## Architettura: un classificatore, un campo, due politiche

Invece di due filtri keyword separati e sovrapposti (che leggerebbero i titoli due volte), **un
solo classificatore** assegna a ogni bando un tipo. Poi due politiche distinte agiscono sull'esito.

```
classifyGrantType(title, summary) → "bando" | "co_progettazione" | "amministrativo"
                                        │              │                    │
                                     normale        etichetta            scarta
                                    (default)      + filtro UI          a ingest (mai salvato)
```

Il campo memorizzato assume solo `{bando, co_progettazione}`: `amministrativo` è un esito transitorio
del classificatore che si traduce in uno `skip` a ingest, non viene mai persistito.

### 1. Il classificatore — `scraper/src/pipeline/grant-type.ts` (nuovo)

```ts
export type GrantType = "bando" | "co_progettazione" | "amministrativo";
export function classifyGrantType(title: string, summary: string | null): GrantType;
```

Precedenza (amministrativo prima di co-progettazione prima di bando) e regole calibrate sui titoli
reali:

- **amministrativo** — alta precisione, **ancorato all'inizio del titolo**: il titolo inizia
  (eventualmente preceduto da "Avviso di/della/sul…") con uno di
  `proroga | differimento | rettifica | errata corrige | revoca | annullamento | modifica`.
  L'ancoraggio all'inizio è deliberato: un bando vero che cita "eventuale proroga dei termini" nel
  *corpo* **non** deve essere scartato — solo un avviso il cui *oggetto* è la modifica lo è.
  Regex indicativa:
  `^(avviso\s+(?:di|della|sul(?:la)?)\s+)?(proroga|differimento|rettifica|errata\s+corrige|revoca|annullamento|modifica)\b`
- **co_progettazione** — su titolo **o** summary:
  `co[-\s]?progettazione | co[-\s]?programmazione | manifestazione\s+di\s+interesse`.
- **bando** — default.

> **Ambiguo → co_progettazione, non amministrativo.** `manifestazione di interesse` può essere un
> precursore di co-progettazione (nel terzo settore quasi sempre lo è) o, raramente, un avviso
> procedurale. Nel dubbio lo trattiamo come `co_progettazione` (visibile + etichettato) perché
> **scartare è irreversibile mentre etichettare è a basso danno**: l'utente vede il badge e può
> comunque aprire il bando.

Perché scartare le proroghe è sicuro anche quando riguardano un bando che *abbiamo* già: la proroga
arriva come avviso separato con URL proprio (dedup è per URL), mentre il bando sottostante resta a
sistema e aggiorna la propria scadenza al re-scrape successivo del listing. Scartare l'avviso di
proroga non perde informazione.

### 2. Lato scraper

- **`ExtractedGrant`** (`types.ts`) guadagna `grantType: GrantType`.
- **`coerce`** (`extract-grants.ts`) imposta il default `"bando"` quando assembla il grant (unico
  punto di assemblaggio sia per il path `parse()` sia per il path LLM).
- **`enrich`** (`enrich.ts`) classifica: `grantType = classifyGrantType(grant.title, grant.summary)`.
  Gira per ogni grant di ogni archetipo via [run.ts](../../../scraper/src/pipeline/run.ts) (`saveGrant(enrich(raw), db)`) — quindi la classificazione è **universale**, non per-archetipo, com'è
  giusto ("non voglio avvisi in generale" vale per tutte le fonti). Titolo e summary sono entrambi
  disponibili già a listing, quindi nessuna dipendenza dall'importo differito.
- **`decide()`** (`dedup.ts`) guadagna un gate gemello di `isExpiredAtIngest`: se
  `incoming.grantType === "amministrativo"` → `{ action: "skip" }`. Vale **solo per gli insert**
  (come la policy only-open): un grant già a sistema che un giorno mutasse tipo non viene cancellato.
  Tutta la policy di ingest resta in un unico posto.
- **Save adapter** (`scraper/src/db/supabase-grants-db.ts`): persiste `grant_type` su insert
  (`diffGrant`/update non lo toccano — non è tra i campi che cambiano tra edizioni).
- **Migration** (`app/supabase/migrations/`): colonna `grant_type text not null default 'bando'`
  su `grants`. Nessun CHECK a DB (coerente con `status`/`funding_type`, validati a livello app).

### 3. Lato app

- **`database.types.ts`** rigenerato per includere `grant_type`.
- **`mapping.ts`**: `grantType: row.grant_type` nel `Grant` mappato.
- **`Grant`** (`app/src/lib/matching/types.ts`): campo `grantType: GrantType` (union locale
  all'app, allineata a quella dello scraper — l'app vede solo `bando | co_progettazione`).
- **Badge**: componente `GrantTypeBadge` che rende "Co-progettazione" quando
  `grantType === "co_progettazione"` (e nulla per `bando`), riusando il pattern di
  `verdict-badge.tsx`/`badge-tone.ts`. Inserito su `grant-card.tsx` e nella scheda dettaglio
  ([bandi/[id]/page.tsx](../../../app/src/app/(app)/bandi/[id]/page.tsx)).
- **Filtro lista**: `Filters.grantTypes?: GrantType[]` in [filters.ts](../../../app/src/lib/grants/filters.ts)
  (`applyFilters` + round-trip query-string `parseFilters`/`serializeFilters`, chiave `tipo`), più
  un toggle in `filter-bar.tsx` ("Mostra co-progettazioni" / default visibili — YAGNI: nessun
  nascondimento di default, il filtro è additivo come gli altri).

### 4. Backfill

Produzione ha 3 righe. La migration le mette tutte a `'bando'` (default). Poi:

- un re-scrape (che rimette `co_progettazione` su "Una giustizia" via il nuovo `enrich`), **oppure**
- una singola `UPDATE grants SET grant_type='co_progettazione' WHERE title ILIKE '%co-progettazione%'`.

Dato il volume minimo, il re-scrape è la via naturale e verifica anche l'end-to-end.

## Testing (TDD)

- **`grant-type.test.ts`** (scraper): tabella di casi sui titoli reali — co-progettazione,
  bando×2, e casi amministrativi sintetici ma realistici ("Proroga dei termini…", "Avviso di
  rettifica…", "Errata corrige…"), più il caso di controllo "bando che cita 'eventuale proroga' nel
  corpo → bando".
- **`dedup.test.ts`**: `decide()` con `grantType: "amministrativo"` su un incoming nuovo → `skip`;
  co_progettazione nuovo aperto → `insert`.
- **`enrich.test.ts`**: `enrich` popola `grantType` dal titolo.
- **`filters.test.ts`** (app): `applyFilters` con `grantTypes` filtra correttamente; round-trip
  query-string della chiave `tipo`.
- **`grants-components.test.tsx`** (app): `GrantTypeBadge` rende il badge per `co_progettazione`,
  nulla per `bando`.

## Non-goals

- Nessun nuovo asse finanziario: `grant_type` (natura dell'opportunità) è distinto da `funding_type`
  (strumento: fondo perduto/prestito/…).
- Nessun re-scoring del matching su `grant_type`: le co-progettazioni sono valutate come gli altri
  bandi; il badge è puramente informativo.
- Nessun nascondimento di default delle co-progettazioni: restano in lista, il filtro è opt-in.
- Il classificatore non usa l'importo (inaffidabile, e differito per sport-governo).

## File toccati

**Scraper:** `grant-type.ts` (nuovo), `types.ts`, `extract-grants.ts` (coerce), `enrich.ts`,
`dedup.ts`, `db/supabase-grants-db.ts`, `tests/{grant-type,dedup,enrich}.test.ts`.
**App:** migration SQL, `database.types.ts`, `lib/grants/mapping.ts`, `lib/matching/types.ts`,
`components/grants/{grant-type-badge,grant-card,filter-bar}.tsx`, `app/(app)/bandi/[id]/page.tsx`,
`lib/grants/filters.ts`, `__tests__/{filters,grants-components}`.
