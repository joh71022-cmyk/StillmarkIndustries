-- Run ONCE on a database whose users table was made before early access needed a reason:
--   wrangler d1 execute stillmark-community --remote --file=migrate-early.sql
-- (anyone already marked early before this becomes 'waiting' so you can approve them)
ALTER TABLE users ADD COLUMN early_reason TEXT NOT NULL DEFAULT '';
UPDATE users SET early = 2 WHERE early = 1;
