# Supabase Schema Management

Skill per gestire lo schema del database Supabase per Bandi-Scanner.

## Quando usare
- Creazione/modifica tabelle Supabase
- Migrazioni database
- Row Level Security (RLS) policies
- Gestione relazioni tra entità (clienti, bandi, matching, fonti)

## Contesto
Il database Supabase gestisce:
- **clients**: profili enti italiani (~40 campi: tipo legale, territorio, capacità, tag, partner, documenti, storico)
- **grants**: bandi pubblici/privati con scadenze, importi, tag, area geografica
- **matches**: risultati matching cliente-bando con score 0-100 e breakdown
- **sources**: 35 fonti monitorate per scraping bandi
- **documents**: documenti caricati (PDF, DOCX) con testo estratto
- **organizations**: multi-tenancy per aziende/consulenti

## Regole
- Usare sempre RLS per multi-tenancy
- I 63 tipi legali italiani (LEGAL_TYPES) vanno come enum o tabella lookup
- I 47 tag tematici vanno come array o tabella lookup
- Timestamps in UTC, date scadenza in formato ISO
- Soft delete con campo `deleted_at` dove necessario
