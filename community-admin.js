/* The COMMUNITY tab of the mod panel: settings, moderation, bans and posting as staff. */
(() => {
  window.HBCommAdmin = function (kit) {
    const { h, btn, call, status } = kit, only = kit.only === 'accounts', devs = kit.devs || [];
    const root = h('div', { class: 'adm-comm' });
    let view = 'recent', page = 0, settings = null, mq = '', mearly = 'any';
    const say = t => { status.textContent = t; };
    const lines = a => (a || []).join('\n'), unlines = s => String(s).split('\n').map(x => x.trim()).filter(Boolean);

    async function paint() {
      root.textContent = '';
      const st = await call({ action: 'c_stats' });
      if (!st.ok) { root.append(h('p', { class: 'adm-note' }, st.error || 'THE COMMUNITY IS NOT SET UP YET. SEE worker/README.md (D1 DATABASE).')); return; }
      if (only) view = 'members';
      if (!only) root.append(h('p', { class: 'adm-note' }, `${st.threads} THREADS  |  ${st.posts} POSTS  |  ${st.pending} WAITING  |  ${st.hidden} HIDDEN  |  ${st.bans} BANNED  |  ${st.users} MEMBERS  |  ${st.early} IN EARLY ACCESS  |  ${st.earlyWaiting} WAITING FOR AN ANSWER`));
      const tabs = h('div', { class: 'adm-btns' });
      (only ? [] : [['recent', 'RECENT'], ['pending', 'WAITING'], ['reports', 'REPORTED'], ['hidden', 'HIDDEN'], ['staff', 'POST AS STAFF'], ['settings', 'SETTINGS'], ['bans', 'BANS']]).forEach(([v, l]) => tabs.append(btn(l + (v === view ? ' *' : ''), () => { view = v; page = 0; paint(); })));
      root.append(tabs);
      const body = h('div'); root.append(body);
      if (view === 'settings') return settingsView(body);
      if (view === 'members') return membersView(body);
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

    /* ---------- the member list: grouped, with one-click roles and early access answers ---------- */
    const ROLES = ['OWNER', 'DEV', 'WEBSITE MAKER', 'MODERATOR', 'TESTER', 'ARTIST'];
    const api = String(kit.api || '').replace(/\/$/, '');
    let searchTimer = null;

    async function membersView(body) {
      const r = await call({ action: 'c_users', page, q: mq, early: mearly === 'any' ? '' : mearly });
      if (!r.ok) return body.append(h('p', { class: 'adm-note' }, r.error || 'FAILED'));

      // categories with counts
      const cats = h('div', { class: 'mem-tabs' });
      [['any', 'EVERYONE', r.total], ['pending', 'EARLY ACCESS REQUESTS', r.waiting], ['approved', 'IN EARLY ACCESS', r.early], ['roles', 'TEAM (ROLES)', r.team], ['declined', 'DENIED', r.declined], ['banned', 'BANNED', r.banned]].forEach(([v, label, n]) => {
        const b = h('button', { type: 'button', class: 'mem-tab' + (mearly === v ? ' on' : '') + (v === 'pending' && n ? ' hot' : '') }, label + '  ' + n);
        b.addEventListener('click', () => { mearly = v; page = 0; paint(); }); cats.append(b);
      });
      const q = h('input', { type: 'search', class: 'mem-search', placeholder: 'FIND A MEMBER BY NAME', value: mq, 'aria-label': 'Search members' });
      q.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { mq = q.value.trim(); page = 0; paint().then(() => { const n = root.querySelector('.mem-search'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 350); });
      body.append(q, cats);
      if (!r.users.length) body.append(h('p', { class: 'adm-note' }, mq ? 'NO ONE MATCHES THAT SEARCH.' : 'NO ONE IN THIS GROUP YET.'));

      const groupOf = u => (u.banned ? 'BANNED' : (u.role || u.dev_name) ? 'TEAM' : u.early === 'pending' ? 'EARLY ACCESS REQUESTS' : u.early === 'approved' ? 'IN EARLY ACCESS' : 'MEMBERS');
      let last = '';
      r.users.forEach(u => {
        const g = groupOf(u);
        if (g !== last) { body.append(h('h4', { class: 'mem-group' }, g)); last = g; }
        body.append(memberCard(u));
      });
      const nav = h('div', { class: 'adm-btns' });
      if (page > 0) nav.append(btn('< PREVIOUS', () => { page--; paint(); }));
      if (r.more) nav.append(btn('NEXT >', () => { page++; paint(); }));
      body.append(nav);
    }

    function memberCard(u) {
      const set = async (extra, okMsg) => { const x = await call({ action: 'c_user_set', id: u.id, ...extra }); say(x.ok ? okMsg : (x.error || 'FAILED')); paint(); };
      const avatar = u.av && api ? h('img', { class: 'mem-av', src: api + '/c/avatar?u=' + u.id, alt: '' }) : h('span', { class: 'mem-av ltr' }, (u.name[0] || '?').toUpperCase());
      const chips = h('span', { class: 'mem-chips' });
      if (u.role) chips.append(h('u', { class: 'mem-chip role' }, u.role));
      if (u.dev_name) chips.append(h('u', { class: 'mem-chip' }, 'DEV: ' + u.dev_name));
      if (u.early === 'approved') chips.append(h('u', { class: 'mem-chip ok' }, 'EARLY ACCESS'));
      if (u.early === 'pending') chips.append(h('u', { class: 'mem-chip hot' }, 'WANTS EARLY ACCESS'));
      if (u.early === 'declined') chips.append(h('u', { class: 'mem-chip' }, 'DENIED'));
      if (u.banned) chips.append(h('u', { class: 'mem-chip bad' }, 'BANNED'));
      const card = h('div', { class: 'mem-card' + (u.early === 'pending' ? ' hot' : '') },
        h('div', { class: 'mem-head' }, avatar, h('div', { class: 'mem-who' }, h('b', {}, u.name), h('small', {}, 'JOINED ' + new Date(u.created * 1000).toISOString().slice(0, 10) + '  |  ' + u.posts + (u.posts === 1 ? ' POST' : ' POSTS') + (u.contact ? '  |  ' + u.contact : ''))), chips));
      if (u.early_reason && u.early === 'pending') card.append(h('p', { class: 'mem-why' }, 'WHY: ' + u.early_reason));
      if (u.early === 'pending') card.append(h('div', { class: 'adm-btns' },
        btn('ACCEPT', () => set({ early: 'approved' }, 'ACCEPTED INTO EARLY ACCESS.'), 'big'),
        btn('DENY', () => { const note = prompt('Optional message they will see (why it was denied):', ''); if (note !== null) set({ early: 'declined', earlyNote: note }, 'DENIED. THEY WILL SEE IT NEXT TIME THEY OPEN THE SITE.'); })));

      // everything else is behind one click
      const more = h('details', { class: 'mem-more' }, h('summary', {}, 'ROLE AND MORE'));
      const row = (label, ...kids) => h('div', { class: 'mem-row' }, h('small', {}, label), h('div', { class: 'mem-pick' }, ...kids));
      const chip = (label, on, fn) => { const c = h('button', { type: 'button', class: 'mem-chipbtn' + (on ? ' on' : '') }, label); c.addEventListener('click', fn); return c; };
      const customRole = !ROLES.includes(u.role) && u.role;
      more.append(row('GIVE THEM A ROLE (SHOWN ON THEIR POSTS)',
        chip('NONE', !u.role, () => set({ role: '' }, 'ROLE REMOVED.')),
        ...ROLES.map(r => chip(r, u.role === r, () => set({ role: r }, r + ' GIVEN TO ' + u.name.toUpperCase() + '.'))),
        chip(customRole ? u.role : 'OTHER...', !!customRole, () => { const v = prompt('Type the role name (24 letters at most):', u.role || ''); if (v !== null) set({ role: v }, 'ROLE SAVED.'); })));
      if (devs.length) more.append(row('WHICH DEV IS THIS PERSON? (OPTIONAL)',
        chip('NOT A DEV', !u.dev_name, () => set({ devName: '' }, 'DEV LINK REMOVED.')),
        ...devs.map(d => chip(d.name, u.dev_name === d.name, () => set({ devName: d.name, ...(u.role ? {} : { role: 'DEV' }) }, 'LINKED TO ' + d.name.toUpperCase() + '.')))));
      more.append(row('EARLY ACCESS',
        chip('NO', u.early === 'none', () => set({ early: 'none' }, 'EARLY ACCESS CLEARED.')),
        chip('IN', u.early === 'approved', () => set({ early: 'approved' }, 'ACCEPTED INTO EARLY ACCESS.')),
        chip('DENIED', u.early === 'declined', () => { const note = prompt('Optional message they will see:', ''); if (note !== null) set({ early: 'declined', earlyNote: note }, 'DENIED.'); })));
      if (u.early_reason && u.early !== 'pending') more.append(h('p', { class: 'mem-why' }, 'THEIR REASON: ' + u.early_reason));
      if (u.bio) more.append(h('p', { class: 'mem-why' }, 'ABOUT: ' + u.bio));
      more.append(h('div', { class: 'adm-btns' },
        btn(u.banned ? 'UNBAN' : 'BAN', () => { if (u.banned || confirm('Ban ' + u.name + '? They are logged out and cannot post.')) set({ banned: !u.banned }, u.banned ? 'UNBANNED.' : 'BANNED.'); }),
        btn('NEW PASSWORD', async () => { if (!confirm('Make a new password for ' + u.name + '? Their old one stops working and they are logged out.')) return; const x = await call({ action: 'c_user_reset', id: u.id }); if (x.ok) prompt('Give this to ' + u.name + ' (it is shown only once):', x.password); else say(x.error || 'FAILED'); }),
        btn('DELETE ACCOUNT', async () => { if (!confirm('Delete the account ' + u.name + ' for good? Their posts stay.')) return; const x = await call({ action: 'c_user_delete', id: u.id }); say(x.ok ? 'DELETED.' : (x.error || 'FAILED')); paint(); })));
      card.append(more);
      return card;
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
