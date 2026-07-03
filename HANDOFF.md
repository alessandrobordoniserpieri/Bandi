# BANDI-SCANNER v2 — Handoff Document

## What happened in this session

Alessandro ha ripensato da zero l'intera app BANDI-SCANNER usando la skill `/grilling` (intervista a 30 domande, una alla volta). Ogni decisione di design e architettura è stata discussa e approvata esplicitamente.

**Nessun codice è stato scritto o riscritto.** L'utente ha esplicitamente proibito di scrivere codice senza il suo permesso ("non iniziare a scrivere o riscrivere codice, prima devi chiedermi il permesso").

## Deliverables produced

### 1. Design Document Definitivo
- **Path:** `bandi-scanner-v2-definitive.html` (763 righe, 46KB)
- **Artifact:** https://claude.ai/code/artifact/ddb572b9-f668-40d2-b153-dcc81e32dfb7
- **Content:** Tutte le 30 decisioni di design emerse dal grilling, organizzate in 10 sezioni

### 2. Specifica Funzionale & Roadmap
- **Path:** `bandi-scanner-v2-roadmap.html` (945 righe, 85KB)
- **Artifact:** https://claude.ai/code/artifact/ddb572b9-f668-40d2-b153-dcc81e32dfb7
- **Content:** Domain model, 7 ADR, 15 branch specs in 5 fasi, gate di accettazione, proiezione costi

### 3. Matching Engine v1 (esistente, da riscrivere)
- **Path:** `app/src/lib/matching/` (10 file TypeScript, ~1274 righe)
- **Status:** Funzionante con 28 test che passano, ma usa il vecchio modello (8 dimensioni, 142pt overflow). Va riscritto secondo il Design Doc v2.

## Key design decisions (summary)

| Decision | Choice |
|----------|--------|
| Target | Enti singoli (non consulenti). Un account = un ente. No multi-tenant. |
| Matching | 6 dimensioni scored (100pt totali): Temi 28, Forma giuridica 22, Territorio 18, Capacità×Complessità 14, Documenti 12, Track record 6. + 3 indicatori visivi + 3 bonus/malus. |
| Legal type matching | 8 gruppi di compatibilità (sostituisce il vecchio substring match su legalTypeKey che aveva bug) |
| Territory matching | Strutturato su codici provincia/regione (sostituisce textOverlap fragile) |
| Capacity | Calcolata da 6 domande concrete (non dropdown autodichiarato) |
| Documents | Checklist strutturata array vs array (non regex su testo concatenato) |
| Track record | 6pt generici + badge storico specifico (Già finanziato / Già candidato / Conosce erogatore) via lista predefinita ~70 enti erogatori |
| Verdetti | Candidabile (≥75+docs), Da preparare (≥75), Da valutare (≥50), Bassa priorità (≥30), Non compatibile (<30), Storico (chiuso) |
| Scraping | Vercel Cron → Browserless.io (free) → AI provider-agnostic (Gemini free default) → Supabase. 12 fonti MVP, ogni 48h. |
| AI architecture | LLMProvider interface con adapter: Gemini (default free), Anthropic, Groq, OpenAI. Cambio provider = cambio env var. |
| Scraper folder | `scraper/` top-level, separato da `app/` |
| Profile | ~40 campi in 8 sezioni, onboarding progressivo (12 essenziali subito) |
| Saved grants pipeline | 4 stati: Salvato → In preparazione → Candidato → Esito. Esito "Finanziato" auto-popola track record. |
| DB | Supabase Postgres + Auth, regione EU Frankfurt. 6 tabelle con RLS. |
| Stack | Next.js su Vercel + Supabase + Browserless.io + Gemini free |
| UI | Desktop-first responsive, web app (no native), 4 pagine |
| Pricing | Piano unico €30-50/mese, tutto incluso |
| Privacy | Dati EU, no analytics terze parti, no cookie banner, disclaimer AI |

## Development roadmap (5 phases, 15 branches)

### Fase 1 — Fondamenta
1. `feat/project-scaffold` — Next.js + Tailwind + vitest
2. `feat/supabase-schema` — 6 tabelle + RLS + seed dati
3. `feat/auth-flow` — Signup/login/logout + layout con sidebar

### Fase 2 — Core Engine
4. `feat/matching-types-constants` — Nuove interfacce + LEGAL_TYPE_GROUPS + PROVINCE_TO_REGION
5. `feat/matching-dimensions` — 6 dimensioni + indicatori + bonus + verdetti
6. `feat/matching-cleanup` — Rimozione codice v1 obsoleto + nuovi test

### Fase 3 — Scraping (parallelizzabile con Fase 4)
7. `feat/scraper-scaffold` — LLMProvider interface + adapter Gemini
8. `feat/scraper-pipeline` — fetch → extract → enrich → dedup → save
9. `feat/scraper-cron` — Vercel Cron + crowdsourcing URL

### Fase 4 — UI (parallelizzabile con Fase 3)
10. `feat/profile-form` — 8 sezioni, ~40 campi, tag/legal-type/province picker
11. `feat/dashboard-matching` — Bandi ordinati per score, card, dettaglio con breakdown
12. `feat/my-grants` — Pipeline 4 stati, auto-popola track record
13. `feat/new-grants-page` — Bandi recenti, filtri, form crowdsourcing

### Fase 5 — Prodotto completo
14. `feat/email-alerts` — Alert settimanali, soglia configurabile
15. `feat/ai-analysis` — Analisi AI on-demand nel dettaglio bando
16. `feat/deploy-production` — Privacy policy, error boundaries, deploy Vercel

## Existing code state

- **Branch:** `claude/enterprise-solution-context-skx691`
- **app/src/lib/matching/** — Engine v1 funzionante (va riscritto per v2)
- **app/vitest.config.ts** — Vitest configurato
- **app/package.json** — Next.js scaffold esistente
- Both HTML design documents committed and pushed

## Known issues in v1 matching (to fix in v2)

1. `legalTypeKey` substring match: "ASD" prefix remains after "associazione sportiva dilettantistica" → "asd" replacement, producing "asdasd". "ETS" matches almost everything.
2. `textOverlap` fragile for Italian place names
3. Weights sum to ~142 not 100 (overflow, then clamped)
4. Document detection via regex on concatenated text strings
5. Capacity is a subjective dropdown

## User preferences

- Works ONLY from Claude web on Windows (no local terminal)
- Wants to download HTML files from GitHub, not via artifacts
- Lingua UI: italiano. Lingua codice: inglese.
- Gets frustrated if skills other than the one requested are used
- Explicit permission required before writing/rewriting any code
- Prefers Fable 5 model for document generation

## Suggested skills for next session

- `/grilling` — if any new design decisions need to be made
- `/implement` — when starting actual development (with user permission)
- `/tdd` — for test-driven development of matching engine v2
- `/supabase` — when setting up the database schema and RLS
- `/domain-modeling` — if refining the data model further
- `/code-review` — when reviewing implemented branches before merge
