# ADR-011 — Ingerire solo bandi ancora aperti; gli scaduti restano in place, non si importano

## Status
Accepted (2026-07-17).

## Context
Fino a oggi la pipeline ingeriva **tutto** ciò che una fonte elencava, scaduti compresi, marcandoli
`status = "scaduto"`. L'assunzione (esplicitata a voce durante lo sviluppo di sport-governo) era che
gli scaduti servissero allo **storico**: il matching dà un bonus di track-record a chi ha già vinto
un bando simile. Ma questo confonde due cose diverse:

- Lo **storico dell'utente** sono i progetti che *l'ente* ha realizzato, inseriti nel suo profilo —
  non i bandi che la piattaforma ha scrapato.
- Importare l'archivio storico di una fonte (es. le edizioni 2023/2024/2025 di "Sport e Periferie")
  riempie il DB e la UI di bandi a cui **nessuno può più candidarsi**. Su sport.governo.it, 19 dei 21
  bandi reali (2026-07-17) erano già scaduti: il 90% sarebbe stato puro rumore.

L'utente ha chiarito la policy: *portiamo dentro solo i bandi nuovi (ancora aperti); quando un bando
già a sistema scade, lo teniamo (marcato scaduto), non lo cancelliamo.*

## Decision
Il gate vive in un punto solo — `decide()` in `scraper/src/pipeline/dedup.ts` — attraversato da OGNI
archetipo via `saveGrant`, quindi vale per tutta la pipeline senza duplicazioni per-archetipo.

Un bando **mai visto** (`existing == null`, oppure una nuova edizione di uno scaduto) viene inserito
**solo se ancora aperto**. "Già scaduto all'ingest" (`isExpiredAtIngest`) significa: `status`
esplicito `scaduto`/`chiuso`, **oppure** `deadline` presente e già passata (quest'ultima copre
l'archetipo LLM generico, che potrebbe lasciare `status = "aperto"` malgrado una deadline passata).
Una `deadline` nulla non è dimostrabilmente scaduta (bando a sportello/rolling) → si inserisce.

Il gate riguarda **solo gli insert**. I bandi già a sistema:
- Se ancora attivi e la fonte li ri-riporta scaduti → il path di **update** fa flippare lo `status` a
  scaduto **in place**, la riga resta ("quando uno scade lo teniamo a sistema").
- Il cron giornaliero `expire_grants()` continua a marcare scaduti quelli con deadline passata.

## Consequences
- Per ogni fonte, la prima ingest prende solo i bandi aperti in quel momento; le edizioni storiche
  già chiuse non entrano mai. Su sport.governo.it: 2 ingeriti invece di 21.
- Deviazione deliberata dal comportamento precedente (ingest-tutto). Se in futuro servisse davvero
  l'archivio storico di una fonte per un uso specifico, sarà una scelta esplicita, non il default.
- I test che asserivano l'inserimento di bandi già scaduti (es. l'end-to-end er-sociale) sono stati
  aggiornati per riflettere la policy: lo scaduto non viene più inserito, l'aperto sì.
- `decide()` guadagna un parametro `today` (default: oggi in ISO) per rendere il confronto sulle
  deadline deterministico nei test.
