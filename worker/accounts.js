// Member accounts for the Stillmark community: a name and a password (no email, no third-party service).
//
//  - Passwords are never stored. Only a salted PBKDF2 hash is kept, and the count of rounds is stored with it.
//  - A login gives the browser a random session token. Only a hash of that token is kept here, so a leaked
//    database cannot be used to log in. Sessions last 30 days.
//  - A registered name belongs to the member: guests cannot post under it.
//  - Wrong passwords are limited per address and per name. Making accounts is limited per address.
//  - A forgotten password is reset by a moderator from the mod panel (there is no email to send a link to).
//  - Profile pictures are tiny images kept in the database and served from /c/avatar with strict headers.

const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const ITER = 100000;                                     // the most Cloudflare Workers allows
const SESSION_DAYS = 30;
const NAME_OK = /^[\p{L}\p{N}_-]{3,20}$/u;
const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+\/]+={0,2})$/;
export const lname = s => String(s).toLowerCase().replace(/[\s._-]+/g, '');

async function pbkdf2(pw, saltHex, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const count = async (kv, key) => (kv ? Number(await kv.get(key)) || 0 : 0);
const bump = async (kv, key, ttl) => { if (kv) await kv.put(key, String((await count(kv, key)) + 1), { expirationTtl: ttl }); };

// the member behind a session token, or null
export async function userFromToken(db, token) {
  if (!token || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const th = await sha('session:' + token);
  const u = await db.prepare('SELECT u.*, s.th AS _th FROM sessions s JOIN users u ON u.id = s.user WHERE s.th = ? AND s.expires > ?').bind(th, Math.floor(Date.now() / 1000)).first();
  return u || null;
}
const EARLY = ['none', 'approved', 'pending', 'declined'];
const mine = u => ({ id: u.id, name: u.name, bio: u.bio, contact: u.contact, early: EARLY[u.early] || 'none', earlyReason: u.early_reason || '', avatar: !!u.av, created: u.created });

async function startSession(db, userId, t) {
  const token = rand(32), th = await sha('session:' + token);
  await db.prepare('INSERT INTO sessions (th, user, created, expires) VALUES (?, ?, ?, ?)').bind(th, userId, t, t + SESSION_DAYS * 86400).run();
  await db.prepare('DELETE FROM sessions WHERE user = ? AND th NOT IN (SELECT th FROM sessions WHERE user = ? ORDER BY created DESC LIMIT 10)').bind(userId, userId).run();
  return token;
}
function passwordProblem(pw, name) {
  if (typeof pw !== 'string' || pw.length < 8) return 'THE PASSWORD MUST BE AT LEAST 8 CHARACTERS.';
  if (pw.length > 100) return 'THE PASSWORD IS TOO LONG (100 AT MOST).';
  if (name && lname(pw) === lname(name)) return 'THE PASSWORD CANNOT BE YOUR NAME.';
  return '';
}
function avatarOk(u) {
  const m = AVATAR_RE.exec(u); if (!m || u.length > 60000) return false;
  let head; try { head = atob(m[2].slice(0, 24)); } catch (e) { return false; }
  if (m[1] === 'png') return head.charCodeAt(0) === 0x89 && head.slice(1, 4) === 'PNG';
  if (m[1] === 'jpeg') return head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8 && head.charCodeAt(2) === 0xff;
  return head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP';
}

// c = { db, s (settings), me (private address fingerprint), t (now), vet, clip, kv }
export async function accountRoute(route, b, env, reply, c) {
  const { db, s, me, t, vet, clip, kv } = c;
  if (!['/register', '/login', '/logout', '/me', '/profile', '/password', '/deleteaccount'].includes(route)) return null;
  const wrong = () => reply({ ok: false, session: false, error: 'YOUR LOGIN EXPIRED. LOG IN AGAIN.' }, 401);

  if (route === '/register') {
    if (await count(kv, 'rg:' + me) >= 5) return reply({ ok: false, error: 'TOO MANY ACCOUNTS FROM HERE. TRY AGAIN LATER.' }, 429);
    const name = clip(b.name, 30).trim();
    if (!NAME_OK.test(name)) return reply({ ok: false, error: 'THE NAME MUST BE 3 TO 20 LETTERS, NUMBERS, DASHES OR UNDERSCORES (NO SPACES).' }, 400);
    const bad = vet(s, name, { name, min: 3 }); if (bad) return reply({ ok: false, error: bad }, 400);
    const pb = passwordProblem(b.password, name); if (pb) return reply({ ok: false, error: pb }, 400);
    if (await db.prepare('SELECT 1 AS x FROM users WHERE lname = ?').bind(lname(name)).first()) return reply({ ok: false, error: 'THAT NAME IS TAKEN.' }, 409);
    let reason = '';
    if (b.early) { reason = clip(b.earlyReason, 300).trim(); if (reason.length < 10) return reply({ ok: false, error: 'TELL US WHY YOU WANT EARLY ACCESS (AT LEAST 10 CHARACTERS), OR UNTICK THE BOX.' }, 400); const rb = vet(s, reason, { min: 10 }); if (rb) return reply({ ok: false, error: 'YOUR REASON: ' + rb }, 400); }
    const salt = rand(16), hash = await pbkdf2(b.password, salt, ITER);
    let r;
    try { r = await db.prepare('INSERT INTO users (name, lname, salt, hash, iter, created, contact, early, early_reason, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(name, lname(name), salt, hash, ITER, t, clip(b.contact, 60).trim(), reason ? 2 : 0, reason, me).run(); }
    catch (e) { return reply({ ok: false, error: 'THAT NAME IS TAKEN.' }, 409); }
    await bump(kv, 'rg:' + me, 3600);
    const token = await startSession(db, r.meta.last_row_id, t);
    const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(r.meta.last_row_id).first();
    return reply({ ok: true, token, me: mine(u) });
  }

  if (route === '/login') {
    const ln = lname(clip(b.name, 30)), pw = typeof b.password === 'string' ? b.password.slice(0, 100) : '';
    if (await count(kv, 'lf:' + me) >= 10 || await count(kv, 'lu:' + ln) >= 10) return reply({ ok: false, error: 'TOO MANY TRIES. WAIT 10 MINUTES.' }, 429);
    const u = ln ? await db.prepare('SELECT * FROM users WHERE lname = ?').bind(ln).first() : null;
    const ok = u ? same(await pbkdf2(pw, u.salt, u.iter), u.hash) : (await pbkdf2(pw, '00'.repeat(16), ITER), false);   // same work either way
    if (!ok) { await bump(kv, 'lf:' + me, 600); await bump(kv, 'lu:' + ln, 600); return reply({ ok: false, error: 'WRONG NAME OR PASSWORD.' }, 401); }
    if (u.banned) return reply({ ok: false, error: 'THIS ACCOUNT HAS BEEN BANNED.' }, 403);
    if (kv) await kv.delete('lu:' + ln);
    await db.prepare('DELETE FROM sessions WHERE expires < ?').bind(t).run();
    return reply({ ok: true, token: await startSession(db, u.id, t), me: mine(u) });
  }

  const u = await userFromToken(db, b.token);
  if (!u) return wrong();

  if (route === '/me') return reply({ ok: true, me: mine(u), banned: !!u.banned });
  if (route === '/logout') { await db.prepare('DELETE FROM sessions WHERE th = ?').bind(u._th).run(); return reply({ ok: true }); }

  if (route === '/profile') {
    const sets = [], args = [];
    if (typeof b.bio === 'string') {
      const bio = clip(b.bio, 200).replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim();
      if (bio) { const bad = vet(s, bio, { min: 0 }); if (bad) return reply({ ok: false, error: 'ABOUT ME: ' + bad }, 400); }
      sets.push('bio = ?'); args.push(bio);
    }
    if (typeof b.contact === 'string') { sets.push('contact = ?'); args.push(clip(b.contact, 60).trim()); }
    if (typeof b.early === 'boolean') {
      if (!b.early) { sets.push('early = 0', "early_reason = ''"); }                    // leaving the list (or withdrawing the request)
      else if (u.early === 1 || u.early === 3) { /* already decided by a moderator: nothing to change */ }
      else {
        const reason = clip(typeof b.earlyReason === 'string' ? b.earlyReason : u.early_reason, 300).trim();
        if (reason.length < 10) return reply({ ok: false, error: 'TELL US WHY YOU WANT EARLY ACCESS (AT LEAST 10 CHARACTERS).' }, 400);
        const rb = vet(s, reason, { min: 10 }); if (rb) return reply({ ok: false, error: 'YOUR REASON: ' + rb }, 400);
        sets.push('early = 2', 'early_reason = ?'); args.push(reason);
      }
    }
    if (typeof b.avatar === 'string') {
      if (b.avatar === '') { sets.push("avatar = ''", 'av = 0'); }
      else if (avatarOk(b.avatar)) { sets.push('avatar = ?', 'av = 1'); args.push(b.avatar); }
      else return reply({ ok: false, error: 'THAT PICTURE IS NOT ALLOWED. USE A SMALL PNG, JPG OR WEBP.' }, 400);
    }
    if (sets.length) await db.prepare('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?').bind(...args, u.id).run();
    return reply({ ok: true, me: mine(await db.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first()) });
  }

  // these two need the current password again
  if (route === '/password' || route === '/deleteaccount') {
    if (await count(kv, 'lu:' + u.lname) >= 10) return reply({ ok: false, error: 'TOO MANY TRIES. WAIT 10 MINUTES.' }, 429);
    if (!same(await pbkdf2(typeof b.password === 'string' ? b.password.slice(0, 100) : '', u.salt, u.iter), u.hash)) { await bump(kv, 'lu:' + u.lname, 600); return reply({ ok: false, error: 'THE CURRENT PASSWORD IS WRONG.' }, 403); }
    if (route === '/password') {
      const pb = passwordProblem(b.newPassword, u.name); if (pb) return reply({ ok: false, error: pb }, 400);
      const salt = rand(16), hash = await pbkdf2(b.newPassword, salt, ITER);
      await db.prepare('UPDATE users SET salt = ?, hash = ?, iter = ? WHERE id = ?').bind(salt, hash, ITER, u.id).run();
      await db.prepare('DELETE FROM sessions WHERE user = ? AND th != ?').bind(u.id, u._th).run();   // every other device is logged out
      return reply({ ok: true });
    }
    await db.prepare('DELETE FROM sessions WHERE user = ?').bind(u.id).run();
    await db.prepare('UPDATE threads SET user = 0 WHERE user = ?').bind(u.id).run();
    await db.prepare('UPDATE posts SET user = 0 WHERE user = ?').bind(u.id).run();
    await db.prepare('DELETE FROM users WHERE id = ?').bind(u.id).run();
    return reply({ ok: true });
  }
  return null;
}

// profile pictures are fetched by <img> tags, which send no Origin, so this one route is open (it only ever returns a tiny image)
export async function avatarRoute(req, env) {
  const id = Math.floor(Number(new URL(req.url).searchParams.get('u')));
  const none = () => new Response('', { status: 404 });
  if (!env.DB || !Number.isFinite(id) || id < 1) return none();
  const row = await env.DB.prepare('SELECT avatar FROM users WHERE id = ? AND av = 1').bind(id).first();
  const m = row && AVATAR_RE.exec(row.avatar); if (!m) return none();
  const bytes = Uint8Array.from(atob(m[2]), ch => ch.charCodeAt(0));
  return new Response(bytes, { headers: { 'Content-Type': 'image/' + m[1], 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}

/* ---------------- moderator side (the mod code is already checked) ---------------- */
export async function accountMod(action, body, env, reply, { clip, int }) {
  const db = env.DB;
  if (action === 'c_users') {
    const page = int(body.page, 0, 0, 1000), q = clip(body.q, 30).replace(/[%_\\]/g, m => '\\' + m), where = [], args = [];
    if (q) { where.push("(name LIKE ? ESCAPE '\\' OR contact LIKE ? ESCAPE '\\')"); args.push('%' + q + '%', '%' + q + '%'); }
    const E = { pending: 2, approved: 1, declined: 3 };
    if (E[body.early]) { where.push('early = ?'); args.push(E[body.early]); } else if (body.early === 'any') where.push('early > 0');
    const rows = await db.prepare('SELECT id, name, created, early, early_reason, contact, banned, av, bio, (SELECT COUNT(*) FROM posts p WHERE p.user = users.id) + (SELECT COUNT(*) FROM threads t WHERE t.user = users.id) AS posts FROM users' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY created DESC LIMIT 51 OFFSET ?').bind(...args, page * 50).all();
    const tot = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(early = 1), 0) AS e, COALESCE(SUM(early = 2), 0) AS w FROM users').first();
    return reply({ ok: true, users: rows.results.slice(0, 50).map(r => ({ ...r, early: EARLY[r.early] || 'none', banned: !!r.banned, av: !!r.av })), more: rows.results.length > 50, total: tot.n, early: tot.e, waiting: tot.w });
  }
  const id = int(body.id, 0, 0, 1e12);
  if (action === 'c_user_set') {
    const sets = [], args = [];
    if (typeof body.banned === 'boolean') { sets.push('banned = ?'); args.push(body.banned ? 1 : 0); }
    if (EARLY.includes(body.early)) { sets.push('early = ?'); args.push(EARLY.indexOf(body.early)); if (body.early === 'none') sets.push("early_reason = ''"); }
    if (!sets.length) return reply({ ok: false, error: 'NOTHING TO CHANGE' }, 400);
    const r = await db.prepare('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?').bind(...args, id).run();
    if (body.banned === true) await db.prepare('DELETE FROM sessions WHERE user = ?').bind(id).run();
    return reply({ ok: !!r.meta.changes });
  }
  if (action === 'c_user_delete') {
    await db.prepare('DELETE FROM sessions WHERE user = ?').bind(id).run();
    await db.prepare('UPDATE threads SET user = 0 WHERE user = ?').bind(id).run();
    await db.prepare('UPDATE posts SET user = 0 WHERE user = ?').bind(id).run();
    const r = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return reply({ ok: !!r.meta.changes });
  }
  if (action === 'c_user_reset') {                            // a forgotten password: make a new one to hand to the person
    const pw = rand(7), salt = rand(16), hash = await pbkdf2(pw, salt, ITER);
    const r = await db.prepare('UPDATE users SET salt = ?, hash = ?, iter = ? WHERE id = ?').bind(salt, hash, ITER, id).run();
    if (!r.meta.changes) return reply({ ok: false, error: 'NO SUCH MEMBER' }, 404);
    await db.prepare('DELETE FROM sessions WHERE user = ?').bind(id).run();
    return reply({ ok: true, password: pw });
  }
  return null;
}
