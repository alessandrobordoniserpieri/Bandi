# Prompt da copiare-incollare nella nuova sessione

Copia tutto il testo sotto la linea e incollalo come primo messaggio.

---

## Contesto

Leggi questi file in questo ordine per capire il progetto:

1. `HANDOFF.md` — riassunto di tutte le decisioni prese, lo stato del codice, le mie preferenze, e cosa c'è da fare
2. `bandi-scanner-v2-definitive.html` — il design document definitivo con tutte le specifiche (matching engine 6 dimensioni / 100pt, profilo ente ~40 campi, scraping, schema DB, UI, pricing)
3. `bandi-scanner-v2-roadmap.html` — la specifica funzionale con i 15 branch da sviluppare, le dipendenze tra loro, i file da creare/modificare, e i criteri di accettazione per ognuno

Il codice esistente è in `app/src/lib/matching/` — è il matching engine v1 che va riscritto secondo il design document v2.

## Come lavorare

Dopo che hai letto tutto, dimmi che hai capito il contesto e fammi un riassunto breve di cosa c'è da fare. Poi iniziamo a sviluppare partendo dal primo branch della roadmap che non è ancora stato fatto. Chiedimi conferma prima di scrivere codice.

### Skill da usare (sono in `.agents/skills/`)

Hai a disposizione le skill di Superpowers. Usale così:

1. **`/writing-plans`** — PRIMA di toccare codice su un branch complesso. Scrivi un piano di implementazione dettagliato con task piccoli. Salva in `docs/superpowers/plans/`.

2. **`/subagent-driven-development`** — PER ESEGUIRE il piano. Lancia un sub-agent per ogni task indipendente del piano. Ogni sub-agent ha contesto isolato e istruzioni precise. Preferisci questa a `/executing-plans` perché supportiamo i sub-agent.

3. **`/test-driven-development`** — PER OGNI feature e bugfix. Scrivi il test PRIMA del codice. Guardalo fallire. Poi scrivi il codice minimo per farlo passare. Mai codice di produzione senza test che fallisce prima.

4. **`/dispatching-parallel-agents`** — QUANDO ci sono 2+ task indipendenti (file diversi, sottosistemi diversi). Lancia un agent per problema, in parallelo.

5. **`/systematic-debugging`** — QUANDO qualcosa non funziona. Mai proporre fix senza prima aver trovato la root cause. Investigare prima, fixare dopo.

6. **`/verification-before-completion`** — PRIMA di dire che un task è completo. Riesegui i test, controlla l'output, verifica che tutto passi. Mai dire "fatto" senza evidenza fresca.

7. **`/requesting-code-review`** — DOPO ogni feature importante o prima di merge. Lancia un sub-agent reviewer con contesto pulito.

8. **`/finishing-a-development-branch`** — ALLA FINE di ogni branch. Verifica test, presenta opzioni (merge/PR/cleanup), esegui la scelta, pulisci.

### Workflow per ogni branch

```
1. /writing-plans        → piano dettagliato del branch
2. /subagent-driven-development → esecuzione con sub-agent
   ↳ dentro ogni task:
     - /test-driven-development → test first
     - /systematic-debugging    → se qualcosa fallisce
     - /verification-before-completion → prima di chiudere il task
3. /requesting-code-review → review del branch
4. /finishing-a-development-branch → commit, push, chiusura
```

### Altre skill disponibili

- **`/grilling`** — se serve discutere una decisione di design non coperta dal design doc
- **`/implement`** — per implementare da un PRD o issue, usa TDD e code-review automaticamente
- **`/brainstorming`** — per sessioni di brainstorming su problemi aperti
- **`/domain-modeling`** — se serve raffinare il data model
- **`/supabase`** — per tutto ciò che riguarda Supabase (schema, RLS, auth, migration)

## Regole

- Usa il modello Opus (4.6 o superiore)
- Non scrivere codice senza il mio permesso esplicito
- Lingua codice: inglese. Lingua UI: italiano.
- Committa su branch separati come da roadmap (feat/nome-feature)
- Ogni branch deve essere autonomo, testabile, e mergeable
