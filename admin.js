/* Mod panel. Opened from the terminal; edits are saved as a draft in THIS browser until published. */
(() => {
  const HB = window.HB;
  if (!HB) return;
  // only a one-way hash lives here, never the passcode itself
  const HASH = 'a2e2d932cf3c0de3835bd597a8f45f48247e4789c89e233e6ad72bd0c9fc03eb';
  const DEFAULT_REPO = 'joh71022-cmyk/HOLLOWBLADEINDUSTRIES';
  // address of the publish service (see worker/README.md). Not secret. Empty = ask for a token instead.
  const PUBLISH_URL = '';
  const pubUrl = () => {
    if (PUBLISH_URL) return PUBLISH_URL;
    try { return localStorage.getItem('hb-pub-url') || ''; } catch (e) { return ''; }
  };

  let fails = 0, lockUntil = 0;
  const sha = async s => {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  };
  const fail = () => { if (++fails >= 5) { lockUntil = Date.now() + 60000; fails = 0; } return false; };
  async function attempt(args) {
    if (Date.now() < lockUntil) return false;
    if ((args[0] || '').toLowerCase() !== 'pas' || !args[1] || !(window.crypto && crypto.subtle)) return fail();
    let h = '';
    try { h = await sha('hollowblade-mod:' + args[1]); } catch (e) { return fail(); }
    if (h !== HASH) return fail();
    fails = 0; open(); return true;
  }
  window.HBAdmin = { attempt };

  /* ---------- tiny DOM helper ---------- */
  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    kids.flat().forEach(c => { if (c != null) e.append(c); });
    return e;
  };

  /* ---------- state ---------- */
  let data, panel, content, status, tab = 'games', editing = null, dirty = false;
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
  const okUrl = u => /^https?:\/\/\S+$/i.test(u);
  const isData = u => /^data:image\//i.test(u || '');
  const saveDraft = () => {
    try { localStorage.setItem('hb-draft', JSON.stringify(data)); status.textContent = 'DRAFT SAVED. ONLY YOU SEE IT UNTIL YOU PUBLISH.'; }
    catch (e) { status.textContent = 'DRAFT TOO BIG FOR BROWSER STORAGE. USE SMALLER PICTURES.'; }
  };

  function open() {
    data = JSON.parse(JSON.stringify(window.SITE));
    if (window.HBTerm) window.HBTerm.hide();
    if (!panel) build();
    panel.hidden = false; HB.fx.ach(); HB.toast('MOD PANEL UNLOCKED');
    render();
  }
  function close() { panel.hidden = true; HB.fx.beep(2); if (dirty) location.reload(); }

  function build() {
    status = h('p', { class: 'adm-status' }, 'READY.');
    content = h('div', { class: 'adm-body' });
    const tabs = h('div', { class: 'adm-tabs', role: 'tablist' });
    ['games', 'devs', 'socials', 'site', 'publish'].forEach(t => tabs.append(h('button', { type: 'button', 'data-tab': t, onclick: () => { tab = t; editing = null; render(); } }, t.toUpperCase())));
    panel = h('div', { class: 'adm', hidden: true },
      h('div', { class: 'adm-box', role: 'dialog', 'aria-label': 'Mod panel' },
        h('div', { class: 'adm-bar' }, h('b', {}, 'MOD PANEL'), h('button', { type: 'button', class: 'tx', onclick: close, 'aria-label': 'Close mod panel' }, 'X')),
        tabs, status, content));
    document.body.appendChild(panel);
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  }

  function render() {
    [...panel.querySelectorAll('.adm-tabs button')].forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    content.textContent = '';
    if (editing) return content.append(editing());
    content.append({ games: gamesTab, devs: devsTab, socials: socialsTab, site: siteTab, publish: publishTab }[tab]());
  }
  const changed = () => { dirty = true; saveDraft(); render(); };

  /* ---------- pictures: pick a file, shrink it, keep it as a small data URL ---------- */
  function shrink(file, max = 320) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error('USE A PNG, JPG, WEBP OR GIF'));
      if (file.size > 12e6) return reject(new Error('FILE IS OVER 12 MB'));
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', .9));
      };
      img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('COULD NOT READ THAT IMAGE')); };
      img.src = u;
    });
  }

  /* ---------- generic pieces ---------- */
  const btn = (label, fn, cls = '') => h('button', { type: 'button', class: cls, onclick: fn }, label);
  function move(arr, i, d) {
    const j = i + d; if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; changed();
  }
  function del(arr, i) {
    return btn('DELETE', e => {
      const b = e.currentTarget;
      if (b.dataset.sure) { arr.splice(i, 1); changed(); return; }
      b.dataset.sure = '1'; b.textContent = 'SURE?'; HB.fx.err();
      setTimeout(() => { b.dataset.sure = ''; b.textContent = 'DELETE'; }, 2500);
    });
  }
  function list(arr, titleOf, subOf, onEdit, thumbOf) {
    const ul = h('ul', { class: 'adm-list' });
    if (!arr.length) ul.append(h('li', { class: 'adm-empty' }, 'NOTHING HERE YET.'));
    arr.forEach((it, i) => {
      const th = thumbOf && thumbOf(it);
      ul.append(h('li', {},
        th ? h('span', { class: 'adm-th', style: 'background-image:url("' + th.replace(/"/g, '%22') + '")' }) : null,
        h('div', { class: 'adm-t' }, h('b', {}, titleOf(it)), h('small', {}, subOf(it))),
        h('div', { class: 'adm-btns' }, btn('EDIT', () => onEdit(it, i)), btn('UP', () => move(arr, i, -1)), btn('DOWN', () => move(arr, i, 1)), del(arr, i))));
    });
    return ul;
  }

  // fields: text | area | check | select | image
  function editor(title, fields, vals, save) {
    const form = h('form', { class: 'adm-form' }, h('h4', {}, title));
    const get = {};
    fields.forEach(f => {
      const id = 'af-' + f.k;
      if (f.type === 'check') {
        const inp = h('input', { id, type: 'checkbox' }); inp.checked = !!vals[f.k];
        get[f.k] = () => inp.checked;
        form.append(h('label', { for: id, class: 'chk' }, inp, f.label));
      } else if (f.type === 'image') {
        let val = vals[f.k] || '', cleared = false;
        const thumb = h('span', { class: 'adm-prev' }), note = h('small', { class: 'adm-hint' });
        const paint = () => {
          thumb.style.backgroundImage = val ? 'url("' + val.replace(/"/g, '%22') + '")' : '';
          thumb.classList.toggle('empty', !val);
          note.textContent = val ? (isData(val) ? 'NEW PICTURE READY (SAVED WHEN YOU HIT SAVE)' : 'CURRENT PICTURE') : (f.fallback && !cleared ? f.fallback : 'NO PICTURE');
        };
        const file = h('input', { id, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
        file.addEventListener('change', async () => {
          const fl = file.files[0]; if (!fl) return;
          try { val = await shrink(fl, f.max || 320); cleared = false; paint(); HB.fx.buy(); }
          catch (e) { note.textContent = 'ERROR: ' + e.message; HB.fx.err(); }
          file.value = '';
        });
        const urlBox = h('input', { type: 'text', placeholder: 'OR PASTE A PICTURE LINK (https://...)', autocomplete: 'off' });
        urlBox.addEventListener('change', () => {
          const u = urlBox.value.trim();
          if (u && !okUrl(u)) { note.textContent = 'LINK MUST START WITH https://'; return HB.fx.err(); }
          if (u) { val = u; cleared = false; paint(); }
        });
        paint();
        get[f.k] = () => val; get[f.k + '_cleared'] = () => cleared;
        form.append(h('div', { class: 'adm-img' }, h('span', { class: 'adm-lbl' }, f.label), h('div', { class: 'adm-imgrow' }, thumb, h('div', { class: 'adm-imgctl' }, file, urlBox,
          btn('REMOVE PICTURE', () => { val = ''; cleared = true; paint(); }))), note));
      } else {
        let inp;
        if (f.type === 'area') inp = h('textarea', { id, rows: f.rows || 4, placeholder: f.ph || '' });
        else if (f.type === 'select') inp = h('select', { id }, f.options.map(o => h('option', { value: o }, o.toUpperCase())));
        else inp = h('input', { id, type: 'text', placeholder: f.ph || '', autocomplete: 'off' });
        inp.value = vals[f.k] != null && vals[f.k] !== '' ? vals[f.k] : (f.def || '');
        get[f.k] = () => inp.value.trim();
        form.append(h('label', { for: id }, f.label, inp));
      }
      if (f.hint) form.append(h('small', { class: 'adm-hint' }, f.hint));
    });
    const msg = h('p', { class: 'adm-msg' });
    form.append(msg, h('div', { class: 'adm-btns' }, h('button', { type: 'submit' }, 'SAVE'), btn('CANCEL', () => { editing = null; render(); })));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const out = {}; Object.keys(get).forEach(k => { out[k] = get[k](); });
      const err = save(out);
      if (err) { msg.textContent = err; HB.fx.err(); } else { HB.fx.buy(); editing = null; changed(); }
    });
    setTimeout(() => { const f = form.querySelector('input[type=text],textarea'); if (f) f.focus(); }, 30);
    return form;
  }
  const addBar = (label, fn) => h('div', { class: 'adm-add' }, btn(label, fn, 'big'));
  const parseLinks = text => {
    const out = [];
    for (const l of text.split('\n').map(x => x.trim()).filter(Boolean)) {
      const i = l.lastIndexOf('|');
      const label = i < 0 ? '' : l.slice(0, i).trim(), url = i < 0 ? '' : l.slice(i + 1).trim();
      if (!label || !okUrl(url)) return { err: 'BAD LINE: "' + l + '". USE  LABEL | https://link' };
      out.push({ label, url });
    }
    return { list: out };
  };
  const linksText = arr => (arr || []).map(b => b.label + ' | ' + b.url).join('\n');

  /* ---------- games ---------- */
  const gameFields = [
    { k: 'name', label: 'GAME NAME', ph: 'THE HOLLOW AFTER DARK' },
    { k: 'icon', label: 'GAME ICON', type: 'image', max: 256, hint: 'SHOWS ON THE GAMES PAGE BANNER AND AT THE TOP OF THE GAME PAGE.' },
    { k: 'tagline', label: 'BANNER SUBTITLE', ph: 'CLICK HERE', hint: 'THE SMALL TEXT UNDER THE NAME ON THE BANNER. EMPTY = CLICK HERE.' },
    { k: 'status', label: 'STATUS TAG', ph: 'IN DEVELOPMENT', hint: 'OPTIONAL. SHOWS UNDER THE TITLE, E.G. OUT NOW / COMING SOON.' },
    { k: 'info', label: 'INFO ROWS', type: 'area', rows: 4, ph: 'DEVELOPER: HOLLOWBLADE INDUSTRIES\nFIND IT AT: ITCH.IO', hint: 'ONE ROW PER LINE, LIKE  LABEL: VALUE' },
    { k: 'blurb', label: 'DESCRIPTION', type: 'area', rows: 5 },
    { k: 'buttons', label: 'BUTTONS', type: 'area', rows: 3, ph: 'PLAY ON ITCH.IO | https://yourname.itch.io/game', hint: 'ONE BUTTON PER LINE, LIKE  LABEL | https://link' }
  ];
  function parseGame(v, g) {
    if (!v.name) return 'GAME NAME IS REQUIRED.';
    const info = v.info.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const i = l.indexOf(':'); return i < 0 ? ['INFO', l] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    });
    const b = parseLinks(v.buttons); if (b.err) return b.err;
    Object.assign(g, { name: v.name, info, blurb: v.blurb, tagline: v.tagline, status: v.status, icon: v.icon, buttons: b.list });
  }
  function gamesTab() {
    const wrap = h('div', {});
    wrap.append(addBar('+ ADD GAME', () => {
      editing = () => editor('ADD A GAME', gameFields, {}, v => {
        const g = { id: '' };
        const err = parseGame(v, g); if (err) return err;
        let id = slug(v.name), n = 2; const base = id;
        while (data.games.some(x => x.id === id)) id = base + '-' + n++;
        g.id = id; data.games.push(g);
      });
      render();
    }), list(data.games, g => g.name, g => 'ID: ' + g.id + '  |  ' + g.buttons.length + ' BUTTON(S)', g => {
      editing = () => editor('EDIT: ' + g.name, gameFields, {
        name: g.name, blurb: g.blurb, icon: g.icon, tagline: g.tagline, status: g.status,
        info: g.info.map(p => p[0] + ': ' + p[1]).join('\n'), buttons: linksText(g.buttons)
      }, v => parseGame(v, g));
      render();
    }, g => g.icon));
    return wrap;
  }

  /* ---------- devs ---------- */
  const devFields = [
    { k: 'name', label: 'NAME', ph: 'TheCelticBhoys' },
    { k: 'role', label: 'ROLE / TITLE', ph: 'CODER & DESIGNER' },
    { k: 'avatar', label: 'PROFILE PICTURE', type: 'image', max: 320, fallback: 'USING THE ORIGINAL PICTURE. UPLOAD ONE TO REPLACE IT.', hint: 'UPLOAD A PNG/JPG, OR PASTE A LINK. IT GETS SHRUNK TO FIT.' },
    { k: 'shape', label: 'PICTURE SHAPE', type: 'select', options: ['circle', 'square', 'hex'], def: 'circle' },
    { k: 'bio', label: 'SHORT BIO (OPTIONAL)', type: 'area', rows: 3, ph: 'MAKES THE GEARS TURN.' },
    { k: 'badge', label: 'BADGE TEXT (OPTIONAL)', ph: 'MAIN DEV', hint: 'THE LABEL ON THE TOP OF THE CARD. EMPTY = NONE (OR MAIN DEV IF TICKED BELOW).' },
    { k: 'main', label: 'THIS IS THE MAIN DEV (BIGGER, GLOWING CARD)', type: 'check' },
    { k: 'url', label: 'MAIN PROFILE LINK', ph: 'https://discord.com/users/123...' },
    { k: 'links', label: 'MORE LINKS (OPTIONAL)', type: 'area', rows: 3, ph: 'YOUTUBE | https://youtube.com/@name\nGITHUB | https://github.com/name', hint: 'ONE PER LINE, LIKE  LABEL | https://link' }
  ];
  function parseDev(v, d) {
    if (!v.name) return 'NAME IS REQUIRED.';
    if (!okUrl(v.url)) return 'MAIN PROFILE LINK MUST START WITH https://';
    const l = parseLinks(v.links); if (l.err) return l.err;
    Object.assign(d, { name: v.name, role: v.role, bio: v.bio, badge: v.badge, shape: v.shape, main: v.main, url: v.url, links: l.list });
    if (v.avatar) { d.avatar = v.avatar; delete d.pfp; }
    else if (v.avatar_cleared) { delete d.avatar; delete d.pfp; }
  }
  function devsTab() {
    const wrap = h('div', {});
    wrap.append(addBar('+ ADD DEV', () => {
      editing = () => editor('ADD A DEV', devFields, {}, v => { const d = {}; const err = parseDev(v, d); if (err) return err; data.devs.push(d); });
      render();
    }), list(data.devs, d => d.name + (d.main ? '  (MAIN DEV)' : ''), d => d.role + (d.links && d.links.length ? '  |  ' + (d.links.length + 1) + ' LINKS' : ''), d => {
      editing = () => editor('EDIT: ' + d.name, devFields, { ...d, links: linksText(d.links), avatar: d.avatar || '' }, v => parseDev(v, d));
      render();
    }, d => d.avatar));
    return wrap;
  }

  /* ---------- socials ---------- */
  const socFields = [
    { k: 'label', label: 'BUTTON TEXT', ph: 'FOLLOW US ON YOUTUBE' },
    { k: 'handle', label: 'HANDLE / NAME', ph: '@HOLLOWBLADE' },
    { k: 'url', label: 'LINK', ph: 'https://www.youtube.com/@...' }
  ];
  function parseSoc(v, s) {
    if (!v.label) return 'BUTTON TEXT IS REQUIRED.';
    if (!okUrl(v.url)) return 'LINK MUST START WITH https://';
    Object.assign(s, { label: v.label, handle: v.handle, url: v.url });
  }
  function socialsTab() {
    const wrap = h('div', {});
    wrap.append(addBar('+ ADD SOCIAL LINK', () => {
      editing = () => editor('ADD A SOCIAL LINK', socFields, {}, v => { const s = {}; const err = parseSoc(v, s); if (err) return err; data.socials.push(s); });
      render();
    }), list(data.socials, s => s.label, s => s.handle + '  |  ' + s.url, s => {
      editing = () => editor('EDIT: ' + s.label, socFields, s, v => parseSoc(v, s));
      render();
    }));
    return wrap;
  }

  /* ---------- site text ---------- */
  function siteTab() {
    const fields = [
      { k: 'title', label: 'MAIN MENU TITLE', ph: 'HOLLOWBLADE INDUSTRIES' },
      { k: 'soon', label: 'GAMES PAGE HEADING', ph: 'MORE GAMES SOON' },
      { k: 'ticker', label: 'SCROLLING TICKER TEXT', type: 'area', rows: 3, hint: 'THE TEXT THAT SCROLLS ACROSS THE GAMES PAGE.' }
    ];
    return editor('SITE TEXT', fields, data.site, v => {
      if (!v.title) return 'MENU TITLE IS REQUIRED.';
      Object.assign(data.site, v);
    });
  }

  /* ---------- publish ---------- */
  const fileText = d => '// Site content (games, devs, socials). The mod panel can edit and publish this file.\nwindow.SITE_DATA = ' + JSON.stringify(d, null, 2) + ';\n';
  const b64 = bytes => { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };

  // turn GitHub's reply into plain words, including GitHub's own explanation
  async function explain(res) {
    let why = '';
    try { why = ((await res.json()).message || '').toUpperCase(); } catch (e) {}
    const status = res.status;
    let msg = 'GITHUB SAID ' + status + '.';
    if (status === 401) msg += ' THE TOKEN WAS REJECTED. IT IS WRONG OR EXPIRED. MAKE A NEW ONE.';
    else if (status === 403 || status === 404) msg += ' THE TOKEN CAN READ BUT NOT WRITE TO THIS REPO. EDIT THE TOKEN ON GITHUB: REPOSITORY ACCESS = ONLY SELECT REPOSITORIES > THIS REPO, AND CONTENTS = READ AND WRITE. (OR USE A CLASSIC TOKEN WITH public_repo TICKED.)';
    return msg + (why ? ' GITHUB SAYS: "' + why + '"' : '');
  }

  function draftButtons() {
    return h('div', { class: 'adm-btns' },
      btn('RELOAD TO PREVIEW DRAFT', () => location.reload()),
      btn('DOWNLOAD site-data.js', () => {
        const a = h('a', { href: URL.createObjectURL(new Blob([fileText(data)], { type: 'text/javascript' })), download: 'site-data.js' });
        document.body.appendChild(a); a.click(); a.remove();
      }),
      btn('DISCARD DRAFT', () => { try { localStorage.removeItem('hb-draft'); } catch (e) {} location.reload(); }));
  }

  const publishTab = () => (pubUrl() ? serviceTab(pubUrl()) : tokenTab());

  // publish through the service: the GitHub token stays on the service as a secret
  function serviceTab(url) {
    const pass = h('input', { type: 'password', id: 'pub-pass', name: 'pp-' + Math.random().toString(36).slice(2), autocomplete: 'new-password', 'data-lpignore': 'true', 'data-1p-ignore': 'true' });
    const msg = h('p', { class: 'adm-msg' });
    const go = btn('PUBLISH', async () => {
      const p = pass.value;
      if (!p) { msg.className = 'adm-msg'; msg.textContent = 'TYPE THE PUBLISH PASSPHRASE FIRST.'; return HB.fx.err(); }
      msg.className = 'adm-msg ok'; msg.textContent = 'PUBLISHING...';
      try {
        const pub = JSON.parse(JSON.stringify(data)), files = [], pics = [];
        pub.games.forEach(g => { if (isData(g.icon)) pics.push([g, 'icon', g.id + '-icon']); });
        pub.devs.forEach(d => { if (isData(d.avatar)) pics.push([d, 'avatar', slug(d.name) + '-pic']); });
        for (const [obj, key, base] of pics) {
          const m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(obj[key]);
          if (!m) throw new Error('A PICTURE IS NOT IN A SUPPORTED FORMAT');
          const path = 'uploads/' + base + '-' + (await sha(m[2])).slice(0, 8) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
          files.push({ path, content: m[2] }); obj[key] = path;
        }
        files.push({ path: 'site-data.js', content: b64(new TextEncoder().encode(fileText(pub))) });
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passphrase: p, files, message: 'Update site content via mod panel' }) });
        let j = {}; try { j = await res.json(); } catch (e) {}
        if (!res.ok || !j.ok) throw new Error(j.error || 'THE PUBLISH SERVICE SAID ' + res.status);
        pass.value = ''; data = pub; try { localStorage.removeItem('hb-draft'); } catch (e) {}
        msg.textContent = 'PUBLISHED! THE LIVE SITE UPDATES IN ABOUT A MINUTE (HARD-REFRESH WITH CTRL+SHIFT+R).';
        HB.fx.ach(); HB.toast('PUBLISHED');
      } catch (e) { msg.className = 'adm-msg'; msg.textContent = 'FAILED: ' + e.message; HB.fx.err(); }
    }, 'big');
    return h('div', { class: 'adm-form' },
      h('h4', {}, 'YOUR EDITS ARE A DRAFT'),
      h('p', { class: 'adm-note' }, 'ONLY YOU CAN SEE THEM, IN THIS BROWSER. PUBLISH TO MAKE THEM LIVE FOR EVERYONE.'),
      draftButtons(),
      h('h4', {}, 'PUBLISH'),
      h('p', { class: 'adm-note' }, 'THE GITHUB TOKEN IS KEPT SAFE ON THE PUBLISH SERVICE, NEVER IN THIS BROWSER. YOU ONLY NEED THE PUBLISH PASSPHRASE.'),
      h('label', { for: 'pub-pass' }, 'PUBLISH PASSPHRASE', pass),
      msg,
      h('div', { class: 'adm-btns' }, go, PUBLISH_URL ? null : btn('STOP USING THE SERVICE', () => { try { localStorage.removeItem('hb-pub-url'); } catch (e) {} render(); })));
  }

  function tokenTab() {
    const repo = h('input', { type: 'text', value: DEFAULT_REPO, autocomplete: 'off', spellcheck: 'false', id: 'pub-repo' });
    const token = h('input', { type: 'password', name: 'gh-token-' + Math.random().toString(36).slice(2), autocomplete: 'new-password', 'data-lpignore': 'true', 'data-1p-ignore': 'true', placeholder: 'github_pat_... or ghp_...', id: 'pub-token' });
    const msg = h('p', { class: 'adm-msg' });
    const go = btn('PUBLISH TO GITHUB', async () => {
      const r = repo.value.trim(), t = token.value.trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(r)) { msg.textContent = 'REPO MUST LOOK LIKE  owner/name'; return HB.fx.err(); }
      if (!t) { msg.textContent = 'PASTE YOUR GITHUB TOKEN FIRST.'; return HB.fx.err(); }
      msg.className = 'adm-msg ok'; msg.textContent = 'PUBLISHING...';
      const hdr = { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' };
      const put = async (path, text64, message) => {
        const api = 'https://api.github.com/repos/' + r + '/contents/' + path;
        let sh;
        const cur = await fetch(api, { headers: hdr });
        if (cur.ok) sh = (await cur.json()).sha; else if (cur.status !== 404) throw new Error(await explain(cur));
        const res = await fetch(api, { method: 'PUT', headers: { ...hdr, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, content: text64, sha: sh }) });
        if (!res.ok) throw new Error(await explain(res));
      };
      try {
        const pub = JSON.parse(JSON.stringify(data));
        // upload each new picture as its own file, then point the data at it
        const pics = [];
        pub.games.forEach(g => { if (isData(g.icon)) pics.push([g, 'icon', g.id + '-icon']); });
        pub.devs.forEach(d => { if (isData(d.avatar)) pics.push([d, 'avatar', slug(d.name) + '-pic']); });
        for (const [obj, key, base] of pics) {
          const m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(obj[key]);
          if (!m) throw new Error('A PICTURE IS NOT IN A SUPPORTED FORMAT');
          const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
          const path = 'uploads/' + base + '-' + (await sha(m[2])).slice(0, 8) + '.' + ext;
          msg.textContent = 'UPLOADING ' + path + '...';
          await put(path, m[2], 'Upload picture via mod panel');
          obj[key] = path;
        }
        msg.textContent = 'SAVING SITE CONTENT...';
        await put('site-data.js', b64(new TextEncoder().encode(fileText(pub))), 'Update site content via mod panel');
        token.value = '';
        data = pub; try { localStorage.removeItem('hb-draft'); } catch (e) {}
        msg.textContent = 'PUBLISHED! THE LIVE SITE UPDATES IN ABOUT A MINUTE (HARD-REFRESH WITH CTRL+SHIFT+R).';
        HB.fx.ach(); HB.toast('PUBLISHED');
      } catch (e) { msg.className = 'adm-msg'; msg.textContent = 'FAILED: ' + e.message; HB.fx.err(); }
    }, 'big');
    return h('div', { class: 'adm-form' },
      h('h4', {}, 'YOUR EDITS ARE A DRAFT'),
      h('p', { class: 'adm-note' }, 'ONLY YOU CAN SEE THEM, IN THIS BROWSER. TO MAKE THEM LIVE FOR EVERYONE, PUBLISH THEM TO GITHUB.'),
      draftButtons(),
      h('h4', {}, 'PUBLISH'),
      h('p', { class: 'adm-note' }, 'USE A GITHUB TOKEN THAT CAN EDIT THIS REPO. IT IS ONLY USED RIGHT NOW TO TALK TO GITHUB AND IS NEVER SAVED. UPLOADED PICTURES ARE ADDED TO AN uploads FOLDER IN THE REPO.'),
      h('label', { for: 'pub-repo' }, 'REPO', repo),
      h('label', { for: 'pub-token' }, 'GITHUB TOKEN (PASTE IT HERE - THE BOX SHOULD STAY DARK)', token),
      msg, h('div', { class: 'adm-btns' }, go),
      h('h4', {}, 'BETTER: USE A PUBLISH SERVICE'),
      h('p', { class: 'adm-note' }, 'IF YOU SET UP THE PUBLISH SERVICE (SEE worker/README.md IN THE REPO), PASTE ITS ADDRESS HERE. THEN NOBODY EVER NEEDS THE GITHUB TOKEN.'),
      (() => {
        const u = h('input', { type: 'text', placeholder: 'https://hollowblade-publish.yourname.workers.dev', autocomplete: 'off', spellcheck: 'false' });
        const m2 = h('p', { class: 'adm-msg' });
        return h('div', { class: 'adm-form' }, u, m2, btn('USE THIS SERVICE', () => {
          const v = u.value.trim();
          if (!/^https:\/\/[\w.-]+(\/\S*)?$/.test(v)) { m2.textContent = 'ADDRESS MUST START WITH https://'; return HB.fx.err(); }
          try { localStorage.setItem('hb-pub-url', v); } catch (e) {}
          HB.fx.buy(); render();
        }));
      })());
  }
})();
