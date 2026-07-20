# provider_id sempre NULL + audit campi sugli 11 bandi sport (vecchi inclusi)

> Debug condotto con `superpowers:systematic-debugging` (Iron Law: nessun fix prima della root
> cause). Fasi 1-2 completate qui sotto; il fix (Fase 4) NON è stato implementato — è proposto in
> fondo, in attesa di conferma.

## Parte A — root cause: perché `grants.provider_id` è sempre NULL

### Fase 1 — Evidenza empirica (DB di produzione, `gptsklxbkuhdfkksmqhz`)

```sql
select count(*) total, count(provider_id) with_provider from public.grants;
-- {"total":3,"with_provider":0}

select gs.name, gs.scrape_config->>'archetype' archetype, count(g.id) grants, count(g.provider_id) with_provider
from public.grants g join public.grant_sources gs on gs.id = g.source_id
group by 1,2;
-- "Dipartimento per lo Sport - Avvisi e Bandi" | sport-governo | 2 | 0
-- "Regione Emilia-Romagna - Bandi Sociale (API)" | er-sociale   | 1 | 0
```

100% dei grant reali (3/3), su due archetipi diversi, hanno `provider_id = null`.

### Fase 1 — Data flow (tracing all'indietro dal campo NULL)

`grants.provider_id` viene scritto da `supabase-grants-db.ts:15` con `grant.providerId`, che a sua
volta arriva da `extract-grants.ts:283-284`:

```ts
const providerId = await resolveProviderId(item, deps.db);
const next: ExtractedGrant = { ...coerced, providerId };
```

`resolveProviderId` (`extract-grants.ts:168-177`):

```ts
async function resolveProviderId(item: unknown, db: GrantsDb): Promise<string | null> {
  const name = typeof item === "object" && item !== null
    ? stringOrNull((item as Record<string, unknown>).providerName) : null;
  if (!name) return null;          // <-- short-circuit
  try { return await db.findProviderIdByName(name); } catch { return null; }
}
```

Legge `item.providerName`. `providerName` esiste SOLO in `GRANT_JSON_SCHEMA`
(`extract-grants.ts:27`) — lo schema JSON richiesto all'LLM nel path di estrazione generico
("full" archetype, chunk HTML → LLM). **Nessun parser a codice** (`parseErSociale`,
`parseSportGoverno`, il parser sportesalute) valorizza mai `providerName` sui raw item che
restituisce — verificato con:

```bash
grep -n "providerName" scraper/src/pipeline/*.ts
# solo 2 righe, entrambe in extract-grants.ts (schema + resolveProviderId)
```

Quindi per qualsiasi grant che passa da un parser a codice, `name` è sempre `undefined` →
`resolveProviderId` ritorna `null` PRIMA di provare qualunque lookup sul DB.

### Fase 2 — Pattern analysis (perché è successo)

`git log -S resolveProviderId` mostra che la funzione è stata introdotta il 2026-07-04
(commit `c1966af`), **prima** che esistesse un solo archetipo a parser-codice: il registro
archetipi (`f97f984`), sportesalute (`5b92636`), poi er-sociale e sport-governo sono tutti
successivi. `resolveProviderId` fu scritta per l'UNICO path di estrazione che esisteva allora
(LLM), e non è mai stata ricollegata quando i parser a codice sono stati aggiunti come path
alternativo per le fonti "perfettamente strutturate" — un caso classico di path nuovo che non
eredita il comportamento del path vecchio.

### Root cause #2 (latente, trovata leggendo ADR-005)

`docs/adr/0005-predefined-provider-list.md` descrive esplicitamente il design voluto:

> "lo normalizza contro `grant_providers` (**nome o uno degli alias**)"

Ma `findProviderIdByName` (`supabase-grants-db.ts:141-146`) fa SOLO:

```ts
.from("grant_providers").select("id").eq("name", name).maybeSingle();
```

— match esatto sul campo `name`, `aliases` non viene mai interrogato, nonostante la colonna
esista apposta (es. `Sport e Salute S.p.A.` ha alias `Sport e Salute`/`Sport & Salute`). Anche
sistemando la root cause #1, un nome estratto in forma-alias fallirebbe comunque il match.

**Conclusione (Fase 3, ipotesi confermata da entrambe le fonti di evidenza — codice + DB
live)**: due bug distinti, non uno:
1. I parser a codice non emettono mai `providerName` → nessun lookup viene MAI tentato per le
   fonti attualmente attive (100% del DB oggi).
2. `findProviderIdByName` ignora `aliases`, in contraddizione con ADR-005 — bug latente che
   colpirebbe anche il path LLM/full quando il nome estratto non è la forma canonica esatta.

### Fix proposto (Fase 4 — NON ancora implementato, in attesa di conferma)

- **#1**: ogni parser a codice conosce il proprio erogatore in modo statico (er-sociale = sempre
  "Regione Emilia-Romagna"; sport-governo = sempre "Dipartimento per lo Sport") — non serve
  inferirlo, va impostato come costante nel parser, stesso pattern già usato per `area:
  "Emilia-Romagna"` in `parseErSociale`.
- **#2**: `findProviderIdByName` va esteso a `.or(\`name.eq.${name},aliases.cs.{${name}}\`)`
  (o una seconda query di fallback sugli alias), per allinearsi ad ADR-005.
- Da fare con TDD (test rosso→verde), un fix alla volta, come da processo.

---

## Parte B — audit campi: tutti gli 11 bandi sport (vecchi inclusi), codice reale

Estratti con `parseErSociale` (listing, non filtrato per data — 11/11 item) +
`parseDetailErSociale` (dettaglio) reali, dati live del 2026-07-20. `NO_LLM` usato per isolare il
path deterministico (stessa convenzione dei test esistenti) — dove indicato "amount=null", in
produzione l'escalation LLM (Gemini) verrebbe davvero chiamata e potrebbe risolverlo; qui no.

| # | Bando | deadline | status | amount | openingDate | requiredDocs | attachments | anomalie |
|---|---|---|---|---|---|---|---|---|
| 1 | Biennali 2026-2027 | 2026-10-02 | aperto | **null*** | 2026-09-09 | [] | 1 | amount* |
| 2 | Eventi 2024 | 2024-07-17 | scaduto | **null*** | 2024-06-18 | runts, rasd | 2 | amount* |
| 3 | Biennali 2023 | 2023-07-14 | scaduto | 1.000.000 | **null** | [] | 2 | openingDate |
| 4 | Eventi 2023 | 2023-07-14 | scaduto | 546.700 | **null** | [] | **0** | openingDate, attachments |
| 5 | Contrasto abbandono 2024 | 2024-09-16 | scaduto | **null*** | 2024-08-26 | rasd | 1 | amount* |
| 6 | Eventi 2025 | 2025-07-31 | scaduto | **null*** | 2025-07-07 | runts | 2 | amount* |
| 7 | Attività motoria 25-26 | 2025-09-30 | scaduto | **null*** | 2025-09-01 | [] | 5 | amount* |
| 8 | Contrasto abbandono 2025 | 2025-07-31 | scaduto | **null*** | 2025-07-07 | rasd | 2 | amount* |
| 9 | Eventi 2026 | 2026-04-30 | scaduto | **null*** | 2026-03-31 | [] | 1 | amount* |
| 10 | Attività motoria 24-25 | 2024-07-17 | scaduto | **null*** | 2024-06-18 | runts, rasd | 1 | amount* |
| 11 | Contrasto abbandono 2026 | 2026-06-12 | scaduto | **null*** | 2026-05-19 | rasd | 2 | amount* |

`*` = nessuna frase-àncora (`TOTAL_SIGNAL_RE`) nel testo di questo bando → in produzione risolto
dalla chiamata LLM di escalation, non testabile qui senza `GEMINI_API_KEY`. Coerente con quanto
già osservato nella ricerca di stamattina (§4): questa fonte userà l'escalation LLM molto più
spesso di sociale.

**provider_id**: null su tutti e 11 (vedi Parte A — nessun parser a codice lo popola).

**Osservazioni non-anomale** (confermano che il codice si comporta come da design):
- `eligibleTypes` cresce correttamente quando `destinatari` include Scuole/Università/Enti di
  formazione (bandi #3, #5, #7, #8, #10, #11) — il fix di oggi funziona su dati reali.
- `status` = scaduto per tutti tranne il #1 (deadline futura) — coerente con la policy
  "solo bandi aperti" già in uso.
- `tags` include "giovani" solo sui bandi che parlano di abbandono sportivo giovanile (#5, #8,
  #11) — regola testuale che funziona correttamente.

**Anomalie reali da guardare, non spiegate da questo audit** (fuori scope, solo segnalate):
- `openingDate: null` sui due bandi 2023 (#3, #4) — il campo Plone `apertura_bando` sembra non
  compilato per i record più vecchi/archiviati; probabile gap nella fonte, non nel parser.
- `attachments: 0` sul bando #4 (Eventi 2023) — nessun allegato mappato; da verificare a vista se
  la pagina originale ne ha e il parser li perde, o se davvero non ne ha.

## Nota sulla preview page

`app/src/app/preview/bando-detail/page.tsx` è una pagina "THROWAWAY... not committed" con dati
**interamente hardcoded** (Fondazione Cariplo finto, punteggio 85 finto) — non consuma nessun
grant reale, né dal DB né da un file. Non è collegabile agli 11 bandi sopra senza prima
riscriverla per accettare dati reali (fuori scope di questo debug; la tabella sopra è
l'equivalente "cosa compilerebbe" richiesto, senza passare dalla UI).
