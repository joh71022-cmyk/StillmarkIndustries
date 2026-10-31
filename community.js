/* The community for visitors: forum threads, replies, page comments and reviews.
   Everything people write is put on the page as plain text, never as HTML. */
(() => {
  if (window.HBCommunity) return;   // already loaded (the account button and the page can both ask for it)
  const API = (location.hostname === 'localhost' && localStorage.getItem('hb-api')) || window.HB_API || 'https://hollowblade-publish.joh71022.workers.dev';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  // a secret that only this browser knows: it is how you can delete your own posts later
  const owner = (() => { let t = store.get('hb-cowner'); if (!t || t.length < 20) { const a = new Uint8Array(18); (crypto.getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; })); t = Array.from(a, x => x.toString(36).padStart(2, '0')).join('').slice(0, 30); store.set('hb-cowner', t); } return t; })();
  const liked = new Set(JSON.parse(store.get('hb-cliked') || '[]'));
  const saveLiked = () => store.set('hb-cliked', JSON.stringify([...liked].slice(-500)));

  // who is logged in (kept in this browser only; the session token is a random secret from the service)
  let session = store.get('hb-session') || '', me = null;
  try { me = JSON.parse(store.get('hb-me') || 'null'); } catch (e) {}
  if (!session) me = null;
  const setSession = (tok, m) => { session = tok || ''; me = tok ? Object.assign({}, m, { av: avVer }) : null; store.set('hb-session', session); store.set('hb-me', JSON.stringify(me)); window.dispatchEvent(new Event('hb-account')); };
  let avVer = 1;

  async function call(path, body) {
    try {
      const res = body === undefined
        ? await fetch(API + path, session ? { headers: { 'X-Session': session } } : undefined)
        : await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, owner, token: session || undefined }) });
      const j = await res.json().catch(() => ({})); j.status = res.status;
      if (j.session === false && session) setSession('');           // the login expired: fall back to being a guest
      return j;
    } catch (e) { return { ok: false, error: 'THE COMMUNITY IS OFFLINE RIGHT NOW. TRY AGAIN LATER.' }; }
  }
  const withOwner = p => API && p + (p.includes('?') ? '&' : '?') + 'o=' + encodeURIComponent(owner);
  const ago = ts => {
    const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (s < 60) return 'JUST NOW'; if (s < 3600) return Math.floor(s / 60) + ' MIN AGO'; if (s < 86400) return Math.floor(s / 3600) + ' H AGO';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' D AGO'; return new Date(ts * 1000).toISOString().slice(0, 10);
  };
  const stars = (n, cls) => { const s = el('span', 'cm-stars' + (cls ? ' ' + cls : '')); for (let i = 1; i <= 5; i++) s.append(el('i', n >= i - .25 ? 'on' : '', '*')); s.setAttribute('aria-label', n + ' out of 5 stars'); return s; };
  const twoClick = (label, doIt, after) => {
    const b = el('button', 'cm-mini', label); b.type = 'button'; let armed = null;
    b.addEventListener('click', async () => {
      if (!armed) { b.textContent = 'SURE?'; armed = setTimeout(() => { armed = null; b.textContent = label; }, 2500); return; }
      clearTimeout(armed); armed = null; b.disabled = true; const r = await doIt(); b.disabled = false; b.textContent = r && r.ok ? 'DONE' : label; if (after) after(r);
    });
    return b;
  };

  // one message (a post, a reply, a comment)
  function card(p, kind, onChange) {
    const c = el('article', 'cm-post' + (p.staff ? ' staff' : ''));
    const head = el('header');
    if (p.av) { const im = el('img', 'cm-av'); im.alt = ''; im.width = 28; im.height = 28; im.loading = 'lazy'; im.src = API + '/c/avatar?u=' + p.uid + '&v=' + (me && me.id === p.uid ? avVer : 0); head.append(im); }
    head.append(el('b', 'cm-name', p.name)); if (p.staff) head.append(el('u', 'cm-badge', 'STAFF'));
    else if (p.role || p.devName) { (p.role ? p.role.split(',') : ['DEV']).forEach(r => head.append(el('u', 'cm-badge role', r))); if (p.devName) head.append(el('small', 'cm-devname', p.devName)); }
    else if (p.member) head.append(el('u', 'cm-badge dim', 'MEMBER'));
    if (p.rating) head.append(stars(p.rating)); head.append(el('small', '', ago(p.created))); c.append(head);
    c.append(el('p', 'cm-body', p.body));
    const foot = el('footer'), type = kind === 'thread' ? 'thread' : 'post';
    const like = el('button', 'cm-mini' + (liked.has(type + p.id) ? ' on' : ''), '+1  ' + p.ups); like.type = 'button';
    like.addEventListener('click', async () => { const r = await call('/c/react', { type, id: p.id }); if (r.ok) { liked.add(type + p.id); saveLiked(); p.ups = r.ups; like.textContent = '+1  ' + r.ups; like.classList.add('on'); } });
    foot.append(like);
    const rep = twoClick('REPORT', () => call('/c/report', { type, id: p.id, reason: 'reported from the page' }), r => { if (r.ok) rep.textContent = 'THANKS'; });
    foot.append(rep);
    if (p.mine) foot.append(twoClick('DELETE', () => call('/c/delete', { type, id: p.id }), r => { if (r.ok && onChange) onChange(); }));
    c.append(foot); return c;
  }

  // the writing form shared by threads, replies and comments
  function form(opts) {
    const f = el('form', 'cm-form'); f.setAttribute('novalidate', '');
    const note = el('p', 'cm-note');
    const name = el('input'); name.type = 'text'; name.maxLength = 24; name.placeholder = 'YOUR NAME'; name.autocomplete = 'nickname'; name.value = store.get('hb-cname') || ''; name.setAttribute('aria-label', 'Your name');
    const row = el('div', 'cm-row'); const as = el('small', 'cm-as');
    const sync = () => { name.hidden = !!me; as.hidden = !me; as.textContent = me ? 'POSTING AS ' + me.name : ''; };
    const onAcc = () => { if (f.isConnected) f.dataset.seen = '1'; else if (f.dataset.seen) return window.removeEventListener('hb-account', onAcc); sync(); };
    window.addEventListener('hb-account', onAcc); sync(); row.append(name, as);
    let board, title, rating = 0, starBox;
    if (opts.boards) { board = el('select'); opts.boards.forEach(b => board.append(Object.assign(el('option'), { value: b, textContent: b }))); board.value = opts.board || opts.boards[0]; board.setAttribute('aria-label', 'Board'); row.append(board); }
    f.append(row);
    if (opts.title) { title = el('input'); title.type = 'text'; title.maxLength = 100; title.placeholder = 'THREAD TITLE'; title.setAttribute('aria-label', 'Title'); f.append(title); }
    if (opts.ratings) {
      starBox = el('div', 'cm-pick'); starBox.append(el('small', '', 'YOUR RATING (OPTIONAL)'));
      for (let i = 1; i <= 5; i++) { const s = el('button', 'cm-star', '*'); s.type = 'button'; s.setAttribute('aria-label', i + ' stars'); s.addEventListener('click', () => { rating = rating === i ? 0 : i; [...starBox.querySelectorAll('.cm-star')].forEach((x, k) => x.classList.toggle('on', k < rating)); }); starBox.append(s); }
      f.append(starBox);
    }
    const text = el('textarea'); text.rows = opts.rows || 4; text.maxLength = 2000; text.placeholder = opts.placeholder || 'WRITE SOMETHING...'; text.setAttribute('aria-label', 'Message'); f.append(text);
    const hp = el('input'); hp.type = 'text'; hp.name = 'website'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true'); hp.className = 'cm-hp'; f.append(hp);   // robots fill this in, people never see it
    const go = el('button', 'cm-go', opts.button || 'POST'); go.type = 'submit'; const count = el('small', 'cm-count', '0 / 2000');
    text.addEventListener('input', () => { count.textContent = text.value.length + ' / 2000'; });
    f.append(el('div', 'cm-foot'), note); f.querySelector('.cm-foot').append(go, count);
    f.addEventListener('submit', async e => {
      e.preventDefault(); note.className = 'cm-note'; if (go.disabled) return;
      if (!me && !name.value.trim()) { note.textContent = 'TYPE A NAME FIRST, OR LOG IN.'; note.classList.add('err'); return; }
      go.disabled = true; note.textContent = 'SENDING...';
      if (!me) store.set('hb-cname', name.value.trim());
      const r = await opts.send({ name: me ? me.name : name.value.trim(), body: text.value, title: title && title.value, board: board && board.value, rating: rating || undefined, hp: hp.value });
      go.disabled = false;
      if (!r.ok) { note.textContent = r.error || 'SOMETHING WENT WRONG.'; note.classList.add('err'); return; }
      text.value = ''; count.textContent = '0 / 2000'; if (title) title.value = ''; rating = 0; if (starBox) starBox.querySelectorAll('.cm-star').forEach(x => x.classList.remove('on'));
      note.textContent = r.pending ? 'THANKS! A MODERATOR WILL LOOK AT IT BEFORE IT SHOWS.' : 'POSTED.'; opts.done && opts.done(r);
    });
    return f;
  }


  /* ---------- accounts: log in, create an account, profile ---------- */
  function modal(title, build) {
    const ov = el('div', 'cm-ov'), box = el('div', 'cm-modal'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title);
    const close = () => { ov.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    const bar = el('div', 'cm-mbar'); bar.append(el('b', '', title)); const x = el('button', 'cm-mini', 'X'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', close); bar.append(x);
    box.append(bar); build(box, close); ov.append(box);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', esc); document.body.append(ov);
    const first = box.querySelector('input,textarea,button.cm-go'); if (first) first.focus();
    return close;
  }
  const field = (label, input) => { const l = el('label', 'cm-field'); l.append(el('small', '', label), input); return l; };
  const input = (type, ph, max, ac) => { const i = el('input'); i.type = type; if (ph) i.placeholder = ph; if (max) i.maxLength = max; if (ac) i.autocomplete = ac; return i; };

  function authModal(start) {
    modal(start === 'new' ? 'CREATE AN ACCOUNT' : 'LOG IN', (box, close) => {
      let mode = start || 'login';
      const body = el('div'); box.append(body);
      const paint = () => {
        body.textContent = '';
        const tabs = el('div', 'cm-tabs'); [['login', 'LOG IN'], ['new', 'CREATE ACCOUNT']].forEach(([m, l]) => { const t = el('button', 'cm-tab' + (m === mode ? ' on' : ''), l); t.type = 'button'; t.addEventListener('click', () => { mode = m; const tt = box.querySelector('.cm-mbar b'); if (tt) tt.textContent = m === 'new' ? 'CREATE AN ACCOUNT' : 'LOG IN'; paint(); }); tabs.append(t); });
        const f = el('form', 'cm-form'); f.setAttribute('novalidate', ''); const note = el('p', 'cm-note');
        const name = input('text', '', 20, 'username'), pw = input('password', '', 100, mode === 'new' ? 'new-password' : 'current-password');
        f.append(field('NAME', name), field(mode === 'new' ? 'PASSWORD (8 OR MORE CHARACTERS)' : 'PASSWORD', pw));
        let contact, early, reason;
        if (mode === 'new') {
          contact = input('text', 'OPTIONAL: DISCORD NAME', 60); f.append(field('HOW THE TEAM CAN REACH YOU', contact));
          early = input('checkbox'); const l = el('label', 'cm-chk'); l.append(early, document.createTextNode(' I WANT TO BE AN EARLY ACCESS TESTER')); f.append(l);
          reason = el('textarea'); reason.rows = 3; reason.maxLength = 300; reason.placeholder = 'WHY DO YOU WANT EARLY ACCESS? (THE TEAM READS EVERY REQUEST)'; reason.hidden = true; reason.setAttribute('aria-label', 'Why you want early access'); f.append(reason);
          early.addEventListener('change', () => { reason.hidden = !early.checked; if (early.checked) reason.focus(); });
          f.append(el('p', 'cm-note', 'NO EMAIL NEEDED. YOUR NAME IS YOURS: NO ONE ELSE CAN POST WITH IT. IF YOU FORGET YOUR PASSWORD, ASK A MODERATOR TO RESET IT.'));
        }
        const go = el('button', 'cm-go', mode === 'new' ? 'CREATE ACCOUNT' : 'LOG IN'); go.type = 'submit'; f.append(go, note);
        f.addEventListener('submit', async e => {
          e.preventDefault(); note.className = 'cm-note'; go.disabled = true; note.textContent = 'ONE MOMENT...';
          const r = await call(mode === 'new' ? '/c/register' : '/c/login', mode === 'new' ? { name: name.value, password: pw.value, contact: contact.value, early: early.checked, earlyReason: reason.value } : { name: name.value, password: pw.value });
          go.disabled = false;
          if (!r.ok) { note.textContent = r.error || 'SOMETHING WENT WRONG.'; note.classList.add('err'); return; }
          verified = true; setSession(r.token, r.me); close(); notice(r.me);
        });
        body.append(tabs, f); name.focus();
      };
      paint();
    });
  }

  // a small square picture: centre crop, 96 pixels, so it stays a few kilobytes
  async function avatarFrom(file) {
    if (file.size > 30e6) throw new Error('THAT PICTURE IS TOO BIG');
    let src; try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { throw new Error('THIS BROWSER CANNOT OPEN THAT PICTURE. TRY A PNG OR JPG.'); }
    const side = Math.min(src.width, src.height), c = document.createElement('canvas'); c.width = c.height = 96;
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 96, 96); x.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, 96, 96);
    if (src.close) src.close();
    return c.toDataURL('image/jpeg', .85);
  }

  function profileModal() {
    modal('YOUR PROFILE', (box, close) => {
      const f = el('form', 'cm-form'); f.setAttribute('novalidate', ''); const note = el('p', 'cm-note');
      let av = null;   // null = unchanged, '' = remove, data address = new
      const prev = el('span', 'cm-avbig'); const paintAv = () => { prev.style.backgroundImage = av ? 'url("' + av + '")' : (av === null && me.avatar ? 'url("' + API + '/c/avatar?u=' + me.id + '&v=' + avVer + '")' : ''); };
      const file = input('file'); file.accept = 'image/*';
      file.addEventListener('change', async () => { const fl = file.files[0]; if (!fl) return; try { av = await avatarFrom(fl); paintAv(); note.textContent = ''; } catch (e) { note.textContent = e.message; note.classList.add('err'); } file.value = ''; });
      const rm = el('button', 'cm-mini', 'REMOVE PICTURE'); rm.type = 'button'; rm.addEventListener('click', () => { av = ''; paintAv(); });
      const row = el('div', 'cm-row'); row.append(prev, el('div'));
      row.lastChild.append(file, rm); paintAv();
      const bio = el('textarea'); bio.rows = 3; bio.maxLength = 200; bio.value = me.bio || ''; bio.setAttribute('aria-label', 'About me');
      const contact = input('text', 'OPTIONAL: DISCORD NAME', 60); contact.value = me.contact || '';
      const st = me.early || 'none', decided = st === 'approved';
      const early = input('checkbox'); early.checked = st === 'approved' || st === 'pending'; early.disabled = decided;
      const el1 = el('label', 'cm-chk'); el1.append(early, document.createTextNode(' I WANT TO BE AN EARLY ACCESS TESTER'));
      const reason = el('textarea'); reason.rows = 3; reason.maxLength = 300; reason.value = me.earlyReason || ''; reason.placeholder = 'WHY DO YOU WANT EARLY ACCESS?'; reason.hidden = !early.checked || decided; reason.setAttribute('aria-label', 'Why you want early access');
      early.addEventListener('change', () => { reason.hidden = !early.checked; });
      const estat = el('p', 'cm-note', { none: '', pending: 'YOUR EARLY ACCESS REQUEST IS WAITING FOR THE TEAM TO LOOK AT IT.', approved: 'YOU ARE IN EARLY ACCESS. THE TEAM MAY CONTACT YOU.', declined: 'YOUR EARLY ACCESS REQUEST WAS DENIED' + (me.earlyNote ? ': ' + me.earlyNote : '.') + ' YOU CAN TRY AGAIN: TICK THE BOX AND GIVE A NEW REASON.' }[st]);
      const save = el('button', 'cm-go', 'SAVE'); save.type = 'submit';
      f.append(el('p', 'cm-note', 'LOGGED IN AS ' + me.name), row, field('ABOUT ME', bio), field('HOW THE TEAM CAN REACH YOU (ONLY THE TEAM SEES THIS)', contact), el1, reason, estat, save, note);
      f.addEventListener('submit', async e => {
        e.preventDefault(); note.className = 'cm-note'; save.disabled = true; note.textContent = 'SAVING...';
        const r = await call('/c/profile', { bio: bio.value, contact: contact.value, ...(decided ? {} : { early: early.checked, earlyReason: reason.value }), ...(av !== null ? { avatar: av } : {}) });
        save.disabled = false;
        if (!r.ok) { note.textContent = r.error || 'COULD NOT SAVE.'; note.classList.add('err'); return; }
        avVer++; setSession(session, r.me); note.textContent = 'SAVED.'; av = null; paintAv();
      });
      // password and deleting need the current password again
      const pw = el('details', 'cm-rules'); pw.append(el('summary', '', 'CHANGE PASSWORD'));
      const cur = input('password', '', 100, 'current-password'), nw = input('password', '', 100, 'new-password'), pn = el('p', 'cm-note');
      const ch = el('button', 'cm-go', 'CHANGE PASSWORD'); ch.type = 'button';
      ch.addEventListener('click', async () => { pn.className = 'cm-note'; const r = await call('/c/password', { password: cur.value, newPassword: nw.value }); pn.textContent = r.ok ? 'PASSWORD CHANGED. YOUR OTHER DEVICES WERE LOGGED OUT.' : (r.error || 'FAILED'); if (!r.ok) pn.classList.add('err'); else { cur.value = nw.value = ''; } });
      pw.append(field('CURRENT PASSWORD', cur), field('NEW PASSWORD', nw), ch, pn);
      const rn = el('details', 'cm-rules'); rn.append(el('summary', '', 'CHANGE MY NAME'));
      const nn = input('text', '', 20, 'off'), rp = input('password', '', 100, 'current-password'), rnote = el('p', 'cm-note', 'YOU CAN CHANGE YOUR NAME ONCE A WEEK. YOUR OLD POSTS WILL SHOW THE NEW NAME.');
      const rbtn = el('button', 'cm-go', 'CHANGE NAME'); rbtn.type = 'button';
      rbtn.addEventListener('click', async () => { rnote.className = 'cm-note'; const r = await call('/c/rename', { newName: nn.value, password: rp.value }); if (r.ok) { avVer++; setSession(session, r.me); rnote.textContent = 'DONE. YOU ARE NOW ' + r.me.name + '.'; nn.value = rp.value = ''; } else { rnote.textContent = r.error || 'FAILED'; rnote.classList.add('err'); } });
      rn.append(field('NEW NAME', nn), field('YOUR PASSWORD', rp), rbtn, rnote);
      const dz = el('details', 'cm-rules'); dz.append(el('summary', '', 'DELETE MY ACCOUNT'));
      const dp = input('password', '', 100, 'current-password'), dn = el('p', 'cm-note', 'YOUR POSTS STAY, BUT THEY NO LONGER BELONG TO A MEMBER. THIS CANNOT BE UNDONE.');
      const dbtn = el('button', 'cm-mini', 'DELETE FOR GOOD'); dbtn.type = 'button';
      dbtn.addEventListener('click', async () => { const r = await call('/c/deleteaccount', { password: dp.value }); if (r.ok) { setSession(''); close(); } else { dn.textContent = r.error || 'FAILED'; dn.classList.add('err'); } });
      dz.append(field('YOUR PASSWORD', dp), dbtn, dn);
      box.append(f, rn, pw, dz);
    });
  }

  // tell people what the team decided, once, the next time they open the site
  function notice(m) {
    const key = 'hb-seen-' + m.id, now = m.early + '|' + (m.earlyNote || ''), seen = store.get(key);
    if (seen === now) return;
    if (m.early !== 'approved' && m.early !== 'declined') { if (seen) store.set(key, ''); return; }
    store.set(key, now);
    modal(m.early === 'approved' ? 'YOU ARE IN!' : 'EARLY ACCESS DENIED', (box, close) => {
      box.append(el('p', 'cm-note', m.early === 'approved' ? 'THE TEAM ACCEPTED YOUR EARLY ACCESS REQUEST. THANKS FOR HELPING TEST!' : 'THE TEAM DENIED YOUR EARLY ACCESS REQUEST' + (m.earlyNote ? ': ' + m.earlyNote : '.')));
      if (m.early === 'declined') box.append(el('p', 'cm-note', 'YOU CAN TRY AGAIN WITH A NEW REASON IN YOUR PROFILE SETTINGS.'));
      const ok = el('button', 'cm-go', 'OK'); ok.type = 'button'; ok.addEventListener('click', close); box.append(ok);
      if (m.early === 'declined') { const pr = el('button', 'cm-mini', 'OPEN PROFILE'); pr.type = 'button'; pr.addEventListener('click', () => { close(); profileModal(); }); box.append(pr); }
    });
  }
  let verified = false;
  const refreshMe = () => { if (verified || !session) return; verified = true; call('/c/me', {}).then(r => { if (!r.ok) return; if (JSON.stringify({ ...r.me, av: 0 }) !== JSON.stringify({ ...me, av: 0 })) setSession(session, r.me); notice(r.me); }); };
  function accountBar() {
    const bar = el('div', 'cm-acct');
    const paint = () => {
      bar.textContent = '';
      if (me) {
        if (me.avatar) { const im = el('img', 'cm-av'); im.alt = ''; im.width = 28; im.height = 28; im.src = API + '/c/avatar?u=' + me.id + '&v=' + avVer; bar.append(im); }
        bar.append(el('b', '', me.name), el('small', '', (me.role ? me.role.split(',').join(' / ') : 'MEMBER') + (me.devName ? '  |  ' + me.devName : '') + ({ approved: '  |  EARLY ACCESS', pending: '  |  EARLY ACCESS REQUESTED', declined: '  |  EARLY ACCESS DENIED' }[me.early] || '')));
        const pr = el('button', 'cm-mini', 'PROFILE'); pr.type = 'button'; pr.addEventListener('click', profileModal);
        const lo = el('button', 'cm-mini', 'LOG OUT'); lo.type = 'button'; lo.addEventListener('click', async () => { await call('/c/logout', {}); setSession(''); });
        bar.append(pr, lo);
      } else {
        bar.append(el('small', '', 'POSTING AS A GUEST. AN ACCOUNT SAVES YOUR NAME, LETS YOU ASK FOR EARLY ACCESS AND ADD A PICTURE.'));
        const a = el('button', 'cm-go', 'LOG IN'), n = el('button', 'cm-go', 'CREATE ACCOUNT'); a.type = n.type = 'button';
        a.addEventListener('click', () => authModal('login')); n.addEventListener('click', () => authModal('new')); bar.append(a, n);
      }
    };
    const onAcc = () => { if (bar.isConnected) bar.dataset.seen = '1'; else if (bar.dataset.seen) return window.removeEventListener('hb-account', onAcc); paint(); };
    window.addEventListener('hb-account', onAcc); paint();
    refreshMe();
    return bar;
  }

  /* ---------- comments (and reviews) on a page element ---------- */
  function mountComments(root, key, opts) {
    opts = opts || {}; root.textContent = '';
    const head = el('div', 'cm-head'), listBox = el('div', 'cm-list'), more = el('button', 'cm-more', 'LOAD MORE'); more.type = 'button'; more.hidden = true;
    const status = el('p', 'cm-note');
    root.append(accountBar(), head, status);
    let page = 0, formEl = null;
    window.addEventListener('hb-account', () => { if (root.isConnected) load(true); });
    async function load(reset) {
      if (reset) { page = 0; listBox.textContent = ''; }
      const r = await call(withOwner('/c/comments?key=' + encodeURIComponent(key) + '&page=' + page));
      if (!r.ok) { status.textContent = r.error || ''; status.className = 'cm-note err'; return; }
      status.textContent = '';
      head.textContent = ''; head.append(el('h4', 'bk-sub', (opts.title || 'COMMENTS') + '  (' + r.count + ')'));
      if (r.ratings && r.avg != null) { const a = el('div', 'cm-avg'); a.append(stars(r.avg), el('b', '', r.avg.toFixed(1) + ' / 5')); head.append(a); }
      if (!formEl) {
        if (r.locked) head.append(el('p', 'cm-note', 'COMMENTS ARE LOCKED.'));
        else if (r.open === false) head.append(el('p', 'cm-note', 'COMMENTS ARE CLOSED RIGHT NOW.'));
        else { formEl = form({ ratings: r.ratings, rows: 3, placeholder: r.ratings ? 'WRITE YOUR REVIEW...' : 'WRITE A COMMENT...', button: r.ratings ? 'POST REVIEW' : 'POST COMMENT', send: d => call('/c/comment', { key, ...d }), done: () => load(true) }); root.insertBefore(formEl, status); }
      }
      if (!listBox.isConnected) root.append(listBox, more);
      r.posts.forEach(p => listBox.append(card(p, 'comment', () => load(true))));
      if (!r.posts.length && page === 0) listBox.append(el('p', 'cm-empty', 'NO COMMENTS YET. BE THE FIRST.'));
      more.hidden = !r.more;
    }
    more.addEventListener('click', () => { page++; load(false); });
    load(true);
  }

  /* ---------- the forum ---------- */
  function mountForum(root, opts) {
    opts = opts || {}; root.textContent = ''; root.classList.add('cm-forum');
    const useHash = opts.hash !== false;
    let boot = null, board = '', sort = 'active', q = '', page = 0, timer = null;
    const body = el('div'); root.append(body);
    const setHash = v => { if (useHash) { try { history.replaceState(null, '', v ? '#t=' + v : location.pathname + location.search); } catch (e) {} } };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    let cur = 0;
    window.addEventListener('hb-account', () => { if (root.isConnected) (cur ? open(cur) : showList(true)); });

    async function showList(reset) {
      stop(); setHash(''); if (reset) page = 0; cur = 0;
      body.textContent = ''; body.append(accountBar());
      if (!boot) { boot = await call('/c/boot'); if (!boot.ok) { body.append(el('p', 'cm-note err', boot.error || 'THE FORUM IS OFFLINE.')); return; } }
      if (!boot.forum) { body.append(el('p', 'cm-note', 'THE FORUM IS CLOSED RIGHT NOW.')); return; }
      if (boot.rules) { const d = el('details', 'cm-rules'); d.append(el('summary', '', 'COMMUNITY RULES'), el('p', '', boot.rules)); body.append(d); }
      const bar = el('div', 'cm-bar');
      const tabs = el('div', 'cm-tabs');
      ['', ...boot.boards].forEach(b => { const t = el('button', 'cm-tab' + (b === board ? ' on' : ''), b || 'ALL'); t.type = 'button'; t.addEventListener('click', () => { board = b; showList(true); }); tabs.append(t); });
      const sel = el('select'); [['active', 'RECENTLY ACTIVE'], ['new', 'NEWEST'], ['top', 'MOST LIKED']].forEach(([v, l]) => sel.append(Object.assign(el('option'), { value: v, textContent: l }))); sel.value = sort; sel.setAttribute('aria-label', 'Sort'); sel.addEventListener('change', () => { sort = sel.value; showList(true); });
      const search = el('input'); search.type = 'search'; search.placeholder = 'SEARCH'; search.value = q; search.setAttribute('aria-label', 'Search threads'); search.addEventListener('keydown', e => { if (e.key === 'Enter') { q = search.value.trim(); showList(true); } });
      const newBtn = el('button', 'cm-go', '+ NEW THREAD'); newBtn.type = 'button';
      bar.append(tabs, el('div', 'cm-tools')); bar.lastChild.append(search, sel, newBtn); body.append(bar);
      const formBox = el('div', 'cm-newbox'); formBox.hidden = true;
      formBox.append(form({ boards: boot.boards, board, title: true, rows: 5, placeholder: 'WHAT DO YOU WANT TO TALK ABOUT?', button: 'POST THREAD', send: d => call('/c/thread', d), done: r => { if (r.id) open(r.id); else showList(true); } }));
      newBtn.addEventListener('click', () => { formBox.hidden = !formBox.hidden; });
      body.append(formBox);
      const list = el('div', 'cm-threads'); body.append(list);
      const more = el('button', 'cm-more', 'LOAD MORE'); more.type = 'button'; more.hidden = true; body.append(more);
      async function fill() {
        const r = await call('/c/threads?page=' + page + '&sort=' + sort + (board ? '&board=' + encodeURIComponent(board) : '') + (q ? '&q=' + encodeURIComponent(q) : ''));
        if (!r.ok) { list.append(el('p', 'cm-note err', r.error)); return; }
        r.threads.forEach(t => {
          const row = el('button', 'cm-thread'); row.type = 'button';
          const top = el('span', 'cm-ttitle'); if (t.pinned) top.append(el('u', 'cm-badge', 'PINNED')); if (t.locked) top.append(el('u', 'cm-badge dim', 'LOCKED')); top.append(document.createTextNode(t.title));
          const meta = el('small', '', [t.board, 'BY ' + t.name + (t.staff ? ' (STAFF)' : ''), t.replies + (t.replies === 1 ? ' REPLY' : ' REPLIES'), '+' + t.ups, ago(t.last)].join('   |   '));
          row.append(top, meta); row.addEventListener('click', () => open(t.id)); list.append(row);
        });
        if (!r.threads.length && page === 0) list.append(el('p', 'cm-empty', q ? 'NOTHING MATCHES THAT SEARCH.' : 'NO THREADS YET. START ONE!'));
        more.hidden = !r.more;
      }
      more.addEventListener('click', () => { page++; fill(); });
      fill();
    }

    async function open(id) {
      stop(); setHash(id); cur = id; body.textContent = '';
      const back = el('button', 'cm-back', '< ALL THREADS'); back.type = 'button'; back.addEventListener('click', () => showList(true)); body.append(back, accountBar());
      const view = el('div'); body.append(view);
      let pages = 1;
      async function paint() {
        const parts = []; let r = null;
        for (let p = 0; p < pages; p++) { r = await call(withOwner('/c/thread?id=' + id + '&page=' + p)); if (!r.ok) { view.textContent = ''; view.append(el('p', 'cm-note err', r.error || 'COULD NOT LOAD THAT THREAD.')); return; } parts.push(r); }
        const th = parts[0].thread; view.textContent = '';
        const t = el('h3', 'cm-title'); if (th.pinned) t.append(el('u', 'cm-badge', 'PINNED')); if (th.locked) t.append(el('u', 'cm-badge dim', 'LOCKED')); t.append(document.createTextNode(th.title)); view.append(t, el('small', 'cm-board', th.board));
        view.append(card({ ...th, id: th.id, body: th.body, mine: th.mine }, 'thread', () => showList(true)));
        const replies = el('div', 'cm-list'); view.append(el('h4', 'bk-sub', 'REPLIES')); view.append(replies);
        const all = parts.flatMap(x => x.posts); all.forEach(p => replies.append(card(p, 'reply', paint)));
        if (!all.length) replies.append(el('p', 'cm-empty', 'NO REPLIES YET.'));
        if (r.more) { const m = el('button', 'cm-more', 'LOAD MORE REPLIES'); m.type = 'button'; m.addEventListener('click', () => { pages++; paint(); }); view.append(m); }
        if (th.locked) view.append(el('p', 'cm-note', 'THIS THREAD IS LOCKED. NO NEW REPLIES.'));
        else if (!view._form) { view._form = form({ rows: 3, placeholder: 'WRITE A REPLY...', button: 'POST REPLY', send: d => call('/c/reply', { thread: id, ...d }), done: () => paint() }); }
        if (!th.locked) view.append(view._form);
      }
      await paint();
      timer = setInterval(() => { if (document.visibilityState === 'visible' && !view.querySelector('textarea:focus')) paint(); }, 25000);
    }

    if (useHash) window.addEventListener('hashchange', () => { const m = /^#t=(\d+)$/.exec(location.hash); if (m) open(+m[1]); else showList(true); });
    const start = useHash && /^#t=(\d+)$/.exec(location.hash);
    if (start) open(+start[1]); else showList(true);
  }

  /* ---------- the newest threads, as a small list ---------- */
  async function mountLatest(root, opts) {
    opts = opts || {}; root.textContent = '';
    const r = await call('/c/threads?sort=new&page=0');
    if (!r.ok || !r.threads.length) { root.append(el('p', 'cm-empty', r.ok ? 'NO THREADS YET.' : (r.error || ''))); return; }
    r.threads.slice(0, opts.count || 5).forEach(t => {
      const a = el('a', 'cm-thread'); a.href = 'community.html#t=' + t.id; a.setAttribute('data-go', '');
      a.append(el('span', 'cm-ttitle', t.title), el('small', '', t.board + '   |   BY ' + t.name + '   |   ' + t.replies + (t.replies === 1 ? ' REPLY' : ' REPLIES') + '   |   ' + ago(t.last)));
      root.append(a);
    });
  }

  if (session) setTimeout(refreshMe, 600);   // on every page: refresh who we are and tell about a decision
  window.HBCommunity = { mountComments, mountForum, mountLatest, account: () => (session && me ? profileModal() : authModal('login')), login: () => authModal('login'), signup: () => authModal('new'), profile: () => (session && me ? profileModal() : authModal('login')) };
})();
