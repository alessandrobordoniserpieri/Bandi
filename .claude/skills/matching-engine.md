# Matching Engine

Skill per lavorare sul motore di matching bandi-clienti.

## Quando usare
- Modifica dell'algoritmo di scoring
- Aggiunta nuovi criteri di matching
- Debug punteggi matching
- Ottimizzazione performance matching

## Contesto
Il matching engine calcola un punteggio 0-100 confrontando:
1. **Tag tematici** (sport, giovani, inclusione, cultura, ambiente...)
2. **Tipo ente** (ASD, SSD, ETS, APS, ODV, cooperative, fondazioni...)
3. **Territorio** (regione, provincia, comune)
4. **Capacità organizzativa** (budget, dipendenti, esperienza)
5. **Partner** (rete di collaborazioni)
6. **Documenti** (statuto, bilanci, rendiconti)
7. **Storico progetti** (track record su bandi simili)
8. **Scadenza** (tempo rimanente per candidatura)

## Decisioni di match
- **Candidabile**: score alto, documenti pronti, scadenza ok
- **Da preparare**: score buono ma mancano documenti/requisiti
- **Da verificare**: score medio, serve analisi manuale
- **Storico**: bando scaduto, utile per confronto

## Regole
- Il motore di matching e' la feature core: preservare la logica esistente nel refactoring
- Ogni modifica deve mantenere backward compatibility con i dati esistenti
- Il breakdown per categoria deve sempre essere disponibile
- L'export CSV deve includere sottopunteggi, criticita e azioni consigliate
