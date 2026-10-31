/* The COMMUNITY tab of the mod panel: settings, moderation, bans and posting as staff. */
(() => {
  window.HBCommAdmin = function (kit) {
    const { h, btn, call, status } = kit;
    const root = h('div', { class: 'adm-comm' });
    let view = 'recent', page = 0, settings = null;
    const say = t => { status.textContent = t; };
    const lines = a => (a || []).join('\n'), unlines = s => String(s).split('\n').map(x => x.trim()).filter(Boolean);

    async function paint() {
      root.textContent = '';
      const st = await call({ action: 'c_stats' });
      if (!st.ok) { root.append(h('p', { class: 'adm-note' }, st.error || 'THE COMMUNITY IS NOT SET UP YET. SEE worker/README.md (D1 DATABASE).')); return; }
      root.append(h('p', { class: 'adm-note' }, `${st.threads} THREADS  |  ${st.posts} POSTS  |  ${st.pending} WAITING  |  ${st.hidden} HIDDEN  |  ${st.bans} BANNED`));
      const tabs = h('div', { class: 'adm-btns' });
      [['recent', 'RECENT'], ['pending', 'WAITING'], ['reports', 'REPORTED'], ['hidden', 'HIDDEN'], ['staff', 'POST AS STAFF'], ['settings', 'SETTINGS'], ['bans', 'BANS']].forEach(([v, l]) => tabs.append(btn(l + (v === view ? ' *' : ''), () => { view = v; page = 0; paint(); })));
      root.append(tabs);
      const body = h('div'); root.append(body);
      if (view === 'settings') return settingsView(body);
      if (view === 'staff') return staffView(body);
      if (view === 'bans') return bansView(body);
      return listView(body);
    }

    async function listView(body) {
      const r = await call({ action: 'c_list', view, page });
      if (!r.ok) return body.append(h('p', { class: 'adm-note' }, r.error || 'FAILED'));
      if (!r.items.length) body.append(h('p', { class: 'adm-note' }, 'NOTHING HERE.'));
      r.items.forEach(it => {
        const act = (label, extra, ask) => btn(label, async () => { if (ask && !confirm(ask)) return; const x = await call({ action: extra.del ? 'c_delete' : 'c_set', type: it.type === 'thread' ? 'thread' : 'post', id: it.id, ...extra }); say(x.ok ? 'DONE.' : (x.error || 'FAILED')); paint(); });
        const row = h('div', { class: 'adm-row' },
          h('b', {}, `${it.type.toUpperCase()}  ${it.name}${it.staff ? ' (STAFF)' : ''}  [${it.status}]${it.reports ? '  REPORTS: ' + it.reports : ''}`),
          h('small', { class: 'adm-hint' }, `${it.title ? it.title + ' - ' : ''}${it.board || ''}  |  USER ${String(it.ip || '').slice(0, 10)}  |  ${new Date(it.created * 1000).toLocaleString()}`),
          h('p', { class: 'adm-note' }, it.body),
          h('div', { class: 'adm-btns' },
            it.status !== 'ok' ? act('APPROVE', { status: 'ok' }) : act('HIDE', { status: 'hidden' }),
            it.type === 'thread' ? act(it.pinned ? 'UNPIN' : 'PIN', { pinned: !it.pinned }) : null,
            it.type === 'thread' ? act(it.locked ? 'UNLOCK' : 'LOCK', { locked: !it.locked }) : null,
            act('DELETE', { del: true }, 'Delete this for good?'),
            it.ip ? btn('BAN USER', async () => { const why = prompt('Reason (optional)') ; if (why === null) return; const x = await call({ action: 'c_ban', ip: it.ip, reason: why }); say(x.ok ? 'BANNED.' : (x.error || 'FAILED')); }) : null));
        body.append(row);
      });
      const nav = h('div', { class: 'adm-btns' });
      if (page > 0) nav.append(btn('< NEWER', () => { page--; paint(); }));
      if (r.more) nav.append(btn('OLDER >', () => { page++; paint(); }));
      body.append(nav);
    }

    function staffView(body) {
      const kind = h('select', {}, ...[['thread', 'NEW THREAD'], ['reply', 'REPLY TO A THREAD (NEEDS ID)']].map(([v, l]) => h('option', { value: v }, l)));
      const name = h('input', { type: 'text', maxlength: 24, value: 'STAFF', 'aria-label': 'Name' });
      const title = h('input', { type: 'text', maxlength: 100, placeholder: 'TITLE (THREADS ONLY)' }), tid = h('input', { type: 'text', placeholder: 'THREAD NUMBER (REPLIES ONLY)' });
      const text = h('textarea', { rows: 5, maxlength: 2000, placeholder: 'MESSAGE' });
      body.append(h('p', { class: 'adm-note' }, 'POSTS SHOW A STAFF BADGE. NO RATE LIMITS APPLY.'), kind, name, title, tid, text, btn('POST', async () => {
        const r = await call({ action: 'c_staff', kind: kind.value, name: name.value, title: title.value, thread: +tid.value || 0, body: text.value });
        say(r.ok ? 'POSTED.' : (r.error || 'FAILED')); if (r.ok) text.value = '';
      }, 'big'));
    }

    async function bansView(body) {
      const r = await call({ action: 'c_bans' });
      if (!r.ok) return body.append(h('p', { class: 'adm-note' }, r.error || 'FAILED'));
      if (!r.bans.length) body.append(h('p', { class: 'adm-note' }, 'NO ONE IS BANNED.'));
      r.bans.forEach(b => body.append(h('div', { class: 'adm-row' }, h('b', {}, b.ip.slice(0, 10)), h('small', { class: 'adm-hint' }, b.reason || ''), btn('UNBAN', async () => { await call({ action: 'c_unban', ip: b.ip }); paint(); }))));
    }

    async function settingsView(body) {
      if (!settings) { const r = await call({ action: 'c_settings_get' }); if (!r.ok) return body.append(h('p', { class: 'adm-note' }, r.error || 'FAILED')); settings = r.settings; }
      const s = settings;
      const chk = (k, label) => { const i = h('input', { type: 'checkbox' }); i.checked = !!s[k]; i.addEventListener('change', () => { s[k] = i.checked; }); return h('label', { class: 'adm-check' }, i, ' ' + label); };
      const num = (k, label) => { const i = h('input', { type: 'number', value: s[k] }); i.addEventListener('input', () => { s[k] = +i.value; }); return h('label', {}, label, i); };
      const area = (k, label, rows, asList) => { const i = h('textarea', { rows }); i.value = asList ? lines(s[k]) : s[k]; i.addEventListener('input', () => { s[k] = asList ? unlines(i.value) : i.value; }); return h('label', {}, label, i); };
      body.append(chk('forum', 'FORUM IS OPEN'), chk('comments', 'COMMENTS ARE OPEN'), chk('approval', 'APPROVE EVERY POST BEFORE IT SHOWS'),
        area('boards', 'BOARDS (ONE PER LINE)', 4, true), area('rules', 'RULES (SHOWN ON THE FORUM)', 4),
        area('blocked', 'BLOCKED WORDS (ONE PER LINE)', 4, true), area('reserved', 'NAMES NO ONE CAN USE (ONE PER LINE)', 4, true),
        num('postSeconds', 'SECONDS BETWEEN POSTS'), num('perHour', 'POSTS PER HOUR PER PERSON'), num('maxLinks', 'LINKS ALLOWED PER POST (0 = NONE)'), num('autoHide', 'HIDE A POST AFTER THIS MANY REPORTS'),
        btn('SAVE SETTINGS', async () => { const r = await call({ action: 'c_settings_set', settings: s }); if (r.ok) settings = r.settings; say(r.ok ? 'SETTINGS SAVED.' : (r.error || 'FAILED')); paint(); }, 'big'));
    }

    paint();
    return root;
  };
})();
