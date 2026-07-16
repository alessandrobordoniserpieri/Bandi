# Sport e Salute: transcodifica beneficiaries/title → eligibleTypes/tags

## Contesto

L'archetipo `sportesalute` (`scraper/src/pipeline/archetypes.ts`) estrae i bandi con un
parser deterministico (`parseSportesalute`, no LLM). Oggi restituisce
`{title, url, deadline, amount, beneficiaries, area}`: `beneficiaries` è testo libero
(es. "Organismi sportivi, Società e associazioni sportive, Altri soggetti") e non popola
né `eligibleTypes` né `tags`. `coerce()` in `extract-grants.ts` li imposta quindi sempre a
`[]`, cioè ogni bando risulta "aperto a tutte le forme giuridiche" (punteggio massimo sulla
dimensione forma-giuridica per chiunque) e senza tag tematici.

Analisi su 219 bandi reali in `grants_preview` (staging table, vedi sessione precedente):

- `beneficiaries` è quasi sempre una lista di **categorie di beneficiari** (chi può
  partecipare), non temi: le 5 voci dominanti sono "Società e associazioni sportive" (187),
  "Altri soggetti" (122, 56%), "Organismi sportivi" (110), "Imprese" (37), "Enti del Terzo
  Settore" (33). Il resto è una coda di ~35 frasi libere con 1-4 occorrenze ciascuna.
  "Altri soggetti" significa semanticamente "chiunque altro" — quando presente, il bando è
  di fatto aperto a tutti, indipendentemente dalle altre categorie elencate insieme.
- `title` è invece una miniera per i tag tematici: la maggioranza dei titoli riguarda
  concessione/gestione di impianti sportivi (palestre, palazzetti, piscine, campi), con
  ricorrenze riconoscibili di parole chiave che matchano direttamente il vocabolario
  `TAGS` esistente (`impianti sportivi`, `scuola`, `minori`, `turismo`, ecc.).

## Decisione

Due tabelle di regole statiche, stesso pattern già in uso per il parser HTML
(deterministico, zero chiamate LLM, testabile):

1. `beneficiaries` → `eligibleTypes` (sottoinsieme di `LEGAL_TYPES`)
2. `title` → `tags` (sottoinsieme di `TAGS`)

Entrambe si innestano in `parseSportesalute`, che aggiunge le due chiavi all'oggetto
grezzo già restituito. `coerce()` in `extract-grants.ts` valida già `eligibleTypes` contro
`LEGAL_TYPE_SET` e `tags` contro `TAG_SET` — nessuna modifica necessaria lì.

### Alternative scartate

- **LLM per classificare beneficiaries/title**: reintroduce il costo/fragilità di quota
  Gemini che il parser di codice ha eliminato per questo archetipo. Scartata.
- **Split di `beneficiaries` per virgola + match esatto per atomo**: la virgola è usata sia
  come separatore fra categorie sia dentro le frasi libere (es. "Micro, Piccole e Medie
  imprese del territorio di Parma, Piacenza e Reggio Emilia" si spezzerebbe in frammenti
  non significativi). Si preferisce testare keyword come sottostringa sull'intera stringa
  `beneficiaries`, robusto a questi casi.

## Regole: `beneficiaries` → `eligibleTypes`

Case-insensitive, testate come sottostringa sull'intera stringa `beneficiaries`:

```
1. contiene "altri soggetti"  →  eligibleTypes = []  (STOP — nessuna restrizione, 56% dei casi)
2. altrimenti accumula in un Set (poi array), una o più regole possono matchare:
   "organismi sportivi"                       → EPS, FSN, DSA, AB, Comitato territoriale EPS/FSN
   "società e associazioni sportive" /
   "associazioni sportive"                    → ASD, SSD, SSD a r.l., ASD/SSD iscritta RASD
   "enti del terzo settore" / "terzo settore" → APS, ODV, ETS - Ente del Terzo Settore,
                                                 Rete associativa ETS, ONLUS, ONG / OSC
   "imprese" / "impresa"                      → Impresa, PMI, Start-up innovativa, Società benefit
   "comuni" / "comune"                        → Comune, Unione di Comuni
   "regioni" / "regione"                      → Regione
   "provinc" / "città metropolitan"           → Provincia / Città Metropolitana
   "enti pubblici" / "ente pubblico"          → Ente pubblico
```

"Persone fisiche/giuridiche", "lavoratori autonomi", "professionisti ordinistici" non hanno
un equivalente in `LEGAL_TYPES` (vocabolario di organizzazioni, non individui): nessuna
regola per loro, ignorati senza errore.

Se `beneficiaries` è null/vuoto o nessuna regola matcha → `eligibleTypes: []` (stesso
comportamento di oggi — degrado sicuro, nessuna restrizione inventata).

## Regole: `title` → `tags`

Case-insensitive, testate come sottostringa sul titolo:

```
sempre                                        → "sport"  (l'intera fonte è Sport e Salute)
"impiant* sportiv" / "palestr" / "palazzett" /
"piscin" / "campo da calcio" / "campo di bocce" /
"struttura sportiva" / "centro sportivo" /
"complesso sportivo"                          → "impianti sportivi"
"scuola" / "scolastic"                        → "scuola"
"minori"                                      → "minori"
"giovani"                                     → "giovani"
"turis" / "ricreativ"                         → "turismo"
"centri estivi" / "centro estivo"             → "centri estivi"
"disabil"                                     → "disabilità"
"anzian"                                      → "anziani"
"volontariat"                                 → "volontariato"
```

`tags` non è mai vuoto: contiene sempre almeno `"sport"`.

## Testing

Estende `scraper/tests/archetypes.test.ts` (già copre `parseSportesalute`):

- una regola per categoria di `eligibleTypes` (incl. "altri soggetti" → `[]` anche quando
  co-presente con altre categorie ristrette)
- combinazione di più categorie beneficiarie nello stesso bando → unione deduplicata
- `beneficiaries` null/non matchato → `eligibleTypes: []`
- titolo che matcha più pattern di tag → unione deduplicata, "sport" sempre incluso
- titolo che non matcha nessun pattern extra → `tags: ["sport"]`

## Non-goal

- Non tocca gli altri archetipi (`full`, `listing-light`): sono estratti via LLM con schema
  che già chiede `eligibleTypes`/`tags` direttamente al modello.
- Non introduce fuzzy matching o LLM: solo test di sottostringa deterministici.
- Non modifica `coerce()`/`types.ts`: la validazione contro i vocabolari esiste già.
