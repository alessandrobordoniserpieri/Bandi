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
