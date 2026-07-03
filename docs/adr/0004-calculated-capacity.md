# ADR-004: Capacità calcolata, non dropdown

## Status

Accettato

## Context

La dimensione "Capacità" del matching (peso 14 su 100, vedi `WEIGHTS.capacity`
in `app/src/lib/matching/constants.ts`) rappresenta la maturità gestionale di
un ente (Bassa/Media/Alta) e viene confrontata con la complessità del bando
tramite una matrice 3×3 (`CAPACITY_MATRIX`).

Un dropdown "capacità: bassa/media/alta" autodichiarato dall'utente produce
dati inaffidabili: nella pratica quasi tutti gli enti si dichiarerebbero
"media" (o "alta", per ottimismo), rendendo la dimensione priva di potere
discriminante e facile da "barare" per alzare artificialmente lo score.

## Decision

La capacità non è mai un valore self-declared: è **sempre calcolata** dalla
funzione `calculateCapacity()` (`app/src/lib/matching/dimensions/capacity.ts`)
a partire da 6 domande concrete e verificabili del profilo ente
(`CapacityAnswers`). L'utente compila le 6 domande; la UI mostra il livello
risultante con la spiegazione (criteri di ancoraggio visibili), ma non può
forzare il livello direttamente.

Se le domande non sono state compilate, `calculateCapacity(null)` restituisce
`null` e la dimensione usa il valore neutro di scoring (`NEUTRAL.capacity`),
mai un valore auto-dichiarato di default (invariante I3 del design).

### Il sistema a punti (implementato in `capacity.ts`)

Ogni risposta contribuisce un numero di punti secondo le seguenti fasce:

| Domanda | Fasce → punti |
|---|---|
| `stableStaff` (persone stabili) | `0-2` → 0, `3-10` → 1, `11-30` → 2, `30+` → 3 |
| `dedicatedAdmin` (admin dedicato) | `yes` → +2, altrimenti 0 |
| `fundedProjects3y` (progetti finanziati ultimi 3 anni) | `0` → 0, `1-2` → 1, `3-5` → 2, `5+` → 3 |
| `reportingExperience` (esperienza di rendicontazione) | `mai` → 0, `qualche_volta` → 1, `regolarmente` → 2 |
| `annualBudget` (budget annuale) | `<20k` → 0, `20-100k` → 1, `100-500k` → 2, `>500k` → 3 |
| `euProject` (esperienza progetti EU) | `yes` → +2, altrimenti 0 |

Punteggio massimo teorico: 3 + 2 + 3 + 2 + 3 + 2 = 15.

I punti totali vengono mappati sul livello di capacità con queste soglie:

| Punti totali | Livello |
|---|---|
| 0 – 4 | Bassa |
| 5 – 9 | Media |
| 10 – 15 | Alta |

Il livello risultante (`Bassa` / `Media` / `Alta`) viene poi incrociato con
la complessità del bando (`bassa` / `media` / `alta`) tramite
`CAPACITY_MATRIX`, che assegna il punteggio finale della dimensione (0-14).

## Consequences / Why

- **Pro**: `calculateCapacity()` è una funzione pura e deterministica — stesso
  set di risposte produce sempre lo stesso livello — quindi ogni fascia e
  ogni soglia è coperta da un test con valore esatto
  (`capacity.test.ts`), incluso il caso limite tra due fasce (es. 4 vs 5
  punti, 9 vs 10 punti).
- **Pro**: le 6 domande sono verificabili e concrete (numero di persone,
  budget, esperienza pregressa), quindi molto più difficili da "gonfiare"
  rispetto a un'autovalutazione soggettiva su una scala bassa/media/alta.
- **Pro**: mostrare i criteri di ancoraggio in UI rende trasparente perché
  un ente è stato classificato in un certo modo, aumentando la fiducia nello
  score complessivo.
- **Contro**: richiede all'utente di rispondere a 6 domande invece di
  scegliere una voce da un menu, aumentando leggermente l'attrito in fase di
  onboarding — accettato perché il profilo capacità viene compilato una
  tantum e riusato per ogni matching successivo.
- **Contro**: le soglie (0-4 / 5-9 / 10-15) e i pesi per fascia sono scelte
  manuali di design, non derivate da dati storici; possono richiedere
  ritaratura futura, ma restano un miglioramento netto rispetto
  all'autodichiarazione libera.
