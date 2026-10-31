/* Page blocks: the building pieces of a game page.
   Used to show pages to every visitor, and to preview them in the mod panel.
   Nothing here ever builds HTML from text, so what people type can never run as code. */
(() => {
  const str = (v, n = 4000) => (typeof v === 'string' ? v.slice(0, n) : '');
  const arr = v => (Array.isArray(v) ? v : []);
  const num = (v, d, lo, hi) => { const n = Number.isFinite(+v) ? +v : d; return Math.min(hi, Math.max(lo, n)); };
  const URL_OK = /^(https?:\/\/\S+|uploads\/[\w.\-]+\.(png|jpe?g|webp|gif)|#)$/i;
  const IMG_OK = /^(https?:\/\/\S+|uploads\/[\w.\-]+\.(png|jpe?g|webp|gif)|data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]+)$/i;
  const safeUrl = u => (URL_OK.test(str(u, 2000)) ? str(u, 2000) : '#');
  const safeImg = u => (IMG_OK.test(str(u, 4000000)) ? str(u, 4000000) : '');
  const cssUrl = u => 'url("' + u.replace(/["\\\n]/g, c => encodeURIComponent(c)) + '")';
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const lines = t => str(t, 20000).split('\n').map(s => s.trim()).filter(Boolean);

  /* ---------- text with a little markup: **bold**, `code`, [label](https://link) ---------- */
  function inline(text) {
    const frag = document.createDocumentFragment();
    const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    let last = 0, m;
    text = str(text, 20000);
    while ((m = re.exec(text))) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      if (m[1]) frag.append(el('strong', '', m[1]));
      else if (m[2]) frag.append(el('code', '', m[2]));
      else { const a = el('a', '', m[3]); a.href = m[4]; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-ext', ''); frag.append(a); }
      last = re.lastIndex;
    }
    if (last < text.length) frag.append(text.slice(last));
    return frag;
  }
  function paras(text) {
    const box = document.createDocumentFragment();
    str(text, 20000).split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).forEach(chunk => {
      const p = el('p');
      chunk.split('\n').forEach((ln, i) => { if (i) p.append(document.createElement('br')); p.append(inline(ln)); });
      box.append(p);
    });
    return box;
  }

  /* ---------- fields that are typed one-per-line in the editor ---------- */
  const LINES = {
    strings: { hint: 'ONE PER LINE',
      fmt: a => a.join('\n'), parse: t => lines(t).slice(0, 100),
      clean: a => arr(a).map(x => str(x, 300)).filter(Boolean).slice(0, 100) },
    rows: { hint: 'ONE PER LINE, LIKE  LABEL: VALUE',
      fmt: a => a.map(r => r[0] + ': ' + r[1]).join('\n'),
      parse: t => lines(t).map(l => { const i = l.indexOf(':'); return i < 0 ? ['INFO', l] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }).slice(0, 60),
      clean: a => arr(a).map(r => [str(arr(r)[0], 80), str(arr(r)[1], 300)]).slice(0, 60) },
    links: { hint: 'ONE PER LINE, LIKE  LABEL | https://link   (ADD  | outline  FOR A HOLLOW BUTTON)',
      fmt: a => a.map(l => [l.label, l.url].concat(l.style === 'outline' ? ['outline'] : []).join(' | ')).join('\n'),
      parse: t => lines(t).map(l => { const p = l.split('|').map(s => s.trim()); return { label: p[0] || 'LINK', url: p[1] || '#', style: p[2] === 'outline' ? 'outline' : 'solid' }; }).slice(0, 12),
      clean: a => arr(a).map(l => ({ label: str(l && l.label, 80), url: safeUrl(l && l.url), style: l && l.style === 'outline' ? 'outline' : 'solid' })).slice(0, 12) },
    qa: { hint: 'ONE PER LINE, LIKE  QUESTION | ANSWER',
      fmt: a => a.map(x => x.q + ' | ' + x.a).join('\n'),
      parse: t => lines(t).map(l => { const i = l.indexOf('|'); return i < 0 ? { q: l, a: '' } : { q: l.slice(0, i).trim(), a: l.slice(i + 1).trim() }; }).slice(0, 40),
      clean: a => arr(a).map(x => ({ q: str(x && x.q, 300), a: str(x && x.a, 2000) })).slice(0, 40) },
    log: { hint: 'ONE PER LINE, LIKE  v1.0 | 2026-10-31 | WHAT CHANGED',
      fmt: a => a.map(x => [x.version, x.date, x.notes].join(' | ')).join('\n'),
      parse: t => lines(t).map(l => { const p = l.split('|').map(s => s.trim()); return { version: p[0] || '', date: p[1] || '', notes: p.slice(2).join(' | ') }; }).slice(0, 40),
      clean: a => arr(a).map(x => ({ version: str(x && x.version, 40), date: str(x && x.date, 40), notes: str(x && x.notes, 2000) })).slice(0, 40) },
    cols: { hint: 'SEPARATE COLUMNS WITH A LINE OF ---   (START A COLUMN WITH  # TITLE  FOR A HEADING)',
      fmt: a => a.map(c => (c.title ? '# ' + c.title + '\n' : '') + c.text).join('\n---\n'),
      parse: t => str(t, 20000).split(/\n-{3,}[ \t]*(?:\n|$)/).map(chunk => {
        const ls = chunk.replace(/^\n+|\n+$/g, '').split('\n'); let title = '';
        if (ls[0] && ls[0].startsWith('# ')) title = ls.shift().slice(2).trim();
        return { title, text: ls.join('\n').trim() };
      }).filter(c => c.title || c.text).slice(0, 4),
      clean: a => arr(a).map(c => ({ title: str(c && c.title, 120), text: str(c && c.text, 6000) })).slice(0, 4) },
    credits: { hint: 'ONE PER LINE, LIKE  NAME | ROLE',
      fmt: a => a.map(x => x.name + ' | ' + x.role).join('\n'),
      parse: t => lines(t).map(l => { const i = l.indexOf('|'); return i < 0 ? { name: l, role: '' } : { name: l.slice(0, i).trim(), role: l.slice(i + 1).trim() }; }).slice(0, 60),
      clean: a => arr(a).map(x => ({ name: str(x && x.name, 80), role: str(x && x.role, 120) })).slice(0, 60) }
  };

  /* ---------- picture viewer (click any image or gallery picture) ---------- */
  let lbx = null;
  function lightbox(list, start) {
    if (lbx) lbx.remove();
    let i = start;
    const box = lbx = el('div', 'lbx'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Picture viewer');
    const img = el('img'), cap = el('p', 'lbx-cap'), x = el('button', 'lbx-x', 'X'), prev = el('button', 'lbx-n', '<'), next = el('button', 'lbx-n lbx-r', '>');
    x.type = prev.type = next.type = 'button'; x.setAttribute('aria-label', 'Close');
    const show = () => { img.src = list[i].src; img.alt = list[i].caption || ''; cap.textContent = list[i].caption || ''; prev.hidden = next.hidden = list.length < 2; };
    const close = () => { box.remove(); lbx = null; document.removeEventListener('keydown', key, true); };
    const go = d => { i = (i + d + list.length) % list.length; show(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
    box.addEventListener('click', e => { if (e.target === box || e.target === x) close(); });
    prev.addEventListener('click', () => go(-1)); next.addEventListener('click', () => go(1));
    document.addEventListener('keydown', key, true);
    box.append(img, cap, x, prev, next); document.body.appendChild(box); show();
  }

  /* ---------- video and embeds: only a few trusted hosts are allowed ---------- */
  function videoEmbed(u) {
    try {
      const x = new URL(u), h = x.hostname.replace(/^www\./, '');
      let id = '';
      if (h === 'youtu.be') id = x.pathname.slice(1);
      else if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtube-nocookie.com') {
        if (x.pathname === '/watch') id = x.searchParams.get('v') || '';
        else { const m = /^\/(embed|shorts|live)\/([\w-]{6,})/.exec(x.pathname); if (m) id = m[2]; }
      }
      if (/^[\w-]{6,20}$/.test(id)) return 'https://www.youtube-nocookie.com/embed/' + id;
      if (h === 'vimeo.com' || h === 'player.vimeo.com') { const m = /(\d{5,})/.exec(x.pathname); if (m) return 'https://player.vimeo.com/video/' + m[1]; }
    } catch (e) {}
    return '';
  }
  function embedUrl(u) {
    try {
      const x = new URL(u), h = x.hostname.replace(/^www\./, '');
      if (x.protocol !== 'https:') return '';
      if (h === 'itch.io' && /^\/embed(-upload)?\//.test(x.pathname)) return x.href;
      if (/\.itch\.zone$/.test(h)) return x.href;
    } catch (e) {}
    return videoEmbed(u);
  }
  function frame(src, ratioClass, height) {
    const box = el('div', 'bk-frame ' + ratioClass);
    if (height) box.style.height = height + 'px';
    const f = document.createElement('iframe');
    f.src = src; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer'; f.allowFullscreen = true;
    f.setAttribute('allow', 'fullscreen; picture-in-picture; autoplay');
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups allow-forms');
    f.title = 'Embedded content';
    box.appendChild(f); return box;
  }

  const ago = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const fileLabel = u => { try { return decodeURIComponent(u.split('?')[0].split('/').pop()) || 'file'; } catch (e) { return 'file'; } };

  /* ---------- the block types ---------- */
  const TYPES = {
    heading: { label: 'HEADING', group: 'TEXT', help: 'A big title for a section.',
      defaults: () => ({ text: 'NEW SECTION', size: 'medium', align: 'left' }),
      fields: [{ k: 'text', label: 'TEXT', type: 'text', max: 200 }, { k: 'size', label: 'SIZE', type: 'select', options: ['large', 'medium', 'small'] }, { k: 'align', label: 'ALIGN', type: 'select', options: ['left', 'center'] }],
      render: b => { const h = el(b.size === 'large' ? 'h2' : b.size === 'small' ? 'h4' : 'h3', 'bk-h'); h.append(inline(b.text)); return h; } },
    text: { label: 'TEXT', group: 'TEXT', help: 'Paragraphs. Use **bold**, `code` and [links](https://...).',
      defaults: () => ({ text: 'Write about your game here.\n\nLeave a blank line to start a new paragraph.' }),
      fields: [{ k: 'text', label: 'TEXT', type: 'area', rows: 7, hint: 'BLANK LINE = NEW PARAGRAPH.  **BOLD**   `CODE`   [LABEL](https://LINK)' }],
      render: b => { const d = el('div', 'bk-text'); d.append(paras(b.text)); return d; } },
    quote: { label: 'QUOTE', group: 'TEXT', help: 'A highlighted quote, such as a review.',
      defaults: () => ({ text: 'A quote worth showing off.', author: '' }),
      fields: [{ k: 'text', label: 'QUOTE', type: 'area', rows: 3 }, { k: 'author', label: 'WHO SAID IT', type: 'text', max: 120 }],
      render: b => { const q = el('blockquote', 'bk-quote'); q.append(el('p', '', b.text)); if (b.author) q.append(el('cite', '', '- ' + b.author)); return q; } },
    callout: { label: 'CALLOUT', group: 'TEXT', help: 'A coloured note box.',
      defaults: () => ({ text: 'Good to know.', tone: 'info' }),
      fields: [{ k: 'text', label: 'TEXT', type: 'area', rows: 3 }, { k: 'tone', label: 'LOOK', type: 'select', options: ['info', 'warning', 'success'] }],
      render: b => { const d = el('div', 'bk-callout tone-' + b.tone); d.append(paras(b.text)); return d; } },
    list: { label: 'LIST', group: 'TEXT', help: 'Features, tips or steps.',
      defaults: () => ({ title: 'FEATURES', style: 'bullets', items: ['First thing', 'Second thing', 'Third thing'] }),
      fields: [{ k: 'title', label: 'TITLE (OPTIONAL)', type: 'text', max: 120 }, { k: 'style', label: 'STYLE', type: 'select', options: ['bullets', 'numbers', 'checks'] }, { k: 'items', label: 'ITEMS', type: 'lines', lines: 'strings' }],
      render: b => { const d = el('div', 'bk-list'); if (b.title) d.append(el('h4', 'bk-sub', b.title)); const ul = el(b.style === 'numbers' ? 'ol' : 'ul', 'st-' + b.style); b.items.forEach(t => { const li = el('li'); li.append(inline(t)); ul.append(li); }); d.append(ul); return d; } },
    columns: { label: 'COLUMNS', group: 'TEXT', help: 'Two to four text columns side by side.',
      defaults: () => ({ cols: [{ title: 'ONE', text: 'First column.' }, { title: 'TWO', text: 'Second column.' }] }),
      fields: [{ k: 'cols', label: 'COLUMNS', type: 'lines', lines: 'cols', rows: 8 }],
      render: b => { const d = el('div', 'bk-cols n' + Math.max(1, b.cols.length)); b.cols.forEach(c => { const col = el('div', 'bk-col'); if (c.title) col.append(el('h4', 'bk-sub', c.title)); col.append(paras(c.text)); d.append(col); }); return d; } },

    image: { label: 'IMAGE', group: 'MEDIA', help: 'One picture. Click it on the page to view it big.',
      defaults: () => ({ src: '', caption: '', size: 'wide' }),
      fields: [{ k: 'src', label: 'PICTURE', type: 'image', max: 1600 }, { k: 'caption', label: 'CAPTION (OPTIONAL)', type: 'text', max: 200 }, { k: 'size', label: 'WIDTH', type: 'select', options: ['full', 'wide', 'medium', 'small'] }],
      render: b => {
        const f = el('figure', 'bk-image sz-' + b.size);
        if (!b.src) { f.append(el('div', 'bk-empty', 'NO PICTURE YET')); return f; }
        const img = el('img'); img.src = b.src; img.alt = b.caption || ''; img.loading = 'lazy';
        img.addEventListener('click', () => lightbox([{ src: b.src, caption: b.caption }], 0));
        f.append(img); if (b.caption) f.append(el('figcaption', '', b.caption)); return f;
      } },
    gallery: { label: 'GALLERY', group: 'MEDIA', help: 'Screenshots in a grid with a picture viewer.',
      defaults: () => ({ images: [], columns: '3' }),
      fields: [{ k: 'images', label: 'PICTURES', type: 'images', max: 1400 }, { k: 'columns', label: 'COLUMNS', type: 'select', options: ['2', '3', '4'] }],
      render: b => {
        const d = el('div', 'bk-gallery c' + b.columns);
        if (!b.images.length) { d.append(el('div', 'bk-empty', 'NO PICTURES YET')); return d; }
        const list = b.images.map(src => ({ src, caption: '' }));
        b.images.forEach((src, i) => { const btn = el('button', 'bk-thumb'); btn.type = 'button'; btn.style.backgroundImage = cssUrl(src); btn.setAttribute('aria-label', 'View picture ' + (i + 1)); btn.addEventListener('click', () => lightbox(list, i)); d.append(btn); });
        return d;
      } },
    video: { label: 'VIDEO', group: 'MEDIA', help: 'A YouTube or Vimeo video. Just paste the link.',
      defaults: () => ({ url: '', caption: '' }),
      fields: [{ k: 'url', label: 'VIDEO LINK', type: 'text', max: 400, ph: 'https://www.youtube.com/watch?v=...' }, { k: 'caption', label: 'CAPTION (OPTIONAL)', type: 'text', max: 200 }],
      render: b => {
        const d = el('figure', 'bk-video'), src = videoEmbed(b.url);
        if (!src) { d.append(el('div', 'bk-empty', b.url ? 'THAT VIDEO LINK IS NOT SUPPORTED (USE YOUTUBE OR VIMEO)' : 'NO VIDEO YET')); return d; }
        d.append(frame(src, 'r169')); if (b.caption) d.append(el('figcaption', '', b.caption)); return d;
      } },
    embed: { label: 'EMBED', group: 'MEDIA', help: 'An itch.io widget or a game that plays on the page.',
      defaults: () => ({ url: '', height: '167' }),
      fields: [{ k: 'url', label: 'EMBED LINK', type: 'text', max: 500, ph: 'https://itch.io/embed/123456', hint: 'ALLOWED: itch.io EMBED LINKS, itch.zone GAMES, YOUTUBE, VIMEO.' }, { k: 'height', label: 'HEIGHT IN PIXELS', type: 'text', max: 5 }],
      render: b => {
        const src = embedUrl(b.url), d = el('div', 'bk-embed');
        if (!src) { d.append(el('div', 'bk-empty', b.url ? 'THAT EMBED LINK IS NOT ALLOWED' : 'NO EMBED YET')); return d; }
        d.append(frame(src, '', num(b.height, 167, 80, 1200))); return d;
      } },

    buttons: { label: 'BUTTONS', group: 'ACTION', help: 'One or more big buttons that open a link.',
      defaults: () => ({ items: [{ label: 'PLAY NOW', url: 'https://', style: 'solid' }] }),
      fields: [{ k: 'items', label: 'BUTTONS', type: 'lines', lines: 'links', rows: 4 }],
      render: b => { const d = el('div', 'bk-buttons'); b.items.forEach(x => { const a = el('a', 'bk-btn ' + x.style, x.label); a.href = x.url; if (x.url !== '#') { a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-ext', ''); } d.append(a); }); return d; } },
    download: { label: 'DOWNLOAD', group: 'ACTION', help: 'A file people can download. Upload it right here, or paste a link.',
      defaults: () => ({ title: 'DOWNLOAD THE GAME', file: '', size: '', version: '', platform: '', note: '' }),
      fields: [{ k: 'title', label: 'TITLE', type: 'text', max: 120 }, { k: 'file', label: 'FILE', type: 'file' }, { k: 'size', label: 'FILE SIZE (FILLED IN FOR YOU)', type: 'text', max: 30 },
        { k: 'version', label: 'VERSION', type: 'text', max: 40, ph: 'v1.0' }, { k: 'platform', label: 'PLATFORM', type: 'text', max: 60, ph: 'Windows' }, { k: 'note', label: 'NOTE (OPTIONAL)', type: 'area', rows: 2 }],
      render: b => {
        const d = el('div', 'bk-download'), top = el('div', 'bk-dl-top');
        top.append(el('b', 'bk-dl-ico', 'v'), el('div', 'bk-dl-info'));
        const info = top.lastChild; info.append(el('strong', '', b.title || 'DOWNLOAD'));
        const meta = [b.version, b.platform, b.size].filter(Boolean).join('  |  '); if (meta) info.append(el('small', '', meta));
        if (b.file && b.file !== '#') info.append(el('small', 'bk-dl-name', fileLabel(b.file)));
        d.append(top);
        if (b.note) { const n = el('p', 'bk-dl-note'); n.append(inline(b.note)); d.append(n); }
        const a = el('a', 'bk-btn solid', b.file && b.file !== '#' ? 'DOWNLOAD' : 'NO FILE YET');
        if (b.file && b.file !== '#') { a.href = b.file; a.setAttribute('download', ''); a.rel = 'noopener'; a.setAttribute('data-ext', ''); } else { a.href = '#'; a.classList.add('off'); a.addEventListener('click', e => e.preventDefault()); }
        d.append(a); return d;
      } },
    countdown: { label: 'COUNTDOWN', group: 'ACTION', help: 'A live timer counting down to a date.',
      defaults: () => ({ label: 'RELEASE IN', date: '', done: 'OUT NOW!' }),
      fields: [{ k: 'label', label: 'LABEL', type: 'text', max: 80 }, { k: 'date', label: 'DATE AND TIME', type: 'text', max: 20, ph: '2027-01-31 18:00', hint: 'YEAR-MONTH-DAY HOUR:MINUTE, IN THE VISITOR\'S OWN TIME ZONE.' }, { k: 'done', label: 'TEXT WHEN IT HITS ZERO', type: 'text', max: 80 }],
      render: b => {
        const d = el('div', 'bk-countdown'), lab = el('small', '', b.label), out = el('b', 'bk-cd-num');
        d.append(lab, out);
        const when = new Date(String(b.date).replace(' ', 'T'));
        if (isNaN(when)) { out.textContent = 'SET A DATE'; return d; }
        const tick = () => {
          if (!d.isConnected && d.dataset.live) { clearInterval(d._t); return; }
          const s = Math.floor((when - Date.now()) / 1000);
          if (s <= 0) { lab.textContent = ''; out.textContent = b.done || 'NOW!'; clearInterval(d._t); return; }
          const dd = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
          out.textContent = [dd ? ago(dd, 'DAY', 'DAYS') : '', String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0')].filter(Boolean).join('  ');
        };
        tick(); d.dataset.live = '1'; d._t = setInterval(tick, 1000); return d;
      } },
    socials: { label: 'SOCIAL LINKS', group: 'ACTION', help: 'Shows your social links from the Socials tab.',
      defaults: () => ({ title: 'FOLLOW US' }),
      fields: [{ k: 'title', label: 'TITLE (OPTIONAL)', type: 'text', max: 100 }],
      render: (b, ctx) => {
        const d = el('div', 'bk-socials'); if (b.title) d.append(el('h4', 'bk-sub', b.title));
        const row = el('div', 'socials');
        ((ctx && ctx.socials) || (window.SITE && window.SITE.socials) || []).forEach(s => { const a = el('a', 'social'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-ext', ''); a.append(el('span', '', s.label), el('b', '', s.handle)); row.append(a); });
        d.append(row); return d;
      } },

    facts: { label: 'INFO TABLE', group: 'INFO', help: 'A tidy table: genre, platforms, release date...',
      defaults: () => ({ title: '', rows: [['GENRE', ''], ['PLATFORM', ''], ['RELEASE', '']] }),
      fields: [{ k: 'title', label: 'TITLE (OPTIONAL)', type: 'text', max: 100 }, { k: 'rows', label: 'ROWS', type: 'lines', lines: 'rows', rows: 5 }],
      render: b => { const d = el('div', 'bk-facts'); if (b.title) d.append(el('h4', 'bk-sub', b.title)); const dl = el('dl'); b.rows.forEach(([k, v]) => { const r = el('div'); r.append(el('dt', '', k), el('dd', '', v)); dl.append(r); }); d.append(dl); return d; } },
    requirements: { label: 'SYSTEM REQUIREMENTS', group: 'INFO', help: 'Minimum and recommended computer specs.',
      defaults: () => ({ minimum: [['OS', 'Windows 10'], ['MEMORY', '4 GB'], ['STORAGE', '500 MB']], recommended: [['OS', 'Windows 11'], ['MEMORY', '8 GB'], ['STORAGE', '500 MB']] }),
      fields: [{ k: 'minimum', label: 'MINIMUM', type: 'lines', lines: 'rows', rows: 4 }, { k: 'recommended', label: 'RECOMMENDED', type: 'lines', lines: 'rows', rows: 4 }],
      render: b => {
        const d = el('div', 'bk-req');
        [['MINIMUM', b.minimum], ['RECOMMENDED', b.recommended]].forEach(([t, rows]) => { if (!rows.length) return; const c = el('div', 'bk-col'); c.append(el('h4', 'bk-sub', t)); const dl = el('dl'); rows.forEach(([k, v]) => { const r = el('div'); r.append(el('dt', '', k), el('dd', '', v)); dl.append(r); }); c.append(dl); d.append(c); });
        return d;
      } },
    faq: { label: 'FAQ', group: 'INFO', help: 'Questions that open to show the answer.',
      defaults: () => ({ title: 'QUESTIONS', items: [{ q: 'Is it free?', a: 'Yes.' }] }),
      fields: [{ k: 'title', label: 'TITLE (OPTIONAL)', type: 'text', max: 100 }, { k: 'items', label: 'QUESTIONS', type: 'lines', lines: 'qa', rows: 5 }],
      render: b => { const d = el('div', 'bk-faq'); if (b.title) d.append(el('h4', 'bk-sub', b.title)); b.items.forEach(x => { const det = el('details'); det.append(el('summary', '', x.q)); const a = el('div', 'bk-ans'); a.append(paras(x.a)); det.append(a); d.append(det); }); return d; } },
    changelog: { label: 'CHANGELOG', group: 'INFO', help: 'What changed in each version.',
      defaults: () => ({ title: 'CHANGELOG', entries: [{ version: 'v1.0', date: '', notes: 'First release.' }] }),
      fields: [{ k: 'title', label: 'TITLE (OPTIONAL)', type: 'text', max: 100 }, { k: 'entries', label: 'VERSIONS', type: 'lines', lines: 'log', rows: 5 }],
      render: b => { const d = el('div', 'bk-log'); if (b.title) d.append(el('h4', 'bk-sub', b.title)); b.entries.forEach(x => { const e = el('article'); const h = el('header'); h.append(el('b', '', x.version), el('small', '', x.date)); e.append(h); const p = el('p'); p.append(inline(x.notes)); e.append(p); d.append(e); }); return d; } },
    credits: { label: 'CREDITS', group: 'INFO', help: 'Who made it and what they did.',
      defaults: () => ({ title: 'CREDITS', people: [{ name: 'Name', role: 'Role' }] }),
      fields: [{ k: 'title', label: 'TITLE (OPTIONAL)', type: 'text', max: 100 }, { k: 'people', label: 'PEOPLE', type: 'lines', lines: 'credits', rows: 4 }],
      render: b => { const d = el('div', 'bk-credits'); if (b.title) d.append(el('h4', 'bk-sub', b.title)); b.people.forEach(p => { const r = el('div'); r.append(el('b', '', p.name), el('small', '', p.role)); d.append(r); }); return d; } },

    divider: { label: 'DIVIDER', group: 'LAYOUT', help: 'A line between sections.',
      defaults: () => ({ style: 'line' }), fields: [{ k: 'style', label: 'LOOK', type: 'select', options: ['line', 'dashed', 'dots'] }],
      render: b => el('hr', 'bk-hr st-' + b.style) },
    spacer: { label: 'SPACE', group: 'LAYOUT', help: 'Empty room between things.',
      defaults: () => ({ size: '40' }), fields: [{ k: 'size', label: 'HEIGHT IN PIXELS', type: 'text', max: 4 }],
      render: b => { const d = el('div', 'bk-space'); d.style.height = num(b.size, 40, 4, 400) + 'px'; d.setAttribute('aria-hidden', 'true'); return d; } }
  };

  /* ---------- make a block, clean a block, show blocks ---------- */
  const newBlock = type => Object.assign({ type }, TYPES[type].defaults());

  function cleanBlock(b) {
    const T = b && TYPES[b.type]; if (!T) return null;
    const d = T.defaults(), out = { type: b.type };
    T.fields.forEach(f => {
      const v = b[f.k];
      if (f.type === 'text') out[f.k] = str(v, f.max || 300);
      else if (f.type === 'area') out[f.k] = str(v, 20000);
      else if (f.type === 'select') out[f.k] = f.options.includes(v) ? v : (f.options.includes(d[f.k]) ? d[f.k] : f.options[0]);
      else if (f.type === 'image') out[f.k] = safeImg(v);
      else if (f.type === 'images') out[f.k] = arr(v).map(safeImg).filter(Boolean).slice(0, 40);
      else if (f.type === 'file') out[f.k] = safeUrl(v) === '#' && v !== '#' ? '' : safeUrl(v);
      else if (f.type === 'lines') out[f.k] = LINES[f.lines].clean(v === undefined ? d[f.k] : v);
    });
    return out;
  }
  const cleanBlocks = list => arr(list).map(cleanBlock).filter(Boolean).slice(0, 80);

  function render(list, ctx) {
    const box = el('div', 'bk-page');
    list.forEach(b => {
      const T = TYPES[b.type]; if (!T) return;
      let node;
      try { node = T.render(b, ctx); } catch (e) { node = el('div', 'bk-empty', 'THIS BLOCK COULD NOT BE SHOWN'); }
      const wrap = el('section', 'bk bk-' + b.type + (b.align === 'center' ? ' center' : ''));
      wrap.append(node); box.append(wrap);
    });
    return box;
  }

  // every picture inside a game's blocks, as [owner, key, name] so the panel can swap pasted pictures for uploaded files
  function collectImages(list, base) {
    const out = [];
    arr(list).forEach((b, bi) => {
      const T = TYPES[b.type]; if (!T) return;
      T.fields.forEach(f => {
        if (f.type === 'image' && b[f.k]) out.push([b, f.k, base + '-b' + bi + '-' + f.k]);
        if (f.type === 'images') arr(b[f.k]).forEach((s, i) => out.push([b[f.k], i, base + '-b' + bi + '-' + i]));
      });
    });
    return out;
  }

  // a short description of a block, shown on its card in the editor
  function summary(b) {
    const T = TYPES[b.type]; if (!T) return '';
    const pick = b.text || b.title || b.url || b.label || (b.items && b.items[0] && (b.items[0].label || b.items[0].q || b.items[0])) || (b.images && (b.images.length + ' pictures')) || (b.file && fileLabel(b.file)) || (b.rows && b.rows.length + ' rows') || (b.cols && b.cols.length + ' columns') || '';
    return String(typeof pick === 'string' ? pick : '').replace(/\s+/g, ' ').slice(0, 70);
  }

  window.HBBlocks = { types: TYPES, lines: LINES, newBlock, cleanBlock, cleanBlocks, render, collectImages, summary, safeUrl, safeImg, lightbox, fileLabel };
})();
