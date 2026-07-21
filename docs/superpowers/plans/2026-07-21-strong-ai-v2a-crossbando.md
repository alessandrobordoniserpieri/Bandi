# Analisi AI forte V2-A — chat cross-bando (vettori/pgvector)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / test-driven-development.
> Additive su V1: chunka+embedda il testo già estratto in `grant_documents`, nessuna ri-estrazione.

**Goal:** Chat che ragiona su **molti bandi insieme** (working-set = bandi salvati dell'utente),
tramite retrieval pgvector sui chunk del testo PDF già estratto in V1.

**Decisioni consigliate prese (nodi aperti della spec V2-A, risolti qui):**
- Estensione `vector` 0.8.2, embedding **Gemini `text-embedding-004` (768 dim)** dietro seam
  `EmbeddingProvider` (riusa `GEMINI_API_KEY`, buon italiano, free tier). Indice **hnsw** (cosine).
- Working-set = **`saved_grants`** dell'utente (già esistente), la proposta della spec.
- Chunking char-based ~2000/200 su confini di paragrafo (riusa lo spirito del chunker scraper).
- Ingestione **condivisa, una volta per documento**: worker async chunka+embedda ogni
  `grant_documents` con `status='ready'` e `chunked_at IS NULL` (batch sui già estratti). Cron
  separato, **spento di default** (stesso pattern di V1, Vault secret).
- Chat cross-bando persistita in **`cross_chat_messages`** (per-utente, non per-bando). Profilo
  iniettato a query-time, mai nei chunk (privacy invariata da V1).
- Entitlement: riusa il secchiello `chat_message` (stesso seam V1).

## Piani (tutti su questa PR/branch)

1. **Fondamenta vettoriali** — migration 0016: `vector`, `grant_document_chunks`,
   `cross_chat_messages`, colonna `chunked_at`, RPC `claim_document_for_embedding()` +
   `match_grant_chunks()`, cron embed (off). Types rigenerati.
2. **Seam embeddings + chunker** — `EmbeddingProvider`/`GeminiEmbeddingProvider`, `chunkText()`.
3. **Worker di embedding** — `embeddingBatch()` + `/api/cron/embed-documents`.
4. **Retrieval + chat cross-bando** — `buildCrossChatPrompt`/`runCrossChatTurn`,
   `/api/ai/strong/cross-chat` (GET storico + POST turno).
5. **UI** — pagina `/assistente` con la chat cross-bando sui bandi salvati.

Dettaglio interfacce nei commit TDD (schema colonne = migration 0016; firme seam = file sorgente).
Ogni piano è software testabile a sé; V2-B (crediti) resta fuori (richiede decisioni pagamenti/IVA).

## Stato: V2-A COMPLETA (2026-07-21)

Tutti e 5 i piani implementati in TDD, 382 test verdi, build produzione pulita, **testato
end-to-end nel browser con Gemini + pgvector reali**: bando salvato → worker chunk+embed
(53 chunk, embeddings reali) → domanda in `/assistente` → retrieval pgvector scoped ai salvati →
risposta LLM fondata sui passaggi recuperati, con fonti cliccabili.

**Correzione durante il test live:** il modello embeddings `text-embedding-004` non è disponibile
su questa API key (404); sostituito con **`gemini-embedding-001` ridotto a 768 dim via
`outputDimensionality`**, chiamato con `:embedContent` per-testo (l'API non espone un batch sync).
DB/indice invariati (768 dim). Vedi commit `fix(ai): Gemini embeddings use gemini-embedding-001`.

Restano manuali (come per V1, per accendere il cron di embedding in produzione): impostare i Vault
secret `embed_endpoint_url` / `embed_cron_secret`. Finché assenti, il cron `embed-documents-every-2-min`
è schedulato ma inerte.
