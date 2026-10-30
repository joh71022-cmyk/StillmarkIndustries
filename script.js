(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* ---------- sound (tiny synth, no files) ---------- */
  let ctx, on = true;
  try { on = localStorage.getItem('hb-snd') !== '0'; } catch (e) {}
  const sndBtn = $('.snd');
  const paintSnd = () => { sndBtn.textContent = 'SND: ' + (on ? 'ON' : 'OFF'); sndBtn.setAttribute('aria-pressed', on); };
  paintSnd();
  function tone(f0, f1, dur, type = 'square', vol = .035) {
    if (!on || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
  }
  sndBtn.addEventListener('click', () => {
    on = !on; paintSnd(); try { localStorage.setItem('hb-snd', on ? '1' : '0'); } catch (e) {}
    tone(500, 900, .08);
  });
  const wake = () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch (e) {} };
  ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, wake));
  $$('a, button').forEach(el => el.addEventListener('pointerenter', () => tone(660, 780, .05)));

  /* ---------- boot-up title + glitch ---------- */
  const title = $('.title');
  if (title) {
    let i = 0;
    title.dataset.text.split(' ').forEach(w => {
      const word = document.createElement('span'); word.className = 'word'; word.setAttribute('aria-hidden', 'true');
      [...w].forEach(c => { const s = document.createElement('span'); s.className = 'ch'; s.textContent = c; s.style.setProperty('--i', i++); word.appendChild(s); });
      title.appendChild(word);
    });
    if (!reduce) (function glitch() {
      setTimeout(() => {
        title.classList.add('glitch'); tone(90, 40, .18, 'sawtooth', .04);
        setTimeout(() => title.classList.remove('glitch'), 230);
        glitch();
      }, 3500 + Math.random() * 4500);
    })();
  }

  /* ---------- page transitions ---------- */
  const wipe = $('.wipe');
  const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => wipe.classList.remove('on')));
  reveal();
  addEventListener('pageshow', e => { if (e.persisted) { leaving = false; reveal(); } });
  let leaving = false;
  function go(url) {
    if (leaving) return; leaving = true;
    tone(140, 600, .35, 'sawtooth', .05);
    wipe.classList.add('on');
    setTimeout(() => { location.href = url; }, reduce ? 0 : 620);
  }
  $$('[data-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(a.getAttribute('href')); }));
  addEventListener('keydown', e => {
    if (e.repeat) return;
    const b = document.body.classList;
    if (b.contains('menu') && e.key === 'Enter' && document.activeElement === document.body) go('games.html');
    if (b.contains('games') && (e.key === 'Escape' || e.key === 'Backspace')) go('index.html');
  });
  const banner = $('.banner');
  if (banner) banner.addEventListener('click', () => tone(300, 900, .2));

  /* ---------- parallax + drifting dust ---------- */
  const root = document.documentElement;
  let tx = 0, ty = 0, cx = 0, cy = 0;
  addEventListener('pointermove', e => { tx = e.clientX / innerWidth * 2 - 1; ty = e.clientY / innerHeight * 2 - 1; });

  const cv = $('#fx'), g = cv.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W, H, dots = [];
  function size() {
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
    const n = Math.round(innerWidth * innerHeight / 14000);
    dots = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      s: (1 + Math.random() * 2) * dpr, v: (.1 + Math.random() * .4) * dpr, p: Math.random() * 6.28
    }));
  }
  addEventListener('resize', size); size();
  function frame(t) {
    cx += (tx - cx) * .06; cy += (ty - cy) * .06;
    root.style.setProperty('--mx', cx.toFixed(3)); root.style.setProperty('--my', cy.toFixed(3));
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fff';
    for (const d of dots) {
      d.y -= d.v; d.x += Math.sin(t / 2000 + d.p) * .2 * dpr;
      if (d.y < -5) { d.y = H + 5; d.x = Math.random() * W; }
      g.globalAlpha = .12 + .38 * (.5 + .5 * Math.sin(t / 700 + d.p));
      g.fillRect(d.x | 0, d.y | 0, d.s, d.s);
    }
    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
