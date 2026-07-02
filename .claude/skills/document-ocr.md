# Document OCR & Text Extraction

Skill per l'estrazione testo da documenti caricati.

## Quando usare
- Integrazione Google Document AI
- Estrazione testo da PDF, DOCX, TXT
- Analisi documenti per compilazione automatica profilo
- Qualita di estrazione e fallback

## Contesto
L'app supporta upload di documenti per:
- Compilazione assistita del profilo cliente (statuto, bilanci, rendiconti, progetti)
- Controllo RASD (confronto dati Registro vs profilo vs documenti)
- Miglioramento matching tramite analisi documentale
- Prontezza documentale collegata al punteggio di candidatura

## Pipeline
1. Upload documento (PDF, DOCX, TXT)
2. Estrazione testo (best-effort senza OCR attualmente)
3. Analisi contenuto (NLP-like per estrarre dati strutturati)
4. Aggiornamento profilo cliente con dati estratti

## Regole
- Il focus e' matching bandi, NON lettura fatture
- Google Document AI per OCR reale (fase futura)
- Fallback a estrazione testuale per PDF non scansionati
- Storage documenti su Supabase Storage
- Rispettare limiti di dimensione file
