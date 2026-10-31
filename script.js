(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const body = document.body, root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {} }
  };
  const sess = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k) { try { sessionStorage.setItem(k, '1'); } catch (e) {} }
  };

  /* ---------- procedural gears ---------- */
  function buildGear(svg) {
    const d = svg.dataset, n = +d.teeth, ro = +d.outer, rr = +d.root;
    const ring = +d.ring || 0, hub = +d.hub || 0, spokes = +d.spokes || 0, box = +d.box || 110;
    const step = Math.PI * 2 / n, pts = [];
    const P = (a, r) => (Math.cos(a) * r).toFixed(2) + ',' + (Math.sin(a) * r).toFixed(2);
    for (let i = 0; i < n; i++) {
      const a = i * step;
      pts.push(P(a - .27 * step, rr), P(a - .17 * step, ro), P(a + .17 * step, ro), P(a + .27 * step, rr), P(a + .5 * step, rr));
    }
    svg.setAttribute('viewBox', `${-box} ${-box} ${box * 2} ${box * 2}`);
    svg.setAttribute('aria-hidden', 'true');
    let h = `<polygon points="${pts.join(' ')}"/>`;
    if (ring) h += `<circle r="${ring}"/>`;
    if (hub) h += `<circle r="${hub}"/>`;
    if (spokes && ring && hub) for (let i = 0; i < spokes; i++) {
      const a = i * Math.PI * 2 / spokes, w = .09;
      h += `<polyline points="${P(a - w, hub)} ${P(a - w, ring)}"/><polyline points="${P(a + w, hub)} ${P(a + w, ring)}"/>`;
    }
    svg.innerHTML = h;
  }
  $$('svg.gear').forEach(buildGear);

  /* ---------- sound engine (all synthesized in the browser, no audio files) ---------- */
  const Snd = (() => {
    let ctx, master, sfxBus, musicBus, nbuf, seq = null, lastHover = 0;
    let sfxOn = store.get('hb-snd', true), musicOn = store.get('hb-music', true);
    const vol = (k, d) => { try { const v = parseFloat(localStorage.getItem(k)); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d; } catch (e) { return d; } };
    const vols = { sfx: vol('hb-vol-sfx', .5), music: vol('hb-vol-music', .35) };
    const live = () => ctx && ctx.state !== 'closed';
    const running = () => live() && ctx.state === 'running';

    function init() {
      if (ctx) { if (ctx.state === 'suspended' && !document.hidden) ctx.resume(); return; }
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.ratio.value = 4; comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = .8; master.connect(comp);
      sfxBus = ctx.createGain(); sfxBus.gain.value = vols.sfx; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      document.addEventListener('visibilitychange', () => {
        if (!live()) return;
        if (document.hidden) ctx.suspend(); else ctx.resume();   // silence when you switch tabs
      });
      if (musicOn) startMusic();
    }

    /* ----- building blocks ----- */
    function voice(dest, type, f0, f1, t, dur, v, lp) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime(v, t + Math.min(.01, dur / 4));
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); f.connect(g); } else o.connect(g);
      g.connect(dest); o.start(t); o.stop(t + dur + .03);
    }
    function hit(dest, t, dur, v, ftype, f0, f1, q) {
      if (!nbuf) {
        nbuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = nbuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = nbuf; s.loop = true;
      f.type = ftype; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + .03);
    }
    // sound effects only play when effects are on and audio is unlocked
    const osc = (type, f0, f1, dur, v, at = 0, lp = 0) => { if (sfxOn && running()) voice(sfxBus, type, f0, f1, ctx.currentTime + at, dur, v, lp); };
    const noise = (dur, v, f0, f1, q = 1, at = 0, ftype = 'bandpass') => { if (sfxOn && running()) hit(sfxBus, ctx.currentTime + at, dur, v, ftype, f0, f1, q); };

    /* ----- the track: an original dark synthwave loop, 108 BPM, A minor ----- */
    const BPM = 108, STEP = 60 / BPM / 4;            // one sixteenth note
    const ROOTS = [0, 8, 3, 10];                      // Am  F  C  G  (semitones above A)
    const CHORDS = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const BASS = { 0: 0, 3: 0, 6: 12, 8: 0, 10: 0, 11: 12, 14: 7 };   // step -> semitone offset
    const ARP = [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 2, 1, 0, 1];
    const mtof = n => 55 * Math.pow(2, n / 12);      // 55 Hz = A1

    function startMusic() {
      if (!live() || seq) return;
      const t0 = ctx.currentTime;
      // echo for the arpeggio (a dotted eighth, the classic synthwave shimmer)
      const delay = ctx.createDelay(1); delay.delayTime.value = STEP * 3;
      const fb = ctx.createGain(); fb.gain.value = .38;
      const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
      delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(musicBus);
      const send = ctx.createGain(); send.gain.value = .55; send.connect(delay);
      const padBus = ctx.createGain(); padBus.connect(musicBus);
      musicBus.gain.cancelScheduledValues(t0);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t0);
      musicBus.gain.linearRampToValueAtTime(vols.music, t0 + 2.5);   // fade in gently
      seq = { step: 0, next: t0 + .15, delay, send, padBus, timer: setInterval(schedule, 40) };
    }
    function schedule() {
      if (!seq || !running()) return;
      while (seq.next < ctx.currentTime + .3) {
        play(seq.step, seq.next);
        seq.next += STEP; seq.step = (seq.step + 1) % 256;
      }
    }
    function play(s, t) {
      const bar = (s >> 4) & 15, i = s & 15, root = ROOTS[bar & 3], chord = CHORDS[bar & 3];
      const full = bar >= 2;                                  // two bars of just pads and arp, then everything
      const lift = bar >= 8;                                  // second half goes up an octave
      if (i === 0) {                                          // pad: one long soft chord per bar
        [...chord, 12].forEach((n, k) => {
          voice(seq.padBus, 'sawtooth', mtof(24 + root + n) * (k % 2 ? 1.004 : .996), mtof(24 + root + n) * (k % 2 ? 1.004 : .996), t, STEP * 16, .028, 650);
        });
      }
      if (full) {
        if (i % 4 === 0) {                                    // kick, and duck the pad so it pumps
          voice(musicBus, 'sine', 150, 42, t, .24, .5);
          seq.padBus.gain.setValueAtTime(.3, t);
          seq.padBus.gain.linearRampToValueAtTime(1, t + .22);
        }
        if (i === 4 || i === 12) { hit(musicBus, t, .15, .2, 'bandpass', 1500, 1100, .7); hit(musicBus, t + .011, .1, .12, 'bandpass', 2200, 1800, .7); }
        if (i % 2 === 0) hit(musicBus, t, .045, i % 4 === 2 ? .05 : .022, 'highpass', 7500, 7500, .5);
        if (bar % 4 === 3 && i >= 12) hit(musicBus, t, .04, .03, 'highpass', 8000, 8000, .5);
        if (i in BASS) {
          const f = mtof(root + BASS[i]);
          voice(musicBus, 'sawtooth', f, f, t, STEP * 1.7, .17, 520);
          voice(musicBus, 'sine', f, f, t, STEP * 1.7, .26);
        }
      }
      if (i % 2 === 0 || (full && i % 4 === 3)) {             // arpeggio
        const n = chord[ARP[i] % 3] + (ARP[i] > 2 ? 12 : 0);
        const f = mtof((lift ? 36 : 24) + root + n);
        const g = ctx.createGain(); g.gain.value = 1; g.connect(musicBus); g.connect(seq.send);
        voice(g, 'sawtooth', f, f, t, STEP * 1.6, full ? .05 : .06, 2400);
      }
    }
    function stopMusic() {
      if (!seq) return;
      clearInterval(seq.timer);
      const t = ctx.currentTime, s = seq; seq = null;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.linearRampToValueAtTime(0, t + .6);
      setTimeout(() => { try { s.delay.disconnect(); s.send.disconnect(); s.padBus.disconnect(); } catch (e) {} }, 2000);
    }

    /* ----- sound effects: short, soft, low-passed, so they do not wear you out ----- */
    const fx = {
      hover: () => { const n = Date.now(); if (n - lastHover < 90) return; lastHover = n; osc('sine', 1100, 1400, .035, .03); },
      click: () => { osc('sine', 170, 70, .09, .2); noise(.035, .09, 3200, 2400, 1.2); },
      beep: i => osc('triangle', 520 + i * 55, 520 + i * 55, .05, .05, 0, 2500),
      ok: () => [523, 659, 784].forEach((f, i) => osc('triangle', f, f, .16, .09, i * .07, 3000)),
      glitch: () => { noise(.16, .14, 5000, 500, 2); osc('sawtooth', 110, 50, .16, .09, 0, 500); },
      whoosh: () => { noise(.5, .2, 300, 3200, 1); osc('sine', 120, 500, .45, .07); },
      clank: () => { [330, 487, 701].forEach((f, i) => osc('triangle', f, f * .8, .28, .06, i * .004)); noise(.08, .14, 4800, 1800, 5); },
      deny: () => { osc('sawtooth', 160, 150, .1, .1, 0, 700); osc('sawtooth', 125, 115, .14, .1, .12, 700); },
      coin: n => osc('sine', 650 + n * 45, 950 + n * 45, .07, .09),
      buy: () => [440, 587, 784].forEach((f, i) => osc('triangle', f, f * 1.25, .12, .09, i * .06, 3500)),
      ach: () => [523, 659, 784, 1047, 1319].forEach((f, i) => osc('triangle', f, f, .26, .1, i * .09, 4000)),
      err: () => osc('sawtooth', 190, 90, .18, .09, 0, 600),
      discord: () => [392, 523, 659, 784].forEach((f, i) => osc('triangle', f, f, .22, .09, i * .06, 3500)),
      siren: () => { for (let i = 0; i < 3; i++) { osc('triangle', 420, 1000, .26, .07, i * .52); osc('triangle', 1000, 420, .26, .07, i * .52 + .26); } }
    };

    function setVolume(kind, v) {
      v = Math.min(1, Math.max(0, +v || 0)); vols[kind] = v;
      try { localStorage.setItem('hb-vol-' + kind, v); } catch (e) {}
      if (!live()) return;
      const t = ctx.currentTime;
      if (kind === 'sfx') sfxBus.gain.setTargetAtTime(v, t, .02);
      else if (seq) musicBus.gain.setTargetAtTime(v, t, .05);
    }
    return {
      init, fx,
      get sfx() { return sfxOn; }, get music() { return musicOn; },
      volume: kind => vols[kind], setVolume,
      toggleSfx() { sfxOn = !sfxOn; store.set('hb-snd', sfxOn); },
      toggleMusic() { musicOn = !musicOn; store.set('hb-music', musicOn); musicOn ? startMusic() : stopMusic(); }
    };
  })();
  const sfx = (name, ...a) => Snd.fx[name](...a);
  // browsers only allow audio after a gesture, so unlock on the very first one
  addEventListener('pointerdown', Snd.init, true);
  addEventListener('keydown', Snd.init, true);

  const hud = { sfx: $('[data-t="sfx"]'), music: $('[data-t="music"]') };
  const paintHud = () => {
    hud.sfx.textContent = 'SFX: ' + (Snd.sfx ? 'ON' : 'OFF'); hud.sfx.setAttribute('aria-pressed', Snd.sfx);
    hud.music.textContent = 'MUSIC: ' + (Snd.music ? 'ON' : 'OFF'); hud.music.setAttribute('aria-pressed', Snd.music);
  };
  paintHud();
  hud.sfx.addEventListener('click', () => { Snd.toggleSfx(); paintHud(); sfx('ok'); });
  hud.music.addEventListener('click', () => { Snd.toggleMusic(); paintHud(); });

  // small volume popup: effects and music each get a slider (remembered on this device)
  const volBtn = document.createElement('button');
  volBtn.type = 'button'; volBtn.textContent = 'VOL'; volBtn.setAttribute('aria-label', 'Volume settings'); volBtn.setAttribute('aria-expanded', 'false');
  hud.sfx.parentNode.appendChild(volBtn);
  const pop = document.createElement('div');
  pop.className = 'volpop'; pop.hidden = true;
  pop.innerHTML = '<label>EFFECTS<input type="range" min="0" max="100" data-k="sfx" aria-label="Effects volume"></label>' +
                  '<label>MUSIC<input type="range" min="0" max="100" data-k="music" aria-label="Music volume"></label>';
  document.body.appendChild(pop);
  $$('input', pop).forEach(r => {
    r.value = Math.round(Snd.volume(r.dataset.k) * 100);
    r.addEventListener('input', () => Snd.setVolume(r.dataset.k, r.value / 100));
    r.addEventListener('change', () => { if (r.dataset.k === 'sfx') sfx('click'); });
  });
  volBtn.addEventListener('click', e => {
    e.stopPropagation(); pop.hidden = !pop.hidden; volBtn.setAttribute('aria-expanded', String(!pop.hidden));
  });
  document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target) && e.target !== volBtn) { pop.hidden = true; volBtn.setAttribute('aria-expanded', 'false'); } });


  /* ---------- helpers ---------- */
  const GLYPHS = '#$%&*+=?@01<>/\\[]{}';
  function scramble(spans, finals, dur = 450) {
    spans.forEach((s, i) => {
      const end = performance.now() + 120 + dur * (i / spans.length), fin = finals[i];
      (function step() {
        if (performance.now() >= end) { s.textContent = fin; return; }
        s.textContent = GLYPHS[Math.random() * GLYPHS.length | 0];
        setTimeout(step, 40);
      })();
    });
  }
  function scrambleText(el, text) {
    el.textContent = '';
    const spans = [...text].map(c => { const s = document.createElement('span'); s.textContent = c; el.appendChild(s); return s; });
    scramble(spans, [...text], 300);
  }
  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    body.appendChild(t); setTimeout(() => t.remove(), 2500);
  }
  let overdrive = false;
  const baseRate = () => overdrive ? 6 : 1;
  const spins = el => (el.getAnimations ? el.getAnimations({ subtree: true }) : []).filter(a => a.animationName === 'spin');
  function boost(el, rate = 12, ms = 1800) {
    const anims = spins(el), t0 = performance.now();
    (function ease() {
      const k = Math.min(1, (performance.now() - t0) / ms);
      anims.forEach(a => { a.playbackRate = baseRate() + (rate - baseRate()) * (1 - k) ** 2; });
      if (k < 1) requestAnimationFrame(ease);
    })();
  }

  /* ---------- boot screen ---------- */
  const boot = $('#boot');
  let booting = false;
  if (boot) {
    if (sess.get('hb-booted') || reduce) { boot.remove(); body.classList.add('ready'); }
    else {
      booting = true;
      const lines = ['HOLLOWBLADE INDUSTRIES BIOS v2.0', '(C) HOLLOWBLADE INDUSTRIES', '',
        'CHECKING GEARBOX ......... OK', 'CALIBRATING BLADES ....... OK', 'LOADING HOLLOW_BLADE.EXE . OK',
        'LINKING DISCORD UPLINK ... OK', 'SPINNING UP COGS ......... OK', '', 'ALL SYSTEMS NOMINAL.'];
      const log = $('.log', boot), bar = $('.bar i', boot);
      let i = 0;
      (function next() {
        if (!booting) return;
        if (i < lines.length) {
          log.textContent += lines[i] + '\n'; sfx('beep', i);
          bar.style.width = ((i + 1) / lines.length * 100) + '%';
          i++; setTimeout(next, 110 + Math.random() * 190);
        } else boot.classList.add('done');
      })();
      boot.addEventListener('pointerdown', () => finishBoot());
    }
  }
  function finishBoot() {
    if (!booting) return false;
    booting = false; sess.set('hb-booted');
    sfx('ok'); sfx('whoosh');
    boot.classList.add('out'); body.classList.add('ready');
    setTimeout(() => boot.remove(), 700);
    return true;
  }

  /* ---------- title: boot-up letters, hover scramble, random glitch ---------- */
  const title = $('.title');
  if (title) {
    let i = 0;
    title.dataset.text.split(' ').forEach(w => {
      const word = document.createElement('span'); word.className = 'word'; word.setAttribute('aria-hidden', 'true');
      [...w].forEach(c => { const s = document.createElement('span'); s.className = 'ch'; s.textContent = c; s.style.setProperty('--i', i++); word.appendChild(s); });
      title.appendChild(word);
    });
    const chars = $$('.ch', title), finals = chars.map(c => c.textContent);
    let last = 0;
    title.addEventListener('pointerenter', () => {
      if (performance.now() - last < 1200) return;
      last = performance.now(); scramble(chars, finals); sfx('glitch');
    });
    if (!reduce) (function glitch() {
      setTimeout(() => {
        if (body.classList.contains('ready')) {
          title.classList.add('glitch'); sfx('glitch');
          setTimeout(() => title.classList.remove('glitch'), 230);
        }
        glitch();
      }, 4000 + Math.random() * 5000);
    })();
  }

  /* ---------- clickable gears ---------- */
  $$('.gear-wrap, .mesh').forEach(el => el.addEventListener('click', () => {
    sfx('clank'); boost(el); shake($('main'));
  }));

  /* ---------- locked slots ---------- */
  $$('.slot').forEach(s => {
    const small = $('small', s);
    s.addEventListener('pointerenter', () => { if (!s.classList.contains('denied')) scrambleText(small, 'CLASSIFIED'); });
    s.addEventListener('pointerleave', () => { if (!s.classList.contains('denied')) scrambleText(small, 'LOCKED'); });
    s.addEventListener('click', () => {
      sfx('deny'); s.classList.add('denied'); scrambleText(small, 'ACCESS DENIED');
      clearTimeout(s._t);
      s._t = setTimeout(() => { s.classList.remove('denied'); scrambleText(small, 'LOCKED'); }, 1100);
    });
  });

  /* ---------- external links: sound + toast; "#" means not set up yet ---------- */
  $$('a[data-ext]').forEach(a => a.addEventListener('click', e => {
    if (a.getAttribute('href') === '#') { e.preventDefault(); sfx('deny'); toast('LINK COMING SOON'); }
    else { sfx('discord'); toast('OPENING LINK...'); }
  }));

  /* ---------- page transitions ---------- */
  const wipe = $('.wipe');
  let leaving = false;
  const reveal = () => { requestAnimationFrame(() => requestAnimationFrame(() => wipe.classList.remove('on'))); setTimeout(() => wipe.classList.remove('on'), 500); };
  reveal();
  addEventListener('pageshow', e => { if (e.persisted) { leaving = false; reveal(); } });
  function go(url) {
    if (leaving) return; leaving = true;
    sfx('whoosh');
    wipe.classList.add('on');
    setTimeout(() => { location.href = url; }, reduce ? 0 : 620);
  }
  $$('[data-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(a.getAttribute('href')); }));

  /* ---------- overdrive easter egg (konami code or type HOLLOW) ---------- */
  const KONAMI = 'ArrowUp ArrowUp ArrowDown ArrowDown ArrowLeft ArrowRight ArrowLeft ArrowRight b a';
  let keys = [];
  function toggleOverdrive() {
    overdrive = !overdrive;
    root.classList.toggle('overdrive', overdrive);
    $$('svg.gear').forEach(g => spins(g).forEach(a => { a.playbackRate = baseRate(); }));
    sfx(overdrive ? 'siren' : 'ok');
    toast(overdrive ? 'OVERDRIVE ENGAGED' : 'OVERDRIVE OFF');
    shake($('main'));
  }

  /* ---------- keyboard ---------- */
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    keys = [...keys, e.key].slice(-10);
    if (keys.join(' ') === KONAMI || keys.slice(-6).join('').toLowerCase() === 'hollow') { keys = []; toggleOverdrive(); }
    if (e.repeat) return;
    if (finishBoot()) { e.preventDefault(); return; }
    if ($('.term-ov:not([hidden]), .adm:not([hidden])')) return;
    const page = body.classList;
    const focused = document.activeElement && document.activeElement.closest ? document.activeElement.closest('a, button') : null;
    if (page.contains('menu') && e.key === 'Enter' && !focused) { e.preventDefault(); sfx('click'); go('games.html'); }
    if (page.contains('games') && e.key === 'Escape') go('index.html');
    if (page.contains('gamepage') && e.key === 'Escape') go(page.contains('workshop') ? 'index.html' : 'games.html');
    if (e.key === 'm' || e.key === 'M') { Snd.toggleMusic(); paintHud(); }
  });

  /* ---------- hover + click sounds everywhere ---------- */
  let hovered = null;
  addEventListener('pointerover', e => {
    const el = e.target.closest('a, button, .clicky');
    if (el && el !== hovered) sfx('hover');
    hovered = el;
    if (ring) ring.classList.toggle('hot', !!el);
  });
  addEventListener('pointerdown', e => {
    if (e.target.closest('a, button') && !e.target.closest('[data-ext], .slot, .hud')) sfx('click');
    burst(e.clientX, e.clientY);
    if (ring) ring.classList.add('down');
  });
  addEventListener('pointerup', () => { if (ring) ring.classList.remove('down'); });

  /* ---------- custom cursor ---------- */
  let ring = null, dot = null;
  if (fine && !reduce) {
    body.classList.add('has-cur');
    dot = document.createElement('div'); dot.className = 'cur';
    ring = document.createElement('div'); ring.className = 'cur-ring';
    ring.innerHTML = '<svg class="gear" data-teeth="8" data-outer="100" data-root="78" data-ring="40"></svg>';
    buildGear($('svg', ring));
    body.append(ring, dot);
  }

  /* ---------- clock ---------- */
  const clock = $('#clock');
  const tickClock = () => { clock.textContent = 'SYS ' + new Date().toLocaleTimeString('en-GB'); };
  tickClock(); setInterval(tickClock, 1000);

  /* ---------- canvas: dust, sparks, parallax ---------- */
  let px = innerWidth / 2, py = innerHeight / 2, rx = px, ry = py, cx = 0, cy = 0;
  addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; });

  const cv = $('#fx'), g = cv.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W, H, dots = [], sparks = [];
  function size() {
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
    const n = Math.round(innerWidth * innerHeight / 12000);
    dots = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H, vx: 0,
      s: (1 + Math.random() * 2) * dpr, v: (.1 + Math.random() * .4) * dpr, p: Math.random() * 6.28
    }));
  }
  function burst(x, y) {
    if (reduce) return;
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 6) * dpr;
      sparks.push({ x: x * dpr, y: y * dpr, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2 * dpr, life: 1, s: (2 + Math.random() * 3) * dpr });
    }
  }
  addEventListener('resize', size); size();

  function frame(t) {
    // parallax for background gears
    const tx = px / innerWidth * 2 - 1, ty = py / innerHeight * 2 - 1;
    cx += (tx - cx) * .06; cy += (ty - cy) * .06;
    root.style.setProperty('--mx', cx.toFixed(3)); root.style.setProperty('--my', cy.toFixed(3));

    // cursor follow
    if (ring) {
      rx += (px - rx) * .2; ry += (py - ry) * .2;
      dot.style.transform = `translate(${px}px,${py}px)`;
      ring.style.transform = `translate(${rx}px,${ry}px)`;
    }

    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fff';
    const mx = px * dpr, my = py * dpr, R = 110 * dpr;
    for (const d of dots) {
      const dx = d.x - mx, dy = d.y - my, dist = Math.hypot(dx, dy);
      if (dist < R && dist > 0) d.vx += dx / dist * (1 - dist / R) * .8 * dpr;
      d.vx *= .92;
      d.y -= d.v; d.x += d.vx + Math.sin(t / 2000 + d.p) * .2 * dpr;
      if (d.y < -5) { d.y = H + 5; d.x = Math.random() * W; }
      g.globalAlpha = .12 + .38 * (.5 + .5 * Math.sin(t / 700 + d.p));
      g.fillRect(d.x | 0, d.y | 0, d.s, d.s);
    }
    for (const s of sparks) {
      s.vy += .25 * dpr; s.x += s.vx; s.y += s.vy; s.vx *= .97; s.life -= .025;
      g.globalAlpha = Math.max(s.life, 0);
      g.fillRect(s.x | 0, s.y | 0, s.s, s.s);
    }
    sparks = sparks.filter(s => s.life > 0);
    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------- shared toolkit for the other scripts ---------- */
  window.HB = { sfx, fx: Snd.fx, toast, shake, boost, go, burst, scramble, toggleOverdrive, Snd, paintHud, reduce };
})();
