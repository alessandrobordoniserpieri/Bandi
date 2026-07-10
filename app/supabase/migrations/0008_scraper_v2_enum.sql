-- 0008: Add 'scaduto' to grant_status enum
-- Must be in its own transaction before any DDL references the new value.
ALTER TYPE grant_status ADD VALUE IF NOT EXISTS 'scaduto';
