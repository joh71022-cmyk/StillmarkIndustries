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
    const SK = 'hb-mus';
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
    function voice(dest, type, f0, f1, t, dur, v, lp, att) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime(v, t + (att ? Math.min(att, dur * .6) : Math.min(.01, dur / 4)));
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

    /* ----- three original tracks. The page picks one: menu = tech, every other page = chill. ----- */
    const mtof = n => 55 * Math.pow(2, n / 12);                                      // 55 Hz = A1
    const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // same "random" every loop
    const dist = k => { const n = 512, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } return c; };
    const duck = (g, t, depth, rel) => { g.gain.setValueAtTime(depth, t); g.gain.linearRampToValueAtTime(1, t + rel); };
    let T = null, STEP = .125;                         // the track that is playing, and the length of one sixteenth note

    function drone(root, chord, t, dur, v, lp, type) { // a low held note pair under the music
      [chord[0], chord[2]].forEach((n, k) => {
        const f = mtof(12 + root + n) * (k ? 1.003 : .997);
        voice(seq.padBus, type, f, f, t, dur, v, lp);
      });
    }

    /* ===== TECH: clean and digital, builds like a loading bar (menu) - 120 BPM ===== */
    const TC = { roots: [0, 8, 3, 10], chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]], arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 2, 1, 0, 1], pent: [0, 3, 5, 7, 10] };
    function playTech(s, t) {
      const bar = (s >> 4) & 15, i = s & 15, root = TC.roots[bar & 3], chord = TC.chords[bar & 3];
      if (i === 0) drone(root, chord, t, STEP * 16, .034, 900, 'triangle');
      // plucked arpeggio that gets brighter every bar, like progress filling up
      const idx = TC.arp[i], f = mtof(24 + root + (idx === 3 ? chord[0] + 12 : chord[idx]));
      voice(musicBus, 'triangle', f, f, t, STEP * 1.5, bar < 2 ? .05 : .06, 900 + Math.min(bar, 10) * 330);
      if (bar >= 2 && i % 2 === 0) voice(musicBus, 'sine', f * 2, f * 2, t, STEP * .9, .016);
      // little digital pings
      if (rnd(s) > .86) { const pf = mtof(48 + TC.pent[Math.floor(rnd(s + 99) * 5)]); voice(musicBus, 'sine', pf, pf, t, .22, .028); }
      if (bar % 4 === 3 && i === 0) hit(musicBus, t, STEP * 16, .035, 'bandpass', 500, 5200, 1);   // a rising sweep every four bars
      if (bar >= 4) {                                          // the beat arrives
        if (i % 4 === 0) { voice(musicBus, 'sine', 140, 48, t, .2, .36); duck(seq.bassBus, t, .35, .12); duck(seq.padBus, t, .5, .15); }
        if (i % 2 === 1) hit(musicBus, t, .03, .018, 'highpass', 9000, 9000, .5);
        if (i === 0 || i === 6 || i === 10) { const bf = mtof(12 + root); voice(seq.bassBus, 'sine', bf, bf, t, STEP * 2.3, .3); voice(seq.bassBus, 'triangle', bf, bf, t, STEP * 2.3, .08, 600); }
      }
      if (bar >= 8 && (i === 4 || i === 12)) hit(musicBus, t, .12, .09, 'bandpass', 2000, 1500, .8);       // soft clap
      if (bar >= 12 && i % 4 === 0) {                          // bell melody over the final part
        const bf = mtof(36 + root + chord[[0, 1, 2, 1][i >> 2]]);
        voice(musicBus, 'sine', bf, bf, t, STEP * 4, .05); voice(musicBus, 'sine', bf * 2.01, bf * 2.01, t, STEP * 3, .014);
      }
    }

    /* ===== CHILL: warm retro lo-fi, quiet background (every other page) - 78 BPM ===== */
    const CL = { roots: [0, 8, 3, 10], chords: [[0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 7, 11], [0, 4, 7, 9]], pent: [0, 3, 5, 7, 10] };
    function playChill(s, t) {
      const bar = (s >> 4) & 15, i = s & 15, root = CL.roots[bar & 3], chord = CL.chords[bar & 3];
      const sw = i % 4 === 2 ? STEP * .12 : 0;                 // lazy swing
      if (i === 0 || i === 10) {                               // electric-piano chords, gently strummed
        chord.forEach((n, k) => {
          const f = mtof(24 + root + n), tt = t + k * .014 + (i ? sw : 0);
          voice(musicBus, 'sine', f, f, tt, STEP * (i ? 5 : 9), i ? .028 : .04, 1600);
          voice(musicBus, 'triangle', f * 2, f * 2, tt, STEP * 3, .008, 2200);
        });
      }
      if (i === 0 || i === 6 || i === 10) {                    // mellow bass
        const bf = mtof(12 + root);
        voice(seq.bassBus, 'sine', bf, bf, t, STEP * (i === 0 ? 4 : 2.5), .3);
      }
      if (i === 0 || i === 10) { voice(musicBus, 'sine', 120, 48, t, .22, .34); duck(seq.bassBus, t, .45, .15); }   // soft kick
      if (i === 8) { hit(musicBus, t, .14, .1, 'bandpass', 1700, 1300, .8); voice(musicBus, 'triangle', 190, 110, t, .1, .06); }   // soft snare
      if (i % 2 === 0) hit(musicBus, t + sw, .035, i % 4 === 2 ? .02 : .012, 'highpass', 8500, 8500, .5);
      if (bar >= 2 && (s * 5 + bar) % 7 === 0) {              // sparse pentatonic plucks with a small echo
        const f = mtof(36 + CL.pent[(s + bar * 3) % 5]);
        voice(musicBus, 'triangle', f, f, t, STEP * 2, .032, 2400);
        voice(musicBus, 'triangle', f, f, t + STEP * 3, STEP * 2, .012, 1800);
      }
      if (rnd(s * 3) > .6) hit(musicBus, t + rnd(s) * STEP, .015, .016, 'highpass', 6000, 6000, .5);   // vinyl crackle
    }

    /* ===== CALM: soft, smooth technology ambient (every page except the menu) - 90 BPM ===== */
    const CM = { roots: [0, 8, 3, 10], chords: [[0, 3, 7, 14], [0, 4, 7, 11], [0, 4, 7, 11], [0, 4, 7, 9]], arp: [0, 1, 2, 3, 2, 1, 2, 1], pent: [0, 3, 5, 7, 10] };
    function playCalm(s, t) {
      const bar = (s >> 4) & 15, i = s & 15, root = CM.roots[bar & 3], chord = CM.chords[bar & 3];
      if (i === 0) {                                           // airy pad that swells in, plus a soft low note
        chord.forEach((n, k) => { const f = mtof(24 + root + n) * (k % 2 ? 1.002 : .998); voice(seq.padBus, 'sine', f, f, t, STEP * 16, .034, 1400, STEP * 5); });
        const bf = mtof(12 + root); voice(seq.padBus, 'sine', bf, bf, t, STEP * 16, .06, 0, STEP * 3);
      }
      if (i === 0 || i === 8) voice(musicBus, 'sine', 90, 62, t, .18, .09);            // a soft heartbeat-like pulse
      if (i % 4 === 0) hit(musicBus, t, .015, .012, 'highpass', 9000, 9000, .5);       // quiet clock tick
      if (bar >= 4 && i % 2 === 0) {                           // slow plucked sequence with a faint echo
        const tone = chord[CM.arp[i >> 1]] + (bar >= 12 ? 12 : 0), f = mtof(36 + root + tone);
        voice(musicBus, 'sine', f, f, t, STEP * 3, .04, 1800);
        voice(musicBus, 'triangle', f, f, t, STEP * 2, .01, 2400);
        voice(musicBus, 'sine', f, f, t + STEP * 3, STEP * 3, .013, 1500);
      }
      if (bar >= 8 && rnd(s + 7) > .9) { const pf = mtof(48 + CM.pent[Math.floor(rnd(s + 31) * 5)]); voice(musicBus, 'sine', pf, pf, t, .3, .018); }   // faint digital shimmer
    }

    /* ===== CYBER: dark, driving, distorted (switch to it from the terminal) - 126 BPM ===== */
    const CY = { roots: [0, 0, 8, 7], chords: [[0, 3, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]],
      bass: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 7, 12], hook: [0, 0, 3, 0, -1, 0, -4, -5], shift: [0, 0, -4, -5] };
    function playCyber(s, t) {
      const bar = (s >> 4) & 15, i = s & 15, root = CY.roots[bar & 3], chord = CY.chords[bar & 3];
      const intro = bar < 2, brk = bar === 7, groove = bar >= 2 && !brk, hard = bar >= 8;
      if (i === 0) drone(root, chord, t, STEP * 16, .03, 500, 'sawtooth');
      if ((intro || brk) && i % 2 === 0) { const f = i % 4 === 0 ? 880 : 587; voice(musicBus, 'square', f, f, t, STEP * 1.4, .026, 2200); }   // the alarm
      if ((bar === 1 || brk) && i === 0) hit(musicBus, t, STEP * 16, brk ? .08 : .05, 'bandpass', 400, 7000, 1);
      if (groove) {
        hit(musicBus, t, .04, i % 4 === 2 ? .05 : i % 2 === 0 ? .03 : .016, 'highpass', 8000, 8000, .5);
        if (i % 8 === 6) hit(musicBus, t, .12, .035, 'highpass', 7000, 7000, .5);
      } else if (intro && i % 4 === 2) hit(musicBus, t, .04, .02, 'highpass', 8000, 8000, .5);
      if (groove) {
        if (i % 4 === 0) { voice(musicBus, 'sine', 165, 44, t, .22, .55); hit(musicBus, t, .012, .12, 'highpass', 3000, 3000, .5); duck(seq.bassBus, t, .22, .11); duck(seq.padBus, t, .3, .2); }
        if (i === 4 || i === 12) { hit(musicBus, t, .16, .22, 'bandpass', 1900, 1400, .7); voice(musicBus, 'triangle', 210, 120, t, .1, .15); if (hard) hit(musicBus, t + .012, .1, .12, 'bandpass', 2600, 2000, .7); }
        if (bar % 2 === 1 && i === 15) hit(musicBus, t, .08, .09, 'bandpass', 1800, 1500, .7);
        if (bar === 15 && i >= 12) hit(musicBus, t, .07, .1, 'bandpass', 1800, 1500, .7);
        const f = mtof(root + CY.bass[i]);
        voice(seq.bassIn, 'sawtooth', f, f, t, STEP * .92, i % 4 === 0 ? .34 : .24, 0);
        voice(musicBus, 'sine', f, f, t, STEP * .92, .28);
        if (bar >= 4 && (i % 4 === 2 || (hard && (i === 3 || i === 11)))) {
          chord.forEach(n => [.994, 1.006].forEach(d => { const fr = mtof(24 + root + n) * d; voice(musicBus, 'sawtooth', fr, fr, t, STEP * 1.3, .016, 2400); }));
        }
      }
      if (hard && i % 2 === 0 && !(bar === 15 && i >= 12)) {
        const f = mtof(36 + CY.hook[i >> 1] + CY.shift[bar & 3]);
        [.996, 1.004].forEach(d => voice(musicBus, 'sawtooth', f * d, f * d, t, STEP * 1.7, .04, 3000));
      }
    }

    const TRACKS = {
      tech:  { bpm: 120, level: 1,   play: playTech,  resume: (bar, t, n) => drone(TC.roots[bar & 3], TC.chords[bar & 3], t, STEP * n, .034, 900, 'triangle') },
      calm:  { bpm: 90,  level: .45, play: playCalm,  resume: null },
      chill: { bpm: 78,  level: .5,  play: playChill, resume: null },
      cyber: { bpm: 126, level: 1,   play: playCyber, resume: (bar, t, n) => drone(CY.roots[bar & 3], CY.chords[bar & 3], t, STEP * n, .03, 500, 'sawtooth') }
    };
    let override = '';
    try { const v = localStorage.getItem('hb-mood'); if (v && TRACKS[v]) override = v; } catch (e) {}
    const autoMood = () => (document.body.classList.contains('menu') ? 'tech' : 'calm');
    const mood = () => override || autoMood();
    const level = () => (T ? T.level : 1);

    function startMusic() {
      if (!live() || seq) return;
      const t0 = ctx.currentTime, name = mood();
      T = TRACKS[name]; STEP = 60 / T.bpm / 4;
      // bass chain: saw -> distortion -> low-pass (only the cyber track sends into it), ducked by the kick
      const bassIn = ctx.createGain(), shaper = ctx.createWaveShaper(), bassLP = ctx.createBiquadFilter(), bassBus = ctx.createGain();
      shaper.curve = dist(18); shaper.oversample = '2x';
      bassLP.type = 'lowpass'; bassLP.frequency.value = 1100;
      bassIn.connect(shaper); shaper.connect(bassLP); bassLP.connect(bassBus); bassBus.connect(musicBus);
      const padBus = ctx.createGain(); padBus.connect(musicBus);
      // came from another page of the SAME track a moment ago? carry on from where it was, with a short fade
      let from = 0, ahead = .15, fade = 2.5, resumed = false;
      try {
        const m = JSON.parse(sessionStorage.getItem(SK) || 'null');
        if (m && m.mood === name && Date.now() - m.wall < 6000) {
          const pos = (((m.pos + (Date.now() - m.wall) / 1000 / STEP) % 256) + 256) % 256, whole = Math.ceil(pos);
          from = whole % 256; ahead = Math.max(.05, (whole - pos) * STEP); fade = .5; resumed = true;
        }
      } catch (e) {}
      musicBus.gain.cancelScheduledValues(t0);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t0);
      musicBus.gain.linearRampToValueAtTime(vols.music * T.level, t0 + fade);
      seq = { name, step: from, next: t0 + ahead, bassIn, bassBus, padBus, parts: [bassIn, shaper, bassLP, bassBus, padBus], timer: setInterval(schedule, 40), saved: 0 };
      if (resumed && (from & 15) !== 0 && T.resume) T.resume((from >> 4) & 15, t0 + .05, 16 - (from & 15));   // landed mid-bar
    }
    function schedule() {
      if (!seq || !running()) return;
      const wall = Date.now();
      if (wall - seq.saved > 400) {
        seq.saved = wall;
        try { sessionStorage.setItem(SK, JSON.stringify({ mood: seq.name, pos: seq.step - (seq.next - ctx.currentTime) / STEP, wall })); } catch (e) {}
      }
      while (seq.next < ctx.currentTime + .3) {
        T.play(seq.step, seq.next);
        seq.next += STEP; seq.step = (seq.step + 1) % 256;
      }
    }
    function stopMusic(keepPos) {
      if (!seq) return;
      clearInterval(seq.timer);
      if (!keepPos) { try { sessionStorage.removeItem(SK); } catch (e) {} }
      const t = ctx.currentTime, s = seq; seq = null;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.linearRampToValueAtTime(0, t + .6);
      setTimeout(() => { try { s.parts.forEach(p => p.disconnect()); } catch (e) {} }, 2000);
    }
    function setMood(m) {                                      // 'tech', 'calm', 'chill', 'cyber', or 'auto' (page decides)
      override = TRACKS[m] ? m : '';
      try { if (override) localStorage.setItem('hb-mood', override); else localStorage.removeItem('hb-mood'); } catch (e) {}
      if (seq && live()) { stopMusic(); setTimeout(() => { if (musicOn) startMusic(); }, 650); }
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
      else if (seq) musicBus.gain.setTargetAtTime(v * level(), t, .05);
    }
    return {
      init, fx,
      get sfx() { return sfxOn; }, get music() { return musicOn; },
      volume: kind => vols[kind], setVolume, setMood, get mood() { return mood(); },
      get blocked() { return !!ctx && ctx.state === 'suspended' && !document.hidden; },
      fadeOut() { if (live() && seq) { const t = ctx.currentTime; musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(musicBus.gain.value, t); musicBus.gain.linearRampToValueAtTime(0, t + .45); } },
      fadeIn() { if (live() && seq) { const t = ctx.currentTime; musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(musicBus.gain.value, t); musicBus.gain.linearRampToValueAtTime(vols.music * level(), t + .6); } },
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
  const hint = document.createElement('div');
  hint.className = 'musichint'; hint.textContent = 'CLICK ANYWHERE FOR MUSIC'; hint.hidden = true;
  document.body.appendChild(hint);
  ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => { hint.hidden = true; }, true));
  Snd.init();                                                  // starts by itself where the browser allows it
  setTimeout(() => { if (Snd.music && Snd.blocked && !$('#boot')) hint.hidden = false; }, 700);

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
      const lines = ['STILLMARK INDUSTRIES BIOS v2.0', '(C) STILLMARK INDUSTRIES', '',
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
  addEventListener('pageshow', e => { if (e.persisted) { leaving = false; Snd.fadeIn(); reveal(); } });
  function go(url) {
    if (leaving) return; leaving = true;
    sfx('whoosh'); Snd.fadeOut();
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
    const el = e.target.closest ? e.target.closest('a, button, .clicky') : null;
    if (el && el !== hovered) sfx('hover');
    hovered = el;
    if (ring) ring.classList.toggle('hot', !!el);
  });
  addEventListener('pointerdown', e => {
    const tg = e.target.closest ? e.target : document.body;
    if (tg.closest('a, button') && !tg.closest('[data-ext], .slot, .hud')) sfx('click');
    burst(e.clientX, e.clientY);
    if (ring) ring.classList.add('down');
  });
  addEventListener('pointerup', () => { if (ring) ring.classList.remove('down'); });

  /* ---------- custom cursor ---------- */
  let ring = null, dot = null;
  if (fine && !reduce && !body.classList.contains('no-cursor')) {
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
    const n = body.classList.contains('no-dust') ? 0 : Math.round(innerWidth * innerHeight / 12000);
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
