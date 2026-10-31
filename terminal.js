/* Hollowblade terminal + shared nav. Press ` (backtick) on any page, or use the >_ button. */
(() => {
  const HB = window.HB;
  if (!HB) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const LINKS = {
    discord: 'https://discord.gg/QNGN2P7MNC',
    itch: 'https://untimed.itch.io/the-hollow-after-dark',
    tiktok: 'https://www.tiktok.com/@thehollowbladeoffical'
  };
  const PAGES = {
    home: 'index.html', menu: 'index.html', games: 'games.html', workshop: 'workshop.html',
    hollowblade: 'hollowblade.html', 'after-dark': 'after-dark.html', afterdark: 'after-dark.html'
  };

  /* ---------- nav links on the inner pages ---------- */
  const top = $('.top');
  if (top) {
    const here = location.pathname.split('/').pop() || 'index.html';
    [['games.html', 'GAMES'], ['workshop.html', 'WORKSHOP']].forEach(([href, label]) => {
      if (here === href) return;
      const a = document.createElement('a');
      a.className = 'lk'; a.href = href; a.textContent = label;
      a.addEventListener('click', e => { e.preventDefault(); HB.go(href); });
      top.appendChild(a);
    });
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lk'; b.dataset.term = ''; b.textContent = 'TERMINAL';
    top.appendChild(b);
  }

  /* ---------- visit counter ---------- */
  let visits = 1;
  try { visits = (+localStorage.getItem('hb-visits') || 0) + 1; localStorage.setItem('hb-visits', visits); } catch (e) {}
  const foot = $('.foot');
  if (foot) {
    const v = document.createElement('span');
    v.textContent = 'VISIT #' + visits;
    foot.insertBefore(v, foot.lastElementChild);
  }

  /* ---------- terminal overlay ---------- */
  const ov = document.createElement('div');
  ov.className = 'term-ov'; ov.hidden = true;
  ov.innerHTML = '<div class="tbox" role="dialog" aria-label="Terminal">' +
    '<div class="tbar"><span>HOLLOWBLADE://TERMINAL</span><button type="button" class="tx" aria-label="Close terminal">X</button></div>' +
    '<div class="tout" aria-live="polite"></div>' +
    '<label class="tin"><b>&gt;</b><input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Command"></label></div>';
  document.body.appendChild(ov);
  const out = $('.tout', ov), input = $('input', ov);
  const hist = []; let hi = 0, booted = false, rain = null;

  const print = (text = '', cls = '') => {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text; out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  };
  const lines = (arr, cls) => arr.forEach(l => print(l, cls));
  const openUrl = (key, label) => { print('OPENING ' + label + '...', 'ok'); HB.fx.discord(); window.open(LINKS[key], '_blank', 'noopener'); };

  function show() {
    ov.hidden = false; HB.fx.ok();
    if (!booted) {
      booted = true;
      lines(['HOLLOWBLADE INDUSTRIES TERMINAL v1.0', 'TYPE "help" FOR A LIST OF COMMANDS.', ''], 'dim');
    }
    setTimeout(() => input.focus(), 30);
  }
  function hide() { ov.hidden = true; stopRain(); HB.fx.beep(2); }
  const toggle = () => (ov.hidden ? show() : hide());

  function startRain() {
    if (rain) return;
    const cv = document.createElement('canvas'); cv.className = 'rain';
    document.body.appendChild(cv);
    const g = cv.getContext('2d'); let cols, drops;
    const size = () => { cv.width = innerWidth; cv.height = innerHeight; cols = Math.ceil(innerWidth / 16); drops = Array.from({ length: cols }, () => Math.random() * -50); };
    size();
    const chars = 'HOLLOWBLADE01<>/\\#$%*';
    const id = setInterval(() => {
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = '#fff'; g.font = '14px monospace';
      drops.forEach((y, i) => {
        g.fillText(chars[Math.random() * chars.length | 0], i * 16, y * 16);
        drops[i] = y * 16 > cv.height && Math.random() > .96 ? 0 : y + 1;
      });
    }, 50);
    rain = { cv, id }; setTimeout(stopRain, 9000);
  }
  function stopRain() { if (!rain) return; clearInterval(rain.id); rain.cv.remove(); rain = null; }

  const CMD = {
    help() {
      lines(['COMMANDS:',
        'games - list the games',
        'devs - meet the team',
        'open <x> - go to games, workshop, home, hollowblade, after-dark, discord, itch or tiktok',
        'discord - open the Discord',
        'itch - open The Hollow After Dark on itch.io',
        'tiktok - open our TikTok',
        'sound on|off - sound effects',
        'music on|off - background music',
        'overdrive - ???',
        'matrix - you know what this does',
        'clear - wipe the screen',
        'exit - close the terminal',
        '(there are a few secret commands too)']);
    },
    games() {
      lines(['01 - HOLLOWBLADE (type: open hollowblade)', '02 - THE HOLLOW AFTER DARK (type: open after-dark)', '', 'MORE GAMES SOON...']);
    },
    devs() {
      lines(['THECELTICBHOYS - MAIN DEV', 'UNKNOWNSERVICE - CODER & DESIGNER', 'JIPJIP - IDEAS PERSON']);
    },
    discord() { openUrl('discord', 'DISCORD'); },
    itch() { openUrl('itch', 'ITCH.IO'); },
    tiktok() { openUrl('tiktok', 'TIKTOK'); },
    open(args) {
      const a = (args[0] || '').toLowerCase();
      if (LINKS[a]) return openUrl(a, a.toUpperCase());
      if (PAGES[a]) { print('LOADING ' + a.toUpperCase() + '...', 'ok'); return setTimeout(() => HB.go(PAGES[a]), 250); }
      print('UNKNOWN TARGET. TRY: games, workshop, home, hollowblade, after-dark, discord, itch, tiktok', 'err');
    },
    sound(args) { toggleSnd(args, 'sfx'); },
    sfx(args) { toggleSnd(args, 'sfx'); },
    music(args) { toggleSnd(args, 'music'); },
    overdrive() { HB.toggleOverdrive(); print('OVERDRIVE TOGGLED.', 'ok'); },
    matrix() { startRain(); print('WAKE UP...', 'ok'); },
    clear() { out.textContent = ''; },
    exit() { hide(); },
    about() { lines(['HOLLOWBLADE INDUSTRIES', 'MAKERS OF HOLLOWBLADE AND THE HOLLOW AFTER DARK.']); },
    whoami() { print('VISITOR #' + visits); },
    date() { print(new Date().toString()); },
    echo(args) { print(args.join(' ')); },
    sudo() { HB.fx.err(); print('PERMISSION DENIED. NICE TRY.', 'err'); },
    hack() {
      const steps = ['BYPASSING FIREWALL ........ ', 'DECRYPTING GEARBOX ........ ', 'DOWNLOADING BLADES ........ '];
      steps.forEach((s, i) => setTimeout(() => { print(s + 'OK'); HB.fx.beep(i * 2); }, 400 * (i + 1)));
      setTimeout(() => { print('JUST KIDDING. WE ARE THE GOOD GUYS.', 'ok'); HB.fx.ok(); }, 400 * (steps.length + 1));
    },
    cogs() {
      let n = 0; try { n = JSON.parse(localStorage.getItem('hb-wk') || '{}').cogs || 0; } catch (e) {}
      print('YOU HAVE ' + Math.floor(n).toLocaleString() + ' COGS IN THE WORKSHOP.');
    },
    hollow() { lines(['...', 'THE HOLLOW IS WATCHING.']); HB.fx.glitch(); },
    konami() { print('UP UP DOWN DOWN LEFT RIGHT LEFT RIGHT B A', 'dim'); }
  };
  function toggleSnd(args, which) {
    const v = (args[0] || '').toLowerCase();
    if (v !== 'on' && v !== 'off') return print('USAGE: ' + which + ' on|off', 'err');
    const want = v === 'on', cur = which === 'sfx' ? HB.Snd.sfx : HB.Snd.music;
    if (want !== cur) { which === 'sfx' ? HB.Snd.toggleSfx() : HB.Snd.toggleMusic(); HB.paintHud(); }
    print(which.toUpperCase() + ' ' + v.toUpperCase(), 'ok');
  }

  function run(raw) {
    const text = raw.trim();
    print('> ' + text, 'cmd');
    if (!text) return;
    hist.push(text); hi = hist.length;
    const [name, ...args] = text.split(/\s+/);
    const fn = CMD[name.toLowerCase()];
    if (fn) fn(args); else { HB.fx.err(); print('UNKNOWN COMMAND: ' + name + '. TYPE "help".', 'err'); }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { run(input.value); input.value = ''; }
    else if (e.key === 'Escape' || e.key === '`') { e.preventDefault(); hide(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) input.value = hist[--hi]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); input.value = ++hi < hist.length ? hist[hi] : (hi = hist.length, ''); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const w = input.value.toLowerCase(), m = Object.keys(CMD).filter(k => k.startsWith(w));
      if (w && m.length === 1) input.value = m[0];
    } else if (e.key.length === 1) HB.fx.beep(Math.random() * 6 | 0);
  });
  $('.tx', ov).addEventListener('click', hide);
  ov.addEventListener('pointerdown', e => { if (e.target === ov) hide(); });

  /* ---------- openers ---------- */
  document.addEventListener('click', e => { if (e.target.closest('[data-term]')) toggle(); });
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === '`' || e.key === '~') { e.preventDefault(); toggle(); }
  });
  const hud = $('.hud');
  if (hud) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.term = ''; b.textContent = '>_'; b.setAttribute('aria-label', 'Open terminal');
    hud.prepend(b);
  }
})();
