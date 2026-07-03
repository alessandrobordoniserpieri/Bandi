# ADR-003: Matching rule-based + AI on-demand

## Status

Accettato

## Context

Il motore di matching deve confrontare il profilo di un ente con centinaia di
bandi e produrre uno score 0-100 con breakdown per dimensione. Questo
confronto avviene ad ogni render (lista bandi, dettaglio bando, dashboard),
quindi deve essere:

- **Istantaneo** — nessuna latenza di rete percepibile dall'utente.
- **Gratuito** — nessun costo per chiamata, perché viene eseguito
  ripetutamente e su larga scala (molti bandi × molti utenti).
- **Spiegabile** — l'utente deve vedere *perché* un bando ha ottenuto un
  certo punteggio (breakdown per dimensione, non un numero opaco).
- **Deterministico** — stesso profilo + stesso bando devono produrre sempre
  lo stesso score, per essere testabile come invariante (unit test, property
  test) e per non confondere l'utente con punteggi che cambiano da soli.

L'alternativa scartata è calcolare lo score direttamente tramite un LLM
(prompt con profilo + bando → punteggio). Questo approccio è stato escluso
perché:

- non è deterministico (stesso input può produrre output diversi a run
  diverse);
- ha un costo per ogni singola valutazione, moltiplicato per bando × utente
  × render;
- non è testabile come invariante di dominio (non si può scrivere un test
  che verifichi "capacità Alta + complessità bassa → 14 punti" contro un
  output di LLM);
- introduce latenza di rete su un'operazione che deve essere istantanea.

## Decision

Il matching a 6 dimensioni (temi, forma giuridica, territorio, capacità,
documenti, track record — più bonus/malus e indicatori) è **puramente
rule-based**: calcolato on-the-fly a ogni richiesta, senza persistenza del
risultato e senza alcuna chiamata a un modello AI durante lo scoring.

L'AI interviene **solo in due punti, mai nello scoring**:

1. **On-demand**, quando l'utente richiede esplicitamente un'"Analisi AI
   approfondita" su un singolo bando, con disclaimer che chiarisce la natura
   generativa e non deterministica del contenuto.
2. **In fase di ingestion**, per arricchire i dati dei bandi (es.
   estrazione/normalizzazione di campi da testo non strutturato), non per
   calcolare il punteggio di compatibilità.

Il risultato del matching non viene mai salvato in database: si ricalcola
ad ogni render, quindi non esiste una cache da invalidare quando il profilo
dell'ente o i dati del bando cambiano (invariante I10 del design).

## Consequences / Why

- **Pro**: score istantaneo e gratuito, riproducibile in unit test
  (`calculate-match.test.ts` e i test per dimensione verificano celle
  esatte della tabella di scoring), spiegabile tramite breakdown per
  dimensione, nessuna infrastruttura di cache/invalidazione da mantenere.
- **Pro**: separare nettamente "scoring" (rule-based) da "analisi"
  (AI on-demand) evita che un output non deterministico finisca in un
  invariante di dominio che deve essere testato.
- **Contro**: i pesi e le soglie sono uno strumento manuale che va tarato
  nel tempo con casi reali (non si "impara" automaticamente dai dati); un
  cambio di regole richiede una modifica di codice e non di un modello.
- **Contro**: l'AI on-demand è un'esperienza separata (con proprio
  disclaimer) e non contribuisce al punteggio, quindi due bandi con lo
  stesso score possono avere "qualità" percepita diversa che l'engine non
  cattura — è un compromesso accettato in cambio di determinismo e costo
  zero per il livello 1.

## Note di integrazione (per branch 004 e successivi)

1. **Contratto di `grant.area` (IMPORTANTE)**: in `territory.ts`, il campo
   `grant.area` viene interpretato in due modi diversi a seconda di
   `grant.geoScope`. Quando `geoScope === "regionale"`, `area` è letto come
   **nome regione** e confrontato per match esatto di stringa con i valori
   di `PROVINCE_TO_REGION` (le chiavi della mappa in `constants.ts`).
   Quando `geoScope` è `provinciale` o `comunale`, `area` è invece letto
   come **codice provincia** e confrontato con i codici provincia
   dell'ente. Il mapping DB → `Grant` del branch 004 deve quindi emettere
   nomi di regione scritti ESATTAMENTE come in `PROVINCE_TO_REGION` (es.
   `Emilia-Romagna`, `Friuli-Venezia Giulia`, `Valle d'Aosta` con apice
   dritto, `Trentino-Alto Adige`) — una grafia diversa fa scattare un
   mismatch silenzioso e lo score di territorialità risulta 0 senza alcun
   errore visibile.
2. **Banda scadenza 15–30 giorni → verde**: la §2.7B della spec lascia
   indefinito il comportamento per l'intervallo 15–30 giorni. L'implementazione
   in `indicators.ts` colora questo intervallo come `verde` (la condizione è
   `days >= 15`). Si tratta di una scelta deliberata, non di una svista.
3. **Proxy bonus partner**: la §2.8 della spec richiede "+5 se l'ente ha
   partner E il bando li richiede", ma tra i 16 campi strutturati del bando
   non esiste un flag esplicito "richiede partner". Il bonus in `bonuses.ts`
   usa `grant.complexity === "alta"` come proxy per questa condizione: va
   sostituito con un campo strutturato dedicato non appena lo scraper sarà
   in grado di estrarlo.
