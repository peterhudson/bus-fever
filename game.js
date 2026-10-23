// Sarah's Bus Jam. Copyright (C) 2026 Peter Hudson. Licensed under GPL-3.0-or-later, see LICENSE.
'use strict';
(() => {
  // ---------- Constants ----------
  const LW = 330, LH = 290;          // parking lot size in lot units
  const BUS_W = 22;
  const BUS_LEN = { 16: 34, 24: 44, 40: 58 };  // seats -> length
  const MAX_BAYS = 7;
  const BAY_PRICES = { 5: 100, 6: 300, 7: 600 };
  const BOOSTER_PRICE = 50;
  const EXTRA_BAY_PRICE = 100;
  const BUMP_DUR = 0.35, FLY_DUR = 0.4, LEAVE_DUR = 0.7, BOARD_GAP = 0.018;
  const RING_SPEED = 70;  // how fast the carousel turns (px/s)
  const LANES = 4;        // people come in groups of 4, standing side by side on the carousel

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

  const MYSTERY = { c: '#64748b', d: '#334155', l: '#94a3b8' };
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
  // Special pieces that show up as levels go on
  const TUNNEL = 22;      // a tunnel is a 2x2-cell block in the lot
  function levelFeatures(n) {
    return {
      mystery: n >= 8 ? Math.min(0.35, 0.1 + (n - 8) * 0.01) : 0,   // share of buses hiding their color
      flips: n >= 12 ? Math.min(5, 1 + Math.floor((n - 12) / 6)) : 0, // buses that turn around
      tunnels: n >= 15 ? (n >= 30 ? 2 : 1) : 0,
    };
  }
  // Where the next bus out of a tunnel parks: right in front of its mouth
  function tunnelMouth(t, len) {
    const d = TUNNEL / 2 + 1 + (len + 2) / 2;
    return { x: t.x + Math.cos(t.ang) * d, y: t.y + Math.sin(t.ang) * d, ang: t.ang, len, wid: BUS_W };
  }

  // Later levels: buses packed tightly on a grid of 12-unit cells, arrows
  // along the grid. A bus is 2 cells wide and 3, 4 or 5 cells long.
  function packGrid(n, target, rng, nTunnels, tunnels) {
    const C = 12, ri = (k) => Math.floor(rng() * k);
    // Size the block so the buses fill most of it
    const area = (target * 8.4) / 0.82, aspect = LW / LH;
    const cols = Math.min(Math.floor(LW / C), Math.round(Math.sqrt(area * aspect)));
    const rows = Math.min(Math.floor(LH / C), Math.round(area / cols));
    const ox = (LW - cols * C) / 2, oy = (LH - rows * C) / 2;
    const used = new Array(cols * rows).fill(false);
    const isFree = (gx, gy, w, h) => {
      if (gx < 0 || gy < 0 || gx + w > cols || gy + h > rows) return false;
      for (let yy = gy; yy < gy + h; yy++) for (let xx = gx; xx < gx + w; xx++) if (used[yy * cols + xx]) return false;
      return true;
    };
    const take = (gx, gy, w, h) => { for (let yy = gy; yy < gy + h; yy++) for (let xx = gx; xx < gx + w; xx++) used[yy * cols + xx] = true; };
    const buses = [];
    const pickCap = () => (rng() < 0.4 ? 16 : rng() < 0.3 ? 40 : 24);
    const cellsOf = (cap) => (cap === 16 ? 3 : cap === 24 ? 4 : 5);

    // Tunnels first, each with the first of its buses parked at the mouth
    for (let tries = 0; tunnels.length < nTunnels && tries < 300; tries++) {
      const cap = pickCap(), cells = cellsOf(cap);
      const dir = ri(4), dx = [1, 0, -1, 0][dir], dy = [0, 1, 0, -1][dir];
      const gx = ri(cols - 1), gy = ri(rows - 1);
      // the mouth bus footprint, in cells
      const bw = dx ? cells : 2, bh = dx ? 2 : cells;
      const bx = dx > 0 ? gx + 2 : dx < 0 ? gx - cells : gx;
      const by = dy > 0 ? gy + 2 : dy < 0 ? gy - cells : gy;
      if (!isFree(gx, gy, 2, 2) || !isFree(bx, by, bw, bh)) continue;
      const t = { x: ox + (gx + 1) * C, y: oy + (gy + 1) * C, ang: (dir * Math.PI) / 2, len: TUNNEL, wid: TUNNEL, tunnel: true, queue: [] };
      const first = { ...tunnelMouth(t, cells * C - 2), cap };
      if (pathHit(first, buses.concat(tunnels))) continue;
      take(gx, gy, 2, 2); take(bx, by, bw, bh);
      const more = 2 + ri(3);
      for (let i = 0; i < more; i++) t.queue.push({ cap, len: cells * C - 2 });
      tunnels.push(t);
      buses.push(first);
    }

    for (let tries = 0; buses.length < target && tries < 12000; tries++) {
      const cap = pickCap(), cells = cellsOf(cap);
      const horiz = rng() < 0.5;
      const w = horiz ? cells : 2, h = horiz ? 2 : cells;
      // Early buses go near the middle so the block fills from the inside out
      let gx = ri(cols - w + 1), gy = ri(rows - h + 1);
      if (tries < 3000) {
        const dist = (x, y) => Math.abs(x + w / 2 - cols / 2) / cols + Math.abs(y + h / 2 - rows / 2) / rows;
        for (let c = 0; c < 2; c++) {
          const x2 = ri(cols - w + 1), y2 = ri(rows - h + 1);
          if (dist(x2, y2) < dist(gx, gy)) { gx = x2; gy = y2; }
        }
      }
      if (!isFree(gx, gy, w, h)) continue;
      const ang = horiz ? (rng() < 0.5 ? 0 : Math.PI) : rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      const nb = { x: ox + (gx + w / 2) * C, y: oy + (gy + h / 2) * C, ang, len: cells * C - 2, wid: BUS_W, cap };
      if (pathHit(nb, buses.concat(tunnels))) continue;
      take(gx, gy, w, h);
      buses.push(nb);
    }
    return buses;
  }

  // Clears the lot in a random order that the rules allow, turning flip buses
  // around and letting tunnels release buses. Returns that order, or null if
  // the lot jams.
  function solveOrder(buses, tunnels, rng) {
    const lot = buses.map((b) => ({ ...b, ref: b }));
    const tq = tunnels.map((t) => t.queue.slice());
    const order = [];
    for (let guard = 0; guard < 1000; guard++) {
      if (!lot.length && tq.every((q) => !q.length)) return order;
      const obs = lot.concat(tunnels);
      const free = lot.filter((b) => !pathHit(b, obs));
      if (!free.length) return null;
      const b = free[Math.floor(rng() * free.length)];
      lot.splice(lot.indexOf(b), 1);
      order.push(b.ref);
      for (const o of lot) if (o.flip) o.ang += Math.PI;
      tunnels.forEach((t, i) => {
        if (!tq[i].length) return;
        const m = tunnelMouth(t, tq[i][0].len);
        if (lot.some((o) => obbOverlap(m, o))) return;
        const spec = tq[i].shift();
        lot.push({ ...m, cap: spec.cap, ref: spec });
      });
    }
    return null;
  }

  // Builds a level from its number. The same number always gives the same
  // level. A level is only kept if the lot can be cleared, and the passenger
  // line is built by playing that clearing order with a few bays, so every
  // level is solvable.
  function genLevel(n) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const L = buildLevel(n, attempt, levelFeatures(n));
      if (L) return L;
    }
    return buildLevel(n, 0, { mystery: 0, flips: 0, tunnels: 0 });
  }

  function buildLevel(n, attempt, feats) {
    const rng = mulberry32(n * 7919 + 13 + attempt * 104729);
    const ri = (k) => Math.floor(rng() * k);
    const packed = n > 4;
    const target = packed ? Math.min(8 + n, 50) : 5 + Math.floor(n * 1.15);
    const nc = Math.min(2 + Math.floor((n + 2) / 3), COLORS.length, target);
    const tunnels = [];
    const buses = packed ? packGrid(n, target, rng, feats.tunnels, tunnels) : [];
    for (let tries = 0; !packed && buses.length < target && tries < 4000; tries++) {
      const cap = rng() < 0.42 ? 16 : n >= 4 && rng() < 0.28 ? 40 : 24;
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

    // Flip buses and mystery buses
    const pool = buses.filter((b) => !tunnels.some((t) => obbOverlap(tunnelMouth(t, b.len), b)));
    for (let i = 0; i < feats.flips && pool.length; i++) pool.splice(ri(pool.length), 1)[0].flip = true;
    for (const b of buses) if (rng() < feats.mystery) b.mystery = true;
    for (const t of tunnels) for (const q of t.queue) if (rng() < feats.mystery) q.mystery = true;

    const order = solveOrder(buses, tunnels, rng);
    if (!order) return null;

    // Colors: every color appears at least once (tunnel buses included)
    const cols = order.map((_, i) => (i < nc ? i : ri(nc)));
    for (let i = cols.length - 1; i > 0; i--) {
      const j = ri(i + 1);
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }
    order.forEach((b, i) => (b.color = cols[i]));

    // Passenger line
    const K = n < 6 ? 2 : n < 15 ? 3 : 4;
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
      // Passengers arrive in clumps of one color, sometimes a whole busload
      const run = rng() < 0.4 ? s.need : LANES * (1 + ri(Math.min(s.need / LANES, 6)));
      for (let r = 0; r < run; r++) queue.push(s.color);
      s.need -= run;
      if (s.need <= 0) open.splice(i, 1);
    }
    return { buses, tunnels, queue, attempt };
  }

  // ---------- Layout ----------
  let dpr = 1, cw = 0, ch = 0, crowdH = 0, slotTop = 0, slotH = 0;
  let lotX = 0, lotY = 0, ls = 1, lotTop = 0, slotW = 0, slotX0 = 0, slotGap = 6, slotScale = 1;
  let qPath = [], qLen = 0;
  let ringXL = 0, ringXR = 0, ringYT = 0, ringYB = 0, ringR = 20, ringLen = 1;
  const Q_SP = 9, Q_ROW = 11, Q_SCALE = 0.7, RING_SCALE = 0.56, LANE_W = 6.4;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    crowdH = Math.round(Math.max(150, Math.min(ch * 0.3, 240)));
    slotTop = crowdH; slotH = 92;
    lotTop = slotTop + slotH + 6;
    const lotH = ch - lotTop - 6, lotW = cw - 12;
    ls = Math.min(lotW / LW, lotH / LH);
    lotX = 6 + (lotW - LW * ls) / 2;
    lotY = lotTop + (lotH - LH * ls) / 2;
    slotW = Math.min(44, (cw - 20 - slotGap * 7) / 8);
    slotX0 = (cw - (slotW * 8 + slotGap * 7)) / 2;
    slotScale = Math.min((slotH - 36) / BUS_LEN[40], (slotW - 8) / BUS_W);

    // Carousel: a stadium-shaped loop just above the bays
    ringYB = crowdH - 18; ringYT = ringYB - 2 * ringR;
    ringXL = 16 + ringR; ringXR = cw - 16 - ringR;
    ringLen = 2 * (ringXR - ringXL) + 2 * Math.PI * ringR;

    // Snake-shaped waiting line above it; the front stands by the carousel entrance
    const m = 16, yb = ringYT - 22;
    qPath = [[ringXL, yb]];
    let y = yb, right = true;
    qPath.push([cw - m, y]);
    while (y - Q_ROW > 8) {
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
  // Point on the carousel, s measured clockwise from the entrance (top left)
  function ringPoint(s) {
    s = ((s % ringLen) + ringLen) % ringLen;
    const L1 = ringXR - ringXL, A = Math.PI * ringR, yc = ringYT + ringR;
    if (s < L1) return { x: ringXL + s, y: ringYT };
    s -= L1;
    if (s < A) { const a = -Math.PI / 2 + s / ringR; return { x: ringXR + ringR * Math.cos(a), y: yc + ringR * Math.sin(a) }; }
    s -= A;
    if (s < L1) return { x: ringXR - s, y: ringYB };
    s -= L1;
    const a = Math.PI / 2 + s / ringR;
    return { x: ringXL + ringR * Math.cos(a), y: yc + ringR * Math.sin(a) };
  }
  // Seats come in rows of LANES across the belt
  const seatBase = (k) => Math.floor(k / LANES) * (ringLen / (G.ring.length / LANES));
  const seatS = (k) => seatBase(k) + G.ringOff;
  function seatPoint(k) {
    const s = seatS(k), p = ringPoint(s), q = ringPoint(s + 1);
    const tx = q.x - p.x, ty = q.y - p.y, l = Math.hypot(tx, ty) || 1;
    const off = ((k % LANES) - (LANES - 1) / 2) * LANE_W;
    return { x: p.x - (ty / l) * off, y: p.y + (tx / l) * off };
  }

  function slotRect(i) {
    return { x: slotX0 + i * (slotW + slotGap), y: slotTop + 8, w: slotW, h: slotH - 34 };
  }

  // ---------- Game state ----------
  let G = null;
  const bays = () => Math.min(MAX_BAYS, save.bays + G.tempBays);

  // The carousel gets smaller as levels go on, which is what makes them harder
  const ringSeats = (n) => LANES * (n < 5 ? 48 : Math.max(20, 42 - Math.floor(n / 2)));

  function startLevel() {
    const L = genLevel(save.level);
    G = {
      buses: L.buses.map((b, i) => makeBus(b, i)),
      tunnels: L.tunnels.map((t) => ({ ...t, queue: t.queue.map((q) => ({ ...q })), shake: 0 })),
      queue: L.queue.slice(), total: L.queue.length,
      slots: new Array(8).fill(null), tempBays: 0, arrivals: 0,
      shift: 0, boardT: 0, particles: [], vipMode: false,
      ring: new Array(ringSeats(save.level)).fill(null), ringOff: 0,
      modal: false, won: false, stuckT: 0, checkT: 0, failDismissed: false,
    };
    // The carousel starts full
    for (let k = 0; k < G.ring.length && G.queue.length; k++) G.ring[k] = G.queue.shift();
    revealFree();
    updateHUD();
    introduceNewPieces();
  }
  function makeBus(b, id) {
    return { ...b, id, state: 'lot', filled: 0, pending: 0, slot: -1, t: 0, ex: 0, bumpT: 0, bumpD: 0, shake: 0, flash: 0, flipT: 0, emergeT: 0 };
  }

  // Obstacles in the lot: parked buses and tunnels
  const obstacles = () => lotBuses().concat(G.tunnels);

  // A mystery bus shows its color once nothing blocks its way out
  function revealFree() {
    const obs = obstacles();
    for (const b of obs) {
      if (b.mystery && !b.tunnel && !pathHit(b, obs)) { b.mystery = false; b.flash = 0.4; }
    }
  }

  // Release the next bus from any tunnel whose mouth is clear
  function spawnFromTunnels() {
    for (const t of G.tunnels) {
      if (!t.queue.length) continue;
      const spec = t.queue[0], m = tunnelMouth(t, spec.len);
      const blocked = G.buses.some((b) => {
        if (b.state === 'lot') return obbOverlap(m, b);
        if (b.state === 'exiting') return obbOverlap(m, { ...b, x: b.x + Math.cos(b.ang) * b.ex, y: b.y + Math.sin(b.ang) * b.ex });
        return false;
      });
      if (blocked) continue;
      t.queue.shift();
      const b = makeBus({ ...spec, ...m }, G.buses.length);
      b.emergeT = 0.35;
      G.buses.push(b);
      revealFree();
    }
  }

  // The first time a level has a new kind of piece, explain it
  function introduceNewPieces() {
    const seen = (save.seenPieces = save.seenPieces || {});
    const notes = [];
    if (G.buses.some((b) => b.mystery) && !seen.mystery) {
      seen.mystery = true;
      notes.push('<li><b>Mystery buses ❓</b> hide their color until nothing is blocking their way out.</li>');
    }
    if (G.buses.some((b) => b.flip) && !seen.flip) {
      seen.flip = true;
      notes.push('<li><b>Gold-outlined buses</b> turn around every time another bus leaves the lot.</li>');
    }
    if (G.tunnels.length && !seen.tunnel) {
      seen.tunnel = true;
      notes.push('<li><b>Tunnels</b> send out a new bus whenever the spot in front of them is clear. The number shows how many are left inside.</li>');
    }
    if (!notes.length) return;
    persist();
    showModal(`<div class="big">✨</div><h2>Something new!</h2><ul class="howto">${notes.join('')}</ul>
      <button class="btn" data-a="close">Got it</button>`);
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
    if (b.emergeT > 0) {
      // slide out of the tunnel behind it
      const back = (b.emergeT / 0.35) * (b.len / 2 + TUNNEL / 2);
      x -= Math.cos(b.ang) * back; y -= Math.sin(b.ang) * back;
    }
    const ang = b.ang - Math.PI * (b.flipT / 0.3);
    return { x: lotX + x * ls, y: lotY + y * ls, ang, s: ls };
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

    if (py < slotTop) { G.boostT = 1.5; return; }

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
    if (b.mystery) { b.mystery = false; b.flash = 0.4; }
    const hit = pathHit(b, obstacles());
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
    // Flip buses turn around whenever a bus leaves the lot
    for (const o of lotBuses()) if (o.flip) { o.ang += Math.PI; o.flipT = 0.3; }
    revealFree();
    sound('go');
  }

  // ---------- Update ----------
  function update(dt) {
    if (!G) return;
    for (const b of G.buses) {
      if (b.shake > 0) b.shake = Math.max(0, b.shake - dt);
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
      if (b.flipT > 0) b.flipT = Math.max(0, b.flipT - dt);
      if (b.emergeT > 0) b.emergeT = Math.max(0, b.emergeT - dt);
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

    // Carousel turns; an empty row passing the entrance takes the next group of 4
    G.shift = Math.max(0, G.shift - dt * 40);
    const prevOff = G.ringOff;
    // Tapping the crowd speeds the carousel up for a moment
    G.boostT = Math.max(0, (G.boostT || 0) - dt);
    G.ringOff += RING_SPEED * (G.boostT > 0 ? 2.5 : 1) * dt;
    for (let k = 0; k < G.ring.length; k += LANES) {
      const a = Math.floor((seatBase(k) + prevOff) / ringLen), b = Math.floor((seatBase(k) + G.ringOff) / ringLen);
      if (a === b || !G.queue.length) continue;
      let empty = true;
      for (let j = 0; j < LANES; j++) if (G.ring[k + j] !== null) empty = false;
      if (!empty) continue;
      for (let j = 0; j < LANES && G.queue.length; j++) G.ring[k + j] = G.queue.shift();
      G.shift += LANES;
    }

    // Boarding: anyone on the carousel hops onto a parked bus of their color
    G.boardT -= dt;
    while (G.boardT <= 0) {
      let pick = null;
      for (const b of G.buses) {
        if (b.state !== 'slot' || b.filled >= b.cap) continue;
        const to = slotPose(b.slot);
        for (let k = 0; k < G.ring.length; k++) {
          if (G.ring[k] !== b.color) continue;
          const p = seatPoint(k);
          const d = Math.hypot(p.x - to.x, p.y - to.y) + b.arrive * 1000;
          if (!pick || d < pick.d) pick = { d, k, b, p };
        }
      }
      if (pick) {
        const { b, k, p } = pick;
        G.ring[k] = null;
        b.filled++; b.pending++;
        G.boardT += BOARD_GAP;
        G.particles.push({ x0: p.x, y0: p.y, bus: b, t: 0, color: b.color });
        if (G.particles.length % 3 === 0) sound('pop');
        updateProgress();
      } else { G.boardT = 0; break; }
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

    spawnFromTunnels();
    if (!G.won && G.buses.every((b) => b.state === 'gone') && G.tunnels.every((t) => !t.queue.length)) {
      G.won = true;
      setTimeout(showWin, 350);
    }

    checkStuck(dt);
  }

  function checkStuck(dt) {
    const waiting = G.queue.length > 0 || G.ring.some((c) => c !== null);
    if (G.won || G.modal || G.failDismissed || !waiting) { G.stuckT = 0; return; }
    const busy = G.particles.length || G.shift > 0.05 ||
      G.buses.some((b) => b.state === 'exiting' || b.state === 'flying' || (b.state === 'lot' && b.bumpT > 0));
    if (busy) { G.stuckT = 0; return; }
    G.checkT -= dt;
    if (G.checkT > 0) { if (G.stuckT > 0) G.stuckT += dt; return; }
    G.checkT = 0.25;
    const canBoard = G.buses.some((b) => b.state === 'slot' && b.filled < b.cap && G.ring.includes(b.color));
    const canFeed = G.queue.length > 0 && G.ring.some((c, k) => k % LANES === 0 && G.ring.slice(k, k + LANES).every((x) => x === null));
    let stuck = false;
    if (!canBoard && !canFeed) {
      if (freeSlot() < 0) stuck = true;
      else {
        const obs = obstacles();
        stuck = !lotBuses().some((b) => !pathHit(b, obs));
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
    const col = b.mystery && mode === 'arrow' ? MYSTERY : COLORS[b.color], L = b.len, W = b.wid;
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

    if (b.mystery && mode === 'arrow') {
      // a big "?" with just the arrowhead, so the direction still shows
      ctx.fillStyle = '#fff'; ctx.font = '900 14px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(-L * 0.08, 0); ctx.rotate(-pose.ang); ctx.fillText('?', 0, 1); ctx.restore();
      const xh = L * 0.36, xb = L * 0.2;
      ctx.beginPath(); ctx.moveTo(xh, 0); ctx.lineTo(xb, -5.5); ctx.lineTo(xb, 5.5); ctx.closePath(); ctx.fill();
    }
    if (b.flip && mode === 'arrow') {
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.4;
      rr(-L / 2 - 1, -W / 2 - 1, L + 2, W + 2, 7); ctx.stroke();
    }
    if (mode === 'arrow' && !b.mystery) {
      const x0 = -L * 0.26, x1 = L * 0.16, xh = L * 0.3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [style, lw] of [['rgba(15,23,42,0.45)', 5.5], ['#fff', 3.2]]) {
        ctx.strokeStyle = style; ctx.fillStyle = style; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xh, 0); ctx.lineTo(x1 - 1, -5.5); ctx.lineTo(x1 - 1, 5.5); ctx.closePath();
        ctx.stroke(); ctx.fill();
      }
    } else {
      // roof fills up from the back as passengers board
      const frac = (b.filled - b.pending) / b.cap, inner = L - 13;
      ctx.fillStyle = 'rgba(15,23,42,0.12)'; rr(-L / 2 + 4, -W / 2 + 5, inner, W - 10, 3); ctx.fill();
      if (frac > 0) { ctx.fillStyle = col.d; rr(-L / 2 + 4, -W / 2 + 5, Math.max(4, inner * frac), W - 10, 3); ctx.fill(); }
    }
    if (b.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${b.flash * 2})`;
      rr(-L / 2, -W / 2, L, W, 6); ctx.fill();
    }
    ctx.restore();
  }

  function drawTunnel(t) {
    const h = TUNNEL / 2;
    ctx.save();
    ctx.translate(lotX + t.x * ls, lotY + t.y * ls);
    ctx.rotate(t.ang); ctx.scale(ls, ls);
    ctx.fillStyle = 'rgba(15,23,42,0.22)'; rr(-h + 1.5, -h + 3, TUNNEL, TUNNEL, 5); ctx.fill();
    ctx.fillStyle = '#57534e'; rr(-h, -h, TUNNEL, TUNNEL, 5); ctx.fill();
    ctx.fillStyle = '#4ade80'; rr(-h + 2, -h + 2, TUNNEL - 4, TUNNEL - 4, 4); ctx.fill();  // grass on the roof
    // dark archway on the mouth side
    ctx.fillStyle = '#1c1917';
    ctx.beginPath(); ctx.moveTo(h, -h + 4); ctx.lineTo(h - 6, -h + 4);
    ctx.arc(h - 6, 0, h - 4, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(h, h - 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (t.queue.length) {
      // count badge on the back corner, away from the mouth
      const bx = t.x - Math.cos(t.ang) * 6, by = t.y - Math.sin(t.ang) * 6;
      const x = lotX + bx * ls, y = lotY + by * ls;
      ctx.fillStyle = '#1e40af'; rr(x - 6.5, y - 6, 13, 12, 4); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '900 9px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(t.queue.length), x, y + 0.5);
    }
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
    // Carousel belt with seat markers that show it turning
    const belt = () => {
      ctx.beginPath();
      ctx.moveTo(ringXL, ringYT); ctx.lineTo(ringXR, ringYT);
      ctx.arc(ringXR, ringYT + ringR, ringR, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(ringXL, ringYB);
      ctx.arc(ringXL, ringYT + ringR, ringR, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath();
    };
    ctx.fillStyle = '#c7d7c0'; belt(); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = LANES * LANE_W + 9; belt(); ctx.stroke();
    ctx.strokeStyle = '#8f9ab0'; ctx.lineWidth = LANES * LANE_W + 4; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < G.ring.length; k++) {
      if (k % LANES) continue;
      const p = ringPoint(seatS(k));
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.moveTo(ringXL - 6, ringYT - 19); ctx.lineTo(ringXL + 6, ringYT - 19); ctx.lineTo(ringXL, ringYT - 13); ctx.fill();

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
    for (const t of G.tunnels) drawTunnel(t);

    // People riding the carousel
    for (let k = 0; k < G.ring.length; k++) {
      if (G.ring[k] === null) continue;
      const p = seatPoint(k);
      drawPerson(p.x, p.y, G.ring[k], RING_SCALE);
    }
    // Waiting line (back of line drawn first)
    const visible = Math.min(G.queue.length, Math.floor(qLen / Q_SP));
    for (let i = visible - 1; i >= 0; i--) {
      const p = queuePoint((i + G.shift) * Q_SP);
      if (p) drawPerson(p.x, p.y, G.queue[i], Q_SCALE);
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
      drawPerson(lerp(p.x0, to.x, t), lerp(p.y0, to.y, t) - Math.sin(Math.PI * t) * 18, p.color, RING_SCALE * (1 - t * 0.3));
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
    const left = G.queue.length + G.ring.filter((c) => c !== null).length;
    const pct = G.total ? (100 * (G.total - left)) / G.total : 0;
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
      for (const c of G.ring) if (c !== null && need[c] > 0) need[c]--;
      const win = G.queue.slice(0, 240), front = [], rest = [];
      // Move whole groups of 4 so the line stays in groups
      for (let i = 0; i < win.length; i += LANES) {
        const g = win.slice(i, i + LANES), c = g[0];
        if (need[c] >= g.length) { front.push(...g); need[c] -= g.length; } else rest.push(...g);
      }
      if (!front.length) { toast('Nobody in line fits your parked buses yet'); return; }
      const newQ = front.concat(rest, G.queue.slice(240));
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
      <p>The carousel is full and nobody on it matches a bus in the bays.</p>
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
      <li>Buses that get out park in a bay. The line feeds a turning carousel, and anyone on it hops onto a bus of their color.</li>
      <li>Full buses drive away. Clear every passenger to win!</li>
      <li>If the carousel fills up and nobody on it matches a parked bus, you're stuck, so plan ahead.</li>
      <li>Tap the crowd to make the carousel turn faster for a moment.</li>
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
  window.__bus = { genLevel, update, lotPose, pathHit, lotBuses, obstacles, freeSlot, levelFeatures, startLevel, get G() { return G; }, get save() { return save; } };
})();
