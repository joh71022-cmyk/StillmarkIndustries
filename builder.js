/* The page builder inside the mod panel: add elements, drag them into order, edit them, upload pictures and
   downloadable files, preview the page. It works directly on a game's `blocks`. */
(() => {
  const B = window.HBBlocks;
  const GROUPS = ['TEXT', 'MEDIA', 'ACTION', 'INFO', 'INTERACT', 'LAYOUT'];
  const ACCENTS = ['', 'white', 'cyan', 'magenta', 'lime', 'amber', 'red'];
  const MOVE = 'application/x-hb-move', NEW = 'application/x-hb-new';
  const fmtSize = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  function starter(kind, g) {
    const mk = (type, extra) => Object.assign(B.newBlock(type), extra || {});
    if (kind === 'legacy') {
      const out = [];
      if (g.blurb) out.push(mk('text', { text: g.blurb }));
      if (g.info && g.info.length) out.push(mk('facts', { title: '', rows: g.info.map(r => [r[0], r[1]]) }));
      if (g.buttons && g.buttons.length) out.push(mk('buttons', { items: g.buttons.map(b => ({ label: b.label, url: b.url, style: 'solid' })) }));
      return out.length ? out : [mk('text')];
    }
    if (kind === 'simple') return [mk('text'), mk('buttons')];
    if (kind === 'about') return [mk('hero', { title: g.name || 'ABOUT US', subtitle: 'Who we are and what we make.', height: '320' }), mk('text', { text: 'Tell your story here.\n\nWho you are, what you make and why.' }), mk('devs'), mk('stats'), mk('socials')];
    if (kind === 'news') return [mk('heading', { text: 'LATEST NEWS', size: 'large' }), mk('changelog', { title: '', entries: [{ version: 'NEW', date: '2026-10-31', notes: 'Write your first news post here.' }] }), mk('socials')];
    if (kind === 'press') return [mk('heading', { text: 'PRESS KIT', size: 'large' }), mk('text', { text: 'A short description for people writing about us.' }), mk('facts', { title: 'FAST FACTS' }), mk('download', { title: 'LOGOS AND SCREENSHOTS (ZIP)' }), mk('gallery'), mk('credits')];
    if (kind === 'itch') return [
      mk('text', { text: 'Tell people what ' + (g.name || 'your game') + ' is about in a few sentences.\n\n**Bold** words and [links](https://example.com) work too.' }),
      mk('buttons'), mk('download'), mk('gallery'), mk('facts'), mk('requirements'), mk('faq'), mk('changelog'), mk('socials')
    ];
    return [];
  }

  function create(g, kit) {
    const { h, btn, HB } = kit;
    if (!Array.isArray(g.blocks)) g.blocks = [];
    const expanded = new WeakSet();
    let previewOn = false;
    const list = h('ol', { class: 'bld-list' });
    const preview = h('div', { class: 'bld-preview', hidden: 'true' });
    const root = h('div', { class: 'bld' });

    const refreshPreview = () => {
      if (!previewOn) return;
      preview.textContent = '';
      preview.append(g.blocks.length ? B.render(B.cleanBlocks(g.blocks), { socials: (window.SITE || {}).socials, devs: (window.SITE || {}).devs, ownerId: g.id, preview: true }) : h('p', { class: 'adm-note' }, 'THE PAGE IS EMPTY. ADD AN ELEMENT.'));
    };
    const tick = () => { kit.touch(); refreshPreview(); };

    /* ----- small controls ----- */
    function imageControl(get, set, max) {
      const prev = h('span', { class: 'adm-prev' }), note = h('small', { class: 'adm-hint' });
      const paint = () => {
        const v = get();
        prev.style.backgroundImage = v ? 'url("' + v.replace(/"/g, '%22') + '")' : ''; prev.classList.toggle('empty', !v);
        note.textContent = v ? (/^data:/.test(v) ? 'NEW PICTURE (UPLOADED WHEN YOU PUBLISH)' : /\.gif($|\?)/i.test(v) ? 'ANIMATED GIF SET' : 'PICTURE SET') : 'NO PICTURE. PNG, JPG, WEBP, OR A GIF (KEEPS ITS ANIMATION).';
      };
      const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
      file.addEventListener('change', async () => {
        if (!file.files[0]) return;
        const isGif = file.files[0].type === 'image/gif'; if (isGif) note.textContent = 'UPLOADING THE GIF...';
        try { set(await kit.pickImage(file.files[0], max || 1400, p => { note.textContent = 'UPLOADING THE GIF... ' + Math.round(p * 100) + '%'; })); HB.fx.buy(); paint(); tick(); } catch (e) { note.textContent = 'ERROR: ' + e.message; HB.fx.err(); }
        file.value = '';
      });
      const url = h('input', { type: 'text', placeholder: 'OR PASTE A PICTURE LINK (https://...)', autocomplete: 'off' });
      url.addEventListener('change', () => { const u = url.value.trim(); if (/^https?:\/\/\S+$/i.test(u)) { set(u); paint(); tick(); } else if (u) { note.textContent = 'LINK MUST START WITH https://'; HB.fx.err(); } });
      paint();
      return h('div', { class: 'adm-imgrow' }, prev, h('div', { class: 'adm-imgctl' }, file, url, btn('REMOVE PICTURE', () => { set(''); paint(); tick(); }), note));
    }

    function imagesControl(b, k, max) {
      const strip = h('div', { class: 'bld-strip' }), note = h('small', { class: 'adm-hint' });
      const paint = () => {
        strip.textContent = '';
        b[k].forEach((src, i) => strip.append(h('span', { class: 'bld-shot', style: 'background-image:url("' + src.replace(/"/g, '%22') + '")' },
          h('button', { type: 'button', 'aria-label': 'Remove picture', onclick: () => { b[k].splice(i, 1); paint(); tick(); } }, 'X'),
          i > 0 ? h('button', { type: 'button', class: 'l', 'aria-label': 'Move left', onclick: () => { [b[k][i - 1], b[k][i]] = [b[k][i], b[k][i - 1]]; paint(); tick(); } }, '<') : null)));
        note.textContent = b[k].length ? b[k].length + ' PICTURE(S)' : 'NO PICTURES YET';
      };
      const file = h('input', { type: 'file', multiple: 'true', accept: 'image/png,image/jpeg,image/webp,image/gif' });
      file.addEventListener('change', async () => {
        for (const f of [...file.files]) { try { if (f.type === 'image/gif') note.textContent = 'UPLOADING ' + f.name + '...'; b[k].push(await kit.pickImage(f, max || 1400, p => { note.textContent = 'UPLOADING ' + f.name + '... ' + Math.round(p * 100) + '%'; })); } catch (e) { note.textContent = 'ERROR: ' + e.message; HB.fx.err(); } }
        file.value = ''; HB.fx.buy(); paint(); tick();
      });
      paint();
      return h('div', { class: 'adm-img' }, strip, file, note);
    }

    function fileControl(b, f, rebuild) {
      const note = h('small', { class: 'adm-hint' }), bar = h('div', { class: 'bld-bar', hidden: 'true' }, h('i'));
      const paint = () => { const v = b[f.k]; note.textContent = v && v !== '#' ? (/github\.com|githubusercontent\.com/.test(v) ? 'FILE: ' + B.fileLabel(v) : 'LINK: ' + v.replace(/^https?:\/\//, '').slice(0, 60)) + (f.sizeKey && b[f.sizeKey] ? '  (' + b[f.sizeKey] + ')' : '') : 'NOTHING YET. UPLOAD A FILE OR PASTE A LINK.'; };
      const file = h('input', Object.assign({ type: 'file' }, f.accept ? { accept: f.accept } : {}));
      file.addEventListener('change', async () => {
        let up = file.files[0]; if (!up) return;
        if (f.videoOnly && !/\.(mp4|webm|m4v|ogv)$/i.test(up.name)) { note.textContent = 'BROWSERS PLAY MP4 OR WEBM VIDEO. CONVERT YOUR FILE FIRST (FOR EXAMPLE WITH HANDBRAKE OR AN ONLINE CONVERTER), THEN UPLOAD IT.'; HB.fx.err(); file.value = ''; return; }
        if (f.unique) up = new File([up], Date.now().toString(36) + '-' + up.name, { type: up.type });   // a fresh name so it never replaces another file
        bar.hidden = false; bar.firstChild.style.width = '0%'; note.textContent = 'UPLOADING ' + up.name + '...';
        try {
          const r = await kit.uploadFile(up, p => { bar.firstChild.style.width = Math.round(p * 100) + '%'; note.textContent = 'UPLOADING ' + up.name + '... ' + Math.round(p * 100) + '%'; });
          b[f.k] = r.url; if (f.sizeKey) b[f.sizeKey] = fmtSize(r.size || up.size); if (f.sizeKey && !b.platform && /\.(exe|msi)$/i.test(up.name)) b.platform = 'Windows';
          HB.fx.ach(); paint(); tick(); if (rebuild) rebuild();
        } catch (e) { note.textContent = 'UPLOAD FAILED: ' + e.message; HB.fx.err(); }
        bar.hidden = true; file.value = '';
      });
      const url = h('input', { type: 'text', placeholder: 'OR PASTE A DOWNLOAD LINK (https://...)', autocomplete: 'off' });
      url.addEventListener('change', () => { const u = url.value.trim(); if (/^https?:\/\/\S+$/i.test(u)) { b[f.k] = u; paint(); tick(); if (rebuild && !f.sizeKey) rebuild(); } else if (u) { note.textContent = 'LINK MUST START WITH https://'; HB.fx.err(); } });
      paint();
      return h('div', { class: 'adm-img' }, file, bar, url, btn('REMOVE', () => { b[f.k] = ''; if (f.sizeKey) b[f.sizeKey] = ''; paint(); tick(); }), note,
        h('small', { class: 'adm-hint' }, f.hint || 'FILES UP TO 95 MB. ZIP, EXE, APK, DMG, PDF, MP3, MP4 AND SIMILAR. FOR BIGGER FILES PASTE A LINK.'));
    }

    function field(b, f, rebuild) {
      const id = 'bf-' + Math.random().toString(36).slice(2, 8);
      const label = text => h('label', { for: id }, text);
      let ctl;
      if (f.type === 'text' || f.type === 'url') { ctl = h('input', { id, type: 'text', autocomplete: 'off', placeholder: f.ph || '' }); ctl.value = b[f.k] || ''; ctl.addEventListener('input', () => { b[f.k] = ctl.value.slice(0, f.max || 300); tick(); }); }
      else if (f.type === 'area') { ctl = h('textarea', { id, rows: f.rows || 4 }); ctl.value = b[f.k] || ''; ctl.addEventListener('input', () => { b[f.k] = ctl.value; tick(); }); }
      else if (f.type === 'check') { ctl = h('input', { id, type: 'checkbox' }); ctl.checked = !!b[f.k]; ctl.addEventListener('change', () => { b[f.k] = ctl.checked; tick(); }); return h('div', { class: 'bld-field' }, h('label', { for: id, class: 'chk' }, ctl, f.label)); }
      else if (f.type === 'select') { ctl = h('select', { id }, f.options.map(o => h('option', { value: o }, o.toUpperCase()))); ctl.value = b[f.k]; ctl.addEventListener('change', () => { b[f.k] = ctl.value; tick(); }); }
      else if (f.type === 'lines') { const L = B.lines[f.lines]; ctl = h('textarea', { id, rows: f.rows || 4 }); ctl.value = L.fmt(b[f.k] || []); ctl.addEventListener('input', () => { b[f.k] = L.parse(ctl.value); tick(); }); }
      else if (f.type === 'image') return h('div', { class: 'adm-img' }, h('span', { class: 'adm-lbl' }, f.label), imageControl(() => b[f.k], v => { b[f.k] = v; }, f.max));
      else if (f.type === 'images') return h('div', { class: 'adm-img' }, h('span', { class: 'adm-lbl' }, f.label), imagesControl(b, f.k, f.max));
      else if (f.type === 'file') return h('div', { class: 'adm-img' }, h('span', { class: 'adm-lbl' }, f.label), fileControl(b, f, rebuild));
      const hint = f.hint || (f.type === 'lines' ? B.lines[f.lines].hint : '');
      return h('div', { class: 'bld-field' }, label(f.label), ctl, hint ? h('small', { class: 'adm-hint' }, hint) : null);
    }

    /* ----- the cards ----- */
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= g.blocks.length) return; [g.blocks[i], g.blocks[j]] = [g.blocks[j], g.blocks[i]]; paint(); tick(); };
    const dup = i => { const c = B.freshen(B.cleanBlock(JSON.parse(JSON.stringify(g.blocks[i]))) || JSON.parse(JSON.stringify(g.blocks[i]))); g.blocks.splice(i + 1, 0, c); expanded.add(c); paint(); tick(); };
    const remove = i => { g.blocks.splice(i, 1); paint(); tick(); };
    const isOurs = e => e.dataTransfer && [...(e.dataTransfer.types || [])].some(t => t === MOVE || t === NEW);

    function drop(index, e) {
      const mv = e.dataTransfer.getData(MOVE), nw = e.dataTransfer.getData(NEW);
      if (nw && B.types[nw]) { const b = B.newBlock(nw); g.blocks.splice(index, 0, b); expanded.add(b); HB.fx.buy(); }
      else if (mv !== '' && g.blocks[+mv]) { const from = +mv; const [b] = g.blocks.splice(from, 1); if (from < index) index--; g.blocks.splice(index, 0, b); HB.fx.click(); }
      paint(); tick();
    }
    const clearMarks = () => list.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after'));
    function makeTarget(li, indexOf, isEnd) {
      li.addEventListener('dragover', e => {
        if (!isOurs(e)) return; e.preventDefault(); clearMarks();
        const r = li.getBoundingClientRect(), after = !isEnd && e.clientY > r.top + r.height / 2;
        li.classList.add(isEnd ? 'drop-before' : after ? 'drop-after' : 'drop-before'); li._after = after;
      });
      li.addEventListener('dragleave', e => { if (!li.contains(e.relatedTarget)) li.classList.remove('drop-before', 'drop-after'); });
      li.addEventListener('drop', e => { if (!isOurs(e)) return; e.preventDefault(); const i = indexOf(); const r = li.getBoundingClientRect(); const after = !isEnd && e.clientY > r.top + r.height / 2; clearMarks(); drop(isEnd ? g.blocks.length : i + (after ? 1 : 0), e); });
    }

    function card(b, i) {
      const T = B.types[b.type], open = expanded.has(b);
      const li = h('li', { class: 'bld-card' + (open ? ' open' : '') });
      const grip = h('span', { class: 'bld-grip', draggable: 'true', title: 'Drag to move' }, '::');
      grip.addEventListener('dragstart', e => { e.dataTransfer.setData(MOVE, String(i)); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setDragImage(li, 12, 12); } catch (x) {} li.classList.add('dragging'); });
      grip.addEventListener('dragend', () => { li.classList.remove('dragging'); clearMarks(); });
      let sure = null;
      const delBtn = btn('DELETE', e => {
        const x = e.currentTarget;
        if (sure) { remove(i); return; }
        x.textContent = 'SURE?'; HB.fx.err(); sure = setTimeout(() => { sure = null; x.textContent = 'DELETE'; }, 2500);
      });
      const sum = h('span', { class: 'bld-sum' }, B.summary(b));
      li.append(h('div', { class: 'bld-head' }, grip, h('b', { class: 'bld-type' }, T.label), sum,
        h('span', { class: 'bld-acts' }, btn('UP', () => move(i, -1)), btn('DOWN', () => move(i, 1)), btn('COPY', () => dup(i)),
          btn(open ? 'CLOSE' : 'EDIT', () => { open ? expanded.delete(b) : expanded.add(b); paint(); }), delBtn)));
      if (open) {
        const body = h('div', { class: 'bld-body' });
        const build = () => { body.textContent = ''; T.fields.filter(f => !f.hidden).forEach(f => body.append(field(b, f, build)));
          if (T.votes) body.append(h('div', { class: 'bld-field' }, btn('RESET VOTES (START A FRESH COUNT)', () => { b.rev = String((+b.rev || 0) + 1); tick(); HB.fx.ok(); }), h('small', { class: 'adm-hint' }, 'VOTES START COUNTING ONCE YOU PUBLISH THIS PAGE. USE RESET IF YOU CHANGE THE OPTIONS.')));
          body.append(h('details', { class: 'bld-style' }, h('summary', {}, 'STYLE: LOOK, ALIGN, WIDTH, ANIMATION'), ...B.common.map(f => field(b, f, build)))); };
        build(); li.append(body);
        body.addEventListener('input', () => { sum.textContent = B.summary(b); });
      }
      makeTarget(li, () => g.blocks.indexOf(b), false);
      return li;
    }

    function paint() {
      list.textContent = '';
      g.blocks.forEach((b, i) => list.append(card(b, i)));
      const end = h('li', { class: 'bld-end' }, g.blocks.length ? 'DROP HERE TO ADD AT THE END' : 'DRAG AN ELEMENT HERE, OR CLICK ONE ABOVE');
      makeTarget(end, () => g.blocks.length, true);
      list.append(end);
      starters.hidden = g.blocks.length > 0;
    }

    /* ----- top: back, preview, page look ----- */
    const addBlock = type => { const b = B.newBlock(type); g.blocks.push(b); expanded.add(b); HB.fx.buy(); paint(); tick(); const last = list.querySelector('.bld-card:last-of-type'); if (last) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    const palette = h('div', { class: 'bld-pal-wrap' });
    GROUPS.forEach(grp => {
      const row = h('div', { class: 'bld-pal-row' }, h('small', {}, grp));
      Object.entries(B.types).filter(([, T]) => T.group === grp).forEach(([type, T]) => {
        const p = h('button', { type: 'button', class: 'bld-pal', draggable: 'true', title: T.help, onclick: () => addBlock(type) }, '+ ' + T.label);
        p.addEventListener('dragstart', e => { e.dataTransfer.setData(NEW, type); e.dataTransfer.effectAllowed = 'copy'; });
        row.append(p);
      });
      palette.append(row);
    });

    const starters = h('div', { class: 'bld-starters' }, h('b', {}, 'START WITH:'),
      ...(kit.isPage
        ? [btn('ABOUT PAGE', () => { g.blocks = starter('about', g); paint(); tick(); }), btn('NEWS PAGE', () => { g.blocks = starter('news', g); paint(); tick(); }), btn('PRESS KIT', () => { g.blocks = starter('press', g); paint(); tick(); })]
        : [btn('MY CURRENT INFO', () => { g.blocks = starter('legacy', g); paint(); tick(); }), btn('ITCH.IO-STYLE PAGE', () => { g.blocks = starter('itch', g); paint(); tick(); })]),
      btn('SIMPLE PAGE', () => { g.blocks = starter('simple', g); paint(); tick(); }),
      h('small', {}, 'OR JUST ADD ELEMENTS BELOW.'));

    const accent = h('select', { id: 'bld-acc' }, ACCENTS.map(a => h('option', { value: a }, (a || 'default (white)').toUpperCase())));
    accent.value = g.accent || ''; accent.addEventListener('change', () => { g.accent = accent.value; tick(); });
    const simple = (label, key, type, options, hint) => {
      const id = 'bp-' + key; let ctl;
      if (type === 'check') { ctl = h('input', { id, type: 'checkbox' }); ctl.checked = key === 'showTitle' ? g[key] !== false : !!g[key]; ctl.addEventListener('change', () => { g[key] = ctl.checked; tick(); }); return h('div', { class: 'bld-field' }, h('label', { for: id, class: 'chk' }, ctl, label)); }
      if (type === 'select') { ctl = h('select', { id }, options.map(o => h('option', { value: o }, o.toUpperCase()))); ctl.value = g[key] || options[0]; ctl.addEventListener('change', () => { g[key] = ctl.value; tick(); }); }
      else { ctl = h('input', { id, type: 'text', autocomplete: 'off', placeholder: hint || '' }); ctl.value = g[key] || ''; ctl.addEventListener('input', () => { g[key] = ctl.value.trim(); tick(); }); }
      return h('div', { class: 'bld-field' }, h('label', { for: id }, label), ctl);
    };
    const look = h('details', { class: 'bld-look' }, h('summary', {}, 'PAGE LOOK: BANNER, COLOURS, WIDTH, BACKGROUND'),
      h('div', { class: 'adm-img' }, h('span', { class: 'adm-lbl' }, 'BANNER PICTURE (WIDE, ACROSS THE TOP)'), imageControl(() => g.banner || '', v => { g.banner = v; }, 1800)),
      h('div', { class: 'bld-field' }, h('label', { for: 'bld-acc' }, 'ACCENT COLOUR (PRESET)'), accent),
      simple('OR YOUR OWN ACCENT COLOUR (HEX, LIKE #ff8800)', 'accentHex', 'text', null, '#ff8800'),
      simple('PAGE WIDTH', 'width', 'select', ['normal', 'narrow', 'wide']),
      simple('BACKGROUND', 'bg', 'select', ['default', 'plain', 'grid', 'dots', 'stars']),
      simple('SUBTITLE UNDER THE TITLE (OPTIONAL)', 'subtitle', 'text', null, 'A SHORT LINE'),
      simple('SHOW THE PAGE TITLE', 'showTitle', 'check'),
      simple('HIDE THE SPINNING GEAR BEHIND THE TITLE', 'hideGear', 'check'));

    const prevBtn = btn('SHOW PREVIEW', () => { previewOn = !previewOn; preview.hidden = !previewOn; prevBtn.textContent = previewOn ? 'HIDE PREVIEW' : 'SHOW PREVIEW'; refreshPreview(); });
    root.append(
      h('div', { class: 'bld-bar-top' }, btn('< BACK TO GAMES', () => kit.back()), h('b', {}, (kit.isPage ? 'PAGE BUILDER: ' : 'PAGE BUILDER: ') + (g.name || g.id)), prevBtn),
      h('p', { class: 'adm-note' }, 'CLICK OR DRAG AN ELEMENT INTO THE PAGE. DRAG THE :: HANDLE TO REORDER (OR USE UP / DOWN). EVERYTHING SAVES AS A DRAFT; PRESS PUBLISH WHEN YOU ARE HAPPY.'),
      look, palette, starters, list, preview);
    paint();
    return root;
  }

  window.HBBuilder = { create };
})();
