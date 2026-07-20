# Attribuzione `source_id` su bandi duplicati: priorità a chi può fare il detail

> Progettato con `superpowers:grilling` (interrogatorio strutturato, 4 decisioni), a partire da
> un'osservazione dell'utente durante l'audit di [[2026-07-20-provider-id-null-and-sport-bandi-field-audit]].

## Contesto

Quando due fonti scrapano lo stesso bando (stesso URL dopo normalizzazione — `dedup.ts`), oggi
`decide()` fa merge campo-per-campo con **last-writer-wins** su ogni chiave, `sourceId` incluso
(`dedup.ts:20-26`, `KEYS` include `"sourceId"` come una chiave qualunque). Non è un bug — è
il comportamento voluto per i campi dato (`diffGrant` non svuota mai un campo già popolato, vedi
il commento a `dedup.ts:45-47`) — ma per `sourceId` specifico ha una conseguenza concreta:

`findGrantsNeedingDetail(source.id, ...)` (`run.ts:104`, `supabase-grants-db.ts`) filtra **per
source_id** — la fonte "proprietaria" del record è l'UNICA che potrà mai arricchirlo col detail,
non solo alla prima scrittura ma per sempre, finché `source_id` non cambia di nuovo. Se
`source_id` finisce attribuito a una fonte con `archetype.detailEnabled === false` (es.
`sportesalute`, un aggregatore che rilista bandi di altre fonti — vedi memoria
`scraper-source-overlap`), quel bando non verrà **mai** arricchito col detail, anche se un'altra
fonte scraper che LO possiede realmente (`detailEnabled: true`, es. `sport-governo`, `er-sociale`)
lo ri-scrapa in un run successivo — perché quella fonte lo vede già presente con un `source_id`
diverso dal proprio e non lo tocca più (o, con last-writer-wins puro, glielo strapperebbe di
nuovo senza una vera priorità).

Non c'è overlap live in produzione oggi (`sportesalute` è `enabled: false`), quindi non serve
nessun backfill sui dati esistenti — questo è un fix preventivo per quando verrà riattivata o
per la prossima fonte aggregatore.

## Regola

Quattro livelli, valutati in ordine, per decidere il `source_id` finale quando un bando già
esistente (`active`, non scaduto) viene ri-visto da una fonte diversa:

1. **`detailEnabled` diverso tra le due fonti** → vince sempre quella con `detailEnabled: true`.
2. **Entrambe `detailEnabled: true`**:
   - `detail_fetched_at` del record esistente ancora `null` → la gara resta aperta, la nuova
     fonte può prendere possesso (nessun detail è stato ancora completato, nessun lavoro
     ridondante nel farlo fare a un'altra fonte capace).
   - `detail_fetched_at` già valorizzato (da chiunque) → **congelato per sempre**. Il detail
     fetch è già stato fatto sull'URL del bando stesso (non un URL fonte-specifico — `run.ts:118`
     passa `grant.url`), quindi ri-attribuire non guadagnerebbe nulla: stessa pagina, stessi dati,
     solo una fetch ridondante.
3. **Entrambe `detailEnabled: false`** → last-writer-wins, comportamento di oggi invariato (nessun
   segnale forte per preferire l'una o l'altra; non usare `grant_sources.priority` come tiebreaker
   perché governa solo la frequenza di scheduling, non l'affidabilità — accoppiarli
   confonderebbe due decisioni indipendenti).
4. **Fonte proprietaria del record esistente non più tra le fonti abilitate** (quindi
   `detailEnabled` sconosciuto) → trattata come "non vince mai contro una `detailEnabled: true`
   nota"; se la fonte in corso ha `detailEnabled: false`, nessun cambiamento (default
   last-writer-wins, nessuna fonte attiva viene scavalcata).

**Esplicitamente FUORI scopo**: il merge dei campi dato (`title`, `amount`, `tags`, ecc.) resta
esattamente com'è — questa regola tocca *solo* `sourceId`. Una fonte che "perde" l'attribuzione
può comunque contribuire dati più freschi/completi agli altri campi, che è un problema
indipendente e già ben gestito da `diffGrant`.

## Design tecnico

`decide()` (`dedup.ts`) resta **invariato** — è una funzione pura, ben testata, con una
responsabilità sola (merge campo-per-campo). La nuova regola vive in una funzione separata,
piccola e testabile da sola, chiamata PRIMA di `decide()`:

```ts
function resolveSourceId(
  incomingSourceId: string | null,
  existing: { sourceId: string | null; detailFetchedAt: string | null },
  detailEnabledBySource: Map<string, boolean>, // solo fonti abilitate, costruita una volta per run
  incomingDetailEnabled: boolean,
): string | null
```

`saveGrant` (`save.ts`) chiama `resolveSourceId(...)` e riscrive `toStore.sourceId` con l'esito
PRIMA di passare l'oggetto a `decide()` — che continua a vedere `sourceId` come una chiave
qualunque e non sa nulla della nuova policy. Se `resolveSourceId` dice "non riassegnare",
`toStore.sourceId` viene impostato uguale a `existing.sourceId`, e il diff esistente produce
naturalmente "nessun cambiamento" per quel campo.

Plumbing necessario (nessuna nuova query DB):

- `StoredGrant` guadagna `detailFetchedAt: string | null` (oggi esiste solo come colonna DB,
  mai mappata); `rowToStoredGrant` mappa `detail_fetched_at` → `detailFetchedAt`.
- `runPipeline` (`run.ts`) costruisce `detailEnabledBySource` una volta a inizio run, da
  `sources` (già caricato per intero da `loadEnabledSources`): per ogni fonte,
  `resolveArchetype(s.scrapeConfig?.archetype).detailEnabled`. Nessuna query in più — il dato
  c'è già in memoria.
- `saveGrant` guadagna un parametro con questo contesto (mappa + `detailEnabled` della fonte in
  corso, già noto in `run.ts` come `archetype.detailEnabled`).

## Non-goal

- Nessun backfill sui dati esistenti (nessun overlap live oggi).
- Nessun cambiamento al merge dei campi dato.
- Nessun nuovo concetto di "affidabilità fonte" — solo `detailEnabled`, già esistente.
