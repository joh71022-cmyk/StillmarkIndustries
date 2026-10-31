/* Builds the games, devs and socials from site-data.js. Runs before script.js. */
(() => {
  const str = v => (typeof v === 'string' ? v : '');
  const num = v => (Number.isFinite(+v) ? +v : 0);
  const safeUrl = u => (/^(https?:\/\/|[a-z0-9_.\/-]+\.html|#)/i.test(str(u)) ? str(u) : '#');
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  const clean = d => ({
    games: (d.games || []).map(g => ({
      id: str(g.id) || 'game', name: str(g.name), blurb: str(g.blurb),
      info: (g.info || []).map(p => [str(p[0]), str(p[1])]),
      buttons: (g.buttons || []).map(b => ({ label: str(b.label), url: safeUrl(b.url) }))
    })),
    devs: (d.devs || []).map(v => ({
      name: str(v.name), role: str(v.role), url: safeUrl(v.url), main: !!v.main, avatar: v.avatar ? safeUrl(v.avatar) : '',
      pfp: v.pfp ? { cx: num(v.pfp.cx), cy: num(v.pfp.cy), r: num(v.pfp.r) || 36 } : null
    })),
    socials: (d.socials || []).map(s => ({ label: str(s.label), handle: str(s.handle), url: safeUrl(s.url) }))
  });

  // the draft only exists in the browser of whoever edited it with the mod panel
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem('hb-draft') || 'null'); } catch (e) {}
  window.SITE = clean(draft || window.SITE_DATA || {});
  window.SITE_IS_DRAFT = !!draft;
  const S = window.SITE;

  const BANNER_SVG = '<svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="4,4 996,4 982,50 996,96 4,96 18,50"/></svg>';
  const CTA_SVG = '<svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><polygon points="2,30 30,3 170,3 198,30 170,57 30,57"/></svg>';

  /* ---------- games page ---------- */
  const list = document.getElementById('game-list');
  if (list) {
    if (!S.games.length) list.appendChild(el('p', 'sub', 'NO GAMES YET'));
    S.games.forEach((g, i) => {
      const a = el('a', 'banner rise');
      a.href = 'game.html?id=' + encodeURIComponent(g.id);
      a.setAttribute('data-go', ''); a.style.setProperty('--r', i);
      a.innerHTML = BANNER_SVG;
      const sp = el('span');
      sp.append(el('i', '', '['), document.createTextNode(g.name), el('i', '', ']'), document.createElement('br'), document.createTextNode('CLICK HERE'));
      const em = el('em'); em.setAttribute('aria-hidden', 'true');
      a.append(sp, em); list.appendChild(a);
    });
  }

  const grid = document.getElementById('dev-grid');
  if (grid) S.devs.forEach(d => {
    const a = el('a', 'dev' + (d.main ? ' main' : ''));
    a.href = d.url; a.target = '_blank'; a.rel = 'noopener';
    if (d.main) a.appendChild(el('u', 'crown', 'MAIN DEV'));
    let av;
    if (d.pfp) {
      av = el('b', 'av pfp'); av.setAttribute('aria-hidden', 'true');
      av.style.cssText = '--cx:' + d.pfp.cx + ';--cy:' + d.pfp.cy + ';--r:' + d.pfp.r;
    } else if (d.avatar) {
      av = el('b', 'av img'); av.setAttribute('aria-hidden', 'true');
      av.style.backgroundImage = 'url("' + d.avatar.replace(/"/g, '%22') + '")';
    } else {
      av = el('b', 'av ltr', (d.name[0] || '?').toUpperCase()); av.setAttribute('aria-hidden', 'true');
    }
    a.append(av, el('strong', '', d.name), el('small', '', d.role), el('em', '', /discord/i.test(d.url) ? 'DISCORD >' : 'LINK >'));
    grid.appendChild(a);
  });

  const soc = document.getElementById('socials');
  if (soc) S.socials.forEach(s => {
    const a = el('a', 'social'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-ext', '');
    a.append(el('span', '', s.label), el('b', '', s.handle)); soc.appendChild(a);
  });

  /* ---------- single game page ---------- */
  const host = document.getElementById('game');
  if (host) {
    const id = new URLSearchParams(location.search).get('id');
    const idx = S.games.findIndex(g => g.id === id);
    const g = S.games[idx];
    if (!g) {
      document.title = 'Game not found - Hollowblade Industries';
      host.append(el('p', 'kicker', '// 404'), el('h1', 'gtitle', 'GAME NOT FOUND'));
      const back = el('a', 'cta', ''); back.href = 'games.html'; back.setAttribute('data-go', ''); back.innerHTML = CTA_SVG;
      back.appendChild(el('span', '', 'BACK TO GAMES')); host.appendChild(back);
    } else {
      document.title = g.name + ' - Hollowblade Industries';
      const gw = el('div', 'gear-wrap hero-gear flash'); gw.setAttribute('aria-hidden', 'true');
      gw.innerHTML = '<svg class="gear main" data-teeth="14" data-outer="100" data-root="84" data-ring="64" data-hub="16" data-spokes="7" style="--t:20s"></svg>';
      const k = el('p', 'kicker rise', '// GAME FILE ' + String(idx + 1).padStart(2, '0')); k.style.setProperty('--r', 0);
      const t = el('h1', 'gtitle rise', g.name); t.style.setProperty('--r', 1);
      const info = el('section', 'info rise'); info.style.setProperty('--r', 2); info.setAttribute('aria-label', 'Game info');
      if (g.info.length) {
        const dl = el('dl');
        g.info.forEach(([a, b]) => { const row = el('div'); row.append(el('dt', '', a), el('dd', '', b)); dl.appendChild(row); });
        info.appendChild(dl);
      }
      info.appendChild(el('p', 'blurb', g.blurb || 'MORE INFO COMING SOON.'));
      const row = el('div', 'cta-row');
      g.buttons.forEach((b, i) => {
        const a = el('a', 'cta rise'); a.style.setProperty('--r', 3 + i);
        a.href = b.url; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-ext', '');
        a.innerHTML = CTA_SVG; a.appendChild(el('span', '', b.label)); row.appendChild(a);
      });
      host.append(gw, k, t, info, row);
    }
  }

  if (window.SITE_IS_DRAFT) {
    const tag = el('div', 'draft-tag', 'DRAFT PREVIEW - ONLY YOU SEE THIS');
    document.body.appendChild(tag);
  }
})();
