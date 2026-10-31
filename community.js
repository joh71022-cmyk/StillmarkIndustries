/* The community for visitors: forum threads, replies, page comments and reviews.
   Everything people write is put on the page as plain text, never as HTML. */
(() => {
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

  async function call(path, body) {
    try {
      const res = body === undefined ? await fetch(API + path) : await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, owner }) });
      const j = await res.json().catch(() => ({})); j.status = res.status; return j;
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
    const head = el('header'); head.append(el('b', 'cm-name', p.name)); if (p.staff) head.append(el('u', 'cm-badge', 'STAFF'));
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
    const row = el('div', 'cm-row'); row.append(name);
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
      if (!name.value.trim()) { note.textContent = 'TYPE A NAME FIRST.'; note.classList.add('err'); return; }
      go.disabled = true; note.textContent = 'SENDING...';
      store.set('hb-cname', name.value.trim());
      const r = await opts.send({ name: name.value.trim(), body: text.value, title: title && title.value, board: board && board.value, rating: rating || undefined, hp: hp.value });
      go.disabled = false;
      if (!r.ok) { note.textContent = r.error || 'SOMETHING WENT WRONG.'; note.classList.add('err'); return; }
      text.value = ''; count.textContent = '0 / 2000'; if (title) title.value = ''; rating = 0; if (starBox) starBox.querySelectorAll('.cm-star').forEach(x => x.classList.remove('on'));
      note.textContent = r.pending ? 'THANKS! A MODERATOR WILL LOOK AT IT BEFORE IT SHOWS.' : 'POSTED.'; opts.done && opts.done(r);
    });
    return f;
  }

  /* ---------- comments (and reviews) on a page element ---------- */
  function mountComments(root, key, opts) {
    opts = opts || {}; root.textContent = '';
    const head = el('div', 'cm-head'), listBox = el('div', 'cm-list'), more = el('button', 'cm-more', 'LOAD MORE'); more.type = 'button'; more.hidden = true;
    const status = el('p', 'cm-note');
    root.append(head, status);
    let page = 0, formEl = null;
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

    async function showList(reset) {
      stop(); setHash(''); if (reset) page = 0;
      body.textContent = '';
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
      stop(); setHash(id); body.textContent = '';
      const back = el('button', 'cm-back', '< ALL THREADS'); back.type = 'button'; back.addEventListener('click', () => showList(true)); body.append(back);
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

  window.HBCommunity = { mountComments, mountForum, mountLatest };
})();
