# Analisi AI "forte" — V2: chat cross-bando (vettori) + layer crediti — design funzionale

> Documento **funzionale** (livello direzione), da approfondire con un proprio ciclo
> brainstorming→spec→plan quando V1 sarà in produzione. Nasce dalle decisioni già prese durante il
> brainstorming di V1 (`2026-07-20-strong-ai-analysis-rag-v1-design.md`): l'utente vuole a tendere
> (a) una chat che ragiona su **molti bandi insieme** e (b) far "parlare quanto vuole" tramite
> **crediti**. V2 è **due cose distinte** che qui teniamo separate.

## Premessa: V2 riusa V1, non lo rifà

Il pezzo costoso di tutta la feature è **l'estrazione del testo dai PDF**, già fatta e persistita in
V1 (`grant_documents`, una riga per documento, condivisa tra utenti). V2 è **additivo**: chunka ed
embedda il **testo già estratto** da V1. Nessuna ri-estrazione, nessun rifacimento dell'ingestione.

---

## Parte A — Chat cross-bando (vettori / pgvector)

### Perché ora servono i vettori (e in V1 no)

In V1 la chat è su **un singolo bando**: il suo testo sta nel contesto dell'LLM, niente vettori.
In V2 la chat spazia su **molti bandi insieme** ("confronta questi 20 bandi", "tra tutti i bandi
aperti, quali parlano di povertà educativa e ci sono ammissibili?") → il corpus **sfora la finestra
di contesto** → serve un **retrieval**: si recuperano solo i chunk rilevanti alla domanda e si
mandano quelli all'LLM. È l'unico scenario in cui pgvector guadagna il suo costo.

### Forma (da confermare nel ciclo dedicato)

- **Superficie:** una chat diversa da quella per-bando di V1 — un **assistente** che opera su un
  **working-set** di bandi dell'utente (proposta: i **bandi salvati**, `saved_grants`, già
  esistenti) e/o su tutti i bandi aperti compatibili col profilo.
- **Ingestione vettoriale:** per ogni riga `grant_documents` con testo estratto, chunk + embed →
  tabella pgvector (`grant_document_chunks(grant_id, document_id, chunk_text, embedding, …)`).
  Fatto **una volta per documento, condiviso** (come l'estrazione). Trigger: quando un bando entra
  in un contesto cross-bando (es. viene salvato) oppure batch sui bandi già estratti.
- **Retrieval:** embed della domanda → similarity search pgvector **scoped** al working-set
  (filtro su `grant_id ∈ set`) → top-k chunk → prompt LLM con profilo (iniettato a query-time,
  come V1) + chunk recuperati + storico.
- **Provider embeddings:** dietro un **seam `EmbeddingProvider`** (come `OcrProvider`/`LLMProvider`),
  scelta del modello concreto rimandata al ciclo dedicato (candidati: embeddings Gemini, o modelli
  aperti; decisione su costo/qualità/lingua italiana).
- **Privacy:** invariata rispetto a V1 — i chunk sono **condivisi** (derivano da PDF pubblici), il
  **profilo resta privato e iniettato a query-time**, mai persistito nei chunk.

### Cosa eredita da V1 senza modifiche

`grant_documents` (testo estratto), il seam di entitlement, il pattern async pg_cron, la
separazione condiviso/privato, lo schema a 4 sezioni per gli "aiuti".

### Nodi aperti per il ciclo V2-A (non decisi ora)

- Estensione Postgres `vector` + dimensione embedding + indice (ivfflat/hnsw).
- Definizione esatta del working-set (solo salvati? tutti gli aperti? scelta utente?).
- Strategia di chunking (dimensione/overlap) sul testo di bando.
- Batch di embedding dei bandi già estratti vs on-demand all'ingresso nel set.

---

## Parte B — Layer crediti ("parla quanto vuoi")

### Obiettivo

Superare i rate-limit fissi di V1 (guardrail anti-abuso) con un modello **a crediti**: l'utente
"parla quanto vuole" **finché ha crediti**, su V1 (chat per-bando) e V2 (chat cross-bando). È il
modello di monetizzazione vero; i rate-limit di V1 sono solo il default gratuito.

### Aggancio già predisposto in V1

V1 implementa il controllo "questo utente può fare questa azione?" come **un'unica funzione-seam di
entitlement** (`checkEntitlement(userId, action)`). Oggi consulta i contatori di rate-limit; in V2
la **stessa funzione** consulta il **saldo crediti**. Nessun rifacimento di route o UI — cambia
solo l'implementazione dietro il seam. Questa è l'unica pre-condizione, ed è già nello spec V1.

### Forma (da confermare nel ciclo dedicato)

- **Unità di consumo:** definire cosa "costa" crediti (un turno di chat? un'estrazione? un'analisi
  forte?) e quanto. Proposta di partenza: la **chat** consuma crediti (il costo ricorrente),
  l'estrazione one-time resta gratuita/condivisa.
- **Saldo e ricarica:** tabella `user_credits` (saldo) + `credit_transactions` (movimenti:
  accredito iniziale free, acquisti, consumi). Pacchetti di crediti acquistabili.
- **Pagamenti:** provider (es. Stripe) dietro seam, decisione rimandata.
- **Free tier:** un accredito iniziale/ricorrente di crediti gratuiti mantiene l'esperienza free;
  i rate-limit di V1 diventano il fallback per utenti senza saldo, o vengono rimossi del tutto in
  favore di "0 crediti = stop".
- **Trasversalità:** i crediti valgono sia per la chat per-bando (V1) sia per la cross-bando (V2) —
  un solo saldo, un solo seam.

### Nodi aperti per il ciclo V2-B (non decisi ora)

- Tariffazione (quanti crediti per turno / per pacchetto / prezzo).
- Provider di pagamento e gestione fatturazione/IVA (contesto italiano).
- Rapporto esatto rate-limit ↔ crediti (coesistenza o sostituzione).
- Antifrode / rimborsi / scadenza crediti.

---

## Ordine di sviluppo consigliato

1. **V1** (spec dedicato) — singolo bando, long-context, guardrail rate-limit. **Si costruisce per
   prima.**
2. **V2-A** (vettori cross-bando) e **V2-B** (crediti) sono **indipendenti** tra loro e possono
   essere fatte in qualsiasi ordine dopo V1. Suggerimento: **V2-B (crediti) prima** se la priorità
   è monetizzare l'uso che V1 già genera; **V2-A (cross-bando) prima** se la priorità è la potenza
   di prodotto. Entrambe riusano le fondamenta di V1 senza rifacimenti.

## Non-goal di questo documento

Questo è un documento **funzionale/di direzione**, non uno spec implementativo. Numeri, schemi
esatti, scelte di provider (embeddings, pagamenti) e tariffe sono **volutamente rimandati** ai
rispettivi cicli brainstorming→spec→plan, da avviare quando V1 sarà in produzione.
