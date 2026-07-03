# ADR-005: Lista predefinita di erogatori

## Status

Accettato

## Context

Una delle dimensioni del matching è lo "storico specifico": il fatto che
un ente sia già stato finanziato da un dato erogatore, ci abbia già
partecipato senza successo, o lo conosca comunque da candidature pregresse
pesa sulla probabilità di successo per un nuovo bando dello stesso
erogatore. Perché questo confronto funzioni, il sistema deve poter
stabilire con certezza che l'"erogatore X" nello storico del profilo e
l'"erogatore Y" del bando scrapato sono la stessa entità.

Con un campo di testo libero questo confronto è impraticabile: lo stesso
erogatore compare in forme diverse a seconda della fonte — "Fondazione
Cariplo", "Cariplo", "F.ne Cariplo" — e un matching esatto su stringa
fallirebbe nella maggioranza dei casi, mentre un fuzzy match generico su
nomi di erogatore produce troppi falsi positivi/negativi per essere
affidabile su un segnale che influenza direttamente lo score.

## Decision

Viene introdotta la tabella `grant_providers`, popolata con una lista
curata di ~70 erogatori italiani reali (fondazioni bancarie, ministeri,
programmi UE, enti pubblici, ecc.):

```sql
create table public.grant_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind provider_kind not null,   -- 'pubblico' | 'privato' | 'eu'
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);
```

Sia lo storico progetti nel profilo ente (`profiles.project_history`, che
referenzia un `providerId`) sia i bandi scrapati (`grants.provider_id`)
puntano a questa tabella tramite **foreign key**, mai tramite testo
libero:

```sql
provider_id uuid references public.grant_providers(id) on delete set null
```

Il flusso di normalizzazione è a due livelli:

1. **Erogatore (esatto)**: quando lo scraper/AI estrae il nome
   dell'erogatore da un bando, lo normalizza contro `grant_providers`
   (nome o uno degli `aliases`) e assegna il `provider_id` corrispondente,
   oppure `null` se non trova corrispondenza — non viene mai inventato un
   nuovo erogatore né salvato un nome libero non risolto.
2. **Bando (fuzzy)**: il fuzzy match resta ammesso solo al secondo
   livello, cioè sul nome del singolo bando (utile per rilevare che "Bando
   Welfare 2024" e "Bando Welfare 2024 - II edizione" sono correlati), mai
   per identificare l'erogatore.

## Consequences

- **Pro**: lo storico "già finanziato da / già candidato a" è confrontabile
  con certezza (join su `provider_id`, non su stringa), rendendo affidabile
  la dimensione di scoring che dipende da questo segnale.
- **Pro**: la lista curata elimina duplicati e varianti ortografiche alla
  radice, invece di doverle gestire ripetutamente a runtime con euristiche
  di fuzzy matching sull'erogatore.
- **Contro**: la lista richiede manutenzione — ogni nuovo erogatore reale
  che compare in un bando scrapato e non trova corrispondenza (`provider_id
  = null`) va aggiunto manualmente (nome canonico, `kind`, alias noti),
  altrimenti quei bandi restano fuori dal segnale di storico specifico.
- **Contro**: onere iniziale di curatela per raggiungere una copertura
  sufficiente (~70 erogatori all'avvio, in `0004_seed.sql`), da estendere
  nel tempo man mano che lo scraper incontra nuovi erogatori non ancora
  presenti in tabella.
