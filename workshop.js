/* Workshop: a small clicker game. Progress is saved in this browser only. */
(() => {
  const HB = window.HB;
  if (!HB) return;
  const $ = s => document.querySelector(s);
  const KEY = 'hb-wk';

  const UPGRADES = [
    { id: 'blade',   name: 'SHARPER BLADE', desc: '+1 COG PER CLICK', base: 25,   mult: 1.6,  click: 1 },
    { id: 'wrench',  name: 'AUTO-WRENCH',   desc: '+1 COG / SEC',     base: 15,   mult: 1.15, cps: 1 },
    { id: 'gearbox', name: 'GEARBOX',       desc: '+6 COGS / SEC',    base: 120,  mult: 1.17, cps: 6 },
    { id: 'forge',   name: 'FORGE',         desc: '+35 COGS / SEC',   base: 900,  mult: 1.18, cps: 35 },
    { id: 'factory', name: 'FACTORY',       desc: '+200 COGS / SEC',  base: 6000, mult: 1.2,  cps: 200 }
  ];
  const ACHIEVEMENTS = [
    { id: 'spark',   name: 'FIRST SPARK',   desc: 'CLICK THE GEAR',     ok: s => s.clicks >= 1 },
    { id: 'c100',    name: 'POCKET CHANGE', desc: 'EARN 100 COGS',      ok: s => s.total >= 100 },
    { id: 'c1k',     name: 'GEARHEAD',      desc: 'EARN 1,000 COGS',    ok: s => s.total >= 1e3 },
    { id: 'c10k',    name: 'MECHANIC',      desc: 'EARN 10,000 COGS',   ok: s => s.total >= 1e4 },
    { id: 'c100k',   name: 'ENGINEER',      desc: 'EARN 100,000 COGS',  ok: s => s.total >= 1e5 },
    { id: 'c1m',     name: 'INDUSTRIALIST', desc: 'EARN 1,000,000 COGS', ok: s => s.total >= 1e6 },
    { id: 'clicks',  name: 'CLICKY',        desc: 'CLICK 500 TIMES',    ok: s => s.clicks >= 500 },
    { id: 'sharp',   name: 'BLADE MASTER',  desc: 'OWN 10 SHARPER BLADES', ok: s => (s.owned.blade || 0) >= 10 },
    { id: 'factory', name: 'FACTORY OWNER', desc: 'BUY A FACTORY',      ok: s => (s.owned.factory || 0) >= 1 }
  ];

  let S = { cogs: 0, total: 0, clicks: 0, owned: {}, ach: {} };
  try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  const cost = u => Math.ceil(u.base * Math.pow(u.mult, S.owned[u.id] || 0));
  const power = () => 1 + (S.owned.blade || 0);
  const cps = () => UPGRADES.reduce((n, u) => n + (u.cps || 0) * (S.owned[u.id] || 0), 0);
  const fmt = n => {
    if (n < 1e4) return Math.floor(n).toLocaleString('en-US');
    const units = ['', 'K', 'M', 'B', 'T'];
    let i = 0; while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return n.toFixed(n < 100 ? 2 : 1) + units[i];
  };

  /* ---------- build shop + achievements ---------- */
  const shop = $('#shop'), achList = $('#ach');
  const rows = UPGRADES.map(u => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'up';
    b.innerHTML = '<b></b><em></em><small></small><i></i>';
    b.addEventListener('click', () => buy(u));
    shop.appendChild(b);
    return { u, b, name: b.children[0], cost: b.children[1], desc: b.children[2], owned: b.children[3] };
  });
  const achRows = ACHIEVEMENTS.map(a => {
    const li = document.createElement('li');
    li.innerHTML = '<b></b><small></small>';
    achList.appendChild(li);
    return { a, li };
  });

  function render() {
    $('#cogs').textContent = fmt(S.cogs);
    $('#rate').textContent = fmt(cps()) + ' / SEC  |  ' + power() + ' PER CLICK';
    rows.forEach(r => {
      const c = cost(r.u);
      r.name.textContent = r.u.name;
      r.cost.textContent = fmt(c) + ' COGS';
      r.desc.textContent = r.u.desc;
      r.owned.textContent = 'OWNED: ' + (S.owned[r.u.id] || 0);
      r.b.classList.toggle('off', S.cogs < c);
      r.b.setAttribute('aria-disabled', S.cogs < c);
    });
    let n = 0;
    achRows.forEach(r => {
      const got = !!S.ach[r.a.id]; if (got) n++;
      r.li.className = got ? 'got' : 'locked';
      r.li.children[0].textContent = got ? r.a.name : '???';
      r.li.children[1].textContent = r.a.desc;
    });
    $('#achcount').textContent = n + '/' + ACHIEVEMENTS.length;
  }

  function check() {
    ACHIEVEMENTS.forEach(a => {
      if (!S.ach[a.id] && a.ok(S)) {
        S.ach[a.id] = 1; HB.fx.ach(); HB.toast('ACHIEVEMENT: ' + a.name); save();
      }
    });
  }

  function floater(x, y, text) {
    const f = document.createElement('div');
    f.className = 'float'; f.textContent = text;
    f.style.left = x + 'px'; f.style.top = y + 'px';
    document.body.appendChild(f); setTimeout(() => f.remove(), 900);
  }

  /* ---------- clicking ---------- */
  const cog = $('#cog');
  let combo = 0, last = 0;
  cog.addEventListener('click', e => {
    const now = performance.now();
    combo = now - last < 450 ? Math.min(combo + 1, 14) : 0; last = now;
    const gain = power();
    S.cogs += gain; S.total += gain; S.clicks++;
    HB.fx.coin(combo);
    const r = cog.getBoundingClientRect();
    const x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
    floater(x + (Math.random() * 40 - 20), y - 10, '+' + gain);
    HB.boost(cog, 6, 700);
    check(); render();
  });

  function buy(u) {
    const c = cost(u);
    if (S.cogs < c) { HB.fx.err(); HB.shake(shop); return; }
    S.cogs -= c; S.owned[u.id] = (S.owned[u.id] || 0) + 1;
    HB.fx.buy(); save(); check(); render();
  }

  /* ---------- passive income ---------- */
  setInterval(() => {
    const gain = cps() / 10;
    if (gain > 0) { S.cogs += gain; S.total += gain; check(); render(); }
  }, 100);
  setInterval(save, 3000);
  addEventListener('beforeunload', save);

  /* ---------- reset (two clicks to confirm) ---------- */
  const reset = $('#reset');
  let armed = null;
  reset.addEventListener('click', () => {
    if (!armed) {
      reset.textContent = 'SURE? CLICK AGAIN'; HB.fx.deny && HB.fx.deny();
      armed = setTimeout(() => { armed = null; reset.textContent = 'RESET PROGRESS'; }, 3000);
      return;
    }
    clearTimeout(armed); armed = null;
    S = { cogs: 0, total: 0, clicks: 0, owned: {}, ach: {} };
    save(); render(); reset.textContent = 'RESET PROGRESS'; HB.toast('PROGRESS RESET');
  });

  render();
})();
