-- 0004_seed.sql — seed grant_providers (~70 real Italian erogatori) and the 12 MVP grant_sources.
-- All grant_sources are inserted with enabled=false (activated later, branch 009).
-- Region names inside provider names/aliases follow the exact PROVINCE_TO_REGION spelling
-- (Emilia-Romagna, Friuli-Venezia Giulia, Trentino-Alto Adige, Valle d'Aosta).

insert into public.grant_providers (name, kind, aliases) values
  -- Starter set (kept from brief)
  ('Fondazione Cariplo', 'privato', '{Cariplo,"F.ne Cariplo"}'),
  ('Compagnia di San Paolo', 'privato', '{"San Paolo","Compagnia di Sanpaolo"}'),
  ('Fondazione CON IL SUD', 'privato', '{"Con il Sud","Fondazione Con Il Sud"}'),
  ('Fondazione di Comunità di Milano', 'privato', '{}'),
  ('Fondazione Cassa di Risparmio di Torino', 'privato', '{"Fondazione CRT",CRT}'),
  ('Fondazione Cassa di Risparmio di Cuneo', 'privato', '{"Fondazione CRC",CRC}'),
  ('Fondazione Cassa di Risparmio in Bologna', 'privato', '{"Fondazione Carisbo",Carisbo}'),
  ('Fondazione Compagnia di San Paolo', 'privato', '{}'),
  ('Fondazione Vodafone Italia', 'privato', '{"Vodafone Italia"}'),
  ('Fondazione Unipolis', 'privato', '{Unipolis}'),
  ('Enel Cuore Onlus', 'privato', '{"Enel Cuore"}'),
  ('Intesa Sanpaolo', 'privato', '{"Intesa San Paolo"}'),
  ('Sport e Salute S.p.A.', 'pubblico', '{"Sport e Salute","Sport & Salute"}'),
  ('CONI - Comitato Olimpico Nazionale Italiano', 'pubblico', '{CONI}'),
  ('Dipartimento per lo Sport', 'pubblico', '{"Ufficio per lo Sport","Presidenza del Consiglio - Sport"}'),
  ('Ministero del Lavoro e delle Politiche Sociali', 'pubblico', '{"Ministero del Lavoro"}'),
  ('Ministero della Cultura', 'pubblico', '{MiC,MIBACT}'),
  ('Agenzia per la Coesione Territoriale', 'pubblico', '{"Agenzia Coesione"}'),
  ('Regione Emilia-Romagna', 'pubblico', '{"Emilia-Romagna"}'),
  ('Unione Europea - Erasmus+', 'eu', '{"Erasmus+",Erasmus}'),
  ('Unione Europea - CERV', 'eu', '{CERV,"Citizens Equality Rights and Values"}'),
  ('Unione Europea - Creative Europe', 'eu', '{"Europa Creativa","Creative Europe"}'),

  -- Banking foundations (fondazioni di origine bancaria)
  ('Fondazione di Sardegna', 'privato', '{}'),
  ('Fondazione Cassa di Risparmio di Padova e Rovigo', 'privato', '{"Fondazione Cariparo",Cariparo}'),
  ('Fondazione Cariverona', 'privato', '{"Fondazione Cassa di Risparmio di Verona Vicenza Belluno e Ancona"}'),
  ('Fondazione Cariparma', 'privato', '{"Fondazione Cassa di Risparmio di Parma"}'),
  ('Fondazione Banco di Napoli', 'privato', '{}'),
  ('Fondazione Carispezia', 'privato', '{"Fondazione Cassa di Risparmio della Spezia"}'),
  ('Fondazione Cassa di Risparmio di Lucca', 'privato', '{"Fondazione Carilucca",Carilucca}'),
  ('Fondazione Carifano', 'privato', '{"Fondazione Cassa di Risparmio di Fano"}'),
  ('Fondazione Cassa di Risparmio di Firenze', 'privato', '{"Fondazione CR Firenze","Ente Cassa di Risparmio di Firenze"}'),
  ('Fondazione Cassa di Risparmio di Pistoia e Pescia', 'privato', '{}'),
  ('Fondazione Cassa di Risparmio di Cento', 'privato', '{}'),
  ('Fondazione Cassa di Risparmio di Ravenna', 'privato', '{}'),
  ('Fondazione Cassa di Risparmio di Alessandria', 'privato', '{}'),
  ('Fondazione Cassa di Risparmio di Fossano', 'privato', '{}'),
  ('Fondazione Cassa di Risparmio di Biella', 'privato', '{"Fondazione CRBiella"}'),
  ('Fondazione Cassa di Risparmio di Trento e Rovereto', 'privato', '{"Fondazione Caritro",Caritro}'),
  ('Fondazione Cassa di Risparmio di Bolzano', 'privato', '{}'),
  ('Fondazione Cassa di Risparmio della Provincia di Chieti', 'privato', '{"Fondazione Carichieti"}'),

  -- Community foundations (fondazioni di comunità)
  ('Fondazione di Comunità di Messina', 'privato', '{}'),
  ('Fondazione di Comunità Val di Noto', 'privato', '{}'),
  ('Fondazione Comunitaria del Novarese', 'privato', '{"Fondazione di Comunità di Novara"}'),
  ('Fondazione di Comunità del Lecchese', 'privato', '{"Fondazione Comunitaria del Lecchese"}'),
  ('Fondazione di Modena', 'privato', '{"Fondazione Cassa di Risparmio di Modena"}'),
  ('Fondazione della Comunità Bresciana', 'privato', '{}'),

  -- Corporate / private foundations
  ('Fondazione Snam', 'privato', '{}'),
  ('Fondazione Prosolidar', 'privato', '{}'),
  ('Fondazione TIM', 'privato', '{"Fondazione Telecom Italia"}'),
  ('Fondazione Cassa Depositi e Prestiti', 'privato', '{"Fondazione CDP"}'),
  ('Fondazione Bracco', 'privato', '{}'),
  ('Fondazione Pirelli', 'privato', '{}'),
  ('Fondazione Peppino Vismara', 'privato', '{}'),
  ('Fondazione Ferrero', 'privato', '{}'),

  -- Public (pubblico)
  ('Ministero dell''Istruzione e del Merito', 'pubblico', '{MIM}'),
  ('Dipartimento per le Politiche Giovanili e il Servizio Civile Universale', 'pubblico', '{"Dipartimento Politiche Giovanili","Politiche Giovanili"}'),
  ('ANCI - Associazione Nazionale Comuni Italiani', 'pubblico', '{ANCI}'),
  ('INAIL', 'pubblico', '{"Istituto Nazionale Assicurazione Infortuni sul Lavoro"}'),
  ('Impresa Sociale Con i Bambini', 'pubblico', '{"Con i Bambini"}'),
  ('Regione Lombardia', 'pubblico', '{Lombardia}'),
  ('Regione Piemonte', 'pubblico', '{Piemonte}'),
  ('Regione Toscana', 'pubblico', '{Toscana}'),
  ('Regione Veneto', 'pubblico', '{Veneto}'),
  ('Regione Lazio', 'pubblico', '{Lazio}'),
  ('Regione Puglia', 'pubblico', '{Puglia}'),
  ('Regione Sicilia', 'pubblico', '{Sicilia,"Regione Siciliana"}'),
  ('Comitato Italiano Paralimpico', 'pubblico', '{CIP}'),

  -- EU
  ('Unione Europea - Horizon Europe', 'eu', '{"Horizon Europe","Orizzonte Europa"}'),
  ('Unione Europea - ESF+', 'eu', '{"ESF+","FSE+"}'),
  ('Unione Europea - AMIF', 'eu', '{AMIF,"Asylum Migration and Integration Fund"}'),
  ('Unione Europea - LIFE', 'eu', '{"LIFE Programme"}'),
  ('Unione Europea - Interreg', 'eu', '{Interreg,"Interreg Europe"}')
;

insert into public.grant_sources (name, url, scrape_config, enabled) values
  ('Sport e Salute - Bandi', 'https://www.sportesalute.eu/bandi.html', '{}', false),
  ('Fondazione CON IL SUD - Bandi', 'https://www.fondazioneconilsud.it/bandi/', '{}', false),
  ('Regione Emilia-Romagna - Bandi Terzo Settore', 'https://sociale.regione.emilia-romagna.it/', '{}', false),
  ('Fondazione Cariplo - Bandi', 'https://www.fondazionecariplo.it/it/bandi/', '{}', false),
  ('Compagnia di San Paolo - Bandi', 'https://www.compagniadisanpaolo.it/it/', '{}', false),
  ('CSVnet - Bandi', 'https://www.csvnet.it/', '{}', false),
  ('Info-cooperazione - Bandi', 'https://www.info-cooperazione.it/', '{}', false),
  ('Terzo Settore - Bandi nazionali', 'https://www.lavoro.gov.it/', '{}', false),
  ('Fondazione CRT - Bandi', 'https://www.fondazionecrt.it/', '{}', false),
  ('CONI - Contributi', 'https://www.coni.it/', '{}', false),
  ('Europa - Funding & Tenders', 'https://ec.europa.eu/info/funding-tenders/', '{}', false),
  ('Erasmus+ Sport', 'https://www.erasmusplus.it/', '{}', false)
;
