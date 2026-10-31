// Hollowblade publish service (runs on Cloudflare Workers).
// The GitHub token lives here as a SECRET, so it never touches a browser or a friend's computer.
// Mods only need a publish passphrase, which can change the site's content and nothing else.
//
// Secrets:   GITHUB_TOKEN  (fine-grained token, Contents: read and write on ONE repo)
//            MOD_PASSCODE  (the publish passphrase, make it long)
// Variables: REPO          e.g. joh71022-cmyk/HOLLOWBLADEINDUSTRIES
//            ALLOWED_ORIGIN e.g. https://joh71022-cmyk.github.io

const OK_PATH = /^(site-data\.js|uploads\/[\w.\-]{1,80}\.(png|jpg|jpeg|webp|gif))$/;
const B64 = /^[A-Za-z0-9+\/]+={0,2}$/;
const MAX_FILES = 12;
const MAX_B64 = 3_000_000; // about 2.2 MB per file

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const localOk = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const allowed = origin === env.ALLOWED_ORIGIN || localOk;
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply({ ok: false, error: 'POST ONLY' }, 405);
    if (!allowed) return reply({ ok: false, error: 'ORIGIN NOT ALLOWED' }, 403);
    if (!env.GITHUB_TOKEN || !env.MOD_PASSCODE || !env.REPO) return reply({ ok: false, error: 'SERVICE IS NOT SET UP YET (MISSING SECRETS OR VARIABLES)' }, 500);

    let body;
    try { body = await req.json(); } catch (e) { return reply({ ok: false, error: 'BAD REQUEST' }, 400); }

    // constant-time passphrase check (compare fixed-length hashes)
    const enc = new TextEncoder();
    const [a, b] = await Promise.all([
      crypto.subtle.digest('SHA-256', enc.encode(String(body.passphrase || ''))),
      crypto.subtle.digest('SHA-256', enc.encode(env.MOD_PASSCODE))
    ]);
    const A = new Uint8Array(a), B = new Uint8Array(b);
    let diff = 0;
    for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i];
    if (diff !== 0) {
      await new Promise(r => setTimeout(r, 1200)); // slow down guessing
      return reply({ ok: false, error: 'WRONG PUBLISH PASSPHRASE' }, 401);
    }

    // only these files, only this shape
    const files = body.files;
    if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) return reply({ ok: false, error: 'BAD FILE LIST' }, 400);
    for (const f of files) {
      if (!f || !OK_PATH.test(f.path || '')) return reply({ ok: false, error: 'FILE NOT ALLOWED: ' + String(f && f.path).slice(0, 60) }, 400);
      if (typeof f.content !== 'string' || !B64.test(f.content) || f.content.length > MAX_B64) return reply({ ok: false, error: 'BAD FILE CONTENT' }, 400);
      if (f.path === 'site-data.js') {
        let text = '';
        try { text = atob(f.content); } catch (e) { return reply({ ok: false, error: 'BAD FILE CONTENT' }, 400); }
        if (!text.includes('window.SITE_DATA')) return reply({ ok: false, error: 'site-data.js LOOKS WRONG' }, 400);
      }
    }
    files.sort((x, y) => (x.path === 'site-data.js') - (y.path === 'site-data.js')); // pictures first, data last

    const hdr = {
      Authorization: 'Bearer ' + env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'hollowblade-publisher',
      'Content-Type': 'application/json'
    };
    const message = String(body.message || 'Update site content via mod panel').slice(0, 100);
    for (const f of files) {
      const api = 'https://api.github.com/repos/' + env.REPO + '/contents/' + f.path;
      let sha;
      const cur = await fetch(api, { headers: hdr });
      if (cur.ok) sha = (await cur.json()).sha;
      else if (cur.status !== 404) return reply({ ok: false, error: 'GITHUB SAID ' + cur.status + ' WHEN READING ' + f.path }, 502);
      const put = await fetch(api, { method: 'PUT', headers: hdr, body: JSON.stringify({ message, content: f.content, sha }) });
      if (!put.ok) {
        let why = ''; try { why = (await put.json()).message || ''; } catch (e) {}
        return reply({ ok: false, error: 'GITHUB SAID ' + put.status + ' WHEN SAVING ' + f.path + (why ? ': ' + why : '') }, 502);
      }
    }
    return reply({ ok: true, saved: files.map(f => f.path) });
  }
};
