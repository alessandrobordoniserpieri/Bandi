# BANDI-SCANNER — Enterprise Solution

## Progetto
Piattaforma italiana per il matching tra bandi pubblici/privati e profili di clienti (associazioni, cooperative, fondazioni, ETS). Trasformazione da beta monolitica a web app enterprise multi-tenant.

## File sorgente attuali
- `grant-radar-matching.html` — App completa single-page (3516 righe, 225KB): CSS + HTML + JS
- `grant-radar-server.mjs` — Server Node.js (455 righe): scraping, API, serving
- `auto-grants.json` — Dati bandi pre-caricati (JSON)
- `CHANGELOG.txt` — Changelog versione beta
- `README-beta.txt` — README versione beta
- `README-node.xml` — README versione con Node.js

## Stack target
- **Frontend**: React/Next.js (da monolite HTML)
- **Backend**: Cloudflare Workers
- **Database**: Supabase (Postgres + Auth + Storage)
- **OCR**: Google Document AI
- **Hosting**: Cloudflare Pages

## Feature core (da preservare)
- Matching engine con scoring 0-100 e breakdown per categoria
- 63 tipi legali italiani (LEGAL_TYPES)
- 47 tag tematici
- 35 fonti di scraping
- Profilazione clienti con ~40 campi
- Export CSV matching

## Convenzioni
- Lingua UI: italiano
- Lingua codice/commenti: inglese
- Contesto normativo: italiano (Codice Terzo Settore, D.Lgs 117/2017)
- L'app NON e' per fatture/OCR fatture — e' per matching bandi
