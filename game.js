// Sarah's Bus Jam. Copyright (C) 2026 Peter Hudson. Licensed under GPL-3.0-or-later, see LICENSE.
'use strict';
(() => {
  // ---------- Constants ----------
  const LW = 330, LH = 290;          // parking lot size in lot units
  const BUS_W = 22;
  const BUS_LEN = { 4: 34, 6: 44, 10: 58 };
  const MAX_BAYS = 7;
  const BAY_PRICES = { 5: 100, 6: 300, 7: 600 };
  const BOOSTER_PRICE = 50;
  const EXTRA_BAY_PRICE = 100;
  const BUMP_DUR = 0.35, FLY_DUR = 0.4, LEAVE_DUR = 0.7, BOARD_GAP = 0.07;

  const COLORS = [
    { c: '#ef4444', d: '#b91c1c', l: '#fca5a5' }, // red
    { c: '#3b82f6', d: '#1d4ed8', l: '#93c5fd' }, // blue
    { c: '#22c55e', d: '#15803d', l: '#86efac' }, // green
    { c: '#facc15', d: '#ca8a04', l: '#fef08a' }, // yellow
    { c: '#a855f7', d: '#7e22ce', l: '#d8b4fe' }, // purple
    { c: '#f97316', d: '#c2410c', l: '#fdba74' }, // orange
    { c: '#ec4899', d: '#be185d', l: '#f9a8d4' }, // pink
    { c: '#22d3ee', d: '#0891b2', l: '#a5f3fc' }, // cyan
    { c: '#9a5b2e', d: '#5f3519', l: '#d6a77a' }, // brown
    { c: '#f8fafc', d: '#94a3b8', l: '#ffffff' }, // white
  ];

  const $ = (s) => document.querySelector(s);
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');

  // ---------- Save data ----------
  const SAVE_KEY = 'sarah-bus-jam-v1';
  const defaultSave = () => ({
    level: 1, coins: 0, bays: 4, sound: true, seenHowTo: false,
    boosters: { shuffle: 2, sort: 2, vip: 2 },
  });
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.level) {
        const d = defaultSave();
        return Object.assign(d, s, { boosters: Object.assign(d.boosters, s.boosters || {}) });
      }
    } catch (e) {}
    return defaultSave();
  }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }
  let save = loadSave();

  // ---------- Math helpers ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeIn = (t) => t * t;
  function lerpAngle(a, b, t) {
    let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return a + d * t;
  }

  function corners(x, y, ang, len, wid) {
    const c = Math.cos(ang), s = Math.sin(ang), hl = len / 2, hw = wid / 2;
    return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([a, b]) => [x + c * a - s * b, y + s * a + c * b]);
  }
  function project(pts, ax, ay) {
    let mn = Infinity, mx = -Infinity;
    for (const p of pts) {
      const d = p[0] * ax + p[1] * ay;
      if (d < mn) mn = d;
      if (d > mx) mx = d;
    }
    return [mn, mx];
  }
  // Separating-axis test for two oriented rectangles
  function obbOverlap(A, B) {
    const dx = A.x - B.x, dy = A.y - B.y, r = (A.len + B.len) / 2;
    if (dx * dx + dy * dy > r * r) return false;
    const pa = corners(A.x, A.y, A.ang, A.len, A.wid);
    const pb = corners(B.x, B.y, B.ang, B.len, B.wid);
    for (const ang of [A.ang, A.ang + Math.PI / 2, B.ang, B.ang + Math.PI / 2]) {
      const ax = Math.cos(ang), ay = Math.sin(ang);
      const [a0, a1] = project(pa, ax, ay), [b0, b1] = project(pb, ax, ay);
      if (a1 <= b0 || b1 <= a0) return false;
    }
    return true;
  }
  function outOfLot(len, x, y) {
    const r = len / 2 + 2;
    return x < -r || x > LW + r || y < -r || y > LH + r;
  }
  // Slide bus b forward along its arrow. Returns null if it gets out, else where it hits.
  function pathHit(b, others, pad = 0) {
    const dx = Math.cos(b.ang), dy = Math.sin(b.ang);
    const cands = [];
    for (const o of others) {
      if (o === b) continue;
      const rx = o.x - b.x, ry = o.y - b.y;
      const t = rx * dx + ry * dy;
      const perp = Math.abs(-rx * dy + ry * dx);
      if (t < -(b.len + o.len) / 2) continue;
      if (perp > (b.wid + o.len) / 2 + pad + 1) continue;
      cands.push(o);
    }
    if (!cands.length) return null;
    const probe = { x: b.x, y: b.y, ang: b.ang, len: b.len + pad, wid: b.wid + pad };
    for (let d = 2; d < 900; d += 2) {
      probe.x = b.x + dx * d; probe.y = b.y + dy * d;
      if (outOfLot(b.len, probe.x, probe.y)) return null;
      for (const o of cands) if (obbOverlap(probe, o)) return { d, other: o };
    }
    return null;
  }

  // ---------- Level generation ----------
  // Buses are placed one at a time, each with a clear exit path, so removing
  // them in reverse order always works. The passenger line is then built by
  // simulating that order with a few bays, so every level is solvable.
  function genLevel(n) {
    const rng = mulberry32(n * 7919 + 13);
    const ri = (k) => Math.floor(rng() * k);
    const target = Math.min(5 + Math.floor(n * 1.15), 34);
    const nc = Math.min(2 + Math.floor((n + 2) / 3), COLORS.length, target);
    const buses = [];
    for (let tries = 0; buses.length < target && tries < 4000; tries++) {
      const cap = rng() < 0.42 ? 4 : n >= 4 && rng() < 0.28 ? 10 : 6;
      const len = BUS_LEN[cap];
      const k = rng() < 0.6 ? 2 * ri(4) : 2 * ri(4) + 1;
      const ang = (k * Math.PI) / 4;
      let x, y;
      const roll = rng();
      if (buses.length && roll < 0.45) {
        // Drop it in front of an existing bus so it blocks that bus
        const b = buses[ri(buses.length)];
        const d = b.len / 2 + len / 2 + 4 + rng() * 50;
        x = b.x + Math.cos(b.ang) * d + (rng() - 0.5) * 16;
        y = b.y + Math.sin(b.ang) * d + (rng() - 0.5) * 16;
      } else if (buses.length && roll < 0.85) {
        const b = buses[ri(buses.length)];
        const a = rng() * Math.PI * 2, d = 26 + rng() * 30;
        x = b.x + Math.cos(a) * d; y = b.y + Math.sin(a) * d;
      } else {
        x = 25 + rng() * (LW - 50); y = 25 + rng() * (LH - 50);
      }
      const nb = { x, y, ang, len, wid: BUS_W, cap };
      if (corners(x, y, ang, len, BUS_W).some(([px, py]) => px < 4 || px > LW - 4 || py < 4 || py > LH - 4)) continue;
      const fat = { x, y, ang, len: len + 7, wid: BUS_W + 7 };
      if (buses.some((o) => obbOverlap(fat, o))) continue;
      if (pathHit(nb, buses, 3)) continue;
      buses.push(nb);
    }

    // Colors: every color appears at least once
    const cols = buses.map((_, i) => (i < nc ? i : ri(nc)));
    for (let i = cols.length - 1; i > 0; i--) {
      const j = ri(i + 1);
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }
    buses.forEach((b, i) => (b.color = cols[i]));

    // Passenger line
    const K = n < 15 ? 2 : n < 35 ? 3 : 4;
    const order = buses.slice().reverse();
    const open = [], queue = [];
    let next = 0;
    for (;;) {
      while (open.length < K && next < order.length) {
        const b = order[next++];
        open.push({ color: b.color, need: b.cap });
      }
      if (!open.length) break;
      let i = rng() < 0.65 ? 0 : ri(open.length);
      // Same-colored buses fill oldest first, matching how boarding works in play
      i = open.findIndex((o) => o.color === open[i].color);
      const s = open[i];
      const run = 1 + ri(Math.min(s.need, 6));
      for (let r = 0; r < run; r++) queue.push(s.color);
      s.need -= run;
      if (s.need <= 0) open.splice(i, 1);
    }
    return { buses, queue };
  }

  // ---------- Layout ----------
  let dpr = 1, cw = 0, ch = 0, crowdH = 0, slotTop = 0, slotH = 0;
  let lotX = 0, lotY = 0, ls = 1, lotTop = 0, slotW = 0, slotX0 = 0, slotGap = 6, slotScale = 1;
  let qPath = [], qLen = 0;
  const Q_SP = 12.5, Q_ROW = 15;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    crowdH = Math.round(Math.max(110, Math.min(ch * 0.25, 210)));
    slotTop = crowdH; slotH = 92;
    lotTop = slotTop + slotH + 6;
    const lotH = ch - lotTop - 6, lotW = cw - 12;
    ls = Math.min(lotW / LW, lotH / LH);
    lotX = 6 + (lotW - LW * ls) / 2;
    lotY = lotTop + (lotH - LH * ls) / 2;
    slotW = Math.min(44, (cw - 20 - slotGap * 7) / 8);
    slotX0 = (cw - (slotW * 8 + slotGap * 7)) / 2;
    slotScale = Math.min((slotH - 36) / BUS_LEN[10], (slotW - 8) / BUS_W);

    // Snake-shaped queue path, front of the line first
    const m = 16, yb = crowdH - 14;
    qPath = [[cw / 2, yb]];
    let y = yb, right = true;
    qPath.push([cw - m, y]);
    while (y - Q_ROW > 10) {
      y -= Q_ROW;
      qPath.push([right ? cw - m : m, y]);
      right = !right;
      qPath.push([right ? cw - m : m, y]);
    }
    qLen = 0;
    for (let i = 1; i < qPath.length; i++) qLen += Math.hypot(qPath[i][0] - qPath[i - 1][0], qPath[i][1] - qPath[i - 1][1]);
  }
  function queuePoint(s) {
    for (let i = 1; i < qPath.length; i++) {
      const [x0, y0] = qPath[i - 1], [x1, y1] = qPath[i];
      const L = Math.hypot(x1 - x0, y1 - y0);
      if (s <= L) return { x: x0 + ((x1 - x0) * s) / L, y: y0 + ((y1 - y0) * s) / L };
      s -= L;
    }
    return null;
  }
  function slotRect(i) {
    return { x: slotX0 + i * (slotW + slotGap), y: slotTop + 8, w: slotW, h: slotH - 34 };
  }

  // ---------- Game state ----------
  let G = null;
  const bays = () => Math.min(MAX_BAYS, save.bays + G.tempBays);

  function startLevel() {
    const L = genLevel(save.level);
    G = {
      buses: L.buses.map((b, i) => ({ ...b, id: i, state: 'lot', filled: 0, pending: 0, slot: -1, t: 0, ex: 0, bumpT: 0, bumpD: 0, shake: 0, flash: 0 })),
      queue: L.queue.slice(), total: L.queue.length,
      slots: new Array(8).fill(null), tempBays: 0, arrivals: 0,
      shift: 0, boardT: 0, particles: [], vipMode: false,
      modal: false, won: false, stuckT: 0, checkT: 0, failDismissed: false,
    };
    updateHUD();
  }

  function freeSlot() {
    for (let i = 1; i <= bays(); i++) if (!G.slots[i]) return i;
    return -1;
  }
  const lotBuses = () => G.buses.filter((b) => b.state === 'lot');

  function lotPose(b, extra = 0) {
    let x = b.x, y = b.y;
    let d = extra;
    if (b.state === 'lot' && b.bumpT > 0) d += b.bumpD * Math.sin(Math.PI * (1 - b.bumpT / BUMP_DUR));
    x += Math.cos(b.ang) * d; y += Math.sin(b.ang) * d;
    if (b.shake > 0) { x += Math.sin(b.shake * 60) * 1.5; }
    return { x: lotX + x * ls, y: lotY + y * ls, ang: b.ang, s: ls };
  }
  function slotPose(i) {
    const r = slotRect(i);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, ang: -Math.PI / 2, s: slotScale };
  }
  function poseOf(b) {
    switch (b.state) {
      case 'lot': return lotPose(b);
      case 'exiting': return lotPose(b, b.ex);
      case 'flying': {
        const to = slotPose(b.slot), t = easeInOut(Math.min(1, b.t));
        return { x: lerp(b.from.x, to.x, t), y: lerp(b.from.y, to.y, t) - Math.sin(Math.PI * t) * 20,
          ang: lerpAngle(b.from.ang, to.ang, t), s: lerp(b.from.s, to.s, t) };
      }
      case 'slot': return slotPose(b.slot);
      case 'leaving': {
        const p = slotPose(b.slot), t = easeIn(Math.min(1, b.t));
        return { x: p.x, y: p.y - t * 110, ang: p.ang, s: p.s, alpha: 1 - t };
      }
    }
    return null;
  }

  // ---------- Input ----------
  function busAt(px, py) {
    const lx = (px - lotX) / ls, ly = (py - lotY) / ls;
    let best = null, bestD = Infinity;
    for (const b of G.buses) {
      if (b.state !== 'lot') continue;
      const dx = lx - b.x, dy = ly - b.y;
      const c = Math.cos(b.ang), s = Math.sin(b.ang);
      const u = dx * c + dy * s, v = -dx * s + dy * c;
      if (Math.abs(u) <= b.len / 2 + 5 && Math.abs(v) <= b.wid / 2 + 5) {
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = b; }
      }
    }
    return best;
  }

  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (G.modal || G.won) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;

    for (let i = bays() + 1; i <= MAX_BAYS; i++) {
      const s = slotRect(i);
      if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) { openShop(); return; }
    }

    const b = busAt(px, py);
    if (!b) return;
    G.failDismissed = false;

    if (G.vipMode) {
      if (G.slots[0]) { toast('The VIP bay is busy'); return; }
      G.vipMode = false;
      spendBooster('vip');
      sendToSlot(b, 0, true);
      return;
    }
    const slot = freeSlot();
    if (slot < 0) { toast('All bays are full!'); b.shake = 0.3; sound('bump'); return; }
    const hit = pathHit(b, lotBuses());
    if (hit) {
      b.bumpT = BUMP_DUR; b.bumpD = Math.max(0, hit.d - 2);
      hit.other.shake = 0.35;
      sound('bump');
      return;
    }
    sendToSlot(b, slot, false);
  });

  function sendToSlot(b, slot, direct) {
    G.slots[slot] = b;
    b.slot = slot;
    b.arrive = ++G.arrivals;
    if (direct) { b.from = lotPose(b); b.state = 'flying'; b.t = 0; }
    else { b.state = 'exiting'; b.ex = 0; }
    sound('go');
  }

  // ---------- Update ----------
  function update(dt) {
    if (!G) return;
    for (const b of G.buses) {
      if (b.shake > 0) b.shake = Math.max(0, b.shake - dt);
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
      switch (b.state) {
        case 'lot':
          if (b.bumpT > 0) b.bumpT = Math.max(0, b.bumpT - dt);
          break;
        case 'exiting': {
          b.ex += (300 + b.ex * 4) * dt;
          const x = b.x + Math.cos(b.ang) * b.ex, y = b.y + Math.sin(b.ang) * b.ex;
          if (outOfLot(b.len, x, y) || b.ex > 500) {
            b.from = lotPose(b, b.ex);
            b.state = 'flying'; b.t = 0;
          }
          break;
        }
        case 'flying':
          b.t += dt / FLY_DUR;
          if (b.t >= 1) { b.state = 'slot'; b.t = 0; }
          break;
        case 'leaving':
          b.t += dt / LEAVE_DUR;
          if (b.t >= 1) b.state = 'gone';
          break;
      }
    }

    // Boarding: only the front of the line can get on, into a matching bus
    G.shift = Math.max(0, G.shift - dt * 16);
    G.boardT -= dt;
    if (G.queue.length && G.boardT <= 0 && G.shift < 0.6) {
      const col = G.queue[0];
      let best = null;
      for (const b of G.buses) {
        if (b.state === 'slot' && b.color === col && b.filled < b.cap && (!best || b.arrive < best.arrive)) best = b;
      }
      if (best) {
        G.queue.shift();
        best.filled++; best.pending++;
        G.shift += 1; G.boardT = BOARD_GAP;
        const fp = queuePoint(0);
        G.particles.push({ x0: fp.x, y0: fp.y, bus: best, t: 0, color: col });
        sound('pop');
        updateProgress();
      }
    }
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.t += dt / 0.22;
      if (p.t >= 1) {
        G.particles.splice(i, 1);
        const b = p.bus;
        b.pending--;
        if (b.filled === b.cap && b.pending === 0) {
          b.state = 'leaving'; b.t = 0;
          G.slots[b.slot] = null;
          sound('leave');
        }
      }
    }

    if (!G.won && !G.queue.length && G.buses.every((b) => b.state === 'gone')) {
      G.won = true;
      setTimeout(showWin, 350);
    }

    checkStuck(dt);
  }

  function checkStuck(dt) {
    if (G.won || G.modal || !G.queue.length || G.failDismissed) { G.stuckT = 0; return; }
    const busy = G.particles.length || G.shift > 0.05 ||
      G.buses.some((b) => b.state === 'exiting' || b.state === 'flying' || (b.state === 'lot' && b.bumpT > 0));
    if (busy) { G.stuckT = 0; return; }
    G.checkT -= dt;
    if (G.checkT > 0) { if (G.stuckT > 0) G.stuckT += dt; return; }
    G.checkT = 0.25;
    const col = G.queue[0];
    const canBoard = G.buses.some((b) => b.state === 'slot' && b.color === col && b.filled < b.cap);
    let stuck = false;
    if (!canBoard) {
      if (freeSlot() < 0) stuck = true;
      else {
        const lot = lotBuses();
        stuck = !lot.some((b) => !pathHit(b, lot));
      }
    }
    if (stuck) {
      G.stuckT += 0.25;
      if (G.stuckT > 0.9) showFail();
    } else G.stuckT = 0;
  }

  // ---------- Drawing ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPerson(x, y, color, s = 1) {
    const col = COLORS[color];
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x + 1, y + 3 * s, 5.5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col.c; ctx.strokeStyle = col.d; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 6 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col.l;
    ctx.beginPath(); ctx.arc(x, y - 2.5 * s, 3.4 * s, 0, Math.PI * 2); ctx.fill();
  }

  function drawBus(b, pose, mode) {
    const col = COLORS[b.color], L = b.len, W = b.wid;
    ctx.save();
    if (pose.alpha !== undefined) ctx.globalAlpha = Math.max(0, pose.alpha);
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.ang);
    ctx.scale(pose.s, pose.s);
    // shadow
    ctx.fillStyle = 'rgba(15,23,42,0.22)';
    rr(-L / 2 + 1.5, -W / 2 + 3, L, W, 6); ctx.fill();
    // body
    ctx.fillStyle = col.d; rr(-L / 2, -W / 2, L, W, 6); ctx.fill();
    ctx.fillStyle = col.c; rr(-L / 2 + 1.3, -W / 2 + 1.3, L - 2.6, W - 2.6, 5); ctx.fill();
    // side windows
    ctx.fillStyle = 'rgba(30,58,95,0.55)';
    const n = Math.max(2, Math.round((L - 16) / 9)), span = (L - 16) / n;
    for (let i = 0; i < n; i++) {
      const wx = -L / 2 + 5 + i * span;
      ctx.fillRect(wx, -W / 2 + 1.6, span - 2, 2.6);
      ctx.fillRect(wx, W / 2 - 4.2, span - 2, 2.6);
    }
    // windshield (front)
    ctx.fillStyle = 'rgba(30,58,95,0.8)';
    rr(L / 2 - 7, -W / 2 + 3, 4.5, W - 6, 2); ctx.fill();
    // roof
    ctx.fillStyle = col.l;
    rr(-L / 2 + 4, -W / 2 + 5, L - 13, W - 10, 3); ctx.fill();

    if (mode === 'arrow') {
      const x0 = -L * 0.26, x1 = L * 0.16, xh = L * 0.3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [style, lw] of [['rgba(15,23,42,0.45)', 5.5], ['#fff', 3.2]]) {
        ctx.strokeStyle = style; ctx.fillStyle = style; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xh, 0); ctx.lineTo(x1 - 1, -5.5); ctx.lineTo(x1 - 1, 5.5); ctx.closePath();
        ctx.stroke(); ctx.fill();
      }
    } else {
      // seats showing how full the bus is
      const cols = b.cap / 2, sp = (L - 17) / cols;
      for (let i = 0; i < b.cap; i++) {
        const cx = -L / 2 + 5 + sp * (Math.floor(i / 2) + 0.5), cy = i % 2 ? 3.3 : -3.3;
        if (i < b.filled - b.pending) {
          ctx.fillStyle = col.d;
          ctx.beginPath(); ctx.arc(cx, cy, 2.8, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(15,23,42,0.15)';
          ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    if (b.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${b.flash * 2})`;
      rr(-L / 2, -W / 2, L, W, 6); ctx.fill();
    }
    ctx.restore();
  }

  let clock = 0;
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Plaza where the crowd waits
    ctx.fillStyle = '#e7ecf3'; ctx.fillRect(0, 0, cw, crowdH);
    ctx.strokeStyle = 'rgba(148,163,184,0.25)'; ctx.lineWidth = 1;
    for (let x = 0; x < cw; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, crowdH); ctx.stroke(); }
    for (let y = 0; y < crowdH; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }
    // Path the crowd stands on
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Q_ROW + 2;
    ctx.beginPath(); qPath.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = '#a3adbf'; ctx.lineWidth = Q_ROW - 3;
    ctx.stroke();

    // Station with bays
    ctx.fillStyle = '#5d6680'; ctx.fillRect(0, slotTop, cw, slotH);
    ctx.fillStyle = '#cbd5e1'; ctx.fillRect(0, slotTop, cw, 3); ctx.fillRect(0, slotTop + slotH - 3, cw, 3);
    for (let i = 0; i <= MAX_BAYS; i++) {
      const r = slotRect(i);
      ctx.lineWidth = 2;
      if (i === 0) {
        ctx.fillStyle = G.vipMode ? `rgba(250,204,21,${0.5 + 0.3 * Math.sin(clock * 8)})` : 'rgba(250,204,21,0.35)';
        rr(r.x, r.y, r.w, r.h, 8); ctx.fill();
        ctx.strokeStyle = '#facc15'; ctx.stroke();
        if (!G.slots[0]) {
          ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(-Math.PI / 2);
          ctx.fillStyle = '#facc15'; ctx.font = '900 14px -apple-system, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VIP', 0, 0); ctx.restore();
        }
      } else if (i <= bays()) {
        ctx.fillStyle = '#6b7491'; rr(r.x, r.y, r.w, r.h, 8); ctx.fill();
        ctx.strokeStyle = '#7f89a6'; ctx.stroke();
      } else {
        ctx.setLineDash([5, 4]); ctx.strokeStyle = '#8a93ad';
        rr(r.x, r.y, r.w, r.h, 8); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#4ade80'; ctx.font = '900 22px -apple-system, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', r.x + r.w / 2, r.y + r.h / 2);
      }
    }

    // Parking lot
    ctx.fillStyle = '#d3dbe7'; ctx.fillRect(0, lotTop - 6, cw, ch - lotTop + 6);

    // Crowd (back of line drawn first)
    const visible = Math.min(G.queue.length, Math.floor(qLen / Q_SP));
    for (let i = visible - 1; i >= 0; i--) {
      const p = queuePoint((i + G.shift) * Q_SP);
      if (p) drawPerson(p.x, p.y, G.queue[i]);
    }
    if (G.queue.length > visible) {
      const p = qPath[qPath.length - 1];
      const txt = `+${G.queue.length - visible}`;
      ctx.font = '800 12px -apple-system, sans-serif';
      const w = ctx.measureText(txt).width + 12;
      ctx.fillStyle = 'rgba(15,23,42,0.75)'; rr(Math.min(cw - w - 4, Math.max(4, p[0] - w / 2)), p[1] - 9, w, 18, 9); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, Math.min(cw - w / 2 - 4, Math.max(4 + w / 2, p[0])), p[1]);
    }

    // Buses: parked first, moving ones on top
    for (const b of G.buses) if (b.state === 'lot') {
      const pose = lotPose(b);
      drawBus(b, pose, 'arrow');
      if (G.vipMode) {
        ctx.save(); ctx.translate(pose.x, pose.y); ctx.rotate(pose.ang);
        ctx.strokeStyle = `rgba(250,204,21,${0.6 + 0.4 * Math.sin(clock * 8)})`; ctx.lineWidth = 3;
        rr((-b.len / 2 - 3) * ls, (-b.wid / 2 - 3) * ls, (b.len + 6) * ls, (b.wid + 6) * ls, 8); ctx.stroke();
        ctx.restore();
      }
    }
    for (const b of G.buses) {
      if (b.state === 'slot' || b.state === 'leaving') drawBus(b, poseOf(b), 'seats');
    }
    for (const b of G.buses) {
      if (b.state === 'exiting' || b.state === 'flying') drawBus(b, poseOf(b), b.state === 'flying' && b.t > 0.5 ? 'seats' : 'arrow');
    }
    // Seats-left badges under bays
    for (const b of G.buses) {
      if (b.state !== 'slot') continue;
      const r = slotRect(b.slot), left = b.cap - b.filled;
      const col = COLORS[b.color];
      ctx.fillStyle = col.c; rr(r.x + 3, r.y + r.h + 5, r.w - 6, 18, 6); ctx.fill();
      ctx.fillStyle = b.color === 9 || b.color === 3 ? '#0f172a' : '#fff';
      ctx.font = '900 13px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(left), r.x + r.w / 2, r.y + r.h + 14.5);
    }
    // Passengers hopping on
    for (const p of G.particles) {
      const to = slotPose(p.bus.slot), t = easeInOut(Math.min(1, p.t));
      drawPerson(lerp(p.x0, to.x, t), lerp(p.y0, to.y, t) - Math.sin(Math.PI * t) * 18, p.color, 1 - t * 0.4);
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; clock += dt;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- HUD, boosters, modals ----------
  function updateProgress() {
    const pct = G.total ? (100 * (G.total - G.queue.length)) / G.total : 0;
    $('#progFill').style.width = pct + '%';
  }
  function updateHUD() {
    $('#lvl').textContent = 'LEVEL ' + save.level;
    $('#coins').textContent = '🪙 ' + save.coins;
    document.querySelectorAll('.boost[data-k]').forEach((el) => {
      const k = el.dataset.k, n = save.boosters[k];
      const cnt = el.querySelector('.cnt');
      cnt.textContent = n > 0 ? n : '+';
      cnt.classList.toggle('zero', n <= 0);
      el.classList.toggle('active', k === 'vip' && G && G.vipMode);
    });
    if (G) updateProgress();
  }

  let toastTimer = 0;
  function toast(msg, ms = 1500) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('show', !!msg);
    clearTimeout(toastTimer);
    if (msg) toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function spendBooster(k) {
    save.boosters[k] = Math.max(0, save.boosters[k] - 1);
    persist(); updateHUD();
  }

  function onBooster(k) {
    unlockAudio();
    if (G.modal || G.won) return;
    if (save.boosters[k] <= 0) { openShop(); return; }
    G.failDismissed = false;
    if (k === 'vip') {
      if (G.slots[0] && !G.vipMode) { toast('The VIP bay is already in use'); return; }
      G.vipMode = !G.vipMode;
      toast(G.vipMode ? 'Tap any bus to fly it to the VIP bay' : '');
      updateHUD();
      return;
    }
    if (k === 'shuffle') {
      const lot = lotBuses();
      const groups = {};
      lot.forEach((b) => (groups[b.cap] = groups[b.cap] || []).push(b));
      let changed = false;
      for (const g of Object.values(groups)) {
        const cols = g.map((b) => b.color);
        for (let i = cols.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [cols[i], cols[j]] = [cols[j], cols[i]];
        }
        g.forEach((b, i) => { if (b.color !== cols[i]) changed = true; b.color = cols[i]; b.flash = 0.4; });
      }
      if (!changed) { toast('Nothing to shuffle'); return; }
      spendBooster('shuffle'); sound('magic');
      return;
    }
    if (k === 'sort') {
      const need = {};
      for (const b of G.buses) {
        if (['slot', 'flying', 'exiting'].includes(b.state)) need[b.color] = (need[b.color] || 0) + b.cap - b.filled;
      }
      const win = G.queue.slice(0, 60), front = [], rest = [];
      for (const c of win) {
        if (need[c] > 0) { front.push(c); need[c]--; } else rest.push(c);
      }
      if (!front.length) { toast('Park a bus in a bay first'); return; }
      const newQ = front.concat(rest, G.queue.slice(60));
      if (newQ.every((c, i) => c === G.queue[i])) { toast('The line is already sorted'); return; }
      G.queue = newQ;
      spendBooster('sort'); sound('magic');
    }
  }
  document.querySelectorAll('.boost[data-k]').forEach((el) => el.addEventListener('click', () => onBooster(el.dataset.k)));
  $('#btnShop').addEventListener('click', () => { unlockAudio(); openShop(); });
  $('#btnRestart').addEventListener('click', () => {
    unlockAudio();
    if (G.modal) return;
    showModal(`<h2>Restart?</h2><p>Start level ${save.level} over from the beginning.</p>
      <button class="btn" data-a="restart">Restart</button><button class="btn gray" data-a="close">Cancel</button>`,
      { restart: () => { closeModal(); startLevel(); } });
  });
  $('#btnMenu').addEventListener('click', () => { unlockAudio(); openMenu(); });

  let modalActions = {};
  let modalOnClose = null;
  function showModal(html, actions, onClose) {
    G.modal = true;
    G.vipMode = false;
    $('#card').innerHTML = html;
    modalActions = actions || {};
    modalOnClose = onClose || null;
    $('#modal').hidden = false;
    updateHUD();
  }
  function closeModal() {
    $('#modal').hidden = true;
    G.modal = false;
    const f = modalOnClose; modalOnClose = null;
    if (f) f();
  }
  $('#card').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-a]');
    if (!btn || btn.disabled) return;
    const a = btn.dataset.a;
    if (a === 'close') closeModal();
    else if (modalActions[a]) modalActions[a](btn);
  });

  function showWin() {
    const reward = 10 + Math.min(40, save.level * 2);
    const bonus = save.level % 5 === 0;
    save.coins += reward;
    if (bonus) for (const k in save.boosters) save.boosters[k]++;
    save.level++;
    persist();
    sound('win');
    const cheers = ['Amazing!', 'Brilliant!', 'Nice driving!', 'Well done!', 'Fantastic!', 'Superb!'];
    showModal(`<div class="big">🎉</div><h2>${cheers[save.level % cheers.length]}</h2>
      <p>Level ${save.level - 1} complete<br><b>+${reward} 🪙</b>${bonus ? '<br>Bonus: +1 of every booster!' : ''}</p>
      <button class="btn" data-a="next">Next level</button>`,
      { next: () => { closeModal(); startLevel(); } });
  }

  function showFail() {
    const anyBooster = Object.values(save.boosters).some((n) => n > 0);
    const canExtra = bays() < MAX_BAYS;
    sound('fail');
    showModal(`<div class="big">🚌💨</div><h2>Out of space!</h2>
      <p>No bus in the bays matches the next passenger.</p>
      ${anyBooster ? '<button class="btn blue" data-a="close">Keep going with a booster</button>' : ''}
      ${canExtra ? `<button class="btn gold" data-a="extra" ${save.coins < EXTRA_BAY_PRICE ? 'disabled' : ''}>Open an extra bay · ${EXTRA_BAY_PRICE} 🪙</button>` : ''}
      <button class="btn" data-a="restart">Try again</button>`,
      {
        extra: () => {
          save.coins -= EXTRA_BAY_PRICE; persist();
          G.tempBays++; closeModal(); updateHUD();
        },
        restart: () => { closeModal(); startLevel(); },
      },
      () => { G.failDismissed = true; G.stuckT = 0; });
  }

  function openShop() {
    if (G.modal) return;
    const render = () => {
      const nextBay = save.bays + 1;
      const bayPrice = BAY_PRICES[nextBay];
      const items = [
        ['shuffle', '🔀', 'Shuffle', 'Mixes up the colors of parked buses'],
        ['sort', '👥', 'Sort', 'Moves passengers who fit your buses to the front'],
        ['vip', '⭐', 'VIP', 'Flies any bus to the VIP bay, even if it is blocked'],
      ];
      return `<h2>Shop</h2><div class="coinline">🪙 ${save.coins}</div>
        <p style="margin:0 0 6px">Earn coins by finishing levels. No ads, ever. ♥</p>
        ${bayPrice ? `<div class="shop-row"><div class="ic">🅿️</div><div class="txt"><b>Extra bay</b>Unlock bay ${nextBay} for every level</div>
          <button data-a="bay" ${save.coins < bayPrice ? 'disabled' : ''}>${bayPrice} 🪙</button></div>`
        : `<div class="shop-row"><div class="ic">🅿️</div><div class="txt"><b>All bays unlocked</b>You have all ${MAX_BAYS} bays</div></div>`}
        ${items.map(([k, ic, name, desc]) => `<div class="shop-row"><div class="ic">${ic}</div>
          <div class="txt"><b>${name} (have ${save.boosters[k]})</b>${desc}</div>
          <button data-a="buy" data-k="${k}" ${save.coins < BOOSTER_PRICE ? 'disabled' : ''}>${BOOSTER_PRICE} 🪙</button></div>`).join('')}
        <button class="btn blue" data-a="close">Done</button>`;
    };
    const actions = {
      bay: () => {
        const price = BAY_PRICES[save.bays + 1];
        if (!price || save.coins < price) return;
        save.coins -= price; save.bays++; persist(); sound('magic');
        $('#card').innerHTML = render(); updateHUD();
      },
      buy: (btn) => {
        if (save.coins < BOOSTER_PRICE) return;
        save.coins -= BOOSTER_PRICE; save.boosters[btn.dataset.k]++; persist(); sound('pop');
        $('#card').innerHTML = render(); updateHUD();
      },
    };
    showModal(render(), actions);
  }

  function howToHtml() {
    return `<h2>How to play</h2><ol class="howto">
      <li>Tap a bus to drive it the way its arrow points. If another bus is in the way, it bumps and stays put.</li>
      <li>Buses that get out park in a bay. Passengers at the front of the line hop on buses of their color.</li>
      <li>Full buses drive away. Clear every passenger to win!</li>
      <li>If all the bays fill up with no match, you're stuck, so plan ahead.</li>
      <li>Earn coins to unlock more bays and boosters in the shop.</li></ol>`;
  }

  function openMenu() {
    if (G.modal) return;
    const render = () => `<h2>Paused</h2>
      <button class="btn" data-a="close">Resume</button>
      <button class="btn blue" data-a="how">How to play</button>
      <button class="btn gray" data-a="sound">Sound: ${save.sound ? 'On' : 'Off'}</button>`;
    showModal(render(), {
      sound: () => { save.sound = !save.sound; persist(); $('#card').innerHTML = render(); },
      how: () => { $('#card').innerHTML = howToHtml() + '<button class="btn" data-a="close">Got it</button>'; },
    });
  }

  // ---------- Sound ----------
  let AC = null;
  function unlockAudio() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (AC && AC.state === 'suspended') AC.resume();
  }
  function tone(freq, dur, type = 'sine', vol = 0.06, slide = 0, delay = 0) {
    const t0 = AC.currentTime + delay;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(AC.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sound(name) {
    if (!save.sound || !AC) return;
    switch (name) {
      case 'pop': tone(700 + Math.random() * 250, 0.05, 'triangle', 0.035); break;
      case 'go': tone(300, 0.18, 'sawtooth', 0.03, 300); break;
      case 'bump': tone(140, 0.15, 'square', 0.05, -60); break;
      case 'leave': tone(400, 0.25, 'triangle', 0.05, 400); break;
      case 'magic': [660, 880, 1100].forEach((f, i) => tone(f, 0.12, 'sine', 0.05, 0, i * 0.07)); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, 0, i * 0.11)); break;
      case 'fail': [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, 0, i * 0.15)); break;
    }
  }

  // ---------- Boot ----------
  window.addEventListener('resize', layout);
  layout();
  startLevel();
  if (!save.seenHowTo) {
    save.seenHowTo = true; persist();
    showModal(`<div class="big">🚌</div>` + howToHtml() + '<button class="btn" data-a="close">Let\'s go!</button>');
  }
  requestAnimationFrame(frame);

  // Exposed for testing
  window.__bus = { genLevel, update, lotPose, pathHit, lotBuses, freeSlot, startLevel, get G() { return G; }, get save() { return save; } };
})();
