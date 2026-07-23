# Redesign UI/UX + Architettura Informativa — Concept

> Documento di concept e architettura informativa per il ripensamento completo dell'interfaccia
> e dell'interazione tra le pagine della piattaforma. Prodotto attraverso un team di agenti
> (mappatura IA, critique visivo, audit accessibilità, revisione UX-copy) e una sessione di
> _grilling_ (skill `grilling` di Matt Pocock) che ha messo in discussione ogni decisione con lo
> stakeholder prima di finalizzarla. Le 14 decisioni qui sotto sono **confermate**, non proposte.

---

## 1. Sommario esecutivo

L'app oggi è un insieme di pagine giustapposte senza una gerarchia di navigazione, con
ridondanze strutturali (due liste bandi quasi identiche, due pannelli AI, due chat non
collegate), informazioni di matching che si perdono dove servono di più (il Kanban dei bandi
salvati), vincoli economici invisibili (crediti e limiti giornalieri nascosti), e nessuno stato
di caricamento/errore brandizzato in tutta l'applicazione.

Il redesign interviene su tre livelli:

1. **Navigazione** → da 5 tab flat a una **sidebar globale permanente** a due gruppi, che dà
   finalmente una casa a impostazioni ente, crediti, scadenze.
2. **Densità e ridondanza** → si accorpa ciò che è duplicato (liste bandi, pannelli AI) e si
   ristruttura ciò che è illeggibile (Kanban, dettaglio bando).
3. **Trasparenza dei vincoli** → crediti e limiti giornalieri diventano sempre visibili, e il
   sistema non distrugge mai output che l'utente ha già pagato.

---

## 2. Stato attuale — problemi rilevati

Sintesi dei tre agenti di analisi. Riferimenti `file:riga` verificati sul codice.

### 2.1 Ridondanze strutturali
- **Dashboard `/` ≈ `nuovi-bandi`**: stessa query/`FilterBar`/`GrantCard`, differiscono solo per
  `discoveredAfterDays: 7` (`page.tsx:28` vs `nuovi-bandi/page.tsx:26`) e per la stats-row +
  `SubmitUrlDialog` presenti solo nella dashboard (`page.tsx:47-52`). Due pagine per "la stessa
  lista con un filtro diverso".
- **Due pannelli AI sovrapposti** in `bandi/[id]/page.tsx:179-180`: `AIAnalysisPanel` ("Analisi AI
  approfondita") e `StrongAnalysisPanel` ("Analisi forte") con lo stesso array `SECTIONS`
  copiato (`ai-analysis-panel.tsx:8-13` = `strong-analysis-panel.tsx:10-15`). Il backend V1
  (`/api/ai/analyze`) **non fa più** questa distinzione: risponde sempre e potenzia in silenzio.
- **Due chat quasi identiche senza rimando**: `StrongChatPanel` (per-bando) e `CrossChatPanel`
  (cross-bando, `/assistente`), stessa UI e stesso contatore crediti, endpoint diversi
  (`/api/ai/strong/chat` vs `/api/ai/strong/cross-chat`).

### 2.2 Informazione che si perde
- **`i-miei-bandi` (Kanban) è "cieco"**: `saved-grant-card.tsx:14-43` non mostra punteggio,
  verdetto né scadenza — l'unico posto dove tornano è riaprendo il dettaglio. Il cuore del
  prodotto (il matching) sparisce proprio nella vista di lavoro quotidiano.
- **Radar a 6 assi promesso ma mai mantenuto**: `auth-shell.tsx` disegna un radar esagonale su
  login/signup come value proposition, ma nel prodotto autenticato le 6 dimensioni sono solo una
  lista di `<progress>` (`score-breakdown.tsx`).

### 2.3 Vincoli invisibili
- **Crediti nascosti**: `free_balance`/`paid_balance` compaiono solo come badge dentro i due
  pannelli chat. Nessuna pagina crediti.
- **Limiti non comunicati**: preparare i documenti di un bando è rate-limited (bucket giornaliero
  `"extraction"`, `prepare/route.ts:50-55`), ma l'utente lo scopre solo sbattendoci contro.

### 2.4 Fondamenta mancanti
- **Nessun `loading.tsx` / `error.tsx` in tutta l'app**: durante i fetch server-side (Supabase) e
  le chiamate LLM lente non c'è skeleton/spinner, e un errore mostra la pagina generica di Next.
  È il gap dev più urgente.
- **Onboarding disonesto**: copre 3/8 sezioni (68/100 di peso) ma il CTA dice "Completa e vai alla
  Dashboard", come se il profilo fosse finito (`onboarding/wizard.tsx:34`).

### 2.5 Accessibilità (buone fondamenta, due difetti)
- ✅ Contrasto colore: tutti i token verificati passano WCAG AA. Focus visibile coerente
  (`globals.css`). Verdetti/badge mai solo-colore (colore + label sempre). **Da preservare.**
- ❌ `aria-hidden="true"` sull'intero `auth-brand-panel` (`auth-shell.tsx`) nasconde agli screen
  reader anche testo reale (wordmark + value proposition). Fix: `aria-hidden` solo sul radar SVG.
- ❌ Intestazioni di colonna Kanban (`kanban-column.tsx`) sono `<div>`, non heading → invisibili
  nella outline dei titoli per gli screen reader.

### 2.6 Copy (tono buono, difetti puntuali)
- **Token grezzi mostrati all'utente**: `section-capacity.tsx:10` mostra `"qualche_volta"`;
  `section-history.tsx` mostra `"non_ammesso"`, `"in_valutazione"`, `"quote_associative"`. Manca
  il mapping a label leggibili (che altrove esiste già, es. `FUNDING_TYPE_LABELS`).
- **Termini sovraccaricati**: `Storico` = dimensione di scoring **e** verdetto bando scaduto **e**
  sezione profilo; radice `candidat-` = verdetto "Candidabile" vs stato "Candidato" vs "Già
  candidato"; radice `preparare` = verdetto "Da preparare" vs stato "In preparazione".
- **Inglese fuori posto**: `"Track record"` (`breakdown.ts:5`) e tab `"Dashboard"`
  (`nav-tabs.tsx:6`) in un'app altrimenti italiana.
- **Chip priorità grezzo**: il profilo mostra letteralmente `"dopo"` come etichetta
  (`profile/constants.ts`).

### 2.7 Bug incontrati
- `/preview/grant-card` non è nell'allowlist del middleware e viene rediretta a `/login` nonostante
  il commento nel codice dica "no auth". Da correggere o rimuovere.

---

## 3. Principi guida (regole trasversali del redesign)

1. **Una casa per ogni cosa.** Ogni funzione ha un posto solo e prevedibile. Niente azioni
   presenti in una pagina e assenti in un'altra sorella.
2. **Il matching non si nasconde mai.** Punteggio, verdetto e scadenza seguono il bando ovunque
   appaia (lista, Kanban, scadenze).
3. **Mostra il costo prima di spenderlo.** Crediti e limiti sono sempre visibili; nessuna spesa a
   sorpresa. Corollario: **non distruggere mai output già pagato** (vedi chat, §5.6).
4. **Onestà sullo stato.** L'app dice sempre la verità su completamento profilo, profondità
   dell'analisi AI, disponibilità documenti. Niente "finto completo".
5. **Craft obbligatorio.** Ogni schermata passa da `impeccable` + `/design:critique` +
   `/design:accessibility` prima di dirsi finita (vedi §8).

---

## 4. Nuova Architettura Informativa

### 4.1 Modello di navigazione — sidebar globale permanente

Si abbandonano le 5 tab flat in alto. Nuova **sidebar sinistra sempre presente** (stile SaaS),
organizzata in **due gruppi** più un widget crediti in fondo:

```
┌─────────────────────────┐
│  [logo/wordmark]        │
│                         │
│  BANDI                  │   ← gruppo operativo (lavoro quotidiano)
│   ▸ Esplora bandi       │   (ex dashboard + nuovi-bandi, unificate)
│   ▸ I miei bandi        │   (Kanban ridisegnato)
│   ▸ Scadenze            │   (nuova: lista-agenda per urgenza)
│   ▸ Assistente          │   (chat cross-bando)
│                         │
│  ───────────────        │
│  IL MIO ENTE            │   ← gruppo account/configurazione
│   ▸ Profilo ente        │   (8 sezioni con sub-nav interna)
│   ▸ Crediti & piano     │   (nuova: saldo, storico, top-up)
│   ▸ Notifiche           │   (soglia/frequenza digest)
│   ▸ Impostazioni        │
│                         │
│  ┌───────────────────┐  │
│  │ Crediti: 12       │  │   ← widget fisso: saldo sempre visibile
│  │ [Gestisci →]      │  │      linka a "Crediti & piano"
│  └───────────────────┘  │
│  [avatar] Esci          │
└─────────────────────────┘
```

Su mobile la sidebar collassa in un drawer (hamburger) con lo stesso raggruppamento.

### 4.2 Mappa flussi (nuova)

```
signup/login → onboarding (4 sez. obbligatorie: identità, territorio, temi, CONTATTI)
             → Esplora bandi (con reminder completamento profilo se < 100%)

Esplora bandi ──(toggle "Novità")── stessa vista, filtro discoveredAfterDays
      │
      └─▸ GrantCard ─▸ Dettaglio bando  (unico hub, layout 2 colonne)
                          ├─ col. sx (scroll): radar+barre punteggio · breakdown · documenti
                          └─ col. dx (sticky): Analisi AI (badge stato) + Chat per-bando

I miei bandi (Kanban ridisegnato) ─▸ card con verdetto+scadenza ─▸ Dettaglio bando
Scadenze (agenda per urgenza)     ─▸ ─────────────────────────────▸ Dettaglio bando
Assistente (chat cross-bando, multi-thread con storico)

Il mio ente ─▸ Profilo (sub-nav 8 sezioni) · Crediti & piano · Notifiche · Impostazioni
```

---

## 5. Decisioni pagina per pagina (14 confermate)

### 5.1 Esplora bandi — unificazione dashboard + nuovi-bandi `[DEC-1]`
Una sola vista lista. Il filtro "novità" (`discoveredAfterDays: 7`) diventa un **toggle**
all'interno della `FilterBar`, non una seconda pagina. La stats-row e "Segnala un bando"
(`SubmitUrlDialog`) vivono qui, coerentemente e in un solo posto. Si elimina una voce di
navigazione e la label inglese "Dashboard".

### 5.2 I miei bandi — Kanban, deep-dive `[DEC-2]`
**Problema:** la vista è visivamente rotta (titolo card sovradimensionato, gerarchia assente,
card illeggibili) e informativamente cieca (niente matching).

**Interventi:**
- **Card ridisegnata**: titolo a dimensione leggibile (non gigante), + **badge verdetto** colorato
  + **badge scadenza** (`DeadlineBadge`, già esistente). **No** breakdown a 6 dimensioni in card
  (resta nel dettaglio) — verdetto + scadenza sono le due info che servono a colpo d'occhio per
  decidere "devo agire ora?".
- **Contatore slot** in testa alla pagina: `"7 / 10 bandi salvati"` — rende visibile il limite
  del working set prima di sbatterci contro.
- **Intestazioni colonna** come heading semantici (`<h2>`/`<h3>`), fix a11y.
- **Deliverable dedicato:** mockup visivo navigabile della card e della board (via
  `web-artifacts-builder`) da validare prima di scrivere il codice.

### 5.3 Navigazione — sidebar globale `[DEC-3]` + Profilo con sub-nav `[DEC-4]`
Vedi §4.1. Il **Profilo ente** smette di essere una pagina-accordion lunghissima: diventa una
pagina con **sub-navigazione interna** alle 8 sezioni (identità, territorio, temi, capacità,
documenti, partnership, storico, contatti). Il chip priorità grezzo (`"dopo"`) va sostituito con
un'etichetta leggibile ("Consigliata dopo l'avvio") o rimosso.

### 5.4 Dettaglio bando — layout due colonne `[DEC-10]`
- **Colonna sinistra (scrollabile):** radar 6 assi + barre lineari (punteggio) · breakdown per
  dimensione · checklist documenti.
- **Colonna destra (sticky):** pannello **Analisi AI** (uno solo, vedi §5.5) + **Chat per-bando**
  sempre a portata di mano.
- **Mobile:** collassa in verticale; la chat in fondo o dietro un pulsante flottante.

### 5.5 Analisi AI — un solo pannello `[DEC-5]`
Si fondono `AIAnalysisPanel` + `StrongAnalysisPanel` in **un unico pannello "Analisi AI"**, in
linea con il backend che già non distingue "debole/forte". Il livello di profondità si comunica
con un **badge di stato onesto**, non con due bottoni:
- `"Analisi potenziata dai documenti del bando"` quando i PDF sono `ready`.
- `"Analisi basata sul testo del bando (documenti in elaborazione)"` quando `preparing`/`not_started`.
- Nessun documento disponibile → nessun badge di potenziamento.

L'analisi è **rate-limited** (bucket orario/giornaliero), non a crediti: si può rigenerare entro
il limite senza spendere crediti.

### 5.6 Chat — due superfici separate, per scelta `[DEC-7]` + `[DEC-8]`
Due chat **restano separate**, con due entry point distinti, perché servono contesti e storici
diversi:
- **Chat per-bando** (dentro il dettaglio bando, colonna destra): **un thread unico persistente per
  bando**. Il transcript è **sempre conservato e visibile** (non si perde ciò che è stato pagato in
  crediti); ciò che si "gestisce" è solo la **finestra di contesto inviata all'LLM** a ogni turno
  (per contenere il costo), non la cronologia mostrata. La chat è auto-organizzata dal bando: la
  ritrovi aprendo quel bando, nessuna lista da gestire.
- **Chat cross-bando** (voce "Assistente" in sidebar): **più chat nominabili con storico**, perché
  non hanno un contenitore naturale e servono a condurre investigazioni trasversali sui bandi
  salvati. RAG su `grant_document_chunks`. Stato vuoto esplicativo quando non ci sono bandi salvati
  con documenti pronti ("Salva dei bandi e preparane i documenti per farci domande trasversali").

**Costo credito esposto**: ogni messaggio mostra `"costa 1 credito · te ne restano N"` prima
dell'invio, in entrambe le chat.

### 5.7 Crediti & limiti — sempre visibili `[DEC-6]`
- **Widget saldo** fisso in fondo alla sidebar (`Crediti: N · Gestisci`) → linka alla pagina
  **"Crediti & piano"** (saldo `free`/`paid`, storico transazioni, top-up).
- **Contatore slot bandi** in testa a "I miei bandi".
- **Chiarezza sulle due meccaniche** (da comunicare nella pagina crediti):
  - Chat AI → consuma **crediti** (`free_balance` mensile che si resetta + `paid_balance` acquistato).
  - Analisi rapida + **preparazione documenti** → **rate-limit** giornaliero, non crediti.
  - **Salvare un bando ≠ preparare i documenti.** La preparazione documenti (`prepare`) è l'azione
    con il tetto giornaliero, e scatta solo sui PDF **nuovi** (se un altro utente ha già preparato
    quel bando, per te è gratis — `prepare/route.ts:11-13`).

### 5.8 Radar a 6 assi — portato nel prodotto `[DEC-11]`
Il radar esagonale diventa la **sintesi visiva del punteggio** in cima alla colonna sinistra del
dettaglio bando, **affiancato dalle barre lineari** che restano per la lettura precisa
dimensione-per-dimensione (radar per il colpo d'occhio, barre per il dettaglio accessibile).
**Nessuna nuova dipendenza**: componente SVG su misura che estende l'esistente `ScoringRadarMark`;
la skill `dataviz` guida colori/scale/leggibilità. Sistema anche la promessa fatta in login/signup.

### 5.9 Onboarding — onesto, contatti obbligatori `[DEC-12]`
- **4 sezioni obbligatorie** nel wizard: identità, territorio, temi, **contatti** (necessari per
  acquisire i dati del cliente).
- Le altre 4 (capacità, documenti, partnership, storico) restano opzionali post-onboarding.
- **Schermata finale onesta:** `"Il tuo profilo è al N% — completa capacità/documenti/storico per
  match più precisi"`, con CTA doppia ("Completa ora" / "Lo faccio dopo").
- **Reminder persistente** (la `CompletionBar` esiste già) in cima a "Esplora bandi" finché < 100%.

### 5.10 Scadenze — lista-agenda `[DEC-13]`
Nuova voce sidebar (gruppo "Bandi"). **Lista** dei bandi salvati + candidature in corso, ordinata
per deadline crescente, **raggruppata per urgenza**: "Questa settimana" / "Questo mese" / "Oltre".
Ogni riga mostra verdetto + stato pipeline. **No calendario** (con poche scadenze/mese sarebbe
mezzo vuoto e meno azionabile). Fa anche da cruscotto eventi in-app.

### 5.11 Notifiche — solo digest + Scadenze (per ora) `[DEC-14]`
La sezione "Notifiche" (gruppo "Il mio ente") gestisce soglia/frequenza del **digest email**
esistente. La vista "Scadenze" copre le urgenze in-app. **Nessun centro notifiche in-app** in
questo giro: la campanella con feed eventi (nuovo bando ad alta compatibilità, documenti pronti,
scadenza imminente) è un sottosistema significativo → **evoluzione futura**, non ora.

### 5.12 Branding & naming `[DEC-9]`
- `"Dashboard"` → eliminato (la vista si fonde in "Esplora bandi").
- `"BANDI-SCANNER"` è un **placeholder** → sostituire con un nome italiano coerente col dominio
  (matching bandi ↔ terzo settore) e col tono caldo. Candidati proposti, da validare:
  - **Combacia** — evoca il match, verbo caldo e italiano ("il bando che combacia con te").
  - **Idòneo** — richiama l'idoneità/verdetto, istituzionale ma umano.
  - **Incontrabandi** — gioco su "incontro" + bandi (rischio assonanza con "contrabbando", da
    valutare).
  - **Bandimatch** — descrittivo, chiaro, ma ibrido con l'inglese "match".
  - _Raccomandazione: **Combacia** come prima scelta_ (distintivo, italiano, memorizzabile).

---

## 6. Correzioni trasversali (non legate a una singola pagina)

### 6.1 Stati loading / error / empty (priorità dev alta)
Introdurre un sistema coerente:
- `loading.tsx` per rotta con **skeleton** brandizzati (priorità: `/assistente`, `/bandi/[id]`,
  liste bandi).
- `error.tsx` con stato d'errore brandizzato (coerente per focus/contrasto col resto).
- **Empty state** azionabili ovunque (Kanban vuoto, nessun bando salvato, nessuna scadenza,
  chat cross-bando senza working set).

### 6.2 Accessibilità
- Rimuovere `aria-hidden` dall'intero `auth-brand-panel`; applicarlo **solo** al radar SVG decorativo.
- Intestazioni colonna Kanban → heading semantici.
- Mantenere i punti di forza esistenti (contrasto AA, focus-visible, badge colore+label).

### 6.3 UX-copy (usare `domain-modeling` per fissare il vocabolario)
- **Mappare tutti i token grezzi** a label leggibili: `qualche_volta` → "Qualche volta",
  `non_ammesso` → "Non ammesso", `quote_associative` → "Quote associative", ecc.
- **Disambiguare i termini sovraccaricati** definendo un vocabolario univoco:
  - Dimensione di scoring `Track record` → rinominare in **"Storico attività"** (uniforme e
    italiano), distinta dal **verdetto "Storico"** (bando chiuso) e dalla **sezione profilo**.
  - Verdetti vs stati pipeline: rivedere le coppie `Candidabile/Candidato` e
    `Da preparare/In preparazione` per ridurre l'omofonia (es. stati pipeline con verbi d'azione:
    "In lavorazione", "Inviata").
- Aggiungere **tooltip esplicativi ai verdetti** (cosa significa, cosa fare) — oggi assenti.
- Aggiungere una nota di next-step al verdetto "Non compatibile" (oggi secco).
- Correggere microcopy da dev: `"Regione (auto)"` → "Regione (calcolata automaticamente)".

### 6.4 Auth
- Su mobile il pannello branding perde il radar (`display:none`): fornire una versione ridotta ma
  presente dell'identità visiva (wordmark + claim), non una striscia blu vuota.

### 6.5 Bug
- `/preview/grant-card`: aggiungere all'allowlist del middleware, oppure rimuovere la pagina se è
  solo uno strumento di sviluppo.

---

## 7. Priorità e fasi

| Fase | Contenuto | Perché prima |
|------|-----------|--------------|
| **F0 — Fondamenta** | Sidebar globale (§4.1), stati loading/error/empty (§6.1), fix a11y (§6.2) | Tutto il resto vive dentro la nuova shell; gli stati mancanti sono il gap più grave |
| **F1 — Accorpamenti** | Esplora bandi unificata (§5.1), un pannello AI (§5.5), crediti visibili (§5.7) | Rimuovono ridondanza e rendono visibili i vincoli — alto valore, medio sforzo |
| **F2 — Ristrutturazioni** | Kanban ridisegnato (§5.2, con mockup), dettaglio 2 colonne (§5.4), radar nel prodotto (§5.8) | I pezzi più "rotti" visivamente; richiedono iterazione su design |
| **F3 — Flussi** | Scadenze (§5.10), onboarding onesto (§5.9), profilo con sub-nav (§5.3) | Completano l'esperienza una volta che shell e schermate chiave sono solide |
| **F4 — Rifiniture** | Copy/vocabolario (§6.3), naming definitivo (§5.12), branding auth mobile (§6.4) | Polish trasversale, da fare a impianto stabile |
| **Futuro** | Centro notifiche in-app (§5.11), calendario scadenze | Sottosistemi non necessari al valore di base |

---

## 8. Playbook di sviluppo Front-End (regole di ingaggio degli agenti)

Il redesign verrà implementato da un **team di agenti** con skill assegnate e **obbligatorie**.
Nessun agente FE consegna una schermata senza essere passato per questo loop.

### 8.1 Skill installate/abilitate per la fase FE
- **`impeccable`** (plugin `impeccable@impeccable`, 23 comandi) — **obbligatoria per ogni agente
  FE**. Init una tantum per progetto (`/impeccable init` → genera `PRODUCT.md`/`DESIGN.md`), poi
  `/impeccable craft|polish|audit|critique|layout|onboard|...` su ogni schermata.
- **`design`** (`/design:critique`, `/design:accessibility`, `/design:handoff`) — loop di review.
- **`dataviz`** — per le visualizzazioni di punteggio (radar, breakdown).
- **`prototype`** (Pocock) + **`web-artifacts-builder`** — per mockup usa-e-getta prima del codice
  reale (React+Tailwind+shadcn, stesso stack del prodotto).
- **`domain-modeling`** (Pocock) — per fissare il vocabolario UI univoco (§6.3).
- **`grilling`** (Pocock) — per bloccare ogni decisione ambigua **prima** di implementare.

### 8.2 Ruoli degli agenti (in fase di sviluppo)
1. **Builder FE** — implementa i componenti/route. **Deve** usare `impeccable` (craft/polish) su
   ogni schermata e `dataviz` per le viz. Legge `node_modules/next/dist/docs/` prima di toccare il
   codice (Next.js 16 ha breaking changes vs training data).
2. **Design reviewer** — su ogni schermata consegnata gira `/impeccable audit` + `/impeccable
   critique` + `/design:accessibility`; blocca finché non passano.
3. **Prototyper** — quando una schermata è incerta, produce un mockup con `web-artifacts-builder`/
   `prototype` da validare con lo stakeholder prima del codice vero (obbligatorio per il Kanban).

### 8.3 Definition of Done per schermata
- Passa `impeccable audit` (58 detector rule, zero anti-pattern bloccanti).
- Passa `/design:accessibility` (WCAG AA, nessuna regressione sui punti di forza esistenti §6.2).
- Ha stati `loading` / `error` / `empty` definiti (§6.1).
- Nessun token grezzo o termine sovraccaricato a schermo (§6.3).
- Responsive verificato (mobile + desktop).

---

## Appendice A — le 14 decisioni in una riga

| # | Decisione |
|---|-----------|
| DEC-1 | Dashboard + nuovi-bandi → **una** vista "Esplora bandi" con toggle "Novità" |
| DEC-2 | Kanban ridisegnato (card leggibile, verdetto+scadenza, contatore slot) + mockup |
| DEC-3 | **Sidebar globale permanente**, due gruppi ("Bandi" / "Il mio ente") |
| DEC-4 | Profilo ente = pagina con **sub-navigazione** alle 8 sezioni |
| DEC-5 | **Un solo** pannello "Analisi AI" con badge di stato onesto |
| DEC-6 | Crediti (widget sidebar) e slot bandi (contatore) **sempre visibili** |
| DEC-7 | **Due chat separate** (per-bando / cross-bando), due entry point |
| DEC-8 | Chat per-bando = thread unico **persistente**; cross-bando = multi-thread con storico |
| DEC-9 | Naming: "Dashboard" eliminato; "BANDI-SCANNER" → nome italiano (**Combacia**) |
| DEC-10 | Dettaglio bando a **due colonne** (sx scroll / dx sticky AI+chat) |
| DEC-11 | Radar 6 assi **nel prodotto** (SVG su misura + barre), nessuna dipendenza |
| DEC-12 | Onboarding onesto, **contatti obbligatori**, reminder di completamento |
| DEC-13 | Scadenze = **lista-agenda** per urgenza (non calendario) |
| DEC-14 | Notifiche = digest + Scadenze; centro notifiche in-app = **futuro** |
