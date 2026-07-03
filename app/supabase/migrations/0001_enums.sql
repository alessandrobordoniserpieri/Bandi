-- 0001_enums.sql — domain enum types (lowercase values, align with matching module)
create type geo_scope as enum ('comunale', 'provinciale', 'regionale', 'nazionale', 'europeo');
create type complexity_level as enum ('bassa', 'media', 'alta');
create type capacity_level as enum ('bassa', 'media', 'alta');
create type grant_status as enum ('aperto', 'chiuso');
create type saved_grant_status as enum ('salvato', 'in_preparazione', 'candidato', 'finanziato', 'non_ammesso');
create type provider_kind as enum ('pubblico', 'privato', 'eu');
create type alert_frequency as enum ('weekly', 'off');
