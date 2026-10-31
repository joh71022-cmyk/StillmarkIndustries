// Community for the Stillmark site: forum threads, replies, page comments and reviews.
// Runs inside the publish service and keeps everything in a Cloudflare D1 database (see schema.sql).
//
// Safety, in short:
//  - Visitors never need an account. A visitor is a private fingerprint of their address; the address is never stored.
//  - Every message is plain text. Nothing a visitor types can run as code (the pages show it with textContent).
//  - Spam limits: wait time between posts, a posts-per-hour cap, no repeated messages, a link limit, a blocked-words list.
//  - Reports: enough different people reporting a post hides it automatically until a moderator looks.
//  - Moderators (mod code) can approve, hide, delete, pin, lock, ban and post as STAFF from the mod panel.

import { userFromToken, accountRoute, accountMod, lname } from './accounts.js';

const DEFAULTS = {
  forum: true, comments: true, approval: false,
  boards: ['GENERAL', 'SUPPORT', 'SHOWCASE'],
  rules: 'Be kind. No spam, no personal information, no hate. Moderators may remove anything.',
  blocked: [], reserved: ['staff', 'admin', 'administrator', 'mod', 'moderator', 'owner', 'stillmark'],
  postSeconds: 20, perHour: 12, maxLinks: 0, autoHide: 3
};
const PAGE = { threads: 20, posts: 30, comments: 20 };
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.\-]{1,23}$/u;
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,40}\.[a-z0-9]{4,20}$/;
const now = () => Math.floor(Date.now() / 1000);
const enc = new TextEncoder();
const sha = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))).map(x => x.toString(16).padStart(2, '0')).join('');
// control characters and the hidden "flip the text direction" characters are removed, so nobody can fake someone else's name
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, '').slice(0, n);
const int = (v, d, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

async function getSettings(db) {
  let s = {};
  try { const row = await db.prepare("SELECT v FROM settings WHERE k = 'main'").first(); if (row) s = JSON.parse(row.v); } catch (e) {}
  return { ...DEFAULTS, ...s };
}
const who = async (req, env) => (await sha((req.headers.get('CF-Connecting-IP') || 'unknown') + ':' + env.MOD_PASSCODE)).slice(0, 24);
const ownerHash = async (token, env) => (token && String(token).length >= 12 ? (await sha('owner:' + String(token).slice(0, 80) + ':' + env.MOD_PASSCODE)).slice(0, 24) : '');

// what is wrong with this piece of text, if anything
function vet(s, text, { name, min = 2 } = {}) {
  const low = text.toLowerCase();
  if (text.trim().length < min) return 'THAT IS TOO SHORT.';
  for (const w of s.blocked) if (w && low.includes(String(w).toLowerCase())) return 'THAT MESSAGE CONTAINS A WORD THAT IS NOT ALLOWED HERE.';
  const links = (text.match(/https?:\/\/|www\./gi) || []).length;
  if (links > s.maxLinks) return s.maxLinks ? 'TOO MANY LINKS (LIMIT ' + s.maxLinks + ').' : 'LINKS ARE NOT ALLOWED HERE.';
  if (/(.)\1{14,}/.test(text)) return 'PLEASE DO NOT SPAM.';
  if (name != null) {
    if (!NAME_RE.test(name)) return 'PICK A NAME OF 2 TO 24 LETTERS, NUMBERS, SPACES, DOTS, DASHES OR UNDERSCORES.';
    const ln = name.toLowerCase().replace(/[\s._-]+/g, '');
    for (const r of s.reserved) if (r && ln.includes(String(r).toLowerCase().replace(/[\s._-]+/g, ''))) return 'THAT NAME IS RESERVED. PICK ANOTHER.';
  }
  return '';
}

async function rateCheck(db, me, s) {
  const t = now();
  const last = await db.prepare('SELECT MAX(c) AS c FROM (SELECT created AS c FROM posts WHERE ip = ? UNION ALL SELECT created AS c FROM threads WHERE ip = ?)').bind(me, me).first();
  if (last && last.c && t - last.c < s.postSeconds) return 'SLOW DOWN. WAIT A FEW SECONDS BETWEEN POSTS.';
  const hr = await db.prepare('SELECT (SELECT COUNT(*) FROM posts WHERE ip = ? AND created > ?) + (SELECT COUNT(*) FROM threads WHERE ip = ? AND created > ?) AS n').bind(me, t - 3600, me, t - 3600).first();
  if (hr && hr.n >= s.perHour) return 'YOU HAVE POSTED A LOT LATELY. TRY AGAIN LATER.';
  return '';
}
const repeated = async (db, me, body) => !!(await db.prepare('SELECT 1 AS x FROM posts WHERE ip = ? AND body = ? AND created > ? UNION ALL SELECT 1 FROM threads WHERE ip = ? AND body = ? AND created > ? LIMIT 1').bind(me, body, now() - 3600, me, body, now() - 3600).first());

const pub = {
  post: (p, mine) => ({ id: p.id, name: p.uname || p.name, staff: !!p.staff, body: p.body, created: p.created, ups: p.ups, rating: p.rating == null ? null : p.rating, mine: !!mine, uid: p.user || 0, member: !!p.user, av: !!p.av, role: p.role || '', devName: p.devname || '' }),
  thread: t => ({ id: t.id, board: t.board, title: t.title, name: t.uname || t.name, staff: !!t.staff, created: t.created, last: t.last, ups: t.ups, pinned: !!t.pinned, locked: !!t.locked, replies: t.replies || 0 })
};

/* =============================== public side =============================== */
export async function communityRoute(req, env, url, reply, defs) {
  const db = env.DB;
  if (!db) return reply({ ok: false, error: 'THE COMMUNITY IS NOT SET UP YET (THE DATABASE IS MISSING).' }, 503);
  const route = url.pathname.slice(2);                     // '/c/threads' -> '/threads'
  const s = await getSettings(db);
  const me = await who(req, env);

  if (req.method === 'GET') {
    if (route === '/boot') return reply({ ok: true, forum: s.forum, comments: s.comments, approval: s.approval, boards: s.boards, rules: s.rules, maxLinks: s.maxLinks, accounts: true });
    const owner = await ownerHash(url.searchParams.get('o'), env);
    const sess = await userFromToken(db, req.headers.get('X-Session'));
    const isMine = p => (!!owner && p.owner === owner) || (!!sess && p.user === sess.id);
    const page = int(url.searchParams.get('page'), 0, 0, 500);

    if (route === '/threads') {
      if (!s.forum) return reply({ ok: false, error: 'THE FORUM IS CLOSED RIGHT NOW.' }, 403);
      const board = clip(url.searchParams.get('board'), 20).toUpperCase(), q = clip(url.searchParams.get('q'), 60).replace(/[%_\\]/g, m => '\\' + m);
      const sort = { new: 't.created DESC', top: 't.ups DESC, t.last DESC' }[url.searchParams.get('sort')] || 't.last DESC';
      const where = ["t.kind = 'thread'", "t.status = 'ok'"], args = [];
      if (board) { where.push('t.board = ?'); args.push(board); }
      if (q) { where.push("(t.title LIKE ? ESCAPE '\\' OR t.body LIKE ? ESCAPE '\\')"); args.push('%' + q + '%', '%' + q + '%'); }
      const rows = await db.prepare('SELECT t.*, (SELECT name FROM users u WHERE u.id = t.user) AS uname, (SELECT COUNT(*) FROM posts p WHERE p.thread = t.id AND p.status = \'ok\') AS replies FROM threads t WHERE ' + where.join(' AND ') + ' ORDER BY t.pinned DESC, ' + sort + ' LIMIT ? OFFSET ?').bind(...args, PAGE.threads + 1, page * PAGE.threads).all();
      const list = rows.results.slice(0, PAGE.threads).map(pub.thread);
      return reply({ ok: true, threads: list, more: rows.results.length > PAGE.threads });
    }
    if (route === '/thread') {
      if (!s.forum) return reply({ ok: false, error: 'THE FORUM IS CLOSED RIGHT NOW.' }, 403);
      const t = await db.prepare("SELECT t.*, u.av AS av, u.role AS role, u.dev_name AS devname, u.name AS uname FROM threads t LEFT JOIN users u ON u.id = t.user WHERE t.id = ? AND t.kind = 'thread' AND t.status = 'ok'").bind(int(url.searchParams.get('id'), 0, 0, 1e12)).first();
      if (!t) return reply({ ok: false, error: 'THAT THREAD DOES NOT EXIST (OR WAS REMOVED).' }, 404);
      const rows = await db.prepare("SELECT p.*, u.av AS av, u.role AS role, u.dev_name AS devname, u.name AS uname FROM posts p LEFT JOIN users u ON u.id = p.user WHERE p.thread = ? AND p.status = 'ok' ORDER BY p.created ASC, p.id ASC LIMIT ? OFFSET ?").bind(t.id, PAGE.posts + 1, page * PAGE.posts).all();
      return reply({ ok: true, thread: { ...pub.thread(t), body: t.body, mine: isMine(t), uid: t.user || 0, member: !!t.user, av: !!t.av, role: t.role || '', devName: t.devname || '' }, posts: rows.results.slice(0, PAGE.posts).map(p => pub.post(p, isMine(p))), more: rows.results.length > PAGE.posts });
    }
    if (route === '/comments') {
      const key = String(url.searchParams.get('key') || '');
      const def = KEY_RE.test(key) && defs && defs['c:' + key];
      if (!def) return reply({ ok: false, error: 'COMMENTS ARE NOT LIVE YET. PUBLISH THE PAGE FIRST.' }, 404);
      const t = await db.prepare("SELECT id, locked FROM threads WHERE kind = 'comments' AND key = ?").bind(key).first();
      if (!t) return reply({ ok: true, count: 0, avg: null, locked: false, ratings: !!def.ratings, posts: [], more: false, open: s.comments });
      const stat = await db.prepare("SELECT COUNT(*) AS n, AVG(rating) AS a FROM posts WHERE thread = ? AND status = 'ok'").bind(t.id).first();
      const rows = await db.prepare("SELECT p.*, u.av AS av, u.role AS role, u.dev_name AS devname, u.name AS uname FROM posts p LEFT JOIN users u ON u.id = p.user WHERE p.thread = ? AND p.status = 'ok' ORDER BY p.created DESC, p.id DESC LIMIT ? OFFSET ?").bind(t.id, PAGE.comments + 1, page * PAGE.comments).all();
      return reply({ ok: true, count: stat.n, avg: stat.a == null ? null : Math.round(stat.a * 10) / 10, locked: !!t.locked, ratings: !!def.ratings, open: s.comments, posts: rows.results.slice(0, PAGE.comments).map(p => pub.post(p, isMine(p))), more: rows.results.length > PAGE.comments });
    }
    return reply({ ok: false, error: 'UNKNOWN COMMUNITY ADDRESS' }, 404);
  }

  /* ---- everything below changes something ---- */
  if (Number(req.headers.get('Content-Length')) > (route === '/profile' ? 70000 : 20000)) return reply({ ok: false, error: 'THAT IS TOO BIG.' }, 413);
  let b; try { b = await req.json(); } catch (e) { return reply({ ok: false, error: 'BAD REQUEST' }, 400); }
  if (await db.prepare('SELECT 1 AS x FROM bans WHERE ip = ?').bind(me).first()) return reply({ ok: false, error: 'YOU CANNOT POST HERE.' }, 403);
  const t = now();
  const acc = await accountRoute(route, b, env, reply, { db, s, me, t, vet, clip, kv: env.STORE });
  if (acc) return acc;
  const owner = await ownerHash(b.owner, env);
  if (!owner && ['/thread', '/reply', '/comment'].includes(route)) return reply({ ok: false, error: 'REFRESH THE PAGE AND TRY AGAIN.' }, 400);

  if (route === '/thread' || route === '/reply' || route === '/comment') {
    if (b.hp) return reply({ ok: true, pending: false, id: 0 });                          // a hidden field only robots fill in: pretend it worked
    const user = b.token ? await userFromToken(db, b.token) : null;
    if (b.token && !user) return reply({ ok: false, session: false, error: 'YOUR LOGIN EXPIRED. LOG IN AGAIN.' }, 401);
    if (user && user.banned) return reply({ ok: false, error: 'THIS ACCOUNT HAS BEEN BANNED.' }, 403);
    const name = user ? user.name : clip(b.name, 30).trim().replace(/\s+/g, ' ');
    const body = clip(b.body, 2000).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    const bad = vet(s, body, user ? {} : { name });
    if (bad) return reply({ ok: false, error: bad }, 400);
    if (!user && await db.prepare('SELECT 1 AS x FROM users WHERE lname = ?').bind(lname(name)).first()) return reply({ ok: false, error: 'THAT NAME BELONGS TO A MEMBER. LOG IN TO USE IT, OR PICK ANOTHER NAME.' }, 403);
    const uid = user ? user.id : 0;
    const wait = await rateCheck(db, me, s); if (wait) return reply({ ok: false, error: wait }, 429);
    if (await repeated(db, me, body)) return reply({ ok: false, error: 'YOU ALREADY POSTED THAT.' }, 400);
    const status = s.approval ? 'pending' : 'ok';

    if (route === '/thread') {
      if (!s.forum) return reply({ ok: false, error: 'THE FORUM IS CLOSED RIGHT NOW.' }, 403);
      const title = clip(b.title, 100).trim().replace(/\s+/g, ' '), board = clip(b.board, 20).toUpperCase();
      const tbad = vet(s, title, { min: 3 }); if (tbad) return reply({ ok: false, error: 'TITLE: ' + tbad }, 400);
      if (!s.boards.includes(board)) return reply({ ok: false, error: 'PICK ONE OF THE BOARDS.' }, 400);
      const r = await db.prepare("INSERT INTO threads (kind, board, title, body, name, ip, owner, user, created, last, status) VALUES ('thread', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(board, title, body, name, me, owner, uid, t, t, status).run();
      return reply({ ok: true, id: r.meta.last_row_id, pending: status === 'pending' });
    }
    if (route === '/reply') {
      if (!s.forum) return reply({ ok: false, error: 'THE FORUM IS CLOSED RIGHT NOW.' }, 403);
      const th = await db.prepare("SELECT id, locked FROM threads WHERE id = ? AND kind = 'thread' AND status = 'ok'").bind(int(b.thread, 0, 0, 1e12)).first();
      if (!th) return reply({ ok: false, error: 'THAT THREAD DOES NOT EXIST.' }, 404);
      if (th.locked) return reply({ ok: false, error: 'THIS THREAD IS LOCKED.' }, 403);
      const r = await db.prepare('INSERT INTO posts (thread, name, body, ip, owner, user, created, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(th.id, name, body, me, owner, uid, t, status).run();
      if (status === 'ok') await db.prepare('UPDATE threads SET last = ? WHERE id = ?').bind(t, th.id).run();
      return reply({ ok: true, id: r.meta.last_row_id, pending: status === 'pending' });
    }
    // comment on a page element
    if (!s.comments) return reply({ ok: false, error: 'COMMENTS ARE CLOSED RIGHT NOW.' }, 403);
    const key = String(b.key || ''), def = KEY_RE.test(key) && defs && defs['c:' + key];
    if (!def) return reply({ ok: false, error: 'COMMENTS ARE NOT LIVE YET. PUBLISH THE PAGE FIRST.' }, 404);
    await db.prepare("INSERT OR IGNORE INTO threads (kind, key, created, last, status) VALUES ('comments', ?, ?, ?, 'ok')").bind(key, t, t).run();
    const th = await db.prepare("SELECT id, locked FROM threads WHERE kind = 'comments' AND key = ?").bind(key).first();
    if (th.locked) return reply({ ok: false, error: 'COMMENTS ON THIS ARE LOCKED.' }, 403);
    const stars = def.ratings && Number.isInteger(b.rating) && b.rating >= 1 && b.rating <= 5 ? b.rating : null;
    const r = await db.prepare('INSERT INTO posts (thread, name, body, ip, owner, user, created, status, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(th.id, name, body, me, owner, uid, t, status, stars).run();
    return reply({ ok: true, id: r.meta.last_row_id, pending: status === 'pending' });
  }

  const type = b.type === 'thread' ? 'thread' : 'post', id = int(b.id, 0, 0, 1e12), table = type === 'thread' ? 'threads' : 'posts';
  if (route === '/react') {
    const item = await db.prepare('SELECT id, ups FROM ' + table + " WHERE id = ? AND status = 'ok'").bind(id).first();
    if (!item) return reply({ ok: false, error: 'THAT IS GONE.' }, 404);
    const r = await db.prepare('INSERT OR IGNORE INTO reacts (type, item, ip) VALUES (?, ?, ?)').bind(type, id, me).run();
    if (r.meta.changes === 1) { await db.prepare('UPDATE ' + table + ' SET ups = ups + 1 WHERE id = ?').bind(id).run(); return reply({ ok: true, ups: item.ups + 1 }); }
    return reply({ ok: true, ups: item.ups, already: true });
  }
  if (route === '/report') {
    const item = await db.prepare('SELECT id FROM ' + table + " WHERE id = ? AND status IN ('ok', 'hidden')").bind(id).first();
    if (!item) return reply({ ok: false, error: 'THAT IS GONE.' }, 404);
    await db.prepare('INSERT OR IGNORE INTO reports (type, item, ip, reason, created) VALUES (?, ?, ?, ?, ?)').bind(type, id, me, clip(b.reason, 200), t).run();
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM reports WHERE type = ? AND item = ?').bind(type, id).first()).n;
    if (n >= s.autoHide) await db.prepare('UPDATE ' + table + " SET status = 'hidden' WHERE id = ? AND status = 'ok'").bind(id).run();
    return reply({ ok: true, hidden: n >= s.autoHide });
  }
  if (route === '/delete') {                                           // people can remove their own posts
    const du = b.token ? await userFromToken(db, b.token) : null;
    if (!owner && !du) return reply({ ok: false, error: 'NOT YOURS.' }, 403);
    const r = await db.prepare('UPDATE ' + table + " SET status = 'deleted' WHERE id = ? AND status != 'deleted' AND ((owner = ? AND owner != '') OR (user > 0 AND user = ?))").bind(id, owner, du ? du.id : -1).run();
    return r.meta.changes ? reply({ ok: true }) : reply({ ok: false, error: 'YOU CAN ONLY REMOVE YOUR OWN POSTS.' }, 403);
  }
  return reply({ ok: false, error: 'UNKNOWN COMMUNITY ADDRESS' }, 404);
}

/* =============================== moderator side =============================== */
// called only after the mod code has been checked
export async function communityMod(action, body, env, reply) {
  const db = env.DB;
  if (!db) return reply({ ok: false, error: 'THE COMMUNITY DATABASE IS MISSING. SEE worker/README.md.' }, 503);
  const t = now();
  const table = ty => (ty === 'thread' ? 'threads' : 'posts');
  const acct = await accountMod(action, body, env, reply, { clip, int });
  if (acct) return acct;

  if (action === 'c_settings_get') return reply({ ok: true, settings: await getSettings(db) });
  if (action === 'c_settings_set') {
    const v = body.settings || {}, cur = await getSettings(db);
    const list = (a, n, w) => (Array.isArray(a) ? a : []).map(x => clip(x, w).trim()).filter(Boolean).slice(0, n);
    const next = {
      forum: v.forum !== false, comments: v.comments !== false, approval: !!v.approval,
      boards: list(v.boards, 8, 16).map(x => x.toUpperCase()), rules: clip(v.rules, 600),
      blocked: list(v.blocked, 200, 40), reserved: list(v.reserved, 50, 30),
      postSeconds: int(v.postSeconds, cur.postSeconds, 0, 3600), perHour: int(v.perHour, cur.perHour, 1, 500),
      maxLinks: int(v.maxLinks, cur.maxLinks, 0, 5), autoHide: int(v.autoHide, cur.autoHide, 1, 50)
    };
    if (!next.boards.length) next.boards = DEFAULTS.boards;
    await db.prepare("INSERT INTO settings (k, v) VALUES ('main', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(next)).run();
    return reply({ ok: true, settings: next });
  }
  if (action === 'c_stats') {
    const one = async sql => (await db.prepare(sql).first()).n;
    return reply({ ok: true,
      threads: await one("SELECT COUNT(*) AS n FROM threads WHERE kind = 'thread' AND status = 'ok'"),
      posts: await one("SELECT COUNT(*) AS n FROM posts WHERE status = 'ok'"),
      pending: (await one("SELECT COUNT(*) AS n FROM posts WHERE status = 'pending'")) + (await one("SELECT COUNT(*) AS n FROM threads WHERE status = 'pending'")),
      hidden: (await one("SELECT COUNT(*) AS n FROM posts WHERE status = 'hidden'")) + (await one("SELECT COUNT(*) AS n FROM threads WHERE status = 'hidden'")),
      bans: await one('SELECT COUNT(*) AS n FROM bans'), users: await one('SELECT COUNT(*) AS n FROM users'), early: await one('SELECT COUNT(*) AS n FROM users WHERE early = 1'), earlyWaiting: await one('SELECT COUNT(*) AS n FROM users WHERE early = 2') });
  }
  if (action === 'c_list') {
    const view = ['recent', 'pending', 'reports', 'hidden'].includes(body.view) ? body.view : 'recent', page = int(body.page, 0, 0, 1000);
    const where = { recent: "status != 'deleted'", pending: "status = 'pending'", hidden: "status = 'hidden'", reports: "reports > 0 AND status IN ('ok', 'hidden')" }[view];
    const rows = await db.prepare(
      "SELECT * FROM (" +
      "SELECT 'thread' AS type, t.id AS id, t.title AS title, t.body AS body, t.name AS name, t.staff AS staff, t.ip AS ip, t.created AS created, t.status AS status, t.ups AS ups, t.pinned AS pinned, t.locked AS locked, t.id AS thread, t.board AS board, (SELECT COUNT(*) FROM reports r WHERE r.type = 'thread' AND r.item = t.id) AS reports FROM threads t WHERE t.kind = 'thread' " +
      "UNION ALL SELECT CASE WHEN th.kind = 'comments' THEN 'comment' ELSE 'reply' END, p.id, '', p.body, p.name, p.staff, p.ip, p.created, p.status, p.ups, 0, 0, p.thread, th.key, (SELECT COUNT(*) FROM reports r WHERE r.type = 'post' AND r.item = p.id) FROM posts p JOIN threads th ON th.id = p.thread" +
      ") WHERE " + where + " ORDER BY created DESC LIMIT 31 OFFSET ?").bind(page * 30).all();
    const items = rows.results.slice(0, 30).map(r => ({ ...r, body: r.body.slice(0, 400), staff: !!r.staff, pinned: !!r.pinned, locked: !!r.locked }));
    return reply({ ok: true, items, more: rows.results.length > 30 });
  }
  if (action === 'c_set') {
    const ty = body.type === 'thread' ? 'thread' : 'post', id = int(body.id, 0, 0, 1e12), sets = [], args = [];
    if (['ok', 'hidden', 'deleted', 'pending'].includes(body.status)) { sets.push('status = ?'); args.push(body.status); }
    if (ty === 'thread' && typeof body.pinned === 'boolean') { sets.push('pinned = ?'); args.push(body.pinned ? 1 : 0); }
    if (ty === 'thread' && typeof body.locked === 'boolean') { sets.push('locked = ?'); args.push(body.locked ? 1 : 0); }
    if (!sets.length) return reply({ ok: false, error: 'NOTHING TO CHANGE' }, 400);
    const r = await db.prepare('UPDATE ' + table(ty) + ' SET ' + sets.join(', ') + ' WHERE id = ?').bind(...args, id).run();
    if (body.status === 'ok') await db.prepare('DELETE FROM reports WHERE type = ? AND item = ?').bind(ty, id).run();   // approved: its reports are cleared
    return reply({ ok: !!r.meta.changes, changed: r.meta.changes });
  }
  if (action === 'c_delete') {
    const ty = body.type === 'thread' ? 'thread' : 'post', id = int(body.id, 0, 0, 1e12);
    if (ty === 'thread') { await db.prepare('DELETE FROM posts WHERE thread = ?').bind(id).run(); await db.prepare('DELETE FROM threads WHERE id = ?').bind(id).run(); }
    else await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
    await db.prepare('DELETE FROM reports WHERE type = ? AND item = ?').bind(ty, id).run(); await db.prepare('DELETE FROM reacts WHERE type = ? AND item = ?').bind(ty, id).run();
    return reply({ ok: true });
  }
  if (action === 'c_ban') {
    const ip = clip(body.ip, 40).replace(/[^a-f0-9]/g, '');
    if (ip.length < 8) return reply({ ok: false, error: 'BAD ID' }, 400);
    const full = await db.prepare('SELECT ip FROM (SELECT ip FROM posts UNION SELECT ip FROM threads) WHERE ip LIKE ? LIMIT 1').bind(ip + '%').first();
    if (!full) return reply({ ok: false, error: 'NO ONE WITH THAT ID HAS POSTED' }, 404);
    await db.prepare('INSERT OR REPLACE INTO bans (ip, reason, created) VALUES (?, ?, ?)').bind(full.ip, clip(body.reason, 200), t).run();
    return reply({ ok: true });
  }
  if (action === 'c_unban') { await db.prepare('DELETE FROM bans WHERE ip LIKE ?').bind(clip(body.ip, 40).replace(/[^a-f0-9]/g, '') + '%').run(); return reply({ ok: true }); }
  if (action === 'c_bans') { const r = await db.prepare('SELECT ip, reason, created FROM bans ORDER BY created DESC LIMIT 100').all(); return reply({ ok: true, bans: r.results }); }
  if (action === 'c_staff') {
    const kind = body.kind, name = clip(body.name || 'STAFF', 24).trim() || 'STAFF', text = clip(body.body, 2000).replace(/\r/g, '').trim();
    if (text.length < 1) return reply({ ok: false, error: 'WRITE SOMETHING FIRST.' }, 400);
    if (kind === 'thread') {
      const s = await getSettings(db), title = clip(body.title, 100).trim(), board = clip(body.board, 20).toUpperCase() || s.boards[0];
      if (title.length < 3) return reply({ ok: false, error: 'GIVE THE THREAD A TITLE.' }, 400);
      const r = await db.prepare("INSERT INTO threads (kind, board, title, body, name, staff, created, last, status) VALUES ('thread', ?, ?, ?, ?, 1, ?, ?, 'ok')").bind(board, title, text, name, t, t).run();
      return reply({ ok: true, id: r.meta.last_row_id });
    }
    let th = kind === 'comment'
      ? await db.prepare("SELECT id FROM threads WHERE kind = 'comments' AND key = ?").bind(clip(body.key, 60)).first()
      : await db.prepare("SELECT id FROM threads WHERE id = ? AND kind = 'thread'").bind(int(body.thread, 0, 0, 1e12)).first();
    if (!th && kind === 'comment') { await db.prepare("INSERT OR IGNORE INTO threads (kind, key, created, last, status) VALUES ('comments', ?, ?, ?, 'ok')").bind(clip(body.key, 60), t, t).run(); th = await db.prepare("SELECT id FROM threads WHERE kind = 'comments' AND key = ?").bind(clip(body.key, 60)).first(); }
    if (!th) return reply({ ok: false, error: 'THAT THREAD DOES NOT EXIST.' }, 404);
    const r = await db.prepare("INSERT INTO posts (thread, name, staff, body, created, status) VALUES (?, ?, 1, ?, ?, 'ok')").bind(th.id, name, text, t).run();
    await db.prepare('UPDATE threads SET last = ? WHERE id = ?').bind(t, th.id).run();
    return reply({ ok: true, id: r.meta.last_row_id });
  }
  return reply({ ok: false, error: 'UNKNOWN COMMUNITY ACTION' }, 400);
}
