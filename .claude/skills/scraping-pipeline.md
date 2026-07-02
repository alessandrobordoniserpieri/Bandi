# Scraping Pipeline

Skill per gestire la pipeline di scraping dei bandi.

## Quando usare
- Aggiunta/modifica fonti di scraping
- Debug fonti che falliscono
- Ottimizzazione pipeline di estrazione
- Gestione cache e refresh dati

## Contesto
La pipeline attuale (in grant-radar-server.mjs):
1. **fetchText**: scarica HTML dalla fonte
2. **extractCandidates**: estrae candidati bandi dal testo
3. **enrichCandidate**: arricchisce con dettagli (segue link interni)
4. **makeGrant**: normalizza in oggetto bando standard

Funzioni NLP-like incluse:
- Relevance scoring del testo
- Inferenza scadenze da contesto
- Inferenza area geografica
- Estrazione importi

## 35 Fonti monitorate
Siti governativi italiani, regionali, fondazioni, piattaforme EU:
- Dipartimento Sport, Sport e Salute, Ministero Lavoro
- Italia Domani (PNRR), Regione Emilia-Romagna
- CSVnet, Obiettivo Europa, Con i Bambini
- Fondazione Cariplo, Compagnia di San Paolo, etc.

## Regole
- Cache 6 ore per bandi scrappati
- Max 16 pagine di dettaglio per fonte
- Gestire gracefully i fallimenti (attualmente tutte 32 fonti falliscono)
- Rate limiting per non sovraccaricare i siti sorgente
- User-Agent appropriato nelle richieste
