# BANDI-SCANNER — Handoff Document (2026-07-13)

## Cos'è il progetto

Piattaforma web italiana per il matching tra bandi pubblici/privati e profili di enti del terzo settore (associazioni, cooperative, fondazioni, ETS). Un utente registra il proprio ente con ~40 campi, e il sistema calcola automaticamente la compatibilità (0-100) con ogni bando disponibile.

## Stack in produzione

| Componente | Tecnologia |
|---|---|
| Frontend | Next.js 16 (React 19, Turbopack) |
| Hosting | Vercel (piano Hobby, maxDuration 300s, root dir = `app/`) |
| Database | Supabase Postgres + Auth + RLS (progetto `gptsklxbkuhdfkksmqhz`, EU) |
| Scraper | Pacchetto npm locale `bandi-scraper` (workspace monorepo) |
| LLM scraping | Gemini 2.5 Flash (default), adapter per Anthropic/OpenAI/Groq |
| Page rendering | Browserless.io (headless Chrome) |
| Email | Resend (digest settimanale) |

## Struttura del monorepo

```
Bandi/
├── app/                        # Next.js web app
│   ├── src/app/(app)/          # Pagine autenticate (lista bandi, dettaglio, profilo, kanban)
│   ├── src/app/(auth)/         # Login, signup, recupera password
│   ├── src/app/api/cron/       # Cron routes (scrape giornaliero, digest settimanale)
│   ├── src/lib/matching/       # Matching engine 6 dimensioni (themes, legal-form, territory, capacity, documents, track-record)
│   ├── src/lib/grants/         # Query, filtri, mapping bandi
│   ├── src/lib/ai/             # Analisi AI on-demand per singolo bando
│   ├── src/lib/alerts/         # Digest email settimanale
│   ├── src/lib/profile/        # Schema profilo ente (~40 campi)
│   ├── src/lib/saved-grants/   # Kanban 4 stati (interessante → candidatura → presentato → esito)
│   ├── supabase/migrations/    # Migrazioni DB (0001-0009)
│   └── vercel.json             # Cron jobs
├── scraper/                    # bandi-scraper package
│   ├── src/pipeline/           # sanitize → extract → detail → dedup → save
│   ├── src/providers/          # LLM adapters (gemini, anthropic, openai, groq)
│   ├── src/db/                 # Supabase adapter
│   └── tests/                  # 104 test
├── docs/                       # ADR, design docs, piani
│   ├── adr/                    # 8 decisioni architetturali
│   ├── bandi-scanner-v2-definitive.html  # Design doc definitivo
│   └── bandi-scanner-v2-roadmap.html     # Roadmap funzionale 15 branch
└── .claude/CLAUDE.md           # Istruzioni per Claude Code
```

## Feature implementate (su main)

| PR | Cosa fa |
|---|---|
| #5 | Matching engine 6 dimensioni, 100pt, 5 verdetti |
| #6-#8 | DB 6 tabelle + RLS, auth Supabase, profilo ~40 campi |
| #9-#12 | Scraper pipeline, dashboard bandi, cron scheduling |
| #13-#16 | Kanban 4 stati, PWA, digest email settimanale |
| #17-#20 | Analisi AI on-demand, fix monorepo Vercel |
| #25-#28 | UX redesign OKLCH, score-bar, density toggle |
| #29-#31 | Fix vercel.json, API middleware, schema Gemini nullable |
| #32 | **Scraper V2**: detail enrichment, edition-aware dedup, 10 nuovi campi |
| #33-#36 | Fix cron GET, types V2, sanitizer HTML, URL snapping |
| #37 | Sanitizer: strip `<select>`, collassa whitespace |
| #39 | Cache-Control no-store su cron routes |
| #40 | Logging diagnostico in extractGrants |
| #41 | Risoluzione URL relativi da LLM |

## Stato test (2026-07-13)

- Scraper: **104/104 test passano**
- App: ~256 test (non ri-verificati in questa sessione)

## Stato scraper e fonti

### Fonti attive nel DB (grant_sources, enabled=true)

| Nome | URL | Stato |
|---|---|---|
| Regione Emilia-Romagna | `sociale.regione.emilia-romagna.it/leggi-atti-bandi` | Funzionante — 4 bandi estratti, detail OK. Ultimo problema: Gemini restituiva URL relativi → fix PR #41 |
| "Fondazione Cariplo" (ora sportesalute.eu) | `sportesalute.eu/bandi-e-avvisi/bandi-altri-enti.html` | Problematica — pagina 1MB, sanitizzata a 80K, ma Gemini dà errore di rete (probabile timeout su input grande) |

### Fonti disabilitate nel DB (enabled=false)

10 fonti disabilitate. Include: Fondazione CON IL SUD, Compagnia di San Paolo, CONI, Erasmus+, CSVnet, Fondazione CRT, Info-cooperazione, Europa Funding, Terzo Settore, Sport e Salute (URL diverso).

**Nota**: la source "Fondazione Cariplo" ha l'URL cambiato a sportesalute.eu per testing. L'URL originale di Cariplo (`fondazionecariplo.it/contributi/bandi/`) è bloccato da Cloudflare anti-bot.

### Lista completa 35 fonti originali (dalla beta)

Queste erano le fonti nella versione beta (`grant-radar-server.mjs`, ora rimosso). Molte non sono ancora nel DB:

1. Dipartimento per lo Sport — `sport.governo.it/it/bandi-e-avvisi/`
2. Piattaforma Avvisi e Bandi Sport — `avvisibandi.sport.governo.it/`
3. Sport e Salute — `bandi.sportesalute.eu/`
4. Ministero del Lavoro - Terzo Settore — `lavoro.gov.it/temi-e-priorita/terzo-settore...`
5. Ministero del Lavoro - Notizie — `lavoro.gov.it/notizie`
6. Italia Domani - PNRR — `italiadomani.gov.it/.../bandi-avvisi.html`
7. Regione Emilia-Romagna - Tutti i bandi — `bandi.regione.emilia-romagna.it/`
8. Regione Emilia-Romagna - Sport — `regione.emilia-romagna.it/sport/bandi`
9. Regione Emilia-Romagna - Sociale — `sociale.regione.emilia-romagna.it/leggi-atti-bandi/bandi`
10. Regione Emilia-Romagna - Terzo Settore — `sociale.regione.emilia-romagna.it/terzo-settore/...`
11. Infobandi CSVnet — `infobandi.csvnet.it/`
12. Obiettivo Europa - Sport — `obiettivoeuropa.com/bandi/aperti/settore/sport/...`
13. Obiettivo Europa - Inclusione — `obiettivoeuropa.com/bandi/aperti/settore/inclusione.../`
14. Con i Bambini — `conibambini.org/bandi-e-iniziative/`
15. Fondazione con il Sud — `fondazioneconilsud.it/bandi/`
16. Fondazione Cariplo — `fondazionecariplo.it/it/bandi.html` (bloccato da Cloudflare)
17. Compagnia di San Paolo — `compagniadisanpaolo.it/it/contributi/`
18. Open Fundraising — `openfundraising.it/`
19. Granter — `granter.it/`
20. AssoBandi — `assobandi.com/`
21. ConfiniOnline — `confinionline.it/it/Principale/bandi.aspx`
22. AgevolaPro — `agevolapro.net/`
23. Bandi e Agevolazioni No Profit — `bandieagevolazioni.it/bandi-noprofit`
24. Incentivi.gov.it — `incentivi.gov.it/`
25. Invitalia — `invitalia.it/cosa-facciamo/creiamo-nuove-aziende`
26. EACEA — `eacea.ec.europa.eu/grants_en`
27. Creative Europe — `culture.ec.europa.eu/creative-europe/calls`
28. CERV Programme — `commission.europa.eu/.../citizens-equality-rights-and-values-programme_en`
29. Fondazione TIM — `fondazionetim.it/`
30. Enel Cuore — `enelcuore.it/`
31. Fondazione Vodafone Italia — `fondazionevodafone.it/`
32. UniCredit Foundation — `unicreditfoundation.org/`

### Problemi noti dello scraper

1. **Gemini errore di rete su pagine grandi**: sportesalute.eu ha 1MB di HTML raw, sanitizzato a 80K. Gemini va in timeout o errore rete. Possibile fix: ridurre MAX_CHARS o chunking.
2. **Cloudflare anti-bot**: Fondazione Cariplo blocca Browserless. Nessun workaround disponibile.
3. **URL hallucination**: Gemini traduce parole italiane negli URL (es. "per" → "for"). Mitigato con URL snapping (PR #36) che aggancia sempre all'href reale più vicino nello stesso dominio.
4. **URL relativi**: Gemini restituisce path relativi invece di URL assoluti. Fix: risoluzione con `new URL(raw, pageUrl)` (PR #41).
5. **Rate limit Gemini**: piano free ha ~15 req/min. Troppe chiamate ravvicinate danno 429.

## Migrazioni DB applicate (Supabase)

- `0001_enums.sql` → enum types (grant_status, geo_scope, complexity, funding_type)
- `0002_tables.sql` → grants, grant_sources, grant_providers, profiles, user_settings, saved_grants
- `0003_rls.sql` → Row Level Security
- `0004_seed.sql` → seed data (12 fonti, provider)
- `0005_enable_sources.sql` → abilita fonti
- `0006_saved_grant_status_fn.sql` → funzione cambio stato kanban
- `0007_ai_analysis.sql` → tabella analisi AI
- `0008_scraper_v2_enum.sql` → aggiunge 'scaduto' a grant_status
- `0009_scraper_v2_schema.sql` → 10 colonne V2, scrape_logs, expire_grants(), partial unique index

Tabelle aggiuntive create via SQL diretto (non in migration):
- `scrape_debug` — log HTML raw/clean per debug, cleanup automatico pg_cron ogni 3 giorni

## pg_cron jobs attivi

- `expire-grants` — `0 2 * * *` — marca come 'scaduto' i bandi con deadline passata
- `cleanup-scrape-debug` — `0 4 * * *` — elimina debug HTML più vecchi di 3 giorni

## Prossimi passi

1. **Verificare fix URL relativi** — dopo deploy PR #41, lanciare il cron e controllare che Emilia-Romagna estragga di nuovo i 4 bandi
2. **Risolvere sportesalute.eu** — ridurre MAX_CHARS o implementare chunking per evitare timeout Gemini
3. **Ripristinare Fondazione Cariplo** — ripristinare l'URL originale nella source o trovare fonte alternativa
4. **Abilitare altre fonti** — una alla volta, verificando che funzionino
5. **Upgrade Vercel Pro** — 300s potrebbe non bastare per 12+ fonti con detail enrichment
6. **Rigenerare tipi Supabase** — `mapping.ts` usa `as Record<string, unknown>` cast

## Design documents

- `docs/bandi-scanner-v2-definitive.html` — tutte le 30 decisioni di design
- `docs/bandi-scanner-v2-roadmap.html` — specifica funzionale, 15 branch, criteri di accettazione
- `docs/adr/` — 8 ADR (one-account-one-entity, AI provider agnostic, rule-based matching, ecc.)
