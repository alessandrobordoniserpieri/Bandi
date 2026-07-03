# ADR-007: Sviluppo branch-per-feature

## Status

Accettato

## Context

Gran parte dello sviluppo di BANDI-SCANNER è svolta da agenti AI, con
revisione umana a valle. In questo contesto un branch grande o long-lived
è particolarmente rischioso: rende la review umana più difficile (diff
ampi, cambiamenti eterogenei mescolati), aumenta la probabilità che
agenti diversi lavorino in parallelo su codice che si sovrappone, e rende
più probabile che `main` attraversi stati non deployabili.

Serve un flusso di lavoro che mantenga ogni cambiamento piccolo,
verificabile in modo automatico prima del merge, e con `main` sempre in
uno stato rilasciabile.

## Decision

Ogni feature (inclusi i branch numerati come questo, es. `001` per lo
schema Supabase) vive in un branch piccolo e autonomo, creato da `main`,
e viene integrato in `main` solo tramite pull request quando typecheck,
test e criteri di accettazione della feature passano. `main` è sempre
deployabile.

Regole:

- **(a) Nessuna dipendenza implicita tra branch non mergiati.** Un branch
  non può assumere l'esistenza di modifiche introdotte da un altro branch
  ancora aperto, salvo dipendenze dichiarate esplicitamente (ad es. nel
  branch stesso o nella issue/PR di riferimento).
- **(b) Test inclusi nel branch.** Ogni branch porta con sé i propri test;
  una feature non si considera completa se priva di copertura di test per
  il comportamento che introduce.
- **(c) Migrazioni DB solo additive dopo il merge di 001.** Una volta
  mergiato lo schema iniziale (branch 001), le migrazioni successive
  possono solo aggiungere (nuove tabelle, colonne, indici, policy) e non
  possono modificare distruttivamente lo schema esistente in modo da
  rompere branch paralleli basati sullo schema precedente.
- **(d) Niente branch long-lived.** Un branch feature non deve restare
  aperto a lungo: va mergiato o abbandonato in tempi brevi, per limitare
  la finestra di divergenza da `main`.

## Consequences

- **Pro**: merge piccoli e frequenti, ciascuno con un checkpoint di review
  umana ben definito — più facile individuare un problema introdotto da
  un agente prima che si propaghi ad altri branch.
- **Pro**: `main` sempre deployabile riduce il rischio che un errore in un
  branch feature blocchi il lavoro sugli altri branch in corso.
- **Pro**: la regola delle migrazioni solo additive dopo 001 evita che un
  branch che tocca lo schema rompa silenziosamente altri branch aperti in
  parallelo che assumono lo schema precedente.
- **Contro**: richiede disciplina nello scomporre le feature in incrementi
  piccoli e autonomi, il che può allungare la pianificazione iniziale di
  una feature complessa rispetto a un unico branch monolitico — accettato
  perché il costo è compensato dalla riduzione del rischio di regressioni
  e dalla maggiore verificabilità di ogni singolo cambiamento.
