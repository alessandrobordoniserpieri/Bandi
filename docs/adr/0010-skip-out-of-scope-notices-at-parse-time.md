# ADR-010 — Bandi senza equivalente in LEGAL_TYPES: scartati in `parse()`, non ingeriti

## Status
Accepted (branch sport-governo, in corso). **Corretta il 2026-07-17**: la stesura originale
affermava che le categorie religiose di `dest` (diocesi, istituti religiosi, ecc.) non avessero
equivalente in `LEGAL_TYPES` — falso, verificato rileggendo `vocab.ts` per intero: esistono già
`"Ente ecclesiastico civilmente riconosciuto"`, `"Parrocchia / Oratorio"` e `"Ente religioso"`.
Il meccanismo di scarto resta valido come rete di sicurezza generale, ma il caso reale che lo
attiva nella fonte sport.governo.it è ristretto a un solo scenario (sotto), non alle categorie
religiose.

## Context
Ogni archetipo esistente ingerisce tutto ciò che la fonte elenca e lascia che `status`
(derivato dalla scadenza) e lo scoring di matching facciano il resto — nessun archetipo filtra
elementi validi fuori dallo scraping per rilevanza. `eligibleTypes: []` ha un significato preciso
e consolidato: "nessuna restrizione nota", trattato dal motore di matching come aperto a tutti
(stesso principio usato per "Cittadini" in er-sociale, dove l'assenza di mapping non inventa
una restrizione).

La fonte sport.governo.it ha un caso reale in cui questa assunzione si romperebbe: il bando
"Fondo dote per la Famiglia - Candidatura BENEFICIARI" ha `dest: ["pf"]` — **persona fisica**,
candidatura individuale delle famiglie, non di un ente. `pf` non ha né può avere un equivalente
in `LEGAL_TYPES` (la piattaforma matcha profili di *enti*, non individui). Se ingerito con il
trattamento standard, `eligibleTypes` risulterebbe `[]` — letto dal motore come "aperto a
tutti", mostrando a un'ASD o una cooperativa sociale un bando a cui nessun ente, per
costruzione, può accedere. Qui l'assenza di mapping non significa "nessuna restrizione", significa
"il richiedente non è un ente" — la stessa forma sintattica (`[]`) nasconderebbe due semantiche
opposte. (Il bando gemello "Fondo dote per la Famiglia - Corsi per contributo – ASD/SSD" ha
invece `dest: ["asd","ssd","onlus","ets"]` — stesso programma, ma candidatura tramite ente
intermediario: resta, mappa normalmente.)

Le categorie ecclesiastiche/religiose (usate ad es. dal bando "Oratori", 50M€) **non** rientrano
in questo scarto: mappano su tipi giuridici reali già esistenti (§ Decision in
`docs/superpowers/specs/2026-07-17-sport-governo-archetype-design.md`).

## Decision
In `sport-governo.parse()`, un bando il cui `dest` non ha **nessuna** sovrapposizione con
`LEGAL_TYPES` dopo la transcodifica viene scartato prima di entrare nella pipeline (non
emesso, non salvato, non contato come skip di budget). Se anche una sola categoria di `dest`
mappa a un tipo giuridico noto, il bando viene ingerito normalmente e `eligibleTypes` riflette
solo le categorie mappate (le altre restano silenziosamente escluse dal set risultante, senza
scartare l'intero bando).

Sui 22 bandi reali verificati (2026-07-17), un solo bando attiva lo scarto: quello con
`dest: ["pf"]`. Il meccanismo resta generale (non è una lista di esclusione hardcoded per "pf"),
quindi copre automaticamente futuri bandi con lo stesso problema.

## Consequences
- Primo archetipo che filtra elementi validi della fonte per rilevanza invece di ingerire tutto
  — deviazione deliberata dalla convenzione stabilita, da non generalizzare per abitudine ad
  altri archetipi senza lo stesso ragionamento esplicito.
- Il conteggio "N bandi trovati" della fonte sport.governo.it sarà sistematicamente inferiore a
  22 di 1 unità (il bando `pf`-only non compare mai) — atteso, da non trattare come bug.
- Se in futuro la piattaforma aprisse a candidature di persone fisiche, lo scarto dipende solo
  dalla tabella di mapping (aggiungere un tipo "Persona fisica" a `LEGAL_TYPES` lo farebbe
  ricomparire da solo), non da codice da rimuovere.
