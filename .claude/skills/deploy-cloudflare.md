# Deploy Cloudflare

Skill per il deploy su Cloudflare Pages/Workers.

## Quando usare
- Configurazione deploy Cloudflare Pages
- Setup Cloudflare Workers per API/scraping
- Configurazione dominio e DNS
- Ottimizzazione performance e caching

## Architettura target
- **Cloudflare Pages**: hosting frontend (React/Next.js)
- **Cloudflare Workers**: API endpoints, proxy scraping
- **Supabase**: database, auth, storage (esterno)
- **Google Document AI**: OCR documenti (esterno)

## Regole
- Le variabili d'ambiente sensibili (API keys Supabase, Google) vanno in Workers Secrets
- CORS configurato per il dominio di produzione
- Cache headers appropriati per assets statici
- Workers con rate limiting per API pubbliche
