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

  /* ---------- sound engine (all synthesized, no files) ---------- */
  const Snd = (() => {
    let ctx, master, musicBus, nbuf, drone = null, tickTimer;
    let sfxOn = store.get('hb-snd', true), musicOn = store.get('hb-music', true);
    const live = () => ctx && ctx.state !== 'closed';

    function init() {
      if (ctx) { ctx.resume(); return; }
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = .9; master.connect(comp);
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      if (musicOn) startMusic();
    }
    function osc(type, f0, f1, dur, vol, at = 0) {
      if (!sfxOn || !live()) return;
      const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(master); o.start(t); o.stop(t + dur + .02);
    }
    function noise(dur, vol, f0, f1, q = 1, at = 0) {
      if (!sfxOn || !live()) return;
      if (!nbuf) {
        nbuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = nbuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = nbuf; s.loop = true;
      f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + .02);
    }
    // ambient factory drone: detuned saws through a slowly sweeping filter, plus a clock tick
    function startMusic() {
      if (!ctx || drone) return;
      const t = ctx.currentTime;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 6; lp.connect(musicBus);
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = .07; lg.gain.value = 220; lfo.connect(lg).connect(lp.frequency); lfo.start();
      const os = [55, 55.3, 82.4, 110.2].map((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f; g.gain.value = i < 2 ? .22 : .12;
        o.connect(g).connect(lp); o.start(); return o;
      });
      drone = { os, lfo };
      musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(musicBus.gain.value, t); musicBus.gain.linearRampToValueAtTime(.5, t + 2.5);
      let n = 0;
      tickTimer = setInterval(() => {
        const tt = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), acc = n++ % 4 === 0;
        o.type = 'square'; o.frequency.setValueAtTime(acc ? 1800 : 1200, tt);
        g.gain.setValueAtTime(acc ? .08 : .04, tt); g.gain.exponentialRampToValueAtTime(.0001, tt + .03);
        o.connect(g).connect(musicBus); o.start(tt); o.stop(tt + .05);
      }, 700);
    }
    function stopMusic() {
      if (!drone) return;
      const t = ctx.currentTime, d = drone;
      musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(musicBus.gain.value, t); musicBus.gain.linearRampToValueAtTime(0, t + .6);
      drone = null; clearInterval(tickTimer);
      setTimeout(() => { d.os.forEach(o => o.stop()); d.lfo.stop(); }, 700);
    }
    const fx = {
      hover: () => osc('square', 900, 1400, .07, .12),
      click: () => { osc('square', 260, 90, .16, .3); noise(.09, .5, 4000, 600, 1.5); },
      beep: i => osc('square', 600 + i * 80, 600 + i * 80, .05, .1),
      ok: () => [523, 659, 784, 1047].forEach((f, i) => osc('square', f, f, .18, .16, i * .08)),
      glitch: () => { noise(.22, .35, 7000, 300, 3); osc('sawtooth', 120, 35, .22, .22); },
      whoosh: () => { noise(.65, .55, 250, 5000, 1.2); osc('sawtooth', 90, 700, .55, .14); },
      clank: () => { [310, 457, 629, 811].forEach((f, i) => osc('square', f, f * .7, .35, .1, i * .004)); noise(.12, .6, 5200, 1400, 6); },
      deny: () => { osc('square', 180, 170, .12, .25); osc('square', 140, 130, .18, .25, .14); },
      coin: n => osc('square', 500 + n * 60, 900 + n * 60, .09, .16),
      buy: () => [440, 660, 880].forEach((f, i) => osc('square', f, f * 1.5, .12, .16, i * .06)),
      ach: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => osc('triangle', f, f, .3, .22, i * .09)),
      err: () => osc('sawtooth', 200, 80, .25, .2),
      discord: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => osc('triangle', f, f, .25, .2, i * .06)),
      siren: () => { for (let i = 0; i < 4; i++) { osc('sawtooth', 400, 1200, .25, .15, i * .5); osc('sawtooth', 1200, 400, .25, .15, i * .5 + .25); } }
    };
    return {
      init, fx,
      get sfx() { return sfxOn; }, get music() { return musicOn; },
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

  /* ---------- discord banner ---------- */
  const discord = $('[data-discord]');
  if (discord) discord.addEventListener('click', () => { sfx('discord'); toast('OPENING DISCORD...'); });

  /* ---------- placeholder links (href="#") just say "coming soon" ---------- */
  $$('a[data-itch]').forEach(a => a.addEventListener('click', e => {
    if (a.getAttribute('href') === '#') { e.preventDefault(); sfx('deny'); toast('ITCH.IO PAGE COMING SOON'); }
    else { sfx('discord'); toast('OPENING ITCH.IO...'); }
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
    if ($('.term-ov:not([hidden])')) return;
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
    if (e.target.closest('a, button') && !e.target.closest('[data-discord], .slot, .hud')) sfx('click');
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
