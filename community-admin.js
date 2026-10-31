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
      root.append(h('p', { class: 'adm-note' }, `${st.threads} THREADS  |  ${st.posts} POSTS  |  ${st.pending} WAITING  |  ${st.hidden} HIDDEN  |  ${st.bans} BANNED  |  ${st.users} MEMBERS  |  ${st.early} IN EARLY ACCESS  |  ${st.earlyWaiting} WAITING FOR AN ANSWER`));
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

    // a label shown next to their posts (DEV, OWNER, ...) and, optionally, which person from the dev list they are
    function roleEditor(u) {
      const presets = ['', 'OWNER', 'DEV', 'WEBSITE MAKER', 'MODERATOR', 'TESTER', 'ARTIST'];
      const pick = h('select', { 'aria-label': 'Role' }, ...presets.map(r => h('option', { value: r }, r || 'NO ROLE')), h('option', { value: '__custom' }, 'OTHER (TYPE BELOW)'));
      const custom = h('input', { type: 'text', maxlength: 24, placeholder: 'CUSTOM ROLE NAME' });
      if (presets.includes(u.role)) pick.value = u.role; else { pick.value = '__custom'; custom.value = u.role; }
      const dev = h('select', { 'aria-label': 'Which developer' }, h('option', { value: '' }, 'NOT LINKED TO A DEV'), ...devs.map(d => h('option', { value: d.name }, d.name + (d.role ? '  (' + d.role + ')' : ''))));
      if (u.dev_name && !devs.some(d => d.name === u.dev_name)) dev.append(h('option', { value: u.dev_name }, u.dev_name));
      dev.value = u.dev_name || '';
      pick.addEventListener('change', () => { if (pick.value === 'DEV' && !dev.value && devs.length === 1) dev.value = devs[0].name; });
      return h('div', {}, h('p', { class: 'adm-note' }, 'THE ROLE SHOWS AS A BADGE ON THEIR COMMENTS AND FORUM POSTS. LINKING A DEV ALSO SHOWS THAT DEV NAME.'), pick, custom, dev,
        btn('SAVE ROLE', async () => { const role = pick.value === '__custom' ? custom.value : pick.value; const x = await call({ action: 'c_user_set', id: u.id, role, devName: dev.value }); say(x.ok ? 'ROLE SAVED.' : (x.error || 'FAILED')); paint(); }));
    }

    async function membersView(body) {
      const q = h('input', { type: 'text', placeholder: 'SEARCH NAME OR CONTACT', value: mq });
      const ec = h('select', { 'aria-label': 'Filter' }, ...[['any', 'EVERYONE'], ['pending', 'EARLY ACCESS: REQUESTS WAITING'], ['approved', 'EARLY ACCESS: APPROVED'], ['declined', 'EARLY ACCESS: DENIED'], ['roles', 'PEOPLE WITH A ROLE']].map(([v, l]) => h('option', { value: v }, l))); ec.value = mearly;
      q.addEventListener('keydown', e => { if (e.key === 'Enter') { mq = q.value.trim(); page = 0; paint(); } });
      ec.addEventListener('change', () => { mearly = ec.value; page = 0; paint(); });
      body.append(h('div', { class: 'adm-btns' }, q, ec));
      const r = await call({ action: 'c_users', page, q: mq, early: mearly === 'any' ? '' : mearly });
      if (!r.ok) return body.append(h('p', { class: 'adm-note' }, r.error || 'FAILED'));
      if (!r.users.length) body.append(h('p', { class: 'adm-note' }, 'NO MEMBERS FOUND.'));
      body.append(btn('DOWNLOAD THIS LIST (CSV)', () => {
        const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"';
        const rows = [['name', 'contact', 'early_access', 'reason', 'joined', 'posts', 'banned'], ...r.users.map(u => [u.name, u.contact, u.early, u.early_reason, new Date(u.created * 1000).toISOString().slice(0, 10), u.posts, u.banned ? 'yes' : 'no'])];
        const a = h('a', { href: URL.createObjectURL(new Blob([rows.map(x => x.map(esc).join(',')).join('\n')], { type: 'text/csv' })), download: 'members.csv' }); document.body.append(a); a.click(); a.remove();
      }));
      r.users.forEach(u => {
        const act = (label, extra, ask) => btn(label, async () => { if (ask && !confirm(ask)) return; const x = await call({ action: 'c_user_set', id: u.id, ...extra }); say(x.ok ? 'DONE.' : (x.error || 'FAILED')); paint(); });
        body.append(h('div', { class: 'adm-row' },
          h('b', {}, u.name + (u.early === 'approved' ? '  [EARLY ACCESS]' : u.early === 'pending' ? '  [WANTS EARLY ACCESS]' : u.early === 'declined' ? '  [EARLY ACCESS DENIED]' : '') + (u.banned ? '  [BANNED]' : '')),
          h('small', { class: 'adm-hint' }, 'JOINED ' + new Date(u.created * 1000).toISOString().slice(0, 10) + '  |  ' + u.posts + ' POSTS  |  CONTACT: ' + (u.contact || 'NONE')),
          u.early_reason ? h('p', { class: 'adm-note' }, 'WHY: ' + u.early_reason) : null,
          u.bio ? h('p', { class: 'adm-note' }, u.bio) : null,
          h('details', { class: 'adm-role' }, h('summary', {}, 'ROLE: ' + (u.role || 'NONE') + (u.dev_name ? '  |  LINKED TO ' + u.dev_name : '')), roleEditor(u)),
          h('div', { class: 'adm-btns' },
            u.early !== 'approved' && u.early !== 'none' ? act('APPROVE EARLY ACCESS', { early: 'approved' }) : null,
            u.early === 'pending' ? btn('DENY', async () => { const note = prompt('Optional message they will see (why it was denied):', ''); if (note === null) return; const x = await call({ action: 'c_user_set', id: u.id, early: 'declined', earlyNote: note }); say(x.ok ? 'DENIED. THEY WILL SEE IT NEXT TIME THEY OPEN THE SITE.' : (x.error || 'FAILED')); paint(); }) : null,
            u.early === 'approved' || u.early === 'declined' ? act('RESET EARLY ACCESS', { early: 'none' }) : null,
            act(u.banned ? 'UNBAN' : 'BAN', { banned: !u.banned }, u.banned ? '' : 'Ban ' + u.name + '? They are logged out and cannot post.'),
            btn('NEW PASSWORD', async () => { if (!confirm('Make a new password for ' + u.name + '? Their old one stops working and they are logged out.')) return; const x = await call({ action: 'c_user_reset', id: u.id }); if (x.ok) prompt('Give this to ' + u.name + ' (it is shown only once):', x.password); else say(x.error || 'FAILED'); }),
            btn('DELETE ACCOUNT', async () => { if (!confirm('Delete the account ' + u.name + ' for good? Their posts stay.')) return; const x = await call({ action: 'c_user_delete', id: u.id }); say(x.ok ? 'DELETED.' : (x.error || 'FAILED')); paint(); }))));
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
