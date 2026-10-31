-- Stillmark community database (Cloudflare D1). Safe to run more than once.
CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                       -- 'thread' (forum) or 'comments' (the comment section of one page element)
  key TEXT NOT NULL DEFAULT '',             -- for 'comments': which element it belongs to
  board TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  staff INTEGER NOT NULL DEFAULT 0,
  ip TEXT NOT NULL DEFAULT '',              -- a private fingerprint, never the address itself
  owner TEXT NOT NULL DEFAULT '',           -- a private fingerprint of the author's secret, lets them delete their own post
  created INTEGER NOT NULL,
  last INTEGER NOT NULL,
  ups INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok'         -- ok, pending (waiting for approval), hidden (reported), deleted
);
CREATE INDEX IF NOT EXISTS threads_list ON threads(kind, status, pinned, last);
CREATE UNIQUE INDEX IF NOT EXISTS threads_key ON threads(key) WHERE kind = 'comments';

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  staff INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  ups INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  rating INTEGER                            -- 1 to 5 stars for reviews, otherwise empty
);
CREATE INDEX IF NOT EXISTS posts_thread ON posts(thread, status, created);
CREATE INDEX IF NOT EXISTS posts_ip ON posts(ip, created);

CREATE TABLE IF NOT EXISTS reacts (type TEXT NOT NULL, item INTEGER NOT NULL, ip TEXT NOT NULL, PRIMARY KEY (type, item, ip));
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, item INTEGER NOT NULL, ip TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, UNIQUE (type, item, ip)
);
CREATE TABLE IF NOT EXISTS bans (ip TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
