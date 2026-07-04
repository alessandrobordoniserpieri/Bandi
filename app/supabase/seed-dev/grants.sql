-- app/supabase/seed-dev/grants.sql — DEVELOPMENT SEED ONLY (not a migration)
-- Purpose: 17 realistic Italian grants for local/dev matching demos (branch 005, Task 6).
-- Not part of the migration chain — apply manually to a dev Supabase project only
-- (e.g. via MCP execute_sql), never to staging/production.
-- Deadlines are engineered relative to "today" = 2026-07-04 so all four
-- deadline-color buckets appear in the UI: verde (>=15d), giallo (7..14d),
-- rosso (<7d), and Storico (status='chiuso' or past deadline). Thresholds match
-- indicators.ts exactly (days < 7 = rosso, days < 15 = giallo).

insert into public.grants
  (title, provider_id, deadline, status, amount, cofunding_required,
   eligible_types, tags, area, geo_scope, complexity, required_documents,
   summary, requirements, url, beneficiaries)
values
  -- 1. verde (164 giorni)
  ('Sport e inclusione sociale 2026',
   (select id from public.grant_providers where name = 'Fondazione CON IL SUD' limit 1),
   '2026-12-15', 'aperto', 50000, 20,
   array['APS - Associazione di Promozione Sociale','ASD - Associazione Sportiva Dilettantistica'],
   array['sport','inclusione'], 'Italia', 'nazionale', 'media',
   array['statuto','bilancio'],
   'Contributi per progetti che usano lo sport come strumento di inclusione sociale.',
   'Enti del terzo settore e sportivi dilettantistici con almeno 2 anni di attivita.',
   'https://seed.dev/bandi/sport-inclusione-2026', 'minori e giovani in condizioni di fragilita'),

  -- 2. verde (88 giorni)
  ('Centri estivi per bambini e famiglie 2026',
   (select id from public.grant_providers where name = 'Impresa Sociale Con i Bambini' limit 1),
   '2026-09-30', 'aperto', 30000, null,
   array['ODV - Organizzazione di Volontariato','APS - Associazione di Promozione Sociale'],
   array['centri estivi','giovani','povertà educativa'], 'Italia', 'nazionale', 'bassa',
   array['statuto'],
   'Finanziamenti per centri estivi rivolti a bambini in condizioni di svantaggio economico o sociale.',
   'Organizzazioni con esperienza pregressa nella gestione di attivita educative estive.',
   'https://seed.dev/bandi/centri-estivi-2026', 'bambini e famiglie in condizioni di svantaggio'),

  -- 3. verde (129 giorni)
  ('Impianti sportivi di quartiere',
   (select id from public.grant_providers where name = 'Sport e Salute S.p.A.' limit 1),
   '2026-11-10', 'aperto', 80000, 30,
   array['ASD - Associazione Sportiva Dilettantistica','SSD - Società Sportiva Dilettantistica','Comune'],
   array['impianti sportivi','sport','quartieri'], 'Italia', 'regionale', 'alta',
   array['statuto','bilancio','durc'],
   'Contributi per la riqualificazione di impianti sportivi in quartieri periferici.',
   'Soggetti gestori di impianti sportivi pubblici o convenzionati con il Comune di riferimento.',
   'https://seed.dev/bandi/impianti-sportivi-quartiere-2026', 'comunita dei quartieri periferici'),

  -- 4. verde (93 giorni)
  ('Digitale per il terzo settore',
   (select id from public.grant_providers where name = 'Fondazione Vodafone Italia' limit 1),
   '2026-10-05', 'aperto', 25000, null,
   array['ETS - Ente del Terzo Settore','APS - Associazione di Promozione Sociale','Fondazione ETS'],
   array['digitale','innovazione','capacity building'], 'Italia', 'nazionale', 'media',
   array['statuto','runts'],
   'Sostegno a percorsi di trasformazione digitale per enti del terzo settore.',
   'Enti iscritti al RUNTS con un progetto di digitalizzazione dei servizi o della raccolta fondi.',
   'https://seed.dev/bandi/digitale-terzo-settore-2026', 'enti del terzo settore in fase di digitalizzazione'),

  -- 5. verde (47 giorni)
  ('Cultura e periferie',
   (select id from public.grant_providers where name = 'Ministero della Cultura' limit 1),
   '2026-08-20', 'aperto', 60000, 25,
   array['Fondazione ETS','Comune','Associazione riconosciuta'],
   array['cultura','periferie','rigenerazione urbana'], 'Italia', 'regionale', 'alta',
   array['statuto','bilancio','certificazioni'],
   'Bando per progetti culturali che favoriscono la rigenerazione di aree periferiche.',
   'Partenariati tra enti culturali ed enti locali con un piano triennale di attivita.',
   'https://seed.dev/bandi/cultura-periferie-2026', 'residenti delle periferie urbane'),

  -- 6. verde (59 giorni)
  ('Servizio civile universale - progetti giovani',
   (select id from public.grant_providers where name = 'Dipartimento per le Politiche Giovanili e il Servizio Civile Universale' limit 1),
   '2026-09-01', 'aperto', 15000, null,
   array['ODV - Organizzazione di Volontariato','APS - Associazione di Promozione Sociale','ETS - Ente del Terzo Settore'],
   array['giovani','servizio civile','volontariato'], 'Italia', 'nazionale', 'media',
   array['statuto','runts'],
   'Finanziamento di progetti di servizio civile universale rivolti a giovani volontari.',
   'Enti accreditati o in fase di accreditamento presso l''albo del servizio civile universale.',
   'https://seed.dev/bandi/servizio-civile-giovani-2026', 'giovani tra 18 e 28 anni'),

  -- 7. verde (150 giorni) — provider non confermato: provider_id null
  ('Cooperazione sociale e occupazione',
   null,
   '2026-12-01', 'aperto', 45000, 15,
   array['Cooperativa sociale tipo B','Consorzio di cooperative sociali','Impresa sociale'],
   array['occupazione','inclusione','formazione'], 'Italia', 'regionale', 'media',
   array['statuto','bilancio'],
   'Sostegno a percorsi di inserimento lavorativo promossi da cooperative sociali di tipo B.',
   'Cooperative sociali o consorzi con esperienza in percorsi di formazione e inserimento lavorativo.',
   'https://seed.dev/bandi/cooperazione-occupazione-2026', 'persone svantaggiate in inserimento lavorativo'),

  -- 8. verde (195 giorni)
  ('Ambiente e sostenibilita nei territori',
   (select id from public.grant_providers where name = 'Unione Europea - LIFE' limit 1),
   '2027-01-15', 'aperto', 150000, 40,
   array['Fondazione ETS','Impresa sociale','Ente pubblico','Università'],
   array['ambiente','sostenibilità'], 'Unione Europea', 'europeo', 'alta',
   array['statuto','bilancio','certificazioni'],
   'Finanziamenti europei per progetti ambientali e di sostenibilita territoriale su larga scala.',
   'Partenariati transnazionali guidati da un capofila con capacita di rendicontazione UE.',
   'https://seed.dev/bandi/ambiente-sostenibilita-2027', 'enti e imprese impegnati in progetti ambientali'),

  -- 9. verde (108 giorni)
  ('Scambi giovanili Erasmus+',
   (select id from public.grant_providers where name = 'Unione Europea - Erasmus+' limit 1),
   '2026-10-20', 'aperto', 20000, null,
   array['APS - Associazione di Promozione Sociale','Gruppo informale','Istituto scolastico statale'],
   array['giovani','formazione','scuola'], 'Unione Europea', 'europeo', 'media',
   array['statuto'],
   'Contributi per scambi giovanili e mobilita di gruppi informali e associazioni giovanili.',
   'Gruppi di giovani o organizzazioni con un partner in almeno un altro paese europeo.',
   'https://seed.dev/bandi/scambi-giovanili-erasmus-2026', 'giovani tra 13 e 30 anni e operatori giovanili'),

  -- 10. verde (32 giorni)
  ('Parita di genere e pari opportunita',
   (select id from public.grant_providers where name = 'Regione Lazio' limit 1),
   '2026-08-05', 'aperto', 18000, 20,
   array['APS - Associazione di Promozione Sociale','ODV - Organizzazione di Volontariato','Cooperativa sociale tipo A'],
   array['donne','pari opportunità','welfare'], 'Lazio', 'regionale', 'bassa',
   array['statuto','bilancio'],
   'Contributi regionali per servizi di supporto alle donne vittime di violenza e discriminazione.',
   'Enti con centri o sportelli attivi da almeno un anno sul territorio regionale.',
   'https://seed.dev/bandi/parita-genere-lazio-2026', 'donne vittime di violenza e discriminazione'),

  -- 11. giallo (12 giorni)
  ('Bando emergenza poverta educativa',
   (select id from public.grant_providers where name = 'Fondazione Cariplo' limit 1),
   '2026-07-16', 'aperto', 35000, null,
   array['ODV - Organizzazione di Volontariato','APS - Associazione di Promozione Sociale','Istituto scolastico statale'],
   array['povertà educativa','scuola','giovani'], 'Lombardia', 'regionale', 'media',
   array['statuto','bilancio'],
   'Interventi rapidi di contrasto alla poverta educativa minorile nelle aree piu fragili.',
   'Enti attivi nel supporto scolastico extracurricolare con almeno un partner scolastico.',
   'https://seed.dev/bandi/emergenza-poverta-educativa-2026', 'minori in condizione di poverta educativa'),

  -- 12. giallo (8 giorni)
  ('Contributi anziani e domiciliarita',
   (select id from public.grant_providers where name = 'Regione Veneto' limit 1),
   '2026-07-12', 'aperto', 22000, 20,
   array['Cooperativa sociale tipo A','ODV - Organizzazione di Volontariato'],
   array['anziani','welfare','salute'], 'Veneto', 'regionale', 'bassa',
   array['statuto'],
   'Contributi per servizi di assistenza domiciliare rivolti a persone anziane non autosufficienti.',
   'Cooperative o organizzazioni di volontariato gia attive nei servizi di assistenza domiciliare.',
   'https://seed.dev/bandi/anziani-domiciliarita-veneto-2026', 'persone anziane non autosufficienti'),

  -- 13. rosso (5 giorni)
  ('Contributi urgenti centri estivi disabilita',
   (select id from public.grant_providers where name = 'Enel Cuore Onlus' limit 1),
   '2026-07-09', 'aperto', 12000, null,
   array['ODV - Organizzazione di Volontariato','APS - Associazione di Promozione Sociale'],
   array['disabilità','centri estivi','famiglie'], 'Italia', 'nazionale', 'bassa',
   array['statuto'],
   'Contributi straordinari per centri estivi inclusivi rivolti a bambini e ragazzi con disabilita.',
   'Enti con esperienza in attivita estive inclusive e personale educativo qualificato.',
   'https://seed.dev/bandi/centri-estivi-disabilita-urgente-2026', 'bambini e ragazzi con disabilita e le loro famiglie'),

  -- 14. rosso (2 giorni)
  ('Bando lampo innovazione sociale',
   (select id from public.grant_providers where name = 'Fondazione Unipolis' limit 1),
   '2026-07-06', 'aperto', 40000, 30,
   array['Impresa sociale','Start-up innovativa','Società benefit'],
   array['innovazione sociale','innovazione','occupazione'], 'Italia', 'nazionale', 'alta',
   array['statuto','bilancio','certificazioni'],
   'Finanziamento lampo per soluzioni innovative capaci di generare impatto sociale misurabile.',
   'Startup innovative, imprese sociali o societa benefit con un prototipo gia testato.',
   'https://seed.dev/bandi/innovazione-sociale-lampo-2026', 'startup e imprese sociali innovative'),

  -- 15. storico (chiuso, scaduto 2025-11-30)
  ('Bando cultura e turismo 2025',
   (select id from public.grant_providers where name = 'Regione Toscana' limit 1),
   '2025-11-30', 'chiuso', 28000, 15,
   array['Comitato','Pro Loco','Associazione riconosciuta'],
   array['cultura','turismo','eventi'], 'Toscana', 'regionale', 'media',
   array['statuto','bilancio'],
   'Contributi per eventi culturali e turistici in grado di valorizzare i borghi storici.',
   'Comitati o Pro Loco con almeno un evento pubblico gia organizzato negli ultimi due anni.',
   'https://seed.dev/bandi/cultura-turismo-toscana-2025', 'enti organizzatori di eventi culturali e turistici'),

  -- 16. storico (chiuso, scaduto 2026-04-15)
  ('Prevenzione e salute mentale giovani',
   (select id from public.grant_providers where name = 'Compagnia di San Paolo' limit 1),
   '2026-04-15', 'chiuso', 50000, null,
   array['ETS - Ente del Terzo Settore','Fondazione di comunità'],
   array['salute mentale','giovani','prevenzione'], 'Piemonte', 'regionale', 'alta',
   array['statuto','bilancio','certificazioni'],
   'Programmi di prevenzione e sostegno psicologico rivolti ad adolescenti e giovani adulti.',
   'Enti con equipe di psicologi o educatori professionali e una rete territoriale attiva.',
   'https://seed.dev/bandi/salute-mentale-giovani-2026', 'adolescenti e giovani adulti'),

  -- 17. storico (chiuso, scaduto 2025-09-20)
  ('Sport per persone con disabilita - bando 2025',
   (select id from public.grant_providers where name = 'Comitato Italiano Paralimpico' limit 1),
   '2025-09-20', 'chiuso', 20000, 20,
   array['ASD - Associazione Sportiva Dilettantistica','ASD/SSD iscritta RASD'],
   array['disabilità','sport','accessibilità'], 'Italia', 'nazionale', 'media',
   array['statuto','rasd'],
   'Contributi per l''attivita sportiva paralimpica e per l''accessibilita degli impianti dedicati.',
   'Associazioni sportive iscritte al registro RASD con sezione dedicata alla disabilita.',
   'https://seed.dev/bandi/sport-disabilita-paralimpico-2025', 'atleti e praticanti con disabilita')
  ;
