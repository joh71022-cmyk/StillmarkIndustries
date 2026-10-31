-- Run ONCE on a community database made before accounts existed (new databases already have these columns):
--   wrangler d1 execute stillmark-community --remote --file=migrate-accounts.sql
-- then run schema.sql again to add the new tables.
ALTER TABLE threads ADD COLUMN user INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN user INTEGER NOT NULL DEFAULT 0;
