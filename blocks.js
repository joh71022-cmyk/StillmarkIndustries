/* Page blocks: the building pieces of a page.
   Used to show pages to every visitor, and to preview them in the mod panel.
   Nothing here ever builds HTML from text, so what people type can never run as code. */
(() => {
  const API = window.HB_API || 'https://hollowblade-publish.joh71022.workers.dev';   // the Cloudflare service (votes)
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
  const cells = l => l.split('|').map(s => s.trim());

  // run something once, the first time an element scrolls into view
  function onVisible(node, fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, { threshold: .25 });
    io.observe(node);
  }

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
  const mkCols = max => ({
    hint: 'SEPARATE WITH A LINE OF ---   (START EACH WITH  # TITLE)',
    fmt: a => a.map(c => (c.title ? '# ' + c.title + '\n' : '') + c.text).join('\n---\n'),
    parse: t => str(t, 30000).split(/\n-{3,}[ \t]*(?:\n|$)/).map(chunk => {
      const ls = chunk.replace(/^\n+|\n+$/g, '').split('\n'); let title = '';
      if (ls[0] && ls[0].startsWith('# ')) title = ls.shift().slice(2).trim();
      return { title, text: ls.join('\n').trim() };
    }).filter(c => c.title || c.text).slice(0, max),
    clean: a => arr(a).map(c => ({ title: str(c && c.title, 120), text: str(c && c.text, 6000) })).slice(0, max)
  });
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
      parse: t => lines(t).map(l => { const p = cells(l); return { label: p[0] || 'LINK', url: p[1] || '#', style: p[2] === 'outline' ? 'outline' : 'solid' }; }).slice(0, 12),
      clean: a => arr(a).map(l => ({ label: str(l && l.label, 80), url: safeUrl(l && l.url), style: l && l.style === 'outline' ? 'outline' : 'solid' })).slice(0, 12) },
    qa: { hint: 'ONE PER LINE, LIKE  QUESTION | ANSWER',
      fmt: a => a.map(x => x.q + ' | ' + x.a).join('\n'),
      parse: t => lines(t).map(l => { const i = l.indexOf('|'); return i < 0 ? { q: l, a: '' } : { q: l.slice(0, i).trim(), a: l.slice(i + 1).trim() }; }).slice(0, 40),
      clean: a => arr(a).map(x => ({ q: str(x && x.q, 300), a: str(x && x.a, 2000) })).slice(0, 40) },
    log: { hint: 'ONE PER LINE, LIKE  v1.0 | 2026-10-31 | WHAT CHANGED',
      fmt: a => a.map(x => [x.version, x.date, x.notes].join(' | ')).join('\n'),
      parse: t => lines(t).map(l => { const p = cells(l); return { version: p[0] || '', date: p[1] || '', notes: p.slice(2).join(' | ') }; }).slice(0, 40),
      clean: a => arr(a).map(x => ({ version: str(x && x.version, 40), date: str(x && x.date, 40), notes: str(x && x.notes, 2000) })).slice(0, 40) },
    cols: mkCols(4),
    tabs: mkCols(8),
    credits: { hint: 'ONE PER LINE, LIKE  NAME | ROLE',
      fmt: a => a.map(x => x.name + ' | ' + x.role).join('\n'),
      parse: t => lines(t).map(l => { const i = l.indexOf('|'); return i < 0 ? { name: l, role: '' } : { name: l.slice(0, i).trim(), role: l.slice(i + 1).trim() }; }).slice(0, 60),
      clean: a => arr(a).map(x => ({ name: str(x && x.name, 80), role: str(x && x.role, 120) })).slice(0, 60) },
    cards: { hint: 'ONE PER LINE, LIKE  TITLE | TEXT | https://link | https://picture   (LINK AND PICTURE OPTIONAL)',
      fmt: a => a.map(c => [c.title, c.text, c.url, c.image].join(' | ').replace(/( \| )+$/, '')).join('\n'),
      parse: t => lines(t).map(l => { const p = cells(l); return { title: p[0] || '', text: p[1] || '', url: p[2] || '', image: p[3] || '' }; }).slice(0, 24),
      clean: a => arr(a).map(c => ({ title: str(c && c.title, 80), text: str(c && c.text, 400), url: c && c.url && safeUrl(c.url) !== '#' ? safeUrl(c.url) : '', image: c && c.image && !/^data:/.test(c.image) ? safeImg(c.image) : '' })).slice(0, 24) },
    table: { hint: 'ONE ROW PER LINE, CELLS SEPARATED BY |',
      fmt: a => a.map(r => r.join(' | ')).join('\n'),
      parse: t => lines(t).map(l => cells(l).slice(0, 8)).slice(0, 40),
      clean: a => arr(a).map(r => arr(r).map(c => str(c, 200)).slice(0, 8)).slice(0, 40) },
    progress: { hint: 'ONE PER LINE, LIKE  LABEL | 70   (0 TO 100)',
      fmt: a => a.map(x => x.label + ' | ' + x.value).join('\n'),
      parse: t => lines(t).map(l => { const p = cells(l); return { label: p[0] || '', value: num(p[1], 0, 0, 100) }; }).slice(0, 20),
      clean: a => arr(a).map(x => ({ label: str(x && x.label, 80), value: num(x && x.value, 0, 0, 100) })).slice(0, 20) },
    stats: { hint: 'ONE PER LINE, LIKE  12,000+ | DOWNLOADS   (NUMBERS COUNT UP)',
      fmt: a => a.map(x => x.value + ' | ' + x.label).join('\n'),
      parse: t => lines(t).map(l => { const p = cells(l); return { value: p[0] || '', label: p[1] || '' }; }).slice(0, 8),
      clean: a => arr(a).map(x => ({ value: str(x && x.value, 20), label: str(x && x.label, 60) })).slice(0, 8) },
    roadmap: { hint: 'ONE PER LINE, LIKE  done | 2026-11 | TITLE | NOTES   (STATUS: done, doing OR planned)',
      fmt: a => a.map(x => [x.status, x.date, x.title, x.notes].join(' | ').replace(/( \| )+$/, '')).join('\n'),
      parse: t => lines(t).map(l => { const p = cells(l); return { status: ['done', 'doing', 'planned'].includes((p[0] || '').toLowerCase()) ? p[0].toLowerCase() : 'planned', date: p[1] || '', title: p[2] || '', notes: p.slice(3).join(' | ') }; }).slice(0, 30),
      clean: a => arr(a).map(x => ({ status: ['done', 'doing', 'planned'].includes(x && x.status) ? x.status : 'planned', date: str(x && x.date, 40), title: str(x && x.title, 120), notes: str(x && x.notes, 600) })).slice(0, 30) }
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
      if (h === 'discord.com' && /^\/widget/.test(x.pathname)) return x.href;
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
  const randId = () => (Math.random().toString(36) + '00000000').slice(2, 10);

  /* ---------- votes: polls and ratings talk to the Cloudflare service ---------- */
  async function pollCall(id, choice) {
    const res = choice == null
      ? await fetch(API + '/poll?id=' + encodeURIComponent(id))
      : await fetch(API + '/poll/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, choice }) });
    let j = {}; try { j = await res.json(); } catch (e) {}
    return j;
  }
  const myVote = id => { try { const v = localStorage.getItem('hb-vote:' + id); return v === null ? null : +v; } catch (e) { return null; } };
  const saveVote = (id, v) => { try { localStorage.setItem('hb-vote:' + id, String(v)); } catch (e) {} };

  function bars(box, labels, res, mine) {
    box.textContent = '';
    box.classList.add('shown');
    const total = res.total || 0;
    labels.forEach((lab, i) => {
      const n = res.counts[i] || 0, pct = total ? Math.round(n / total * 100) : 0;
      const row = el('div', 'bk-pbar' + (mine === i ? ' mine' : ''));
      const top = el('div', 'bk-ptop'); top.append(el('span', '', lab), el('b', '', pct + '%  (' + n + ')'));
      const track = el('div', 'bk-ptrack'), fill = el('i'); fill.style.width = '0%'; track.append(fill);
      row.append(top, track); box.append(row);
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pct + '%'; }));
    });
    box.append(el('small', 'bk-pnote', total + (total === 1 ? ' VOTE' : ' VOTES') + (res.closed ? '  |  CLOSED' : '') + (mine != null ? '  |  YOU VOTED' : '')));
  }

  /* ---------- the common style options every block has ---------- */
  const COMMON = [
    { k: 'look', label: 'LOOK', type: 'select', options: ['plain', 'box', 'accent', 'glow', 'glass'] },
    { k: 'align', label: 'ALIGN TEXT', type: 'select', options: ['left', 'center', 'right'] },
    { k: 'width', label: 'WIDTH', type: 'select', options: ['full', 'wide', 'narrow'] },
    { k: 'anim', label: 'WHEN IT APPEARS', type: 'select', options: ['none', 'fade', 'slide', 'pop'] },
    { k: 'show', label: 'SHOW ON', type: 'select', options: ['all', 'desktop', 'mobile'] }
  ];

  /* ---------- the block types ---------- */
  const TYPES = {
    heading: { label: 'HEADING', group: 'TEXT', help: 'A big title for a section.',
      defaults: () => ({ text: 'NEW SECTION', size: 'medium' }),
      fields: [{ k: 'text', label: 'TEXT', type: 'text', max: 200 }, { k: 'size', label: 'SIZE', type: 'select', options: ['large', 'medium', 'small'] }],
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
      fields: [{ k: 'text', label: 'TEXT', type: 'area', rows: 3 }, { k: 'tone', label: 'TONE', type: 'select', options: ['info', 'warning', 'success'] }],
      render: b => { const d = el('div', 'bk-callout tone-' + b.tone); d.append(paras(b.text)); return d; } },
    list: { label: 'LIST', group: 'TEXT', help: 'Features, tips or steps.',
      defaults: () => ({ title: 'FEATURES', style: 'bullets', items: ['First thing', 'Second thing', 'Third thing'] }),
      fields: [{ k: 'title', label: 'TITLE (OPTIONAL)', type: 'text', max: 120 }, { k: 'style', label: 'STYLE', type: 'select', options: ['bullets', 'numbers', 'checks'] }, { k: 'items', label: 'ITEMS', type: 'lines', lines: 'strings' }],
      render: b => { const d = el('div', 'bk-list'); if (b.title) d.append(el('h4', 'bk-sub', b.title)); const ul = el(b.style === 'numbers' ? 'ol' : 'ul', 'st-' + b.style); b.items.forEach(t => { const li = el('li'); li.append(inline(t)); ul.append(li); }); d.append(ul); return d; } },
    columns: { label: 'COLUMNS', group: 'TEXT', help: 'Two to four text columns side by side.',
      defaults: () => ({ cols: [{ title: 'ONE', text: 'First column.' }, { title: 'TWO', text: 'Second column.' }] }),
      fields: [{ k: 'cols', label: 'COLUMNS', type: 'lines', lines: 'cols', rows: 8 }],
      render: b => { const d = el('div', 'bk-cols n' + Math.max(1, b.cols.length)); b.cols.forEach(c => { const col = el('div', 'bk-col'); if (c.title) col.append(el('h4', 'bk-sub', c.title)); col.append(paras(c.text)); d.append(col); }); return d; } },
    table: { label: 'TABLE', group: 'TEXT', help: 'A simple table. Separate cells with |.',
      defaults: () => ({ title: '', header: true, rows: [['NAME', 'VALUE'], ['One', '1'], ['Two', '2']] }),
      fields: [{ k: 'title', label: 'TITLE (OPTIONAL)', type: 'text', max: 100 }, { k: 'header', label: 'FIRST ROW IS A HEADING', type: 'check' }, { k: 'rows', label: 'ROWS', type: 'lines', lines: 'table', rows: 6 }],
      render: b => {
        const d = el('div', 'bk-table'); if (b.title) d.append(el('h4', 'bk-sub', b.title));
        const wrap = el('div', 'bk-tscroll'), t = el('table');
        b.rows.forEach((r, i) => { const tr = el('tr'); r.forEach(c => tr.append(el(i === 0 && b.header ? 'th' : 'td', '', c))); t.append(tr); });
        wrap.append(t); d.append(wrap); return d;
      } },

    image: { label: 'IMAGE', group: 'MEDIA', help: 'One picture. Click it on the page to view it big.',
      defaults: () => ({ src: '', caption: '', size: 'wide' }),
      fields: [{ k: 'src', label: 'PICTURE', type: 'image', max: 1600 }, { k: 'caption', label: 'CAPTION (OPTIONAL)', type: 'text', max: 200 }, { k: 'size', label: 'PICTURE SIZE', type: 'select', options: ['full', 'wide', 'medium', 'small'] }],
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
    audio: { label: 'AUDIO PLAYER', group: 'MEDIA', help: 'A music or sound player. Paste a link to an MP3, OGG or WAV file.',
      defaults: () => ({ title: 'SOUNDTRACK', url: '', loop: false }),
      fields: [{ k: 'title', label: 'TITLE', type: 'text', max: 120 }, { k: 'url', label: 'AUDIO FILE LINK', type: 'url', max: 500, ph: 'https://.../song.mp3', hint: 'TIP: UPLOAD THE FILE IN A DOWNLOAD ELEMENT, THEN PASTE ITS LINK HERE.' }, { k: 'loop', label: 'REPEAT', type: 'check' }],
      render: b => {
        const d = el('div', 'bk-audio'); if (b.title) d.append(el('h4', 'bk-sub', b.title));
        if (!b.url || b.url === '#') { d.append(el('div', 'bk-empty', 'NO AUDIO FILE YET')); return d; }
        const a = document.createElement('audio'); a.controls = true; a.preload = 'none'; a.loop = !!b.loop; a.src = b.url; d.append(a); return d;
      } },
    embed: { label: 'EMBED', group: 'MEDIA', help: 'An itch.io widget, a Discord server widget or a game that plays on the page.',
      defaults: () => ({ url: '', height: '167' }),
      fields: [{ k: 'url', label: 'EMBED LINK', type: 'text', max: 500, ph: 'https://itch.io/embed/123456', hint: 'ALLOWED: ITCH.IO EMBEDS, ITCH.ZONE GAMES, DISCORD WIDGETS (discord.com/widget?id=...), YOUTUBE, VIMEO.' }, { k: 'height', label: 'HEIGHT IN PIXELS', type: 'text', max: 5 }],
      render: b => {
        const src = embedUrl(b.url), d = el('div', 'bk-embed');
        if (!src) { d.append(el('div', 'bk-empty', b.url ? 'THAT EMBED LINK IS NOT ALLOWED' : 'NO EMBED YET')); return d; }
        d.append(frame(src, '', num(b.height, 167, 80, 1200))); return d;
      } },
    hero: { label: 'HERO BANNER', group: 'MEDIA', help: 'A big picture with a title, a line of text and a button on top.',
      defaults: () => ({ image: '', title: 'BIG TITLE', subtitle: 'A short line about it.', label: '', url: '', height: '320' }),
      fields: [{ k: 'image', label: 'BACKGROUND PICTURE', type: 'image', max: 1800 }, { k: 'title', label: 'TITLE', type: 'text', max: 120 }, { k: 'subtitle', label: 'SUBTITLE', type: 'text', max: 200 },
        { k: 'label', label: 'BUTTON TEXT (OPTIONAL)', type: 'text', max: 60 }, { k: 'url', label: 'BUTTON LINK', type: 'url', max: 500, ph: 'https://' }, { k: 'height', label: 'HEIGHT', type: 'select', options: ['220', '320', '420', '520'] }],
      render: b => {
        const d = el('div', 'bk-hero'); d.style.minHeight = num(b.height, 320, 160, 700) + 'px';
        if (b.image) d.style.backgroundImage = cssUrl(b.image);
        const in1 = el('div', 'bk-hero-in'); if (b.title) in1.append(el('h2', '', b.title)); if (b.subtitle) in1.append(el('p', '', b.subtitle));
        if (b.label) { const a = el('a', 'bk-btn solid', b.label); a.href = b.url || '#'; if (a.getAttribute('href') !== '#') { a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-ext', ''); } in1.append(a); }
        d.append(in1); return d;
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
    cards: { label: 'CARDS', group: 'ACTION', help: 'A grid of cards, each with a title, a line of text, a link and a picture.',
      defaults: () => ({ columns: '3', items: [{ title: 'ONE', text: 'About the first thing.', url: '', image: '' }, { title: 'TWO', text: 'About the second thing.', url: '', image: '' }, { title: 'THREE', text: 'About the third thing.', url: '', image: '' }] }),
      fields: [{ k: 'columns', label: 'COLUMNS', type: 'select', options: ['2', '3', '4'] }, { k: 'items', label: 'CARDS', type: 'lines', lines: 'cards', rows: 6 }],
      render: b => {
        const d = el('div', 'bk-cards c' + b.columns);
        b.items.forEach(c => {
          const card = el(c.url ? 'a' : 'div', 'bk-card'); if (c.url) { card.href = c.url; card.target = '_blank'; card.rel = 'noopener'; card.setAttribute('data-ext', ''); }
          if (c.image) { const im = el('span', 'bk-card-img'); im.style.backgroundImage = cssUrl(c.image); card.append(im); }
          const body = el('span', 'bk-card-body'); if (c.title) body.append(el('strong', '', c.title)); if (c.text) body.append(el('small', '', c.text)); card.append(body); d.append(card);
        });
        return d;
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
    roadmap: { label: 'ROADMAP', group: 'INFO', help: 'A timeline of what is done, in progress and planned.',
      defaults: () => ({ title: 'ROADMAP', items: [{ status: 'done', date: '2026-10', title: 'Prototype', notes: '' }, { status: 'doing', date: '2026-11', title: 'First release', notes: '' }, { status: 'planned', date: '2027', title: 'More levels', notes: '' }] }),
      fields: [{ k: 'title', label: 'TITLE (OPTIONAL)', type: 'text', max: 100 }, { k: 'items', label: 'STEPS', type: 'lines', lines: 'roadmap', rows: 6 }],
      render: b => {
        const d = el('div', 'bk-road'); if (b.title) d.append(el('h4', 'bk-sub', b.title));
        b.items.forEach(x => { const r = el('div', 'bk-step st-' + x.status); const dot = el('i'); dot.setAttribute('aria-hidden', 'true'); const body = el('div'); const top = el('div', 'bk-step-top'); top.append(el('b', '', x.title), el('small', '', x.date + (x.date ? '  |  ' : '') + x.status.toUpperCase())); body.append(top); if (x.notes) body.append(el('p', '', x.notes)); r.append(dot, body); d.append(r); });
        return d;
      } },
    progress: { label: 'PROGRESS BARS', group: 'INFO', help: 'Bars that fill up, like development progress.',
      defaults: () => ({ title: 'DEVELOPMENT', items: [{ label: 'Story', value: 80 }, { label: 'Levels', value: 55 }, { label: 'Sound', value: 30 }] }),
      fields: [{ k: 'title', label: 'TITLE (OPTIONAL)', type: 'text', max: 100 }, { k: 'items', label: 'BARS', type: 'lines', lines: 'progress', rows: 4 }],
      render: b => {
        const d = el('div', 'bk-progress'); if (b.title) d.append(el('h4', 'bk-sub', b.title));
        const fills = [];
        b.items.forEach(x => { const r = el('div', 'bk-pbar'); const top = el('div', 'bk-ptop'); top.append(el('span', '', x.label), el('b', '', x.value + '%')); const tr = el('div', 'bk-ptrack'), f = el('i'); f.style.width = '0%'; tr.append(f); r.append(top, tr); d.append(r); fills.push([f, x.value]); });
        onVisible(d, () => fills.forEach(([f, v]) => { f.style.width = v + '%'; }));
        return d;
      } },
    stats: { label: 'BIG NUMBERS', group: 'INFO', help: 'Numbers that count up, like downloads or players.',
      defaults: () => ({ items: [{ value: '12,000+', label: 'DOWNLOADS' }, { value: '4.8', label: 'RATING' }, { value: '30', label: 'LEVELS' }] }),
      fields: [{ k: 'items', label: 'NUMBERS', type: 'lines', lines: 'stats', rows: 4 }],
      render: b => {
        const d = el('div', 'bk-stats'), runs = [];
        b.items.forEach(x => {
          const s = el('div', 'bk-stat'), n = el('b', '', x.value); s.append(n, el('small', '', x.label)); d.append(s);
          const m = /^([^\d]*)([\d][\d,]*(?:\.\d+)?)(.*)$/.exec(x.value);
          if (m) { const target = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, comma = m[2].includes(','); runs.push([n, m[1], target, dec, comma, m[3]]); }
        });
        onVisible(d, () => runs.forEach(([n, pre, target, dec, comma, post]) => {
          const t0 = performance.now(), fmt = v => { const t = v.toFixed(dec); return pre + (comma ? Number(t).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : t) + post; };
          (function step(now) { const k = Math.min(1, (now - t0) / 1200); n.textContent = fmt(target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0);
        }));
        return d;
      } },
    devs: { label: 'TEAM', group: 'INFO', help: 'Shows your team from the Devs tab.',
      defaults: () => ({ title: 'THE TEAM' }),
      fields: [{ k: 'title', label: 'TITLE (OPTIONAL)', type: 'text', max: 100 }],
      render: (b, ctx) => {
        const d = el('div', 'bk-devs'); if (b.title) d.append(el('h4', 'bk-sub', b.title));
        const row = el('div', 'bk-devrow');
        ((ctx && ctx.devs) || (window.SITE && window.SITE.devs) || []).forEach(v => {
          const card = el('a', 'bk-dev'); card.href = v.url; card.target = '_blank'; card.rel = 'noopener'; card.setAttribute('data-ext', '');
          let av;
          if (v.pfp && !v.avatar) { av = el('b', 'av pfp'); av.style.cssText = '--cx:' + v.pfp.cx + ';--cy:' + v.pfp.cy + ';--r:' + v.pfp.r; }
          else if (v.avatar) { av = el('b', 'av img'); av.style.backgroundImage = cssUrl(v.avatar); }
          else av = el('b', 'av ltr', (v.name[0] || '?').toUpperCase());
          av.classList.add('shape-' + (v.shape || 'circle'));
          card.append(av, el('strong', '', v.name), el('small', '', v.role)); row.append(card);
        });
        d.append(row); return d;
      } },

    poll: { label: 'POLL', group: 'INTERACT', help: 'A question visitors can vote on. One vote per person. Goes live when you publish.', needsUid: true,
      defaults: () => ({ question: 'What should we make next?', options: ['A sequel', 'A new game', 'More levels'], results: 'after', closes: '', uid: '', rev: '0' }),
      fields: [{ k: 'question', label: 'QUESTION', type: 'text', max: 200 }, { k: 'options', label: 'OPTIONS (2 TO 8)', type: 'lines', lines: 'strings', rows: 5 },
        { k: 'results', label: 'SHOW RESULTS', type: 'select', options: ['after', 'always'] }, { k: 'closes', label: 'CLOSES ON (OPTIONAL)', type: 'text', max: 20, ph: '2027-01-31 18:00', hint: 'YEAR-MONTH-DAY HOUR:MINUTE. LEAVE EMPTY TO KEEP IT OPEN.' },
        { k: 'uid', type: 'text', max: 20, hidden: true }, { k: 'rev', type: 'text', max: 4, hidden: true }],
      render: (b, ctx) => {
        const d = el('div', 'bk-poll'); d.append(el('h4', 'bk-sub', b.question || 'POLL'));
        const opts = b.options.slice(0, 8), box = el('div', 'bk-poll-opts'), note = el('small', 'bk-pnote');
        const id = ((ctx && ctx.ownerId) || 'x') + '.' + b.uid + '.' + (b.rev || 0);
        d.append(box, note);
        const buttons = enabled => { box.textContent = ''; box.classList.remove('shown'); opts.forEach((o, i) => { const bt = el('button', 'bk-popt', o); bt.type = 'button'; bt.disabled = !enabled; if (enabled) bt.addEventListener('click', () => vote(i)); box.append(bt); }); };
        if (!opts.length || !b.uid) { d.append(el('div', 'bk-empty', 'ADD AT LEAST TWO OPTIONS')); return d; }
        if (ctx && ctx.preview) { buttons(false); note.textContent = 'PREVIEW: VOTING TURNS ON WHEN YOU PUBLISH.'; return d; }
        const show = (res, mine) => { saveVote(id, mine); bars(box, opts, res, mine); note.textContent = ''; };
        const vote = async i => {
          note.textContent = 'SENDING YOUR VOTE...'; box.querySelectorAll('button').forEach(x => { x.disabled = true; });
          try { const r = await pollCall(id, i); if (r.counts) show(r, r.voted != null ? r.voted : i); else { buttons(true); note.textContent = r.error || 'COULD NOT SEND THE VOTE'; } }
          catch (e) { buttons(true); note.textContent = 'VOTING IS OFFLINE RIGHT NOW. TRY LATER.'; }
        };
        buttons(true); note.textContent = 'LOADING...';
        pollCall(id).then(r => {
          if (!r.counts) { note.textContent = r.error || ''; return; }
          const mine = r.voted != null ? r.voted : myVote(id);
          if (mine != null || r.closed || b.results === 'always') show(r, mine); else { note.textContent = r.total ? r.total + (r.total === 1 ? ' VOTE SO FAR' : ' VOTES SO FAR') : 'BE THE FIRST TO VOTE'; }
        }).catch(() => { note.textContent = 'VOTING IS OFFLINE RIGHT NOW.'; });
        return d;
      } },
    rating: { label: 'STAR RATING', group: 'INTERACT', help: 'Visitors rate from 1 to 5 stars. One vote per person. Goes live when you publish.', needsUid: true,
      defaults: () => ({ title: 'RATE THIS GAME', uid: '', rev: '0' }),
      fields: [{ k: 'title', label: 'TITLE', type: 'text', max: 120 }, { k: 'uid', type: 'text', max: 20, hidden: true }, { k: 'rev', type: 'text', max: 4, hidden: true }],
      render: (b, ctx) => {
        const d = el('div', 'bk-rating'); d.append(el('h4', 'bk-sub', b.title || 'RATING'));
        const row = el('div', 'bk-stars'), note = el('small', 'bk-pnote'); d.append(row, note);
        const id = ((ctx && ctx.ownerId) || 'x') + '.' + b.uid + '.' + (b.rev || 0);
        const paint = (avg, mine, enabled) => { row.textContent = ''; for (let i = 0; i < 5; i++) { const s = el('button', 'bk-star' + (avg >= i + .5 ? ' on' : '') + (mine === i ? ' mine' : ''), '*'); s.type = 'button'; s.setAttribute('aria-label', (i + 1) + ' star' + (i ? 's' : '')); s.disabled = !enabled; if (enabled) s.addEventListener('click', () => vote(i)); row.append(s); } };
        const summary = (r, mine) => { const avg = r.total ? r.counts.reduce((a, c, i) => a + c * (i + 1), 0) / r.total : 0; paint(avg - 0.01 > 0 ? avg - 0.01 : 0, mine != null ? mine : null, mine == null && !r.closed); note.textContent = r.total ? avg.toFixed(1) + ' / 5  |  ' + r.total + (r.total === 1 ? ' RATING' : ' RATINGS') + (mine != null ? '  |  YOU GAVE ' + (mine + 1) : '') : 'NO RATINGS YET'; };
        if (!b.uid) { d.append(el('div', 'bk-empty', 'NOT READY')); return d; }
        if (ctx && ctx.preview) { paint(0, null, false); note.textContent = 'PREVIEW: RATINGS TURN ON WHEN YOU PUBLISH.'; return d; }
        const vote = async i => { note.textContent = 'SENDING...'; try { const r = await pollCall(id, i); if (r.counts) { saveVote(id, r.voted != null ? r.voted : i); summary(r, r.voted != null ? r.voted : i); } else note.textContent = r.error || 'COULD NOT SEND'; } catch (e) { note.textContent = 'RATINGS ARE OFFLINE RIGHT NOW.'; } };
        paint(0, null, true); note.textContent = 'LOADING...';
        pollCall(id).then(r => { if (!r.counts) { note.textContent = r.error || ''; return; } const mine = r.voted != null ? r.voted : myVote(id); summary(r, mine); }).catch(() => { note.textContent = 'RATINGS ARE OFFLINE RIGHT NOW.'; });
        return d;
      } },
    tabs: { label: 'TABS', group: 'INTERACT', help: 'Content split into tabs that visitors click between.',
      defaults: () => ({ tabs: [{ title: 'ABOUT', text: 'First tab text.' }, { title: 'CONTROLS', text: 'Second tab text.' }] }),
      fields: [{ k: 'tabs', label: 'TABS', type: 'lines', lines: 'tabs', rows: 8 }],
      render: b => {
        const d = el('div', 'bk-tabs'), bar = el('div', 'bk-tabbar'), panels = [];
        bar.setAttribute('role', 'tablist');
        const pick = i => { bar.querySelectorAll('button').forEach((x, k) => { x.classList.toggle('on', k === i); x.setAttribute('aria-selected', k === i); }); panels.forEach((p, k) => { p.hidden = k !== i; }); };
        b.tabs.forEach((t, i) => { const bt = el('button', 'bk-tab', t.title || 'TAB ' + (i + 1)); bt.type = 'button'; bt.setAttribute('role', 'tab'); bt.addEventListener('click', () => pick(i)); bar.append(bt); const p = el('div', 'bk-tabpanel'); p.setAttribute('role', 'tabpanel'); p.append(paras(t.text)); panels.push(p); d.append(p); });
        d.prepend(bar); if (b.tabs.length) pick(0); return d;
      } },
    typewriter: { label: 'TYPEWRITER', group: 'INTERACT', help: 'Lines of text typed out one letter at a time, like a terminal.',
      defaults: () => ({ lines: ['BOOTING...', 'LOADING THE FACTORY...', 'READY.'], prefix: '> ', speed: 'normal', loop: false }),
      fields: [{ k: 'lines', label: 'LINES', type: 'lines', lines: 'strings', rows: 4 }, { k: 'prefix', label: 'START OF EACH LINE', type: 'text', max: 10 }, { k: 'speed', label: 'SPEED', type: 'select', options: ['slow', 'normal', 'fast'] }, { k: 'loop', label: 'REPEAT FOREVER', type: 'check' }],
      render: (b, ctx) => {
        const d = el('pre', 'bk-type'), cur = el('span', 'bk-cur', '_'); d.append(cur);
        const ms = { slow: 90, normal: 45, fast: 20 }[b.speed] || 45;
        const full = b.lines.map(l => (b.prefix || '') + l);
        if (ctx && ctx.preview) { d.textContent = full.join('\n'); return d; }
        const run = async () => {
          do { d.textContent = ''; d.append(cur);
            for (const l of full) { const tn = document.createTextNode(''); d.insertBefore(tn, cur); for (const ch of l) { if (!d.isConnected) return; tn.nodeValue += ch; await new Promise(r => setTimeout(r, ms)); } d.insertBefore(document.createTextNode('\n'), cur); await new Promise(r => setTimeout(r, 350)); }
            if (b.loop) await new Promise(r => setTimeout(r, 1800));
          } while (b.loop && d.isConnected);
        };
        onVisible(d, run); return d;
      } },
    marquee: { label: 'SCROLLING TEXT', group: 'INTERACT', help: 'A line of text that scrolls across the page.',
      defaults: () => ({ text: '/// NEW GAME COMING SOON /// STAY TUNED ///', speed: 'normal' }),
      fields: [{ k: 'text', label: 'TEXT', type: 'text', max: 300 }, { k: 'speed', label: 'SPEED', type: 'select', options: ['slow', 'normal', 'fast'] }],
      render: b => { const d = el('div', 'bk-marquee sp-' + b.speed), tr = el('div', 'bk-mtrack'); for (let i = 0; i < 2; i++) { const s = el('span', '', (b.text + '   ').repeat(4)); if (i) s.setAttribute('aria-hidden', 'true'); tr.append(s); } d.append(tr); return d; } },

    divider: { label: 'DIVIDER', group: 'LAYOUT', help: 'A line between sections.',
      defaults: () => ({ style: 'line' }), fields: [{ k: 'style', label: 'LOOK', type: 'select', options: ['line', 'dashed', 'dots'] }],
      render: b => el('hr', 'bk-hr st-' + b.style) },
    spacer: { label: 'SPACE', group: 'LAYOUT', help: 'Empty room between things.',
      defaults: () => ({ size: '40' }), fields: [{ k: 'size', label: 'HEIGHT IN PIXELS', type: 'text', max: 4 }],
      render: b => { const d = el('div', 'bk-space'); d.style.height = num(b.size, 40, 4, 400) + 'px'; d.setAttribute('aria-hidden', 'true'); return d; } }
  };

  /* ---------- make a block, clean a block, show blocks ---------- */
  const newBlock = type => { const b = Object.assign({ type }, TYPES[type].defaults()); COMMON.forEach(f => { b[f.k] = f.options[0]; }); if (TYPES[type].needsUid) b.uid = randId(); return b; };
  // a copy of a block that must not share votes with the original
  const freshen = b => { if (TYPES[b.type] && TYPES[b.type].needsUid) { b.uid = randId(); b.rev = '0'; } return b; };

  function cleanBlock(b) {
    const T = b && TYPES[b.type]; if (!T) return null;
    const d = T.defaults(), out = { type: b.type };
    T.fields.forEach(f => {
      const v = b[f.k];
      if (f.type === 'text') out[f.k] = str(v, f.max || 300);
      else if (f.type === 'area') out[f.k] = str(v, 20000);
      else if (f.type === 'check') out[f.k] = v === undefined ? !!d[f.k] : !!v;
      else if (f.type === 'select') out[f.k] = f.options.includes(v) ? v : (f.options.includes(d[f.k]) ? d[f.k] : f.options[0]);
      else if (f.type === 'image') out[f.k] = safeImg(v);
      else if (f.type === 'images') out[f.k] = arr(v).map(safeImg).filter(Boolean).slice(0, 40);
      else if (f.type === 'file') out[f.k] = safeUrl(v) === '#' && v !== '#' ? '' : safeUrl(v);
      else if (f.type === 'url') out[f.k] = v && safeUrl(v) !== '#' ? safeUrl(v) : '';
      else if (f.type === 'lines') out[f.k] = LINES[f.lines].clean(v === undefined ? d[f.k] : v);
    });
    if (T.needsUid) { out.uid = str(b.uid, 20).replace(/[^a-z0-9]/g, ''); out.rev = String(num(b.rev, 0, 0, 9999)); }
    COMMON.forEach(f => { out[f.k] = f.options.includes(b[f.k]) ? b[f.k] : f.options[0]; });
    return out;
  }
  const cleanBlocks = list => arr(list).map(cleanBlock).filter(Boolean).slice(0, 120);

  function render(list, ctx) {
    ctx = ctx || {};
    const box = el('div', 'bk-page');
    const io = !ctx.preview && 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
    list.forEach(b => {
      const T = TYPES[b.type]; if (!T) return;
      let node;
      try { node = T.render(b, ctx); } catch (e) { node = el('div', 'bk-empty', 'THIS BLOCK COULD NOT BE SHOWN'); }
      const wrap = el('section', ['bk', 'bk-' + b.type, 'look-' + (b.look || 'plain'), 'al-' + (b.align || 'left'), 'w-' + (b.width || 'full'), 'show-' + (b.show || 'all')].join(' '));
      if (io && b.anim && b.anim !== 'none') { wrap.classList.add('anim-' + b.anim, 'pre'); io.observe(wrap); }
      wrap.append(node); box.append(wrap);
    });
    return box;
  }

  // every picture inside a page's blocks, as [owner, key, name] so the panel can swap pasted pictures for uploaded files
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
    const pick = b.text || b.question || b.title || b.url || b.label || (b.items && b.items[0] && (b.items[0].label || b.items[0].q || b.items[0].title || b.items[0].value || b.items[0])) || (b.images && (b.images.length + ' pictures')) || (b.file && fileLabel(b.file)) || (b.rows && b.rows.length + ' rows') || (b.cols && b.cols.length + ' columns') || (b.tabs && b.tabs.length + ' tabs') || (b.lines && b.lines[0]) || '';
    return String(typeof pick === 'string' ? pick : '').replace(/\s+/g, ' ').slice(0, 70);
  }

  window.HBBlocks = { types: TYPES, lines: LINES, common: COMMON, newBlock, freshen, cleanBlock, cleanBlocks, render, collectImages, summary, safeUrl, safeImg, lightbox, fileLabel };
})();
