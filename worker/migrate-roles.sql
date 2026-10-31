-- Run ONCE on a database whose users table was made before roles existed:
--   wrangler d1 execute stillmark-community --remote --file=migrate-roles.sql
ALTER TABLE users ADD COLUMN early_note TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN dev_name TEXT NOT NULL DEFAULT '';
