/* Builds the games, pages, devs and socials from site-data.js. Runs before script.js. */
(() => {
  const str = v => (typeof v === 'string' ? v : '');
  const num = v => (Number.isFinite(+v) ? +v : 0);
  // links, repo-relative pages, uploaded pictures, or small embedded pictures (draft previews)
  const URL_OK = /^(https?:\/\/\S+|uploads\/[\w.\-]+\.(png|jpe?g|webp|gif)|[a-z0-9_.\/-]+\.html(\?[\w=&.\-]*)?|#|data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]+)$/i;
  const safeUrl = u => (URL_OK.test(str(u)) ? str(u) : '#');
  const safeImg = u => (/^(https?:\/\/|uploads\/|data:image\/)/i.test(str(u)) ? safeUrl(u) : '');
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const cssUrl = u => 'url("' + u.replace(/["\\\n]/g, c => encodeURIComponent(c)) + '")';
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

  const ACCENTS = { white: '#ffffff', cyan: '#00e5ff', magenta: '#ff2bd6', lime: '#b6ff3c', amber: '#ffb000', red: '#ff3b3b' };
  const WIDTHS = { narrow: '680px', normal: '900px', wide: '1240px' };
  const BG = ['default', 'plain', 'grid', 'dots', 'stars'];
  const blocksOf = b => (window.HBBlocks ? window.HBBlocks.cleanBlocks(b) : []);
  // the look options a game page or a custom page can have
  const pageOpts = g => ({
    banner: safeImg(g.banner), accent: ACCENTS[g.accent] ? g.accent : '', accentHex: /^#[0-9a-f]{6}$/i.test(str(g.accentHex)) ? g.accentHex : '',
    width: WIDTHS[g.width] ? g.width : 'normal', bg: BG.includes(g.bg) ? g.bg : 'default', hideGear: !!g.hideGear, showTitle: g.showTitle !== false, showIcon: g.showIcon !== false, showLabel: g.showLabel !== false, showStatus: g.showStatus !== false,
    subtitle: str(g.subtitle).slice(0, 200), blocks: blocksOf(g.blocks)
  });

  const clean = d => {
    const s = d.site || {};
    return {
      site: {
        title: str(s.title) || 'STILLMARK INDUSTRIES', soon: str(s.soon) || 'MORE GAMES SOON', ticker: str(s.ticker),
        announce: str(s.announce).slice(0, 300), announceUrl: safeUrl(s.announceUrl) === '#' ? '' : safeUrl(s.announceUrl),
        announceTone: ['info', 'warning', 'party'].includes(s.announceTone) ? s.announceTone : 'info',
        footer: str(s.footer).slice(0, 120), enterLabel: str(s.enterLabel).slice(0, 24),
        fxScan: s.fxScan !== false, fxDust: s.fxDust !== false, fxVignette: s.fxVignette !== false, fxCursor: s.fxCursor !== false, fxGrid: s.fxGrid !== false
      },
      games: (d.games || []).map(g => Object.assign({
        id: str(g.id) || 'game', name: str(g.name), blurb: str(g.blurb), tagline: str(g.tagline), status: str(g.status), icon: safeImg(g.icon),
        info: (g.info || []).map(p => [str(p[0]), str(p[1])]),
        buttons: (g.buttons || []).map(b => ({ label: str(b.label), url: safeUrl(b.url) }))
      }, pageOpts(g))),
      pages: (d.pages || []).map(p => Object.assign({ id: str(p.id) || 'page', name: str(p.name), nav: p.nav !== false }, pageOpts(p))),
      devs: (d.devs || []).map(v => ({
        name: str(v.name), role: str(v.role), bio: str(v.bio), badge: str(v.badge), url: safeUrl(v.url), main: !!v.main,
        shape: ['circle', 'square', 'hex'].includes(v.shape) ? v.shape : 'circle', avatar: safeImg(v.avatar),
        links: (v.links || []).map(l => ({ label: str(l.label), url: safeUrl(l.url) })),
        pfp: v.pfp ? { cx: num(v.pfp.cx), cy: num(v.pfp.cy), r: num(v.pfp.r) || 36 } : null
      })),
      socials: (d.socials || []).map(x => ({ label: str(x.label), handle: str(x.handle), url: safeUrl(x.url) }))
    };
  };

  // the draft only exists in the browser of whoever edited it with the mod panel
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem('hb-draft') || 'null'); } catch (e) {}
  window.hbClean = clean;
  window.SITE = clean(draft || window.SITE_DATA || {});
  window.SITE_IS_DRAFT = !!draft;
  const S = window.SITE;

  const BANNER_SVG = '<svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="4,4 996,4 982,50 996,96 4,96 18,50"/></svg>';
  const CTA_SVG = '<svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><polygon points="2,30 30,3 170,3 198,30 170,57 30,57"/></svg>';
  const body = document.body;

  /* ---------- site-wide text and switches ---------- */
  const menuTitle = document.querySelector('.title[data-text]');
  if (menuTitle) { menuTitle.dataset.text = S.site.title; menuTitle.setAttribute('aria-label', S.site.title); }
  const soon = document.getElementById('soon-text');
  if (soon) soon.textContent = S.site.soon;
  const tick = document.querySelectorAll('.ticker .track span');
  if (S.site.ticker) tick.forEach(t => { t.textContent = S.site.ticker; });
  if (S.site.footer) { const f = document.querySelector('.foot span'); if (f) f.textContent = S.site.footer; }
  if (S.site.enterLabel) { const e = document.querySelector('.enter span'); if (e) e.textContent = S.site.enterLabel; const ea = document.querySelector('.enter'); if (ea) ea.setAttribute('aria-label', S.site.enterLabel); }
  [['fxScan', 'no-scan'], ['fxDust', 'no-dust'], ['fxVignette', 'no-vig'], ['fxCursor', 'no-cursor'], ['fxGrid', 'no-grid']].forEach(([k, c]) => { if (!S.site[k]) body.classList.add(c); });

  // a message bar across the top of every page (visitors can close it; a new message shows again)
  if (S.site.announce) {
    const key = 'hb-ann:' + hash(S.site.announce + S.site.announceUrl);
    let hidden = false; try { hidden = !!localStorage.getItem(key); } catch (e) {}
    if (!hidden) {
      const bar = el('div', 'announce tone-' + S.site.announceTone); bar.setAttribute('role', 'status');
      let msg;
      if (S.site.announceUrl) { msg = el('a', '', S.site.announce); msg.href = S.site.announceUrl; msg.target = '_blank'; msg.rel = 'noopener'; msg.setAttribute('data-ext', ''); } else msg = el('span', '', S.site.announce);
      const x = el('button', 'ann-x', 'X'); x.type = 'button'; x.setAttribute('aria-label', 'Close message');
      x.addEventListener('click', () => { bar.remove(); body.classList.remove('has-announce'); try { localStorage.setItem(key, '1'); } catch (e) {} });
      bar.append(msg, x); body.prepend(bar); body.classList.add('has-announce');
    }
  }

  // custom pages that should be in the menu get a link on the main menu
  const quick = document.querySelector('.quick');
  if (quick) S.pages.filter(p => p.nav && p.name).forEach(p => {
    const a = el('a', '', p.name.toUpperCase()); a.href = 'page.html?id=' + encodeURIComponent(p.id); a.setAttribute('data-go', '');
    quick.insertBefore(a, quick.querySelector('button'));
  });

  /* ---------- games page ---------- */
  const list = document.getElementById('game-list');
  if (list) {
    if (!S.games.length) list.appendChild(el('p', 'sub', 'NO GAMES YET'));
    S.games.forEach((g, i) => {
      const a = el('a', 'banner rise');
      a.href = 'game.html?id=' + encodeURIComponent(g.id);
      a.setAttribute('data-go', ''); a.style.setProperty('--r', i);
      a.innerHTML = BANNER_SVG;
      if (g.icon) { const ic = el('b', 'bicon'); ic.setAttribute('aria-hidden', 'true'); ic.style.backgroundImage = cssUrl(g.icon); a.appendChild(ic); }
      const sp = el('span');
      sp.append(el('i', '', '['), document.createTextNode(g.name), el('i', '', ']'), document.createElement('br'), document.createTextNode(g.tagline || 'CLICK HERE'));
      const em = el('em'); em.setAttribute('aria-hidden', 'true');
      a.append(sp, em); list.appendChild(a);
    });
  }

  const grid = document.getElementById('dev-grid');
  if (grid) S.devs.forEach(d => {
    const card = el('article', 'dev' + (d.main ? ' main' : ''));
    const badge = d.badge || (d.main ? 'MAIN DEV' : '');
    if (badge) card.appendChild(el('u', 'crown', badge));
    let av;
    if (d.pfp && !d.avatar) {
      av = el('b', 'av pfp'); av.style.cssText = '--cx:' + d.pfp.cx + ';--cy:' + d.pfp.cy + ';--r:' + d.pfp.r;
    } else if (d.avatar) {
      av = el('b', 'av img'); av.style.backgroundImage = cssUrl(d.avatar);
    } else {
      av = el('b', 'av ltr', (d.name[0] || '?').toUpperCase());
    }
    av.classList.add('shape-' + d.shape); av.setAttribute('aria-hidden', 'true');
    const main = el('a', 'dev-link'); main.href = d.url; main.target = '_blank'; main.rel = 'noopener'; main.setAttribute('data-ext', '');
    main.append(av, el('strong', '', d.name), el('small', '', d.role));
    card.appendChild(main);
    if (d.bio) card.appendChild(el('p', 'bio', d.bio));
    const links = [{ label: /discord/i.test(d.url) ? 'DISCORD' : 'PROFILE', url: d.url }, ...d.links];
    const row = el('div', 'dev-links');
    links.forEach(l => { const a = el('a', '', l.label); a.href = l.url; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-ext', ''); row.appendChild(a); });
    card.appendChild(row);
    grid.appendChild(card);
  });

  const soc = document.getElementById('socials');
  if (soc) S.socials.forEach(s => {
    const a = el('a', 'social'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-ext', '');
    a.append(el('span', '', s.label), el('b', '', s.handle)); soc.appendChild(a);
  });

  /* ---------- a single game page, or a custom page (same builder, same look options) ---------- */
  const host = document.getElementById('game');
  if (host) {
    const kind = host.dataset.kind === 'page' ? 'page' : 'game';
    const source = kind === 'page' ? S.pages : S.games;
    const id = new URLSearchParams(location.search).get('id');
    const idx = source.findIndex(g => g.id === id);
    const g = source[idx];
    if (!g) {
      document.title = (kind === 'page' ? 'Page' : 'Game') + ' not found - Stillmark Industries';
      host.append(el('p', 'kicker', '// 404'), el('h1', 'gtitle', (kind === 'page' ? 'PAGE' : 'GAME') + ' NOT FOUND'));
      const back = el('a', 'cta', ''); back.href = kind === 'page' ? 'index.html' : 'games.html'; back.setAttribute('data-go', ''); back.innerHTML = CTA_SVG;
      back.appendChild(el('span', '', kind === 'page' ? 'BACK HOME' : 'BACK TO GAMES')); host.appendChild(back);
    } else {
      document.title = g.name + ' - Stillmark Industries';
      const accent = g.accentHex || ACCENTS[g.accent];
      if (accent) host.style.setProperty('--accent', accent);
      if (g.bg !== 'default') body.classList.add('pbg-' + g.bg);
      if (!g.hideGear) {
        const gw = el('div', 'gear-wrap hero-gear flash'); gw.setAttribute('aria-hidden', 'true');
        gw.innerHTML = '<svg class="gear main" data-teeth="14" data-outer="100" data-root="84" data-ring="64" data-hub="16" data-spokes="7" style="--t:20s"></svg>';
        host.appendChild(gw);
      }
      if (g.banner) { const bn = el('div', 'gbanner rise'); bn.style.setProperty('--r', 0); bn.style.backgroundImage = cssUrl(g.banner); bn.setAttribute('role', 'img'); bn.setAttribute('aria-label', g.name + ' banner'); host.appendChild(bn); }
      if (kind === 'game' && g.icon && g.showIcon) { const ic = el('div', 'gicon rise'); ic.style.setProperty('--r', 0); ic.style.backgroundImage = cssUrl(g.icon); ic.setAttribute('role', 'img'); ic.setAttribute('aria-label', g.name + ' icon'); host.appendChild(ic); }
      if (g.showTitle) {
        const t = el('h1', 'gtitle rise', g.name); t.style.setProperty('--r', 1);
        if (g.showLabel) { const k = el('p', 'kicker rise', kind === 'page' ? '// PAGE' : '// GAME FILE ' + String(idx + 1).padStart(2, '0')); k.style.setProperty('--r', 0); host.append(k); }
        host.append(t);
        if (g.subtitle) { const sb = el('p', 'psub rise', g.subtitle); sb.style.setProperty('--r', 1); host.appendChild(sb); }
        if (kind === 'game' && g.status && g.showStatus) { const st = el('p', 'status rise', g.status); st.style.setProperty('--r', 1); host.appendChild(st); }
      }
      if (g.blocks.length && window.HBBlocks) {            // a page built in the mod panel
        host.style.setProperty('--pw', WIDTHS[g.width]);
        const pg = window.HBBlocks.render(g.blocks, { socials: S.socials, devs: S.devs, ownerId: g.id });
        pg.classList.add('rise'); pg.style.setProperty('--r', 2);
        host.append(pg);
        body.classList.add('built');
      } else if (kind === 'game') {                        // the older plain layout
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
        host.append(info, row);
      } else {
        host.appendChild(el('p', 'blurb', 'THIS PAGE IS EMPTY. ADD ELEMENTS TO IT IN THE MOD PANEL.'));
      }
    }
  }

  if (window.SITE_IS_DRAFT) body.appendChild(el('div', 'draft-tag', 'DRAFT PREVIEW - ONLY YOU SEE THIS'));
})();
