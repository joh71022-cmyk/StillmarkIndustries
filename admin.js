/* Mod panel. Opened from the terminal; edits are saved as a draft in THIS browser until published. */
(() => {
  const HB = window.HB;
  if (!HB) return;
  // only a one-way hash lives here, never the passcode itself
  const HASH = 'a2e2d932cf3c0de3835bd597a8f45f48247e4789c89e233e6ad72bd0c9fc03eb';
  const DEFAULT_REPO = 'joh71022-cmyk/HOLLOWBLADEINDUSTRIES';

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
  let data, panel, content, status, tab = 'games', editing = null;
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
  const okUrl = u => /^https?:\/\/\S+$/i.test(u);
  const saveDraft = () => {
    try { localStorage.setItem('hb-draft', JSON.stringify(data)); status.textContent = 'DRAFT SAVED. ONLY YOU SEE IT UNTIL YOU PUBLISH.'; }
    catch (e) { status.textContent = 'COULD NOT SAVE DRAFT (BROWSER STORAGE BLOCKED).'; }
  };

  function open() {
    data = JSON.parse(JSON.stringify(window.SITE));
    if (window.HBTerm) window.HBTerm.hide();
    if (!panel) build();
    panel.hidden = false; HB.fx.ach(); HB.toast('MOD PANEL UNLOCKED');
    render();
  }
  function close() { panel.hidden = true; HB.fx.beep(2); if (dirty) location.reload(); }
  let dirty = false;

  function build() {
    status = h('p', { class: 'adm-status' }, 'READY.');
    content = h('div', { class: 'adm-body' });
    const tabs = h('div', { class: 'adm-tabs', role: 'tablist' });
    ['games', 'devs', 'socials', 'publish'].forEach(t => tabs.append(h('button', { type: 'button', 'data-tab': t, onclick: () => { tab = t; editing = null; render(); } }, t.toUpperCase())));
    panel = h('div', { class: 'adm', hidden: true },
      h('div', { class: 'adm-box', role: 'dialog', 'aria-label': 'Mod panel' },
        h('div', { class: 'adm-bar' }, h('b', {}, 'MOD PANEL'), h('button', { type: 'button', class: 'tx', onclick: close, 'aria-label': 'Close mod panel' }, 'X')),
        tabs, status, content));
    document.body.appendChild(panel);
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  }

  function render() {
    $$tabs().forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    content.textContent = '';
    if (editing) return content.append(editing());
    content.append({ games: gamesTab, devs: devsTab, socials: socialsTab, publish: publishTab }[tab]());
  }
  const $$tabs = () => [...panel.querySelectorAll('.adm-tabs button')];
  const changed = () => { dirty = true; saveDraft(); render(); };

  /* ---------- generic pieces ---------- */
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
  const btn = (label, fn, cls = '') => h('button', { type: 'button', class: cls, onclick: fn }, label);
  function list(arr, titleOf, subOf, onEdit) {
    const ul = h('ul', { class: 'adm-list' });
    if (!arr.length) ul.append(h('li', { class: 'adm-empty' }, 'NOTHING HERE YET.'));
    arr.forEach((it, i) => ul.append(h('li', {},
      h('div', { class: 'adm-t' }, h('b', {}, titleOf(it)), h('small', {}, subOf(it))),
      h('div', { class: 'adm-btns' }, btn('EDIT', () => onEdit(it, i)), btn('UP', () => move(arr, i, -1)), btn('DOWN', () => move(arr, i, 1)), del(arr, i)))));
    return ul;
  }
  function editor(title, fields, vals, save) {
    const form = h('form', { class: 'adm-form' }, h('h4', {}, title));
    const inputs = {};
    fields.forEach(f => {
      const id = 'af-' + f.k;
      let inp;
      if (f.type === 'area') inp = h('textarea', { id, rows: f.rows || 4, placeholder: f.ph || '' });
      else if (f.type === 'check') inp = h('input', { id, type: 'checkbox' });
      else inp = h('input', { id, type: 'text', placeholder: f.ph || '', autocomplete: 'off' });
      if (f.type === 'check') inp.checked = !!vals[f.k]; else inp.value = vals[f.k] || '';
      inputs[f.k] = inp;
      form.append(f.type === 'check' ? h('label', { for: id, class: 'chk' }, inp, f.label) : h('label', { for: id }, f.label, inp));
      if (f.hint) form.append(h('small', { class: 'adm-hint' }, f.hint));
    });
    const msg = h('p', { class: 'adm-msg' });
    form.append(msg, h('div', { class: 'adm-btns' }, h('button', { type: 'submit' }, 'SAVE'), btn('CANCEL', () => { editing = null; render(); })));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const out = {};
      fields.forEach(f => { out[f.k] = f.type === 'check' ? inputs[f.k].checked : inputs[f.k].value.trim(); });
      const err = save(out);
      if (err) { msg.textContent = err; HB.fx.err(); } else { HB.fx.buy(); editing = null; changed(); }
    });
    setTimeout(() => { const f = form.querySelector('input,textarea'); if (f) f.focus(); }, 30);
    return form;
  }
  const addBar = (label, fn) => h('div', { class: 'adm-add' }, btn(label, fn, 'big'));

  /* ---------- games ---------- */
  const gameFields = [
    { k: 'name', label: 'GAME NAME', ph: 'THE HOLLOW AFTER DARK' },
    { k: 'info', label: 'INFO ROWS', type: 'area', rows: 4, ph: 'DEVELOPER: HOLLOWBLADE INDUSTRIES\nFIND IT AT: ITCH.IO', hint: 'ONE ROW PER LINE, LIKE  LABEL: VALUE' },
    { k: 'blurb', label: 'DESCRIPTION', type: 'area', rows: 4 },
    { k: 'buttons', label: 'BUTTONS', type: 'area', rows: 3, ph: 'PLAY ON ITCH.IO | https://yourname.itch.io/game', hint: 'ONE BUTTON PER LINE, LIKE  LABEL | https://link' }
  ];
  function parseGame(v, g) {
    if (!v.name) return 'GAME NAME IS REQUIRED.';
    const info = v.info.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const i = l.indexOf(':'); return i < 0 ? ['INFO', l] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    });
    const buttons = [];
    for (const l of v.buttons.split('\n').map(x => x.trim()).filter(Boolean)) {
      const i = l.lastIndexOf('|');
      const label = i < 0 ? '' : l.slice(0, i).trim(), url = i < 0 ? '' : l.slice(i + 1).trim();
      if (!label || !okUrl(url)) return 'BAD BUTTON LINE: "' + l + '". USE  LABEL | https://link';
      buttons.push({ label, url });
    }
    g.name = v.name; g.info = info; g.blurb = v.blurb; g.buttons = buttons;
  }
  function gamesTab() {
    const wrap = h('div', {});
    wrap.append(addBar('+ ADD GAME', () => {
      editing = () => editor('ADD A GAME', gameFields, {}, v => {
        const g = { id: '', name: '', info: [], blurb: '', buttons: [] };
        const err = parseGame(v, g); if (err) return err;
        let id = slug(v.name), n = 2; const base = id;
        while (data.games.some(x => x.id === id)) id = base + '-' + n++;
        g.id = id; data.games.push(g);
      });
      render();
    }), list(data.games, g => g.name, g => 'ID: ' + g.id + '  |  ' + g.buttons.length + ' BUTTON(S)', g => {
      editing = () => editor('EDIT: ' + g.name, gameFields, {
        name: g.name, blurb: g.blurb,
        info: g.info.map(p => p[0] + ': ' + p[1]).join('\n'),
        buttons: g.buttons.map(b => b.label + ' | ' + b.url).join('\n')
      }, v => parseGame(v, g));
      render();
    }));
    return wrap;
  }

  /* ---------- devs ---------- */
  const devFields = [
    { k: 'name', label: 'NAME', ph: 'TheCelticBhoys' },
    { k: 'role', label: 'ROLE', ph: 'CODER & DESIGNER' },
    { k: 'url', label: 'PROFILE LINK', ph: 'https://discord.com/users/123...' },
    { k: 'avatar', label: 'PICTURE LINK (OPTIONAL)', ph: 'https://.../picture.png', hint: 'LEAVE EMPTY TO SHOW THEIR FIRST LETTER' },
    { k: 'main', label: 'THIS IS THE MAIN DEV', type: 'check' }
  ];
  function parseDev(v, d) {
    if (!v.name) return 'NAME IS REQUIRED.';
    if (!okUrl(v.url)) return 'PROFILE LINK MUST START WITH https://';
    if (v.avatar && !okUrl(v.avatar)) return 'PICTURE LINK MUST START WITH https://';
    d.name = v.name; d.role = v.role; d.url = v.url; d.main = v.main;
    if (v.avatar !== (d.avatar || '')) { d.avatar = v.avatar; delete d.pfp; }
  }
  function devsTab() {
    const wrap = h('div', {});
    wrap.append(addBar('+ ADD DEV', () => {
      editing = () => editor('ADD A DEV', devFields, {}, v => { const d = {}; const err = parseDev(v, d); if (err) return err; data.devs.push(d); });
      render();
    }), list(data.devs, d => d.name + (d.main ? '  (MAIN DEV)' : ''), d => d.role, d => {
      editing = () => editor('EDIT: ' + d.name, devFields, d, v => parseDev(v, d));
      render();
    }));
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
    s.label = v.label; s.handle = v.handle; s.url = v.url;
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

  /* ---------- publish ---------- */
  const fileText = () => '// Site content (games, devs, socials). The mod panel can edit and publish this file.\nwindow.SITE_DATA = ' + JSON.stringify(data, null, 2) + ';\n';
  function publishTab() {
    const repo = h('input', { type: 'text', value: DEFAULT_REPO, autocomplete: 'off', spellcheck: 'false', id: 'pub-repo' });
    const token = h('input', { type: 'password', autocomplete: 'off', placeholder: 'github_pat_...', id: 'pub-token' });
    const msg = h('p', { class: 'adm-msg' });
    const go = btn('PUBLISH TO GITHUB', async () => {
      const r = repo.value.trim(), t = token.value.trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(r)) { msg.textContent = 'REPO MUST LOOK LIKE  owner/name'; return HB.fx.err(); }
      if (!t) { msg.textContent = 'PASTE YOUR GITHUB TOKEN FIRST.'; return HB.fx.err(); }
      msg.textContent = 'PUBLISHING...';
      try {
        const api = 'https://api.github.com/repos/' + r + '/contents/site-data.js';
        const hdr = { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' };
        let sha;
        const cur = await fetch(api, { headers: hdr });
        if (cur.ok) sha = (await cur.json()).sha;
        else if (cur.status !== 404) throw new Error('GITHUB SAID ' + cur.status + (cur.status === 401 ? ' (TOKEN REJECTED)' : ''));
        const bytes = new TextEncoder().encode(fileText());
        let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
        const res = await fetch(api, {
          method: 'PUT', headers: { ...hdr, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Update site content via mod panel', content: btoa(bin), sha })
        });
        if (!res.ok) throw new Error('GITHUB SAID ' + res.status + (res.status === 403 || res.status === 404 ? ' (TOKEN NEEDS CONTENTS: READ & WRITE ON THIS REPO)' : ''));
        token.value = '';
        try { localStorage.removeItem('hb-draft'); } catch (e) {}
        msg.textContent = 'PUBLISHED! THE LIVE SITE UPDATES IN ABOUT A MINUTE.';
        HB.fx.ach(); HB.toast('PUBLISHED');
      } catch (e) { msg.textContent = 'FAILED: ' + e.message; HB.fx.err(); }
    }, 'big');
    return h('div', { class: 'adm-form' },
      h('h4', {}, 'YOUR EDITS ARE A DRAFT'),
      h('p', { class: 'adm-note' }, 'ONLY YOU CAN SEE THEM, IN THIS BROWSER. TO MAKE THEM LIVE FOR EVERYONE, PUBLISH THEM TO GITHUB.'),
      h('div', { class: 'adm-btns' },
        btn('RELOAD TO PREVIEW DRAFT', () => location.reload()),
        btn('DOWNLOAD site-data.js', () => {
          const a = h('a', { href: URL.createObjectURL(new Blob([fileText()], { type: 'text/javascript' })), download: 'site-data.js' });
          document.body.appendChild(a); a.click(); a.remove();
        }),
        btn('DISCARD DRAFT', () => { try { localStorage.removeItem('hb-draft'); } catch (e) {} location.reload(); })),
      h('h4', {}, 'PUBLISH'),
      h('p', { class: 'adm-note' }, 'CREATE A FINE-GRAINED GITHUB TOKEN FOR THIS ONE REPO WITH "CONTENTS: READ AND WRITE". IT IS ONLY USED RIGHT NOW TO TALK TO GITHUB AND IS NEVER SAVED.'),
      h('label', { for: 'pub-repo' }, 'REPO', repo),
      h('label', { for: 'pub-token' }, 'GITHUB TOKEN', token),
      msg, h('div', { class: 'adm-btns' }, go));
  }
})();
