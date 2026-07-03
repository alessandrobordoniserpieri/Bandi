# ADR-001: Un account = un ente (niente multi-tenant)

## Status

Accettato

## Context

BANDI-SCANNER serve enti singoli — associazioni sportive dilettantistiche,
enti del Terzo Settore, cooperative, fondazioni — che devono profilare la
propria organizzazione e trovare i bandi più adatti a *quell'unico* ente.
Il target non è il consulente o il centro servizi che gestisce un
portafoglio di clienti multipli sotto lo stesso login: quel segmento
(multi-tenant, con più profili ente per singolo account, ruoli e
condivisione tra collaboratori) è esplicitamente fuori dal perimetro del
prodotto.

Progettare fin da subito uno schema multi-tenant (tabella `organizations`,
membership con ruoli, policy RLS che risolvono l'appartenenza tramite una
tabella ponte) introduce complessità di modello dati, di RLS e di UI che
non serve a nessun utente reale del segmento target, e rallenta lo sviluppo
del branch 001 (schema Supabase) su cui dipendono tutti i branch successivi.

## Decision

Ogni account Supabase Auth (`auth.users`) possiede **esattamente un**
profilo ente. Non esiste alcuna tabella `organizations`, alcun sistema di
ruoli (owner/admin/member) né alcun meccanismo di condivisione di un
profilo tra più account.

Il rapporto 1:1 è imposto a livello di schema:

- `profiles.user_id` è `not null unique references auth.users(id)`;
- `user_settings.user_id` è `not null unique references auth.users(id)`;

di conseguenza un utente non può avere più di un profilo ente né più di
una riga di impostazioni, e l'unicità è garantita dal database, non solo
applicativamente.

Le policy RLS derivano da questo modello e sono banali — nessuna join,
nessuna tabella di membership da attraversare:

```sql
using ((select auth.uid()) = user_id)
```

applicata identica (adattata a insert/update/delete) su `profiles`,
`user_settings` e `saved_grants`.

## Consequences

- **Pro**: schema e RLS minimi, facili da auditare e da mantenere corretti;
  nessuna superficie per bug di isolamento tra tenant (privilege escalation
  via join su tabella di membership) perché quella join non esiste.
- **Pro**: onboarding e UI più semplici — non serve alcuna schermata di
  "seleziona organizzazione" o gestione inviti/ruoli.
- **Contro**: se in futuro emergesse una domanda reale dal segmento
  consulenti/centri servizi (un account che gestisce N profili ente),
  servirà una migrazione strutturale non banale: introdurre una tabella
  ponte (es. `organization_members`), spostare `user_id` da colonna diretta
  a riferimento tramite membership, e riscrivere le policy RLS su tutte le
  tabelle owner-scoped. Questo costo è rinviato deliberatamente: il
  segmento consulenti è oggi fuori target, e ottimizzare per un caso d'uso
  ipotetico avrebbe rallentato la messa in produzione del caso d'uso reale.
