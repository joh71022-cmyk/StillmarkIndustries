// Hollowblade publish service (runs on Cloudflare Workers).
// It keeps the GitHub token on the SERVER, so the token never sits in a browser or on a friend's computer.
//
// First time: the mod panel asks for the token once and sends it here ("setup"). After that the panel
// only needs the mod code to "publish". Two kinds of request are accepted:
//   POST /          JSON  - status / setup / forget / publish (site-data.js and pictures in uploads/ only)
//   POST /upload    file  - a game download, streamed into a GitHub Release called "downloads"
//
// Needs:  Secret    MOD_PASSCODE   the mod code (the same thing typed after "mod pas")
//         Variable  REPO           e.g. joh71022-cmyk/HOLLOWBLADEINDUSTRIES
//         Variable  ALLOWED_ORIGIN e.g. https://joh71022-cmyk.github.io
//         KV binding STORE         (a free KV namespace; holds the token and the wrong-guess counter)
// Optional: Secret  GITHUB_TOKEN   if you would rather paste the token in Cloudflare than in the panel.

const OK_PATH = /^(site-data\.js|uploads\/[\w.\-]{1,80}\.(png|jpg|jpeg|webp|gif))$/;
const OK_FILE = /^[\w][\w.\-]{0,100}\.(zip|7z|rar|exe|msi|apk|dmg|pkg|deb|appimage|tar|gz|tgz|xz|pdf|txt|md|mp3|ogg|wav|flac|mp4|webm|png|jpg|jpeg|gif|webp|unitypackage|blend|psd)$/i;
const B64 = /^[A-Za-z0-9+\/]+={0,2}$/;
const TOKEN_RE = /^(github_pat_|ghp_|gho_|ghu_|ghs_)[A-Za-z0-9_]{20,}$/;
const MAX_FILES = 12;
const MAX_B64 = 3_000_000;          // about 2.2 MB per picture / data file
const MAX_UPLOAD = 95 * 1024 * 1024; // downloads: Cloudflare's free plan allows 100 MB per request
const MAX_FAILS = 20;               // wrong guesses allowed ...
const LOCK_SECONDS = 600;           // ... before everything is locked for 10 minutes

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const localOk = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const allowed = origin === env.ALLOWED_ORIGIN || localOk;
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Mod-Code',
      'Vary': 'Origin'
    };
    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply({ ok: false, error: 'POST ONLY' }, 405);
    if (!allowed) return reply({ ok: false, error: 'ORIGIN NOT ALLOWED' }, 403);
    if (!env.MOD_PASSCODE || !env.REPO) return reply({ ok: false, error: 'SERVICE IS NOT SET UP YET (MISSING MOD_PASSCODE OR REPO)' }, 500);

    const kv = env.STORE;
    const url = new URL(req.url);
    const isUpload = url.pathname === '/upload';

    let body = {};
    if (!isUpload) { try { body = await req.json(); } catch (e) { return reply({ ok: false, error: 'BAD REQUEST' }, 400); } }

    /* ---- the mod code, with a wrong-guess lockout (constant-time compare of fixed-length hashes) ---- */
    const code = isUpload ? (req.headers.get('X-Mod-Code') || '') : String(body.passphrase || '');
    const readFails = async () => { try { return JSON.parse((kv && await kv.get('fails')) || '{"n":0}').n || 0; } catch (e) { return 0; } };
    const fails = await readFails();
    if (fails >= MAX_FAILS) return reply({ ok: false, error: 'TOO MANY WRONG TRIES. TRY AGAIN IN 10 MINUTES.' }, 429);
    const enc = new TextEncoder();
    const [a, b] = await Promise.all([
      crypto.subtle.digest('SHA-256', enc.encode(code)),
      crypto.subtle.digest('SHA-256', enc.encode(env.MOD_PASSCODE))
    ]);
    const A = new Uint8Array(a), B = new Uint8Array(b);
    let diff = 0;
    for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i];
    if (diff !== 0) {
      if (kv) await kv.put('fails', JSON.stringify({ n: fails + 1 }), { expirationTtl: LOCK_SECONDS });
      await new Promise(r => setTimeout(r, 1200)); // slow each guess down
      return reply({ ok: false, error: 'WRONG MOD CODE' }, 401);
    }
    if (kv && fails > 0) await kv.delete('fails');

    const getToken = async () => (kv && (await kv.get('github_token'))) || env.GITHUB_TOKEN || '';
    const ghHeaders = token => ({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'hollowblade-publisher' });

    /* ---- upload: stream a game download into the "downloads" release ---- */
    if (isUpload) {
      const token = await getToken();
      if (!token) return reply({ ok: false, needSetup: true, error: 'NO GITHUB TOKEN SAVED YET. ADD IT ONCE IN THE PANEL.' }, 400);
      const name = (url.searchParams.get('name') || '').trim().replace(/\s+/g, '-');
      if (!OK_FILE.test(name)) return reply({ ok: false, error: 'THAT FILE NAME OR TYPE IS NOT ALLOWED. USE ZIP, 7Z, RAR, EXE, MSI, APK, DMG, PDF, MP3, MP4 AND SIMILAR, WITH LETTERS, NUMBERS, DASHES AND DOTS ONLY.' }, 400);
      const len = Number(req.headers.get('Content-Length')) || 0;
      if (!len) return reply({ ok: false, error: 'THE FILE IS EMPTY OR ITS SIZE IS UNKNOWN' }, 400);
      if (len > MAX_UPLOAD) return reply({ ok: false, error: 'FILE IS TOO BIG (LIMIT 95 MB). PASTE A LINK TO IT INSTEAD, FOR EXAMPLE FROM GOOGLE DRIVE OR MEGA.' }, 413);
      const hdr = { ...ghHeaders(token), 'Content-Type': 'application/json' };
      const gh = (path, init = {}) => fetch('https://api.github.com/repos/' + env.REPO + path, { ...init, headers: { ...hdr, ...(init.headers || {}) } });
      const fail = async (res, what) => {
        let why = ''; try { why = (await res.json()).message || ''; } catch (e) {}
        return reply({ ok: false, badToken: res.status === 401 || res.status === 403, error: 'GITHUB SAID ' + res.status + ' ' + what + (why ? ': ' + why : '') }, 502);
      };
      let rel = await gh('/releases/tags/downloads');
      if (rel.status === 404) {
        rel = await gh('/releases', { method: 'POST', body: JSON.stringify({ tag_name: 'downloads', name: 'Game downloads', body: 'Files offered for download on the Hollowblade Industries website.', draft: false, prerelease: false }) });
      }
      if (!rel.ok) return fail(rel, 'WHEN OPENING THE DOWNLOADS RELEASE');
      const release = await rel.json();
      const old = (release.assets || []).find(x => x.name === name);       // same name uploaded before? replace it
      if (old) { const del = await gh('/releases/assets/' + old.id, { method: 'DELETE' }); if (!del.ok && del.status !== 404) return fail(del, 'WHEN REPLACING THE OLD FILE'); }
      const up = await fetch('https://uploads.github.com/repos/' + env.REPO + '/releases/' + release.id + '/assets?name=' + encodeURIComponent(name), {
        method: 'POST',
        headers: { ...ghHeaders(token), 'Content-Type': req.headers.get('Content-Type') || 'application/octet-stream', 'Content-Length': String(len) },
        body: req.body, duplex: 'half'
      });
      if (!up.ok) return fail(up, 'WHEN UPLOADING THE FILE');
      const asset = await up.json();
      return reply({ ok: true, url: asset.browser_download_url, name: asset.name, size: asset.size });
    }

    const action = body.action || (body.files ? 'publish' : 'status');

    /* ---- status: is a token saved yet? ---- */
    if (action === 'status') return reply({ ok: true, tokenSet: !!(await getToken()), canStoreToken: !!kv, uploads: true });

    /* ---- setup: save the token once ---- */
    if (action === 'setup') {
      if (!kv) return reply({ ok: false, error: 'THE SERVICE HAS NO STORAGE YET. ADD THE KV BINDING CALLED STORE (SEE worker/README.md).' }, 500);
      const t = String(body.token || '').trim();
      if (!TOKEN_RE.test(t)) return reply({ ok: false, error: 'THAT DOES NOT LOOK LIKE A GITHUB TOKEN (IT STARTS WITH github_pat_ OR ghp_).' }, 400);
      const probe = await fetch('https://api.github.com/repos/' + env.REPO + '/contents/site-data.js', { headers: ghHeaders(t) });
      if (!probe.ok) return reply({ ok: false, error: 'GITHUB REJECTED THAT TOKEN (' + probe.status + '). CHECK IT IS NEW, NOT EXPIRED, AND ALLOWED ON THIS REPO.' }, 400);
      await kv.put('github_token', t);
      return reply({ ok: true, tokenSet: true });
    }

    /* ---- forget: remove the saved token ---- */
    if (action === 'forget') {
      if (kv) await kv.delete('github_token');
      return reply({ ok: true, tokenSet: !!env.GITHUB_TOKEN });
    }

    if (action !== 'publish') return reply({ ok: false, error: 'UNKNOWN ACTION' }, 400);

    /* ---- publish ---- */
    const token = await getToken();
    if (!token) return reply({ ok: false, needSetup: true, error: 'NO GITHUB TOKEN SAVED YET. ADD IT ONCE IN THE PANEL.' }, 400);

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

    const hdr = { ...ghHeaders(token), 'Content-Type': 'application/json' };
    const message = String(body.message || 'Update site content via mod panel').slice(0, 100);
    for (const f of files) {
      const api = 'https://api.github.com/repos/' + env.REPO + '/contents/' + f.path;
      let sha;
      const cur = await fetch(api, { headers: hdr });
      if (cur.ok) sha = (await cur.json()).sha;
      else if (cur.status !== 404) return reply({ ok: false, badToken: cur.status === 401, error: 'GITHUB SAID ' + cur.status + ' WHEN READING ' + f.path + (cur.status === 401 ? ' (THE SAVED TOKEN EXPIRED OR WAS REVOKED. ADD A NEW ONE.)' : '') }, 502);
      const put = await fetch(api, { method: 'PUT', headers: hdr, body: JSON.stringify({ message, content: f.content, sha }) });
      if (!put.ok) {
        let why = ''; try { why = (await put.json()).message || ''; } catch (e) {}
        return reply({ ok: false, badToken: put.status === 401 || put.status === 403, error: 'GITHUB SAID ' + put.status + ' WHEN SAVING ' + f.path + (why ? ': ' + why : '') }, 502);
      }
    }
    return reply({ ok: true, saved: files.map(f => f.path) });
  }
};
