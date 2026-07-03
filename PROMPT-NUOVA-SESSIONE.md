# Prompt da copiare-incollare nella nuova sessione

Copia tutto il testo sotto la linea e incollalo come primo messaggio.

---

Leggi questi file in questo ordine per capire il contesto del progetto:

1. `HANDOFF.md` — riassunto di tutte le decisioni prese, lo stato del codice, le mie preferenze, e cosa c'è da fare
2. `bandi-scanner-v2-definitive.html` — il design document definitivo con tutte le specifiche (matching engine, profilo ente, scraping, schema DB, UI, pricing)
3. `bandi-scanner-v2-roadmap.html` — la specifica funzionale con i 15 branch da sviluppare, le dipendenze tra loro, i file da creare/modificare, e i criteri di accettazione per ognuno

Il codice esistente è in `app/src/lib/matching/` — è il matching engine v1 che va riscritto secondo il design document v2.

Dopo che hai letto tutto, dimmi che hai capito il contesto e fammi un riassunto breve di cosa c'è da fare. Poi iniziamo a sviluppare partendo dal primo branch della roadmap che non è ancora stato fatto. Prima di scrivere codice chiedimi conferma.
