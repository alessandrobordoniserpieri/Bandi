# ADR-010 — Bandi senza equivalente in LEGAL_TYPES: scartati in `parse()`, non ingeriti

## Status
Accepted (branch sport-governo, in corso).

## Context
Ogni archetipo esistente ingerisce tutto ciò che la fonte elenca e lascia che `status`
(derivato dalla scadenza) e lo scoring di matching facciano il resto — nessun archetipo filtra
elementi validi fuori dallo scraping per rilevanza. `eligibleTypes: []` ha un significato preciso
e consolidato: "nessuna restrizione nota", trattato dal motore di matching come aperto a tutti
(stesso principio usato per "Cittadini" in er-sociale, dove l'assenza di mapping non inventa
una restrizione).

La fonte sport.governo.it rompe questa assunzione: alcuni bandi (es. "Avviso Oratori", 50M€)
hanno `dest` composto **solo** da categorie senza alcun equivalente in `LEGAL_TYPES` (diocesi,
istituti religiosi, società di vita apostolica — non tipi di soggetto terzo-settore che
gestiamo). Se ingeriti con il trattamento standard, `eligibleTypes` risulterebbe `[]` — che il
motore leggerebbe come "aperto a tutti", mostrando un bando riservato a enti ecclesiastici come
compatibile a un'ASD o una cooperativa sociale. Qui l'assenza di mapping non significa "nessuna
restrizione", significa "restrizione a una categoria che non rappresentiamo" — la stessa forma
sintattica (`[]`) nasconderebbe due semantiche opposte.

## Decision
In `sport-governo.parse()`, un bando il cui `dest` non ha **nessuna** sovrapposizione con
`LEGAL_TYPES` dopo la transcodifica viene scartato prima di entrare nella pipeline (non
emesso, non salvato, non contato come skip di budget). Se anche una sola categoria di `dest`
mappa a un tipo giuridico noto, il bando viene ingerito normalmente e `eligibleTypes` riflette
solo le categorie mappate (le altre, es. `pf`/persona fisica, restano silenziosamente escluse
dal set risultante, senza scartare l'intero bando).

Decisione discussa con l'utente: alternative valutate erano ingerire comunque lasciando
`eligibleTypes: []` (status quo, ma perpetua il falso "aperto a tutti") o aggiungere un tag
dedicato di esclusione per farlo penalizzare dal motore di matching invece che filtrarlo a
monte (più corretto in astratto, ma richiede toccare il motore di matching per un caso che lo
scraper può risolvere da solo). Scelto lo scarto a monte per semplicità e perché questi bandi
non sono comunque rilevanti per l'utenza della piattaforma.

## Consequences
- Primo archetipo che filtra elementi validi della fonte per rilevanza invece di ingerire tutto
  — deviazione deliberata dalla convenzione stabilita, da non generalizzare per abitudine ad
  altri archetipi senza lo stesso ragionamento esplicito.
- Se in futuro `LEGAL_TYPES` guadagna una categoria "ente religioso/ecclesiastico" (fuori scope
  oggi), questi bandi torneranno visibili al prossimo run senza altro intervento — lo scarto
  dipende solo dalla tabella di mapping, non da una lista di esclusione hardcoded.
- Il conteggio "N bandi trovati" della fonte sport.governo.it sarà sistematicamente inferiore a
  22 (i bandi solo-religiosi non compaiono mai) — atteso, da non trattare come bug.
