# Onboarding: chiave OCR.space (gratuita) per l'analisi forte

L'estrazione dei PDF **scansionati** usa OCR.space come motore OCR di default (seam `OcrProvider`,
sostituibile). Serve una **chiave API gratuita**. Build e test NON la richiedono (usano un fake);
serve solo per far girare l'estrazione reale (Piano 3+).

## Passo-passo

1. Vai su **https://ocr.space/ocrapi** e clicca "Register for free API key".
2. Inserisci la tua email. Ricevi la chiave (una stringa) via email.
3. Aggiungi la chiave alle env var del progetto:
   - **In locale:** in `app/.env.local` aggiungi
     ```
     OCR_SPACE_API_KEY=la-tua-chiave
     ```
   - **Su Vercel:** Project → Settings → Environment Variables → aggiungi `OCR_SPACE_API_KEY`.
4. (Opzionale) `OCR_SPACE_LANGUAGE` (default `ita`) e `OCR_PROVIDER` (default `ocrspace`).

## Limiti del free tier (perché rasterizziamo pagina-per-pagina)

- **1 MB** per file → inviamo una immagine PNG per pagina, ricompressa sotto 1 MB (`rasterize.ts`).
- **25.000** richieste/mese, **500**/giorno per IP.
- Il cap giornaliero per-utente sull'estrazione (spec §8, ~15 bandi/giorno) tiene il volume basso.

## Migrazione futura (stesso seam)

Per più accuratezza si può passare a **Google Cloud Vision** (richiede progetto GCP + billing):
si aggiunge un adapter dietro `OcrProvider` e si cambia `OCR_PROVIDER`. Nessun altro codice cambia.
