# ADR-009 — Escalation LLM economica condivisa (amount + cofundingPercentage)

## Status
Accepted (branch sport-governo, in corso).

## Context
`er-sociale` risolve `amount` con 3 livelli (parse diretto → regex ancorata a frasi-segnale →
escalation LLM mirata su un solo campo), usata solo quando i primi due falliscono (0/5 bandi
reali l'hanno richiesta). Il nuovo archetipo `sport-governo` ha lo stesso bisogno per `amount` e,
in più, per `cofundingPercentage` (oggi sempre `null` per entrambe le fonti, pur essendo scritto
in chiaro nel testo — es. "compartecipazione del 15%" — e guidando un indicatore che l'utente
vede in home e in dettaglio).

La tentazione ovvia — "già che chiamiamo l'LLM, tiriamo fuori anche `fundingType`, `minAmount`,
`maxAmount`, `eligibleExpenses`, `applicationMethod` in un colpo solo" — è stata scartata:
`minAmount`/`maxAmount` sono esattamente le cifre-esca (soglie per-progetto, limiti di spesa)
che l'`amount` deve ignorare, quindi chiederle nella stessa chiamata rischia contaminazione
incrociata; gli altri campi sono solo display (non guidano nessuno score) per un beneficio
marginale.

## Decision
Un helper condiviso, `escalateEconomicsToLLM(text) -> { amount, cofundingPercentage }`, in un
modulo di pipeline condiviso (non dentro `er-sociale.ts` né `sport-governo.ts`), usato da
entrambi gli archetipi. Sostituisce l'attuale `escalateAmountToLLM` di `er-sociale`.

`cofundingPercentage` guadagna il proprio primo livello deterministico (regex "N%" ancorata a
"cofinanziamento/compartecipazione/quota"), simmetrico a quello di `amount`. La chiamata LLM
resta **rara per costruzione**: scatta solo quando `amount` resta irrisolto dopo i livelli
deterministici (lo stesso trigger raro già validato su er-sociale); quando scatta, risolve
entrambi i campi nella stessa chiamata invece di uno solo, ma non aggiunge nessun trigger nuovo.
`fundingType`, `minAmount`, `maxAmount`, `eligibleExpenses`, `applicationMethod` restano fuori
scope per l'LLM.

## Consequences
- Un solo punto di manutenzione per l'escalation economica; `er-sociale` e `sport-governo`
  condividono schema/istruzioni/logica di trigger invece di duplicarla.
- `cofundingPercentage` può restare `null` anche quando il testo lo dichiara, se la frase non
  aggancia la regex ANCHE quando `amount` si è già risolto deterministicamente (l'LLM non parte
  solo per completare il cofinanziamento) — compromesso deliberato per non riaprire il fronte
  costi/timeout Vercel tenendo la chiamata come regola invece che eccezione.
- Retrofit dei test esistenti di `er-sociale` sul nuovo nome/forma del helper.
