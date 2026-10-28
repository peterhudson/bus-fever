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
  const DEFUSE_PRICE = 100;
  const BUMP_DUR = 0.35, FLY_DUR = 0.4, LEAVE_DUR = 0.7, BOARD_GAP = 0.018;
  const RING_SPEED = 70;  // how fast the carousel turns (px/s)
  const LANES = 4;        // four seats abreast; later chapters board people individually

  // Bright, well separated colors: c body, d outline/shade, l highlight
  const COLORS = [
    { c: '#ff2e2e', d: '#c10f12', l: '#ff9b96' }, // red
    { c: '#1f6bff', d: '#123fc4', l: '#94b6ff' }, // blue
    { c: '#1fd655', d: '#0e9437', l: '#97f2b1' }, // green
    { c: '#ffd60a', d: '#cc9a00', l: '#fff28a' }, // yellow
    { c: '#a63cff', d: '#6b16c7', l: '#d8adff' }, // purple
    { c: '#ff8a00', d: '#c45a00', l: '#ffc47a' }, // orange
    { c: '#ff47b5', d: '#c4157e', l: '#ffadde' }, // pink
    { c: '#14e0f0', d: '#0798ab', l: '#a3f7fc' }, // cyan
    { c: '#9b5a24', d: '#5e3312', l: '#dba06c' }, // brown
    { c: '#ffffff', d: '#8e9bb0', l: '#ffffff' }, // white
  ];

  // A passenger is a color number; BAG is added for one towing a suitcase,
  // who takes two seats
  const BAG = 16, colorOf = (p) => p & 15, seatsOf = (p) => (p >= BAG ? 2 : 1);
  const COLOR_NAMES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'brown', 'white'];
  const MYSTERY = { c: '#64748b', d: '#334155', l: '#94a3b8' };
  const A = window.Advanced;
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

  // Tow trucks pull their bus forward into any gap that has opened ahead of
  // it, stopping a little short of whatever is in the way. Returns how far
  // each one moved.
  function towStep(lot, fixed) {
    const moved = [];
    for (const o of lot.filter(q => q.tow).sort((a, c) => a.seq - c.seq)) {
      const hit = pathHit(o, lot.concat(fixed));
      if (!hit || hit.d <= 10) continue;
      const d = hit.d - 6;
      o.x += Math.cos(o.ang) * d; o.y += Math.sin(o.ang) * d;
      moved.push([o, d]);
    }
    return moved;
  }

  // ---------- Level generation ----------
  // Every 10th level is a HARD level: the buses are packed into a shape and
  // the carousel is smaller. u and v run from -1 to 1 across the block.
  const isHard = (n) => n >= 10 && n % 10 === 0;
  // Past level 45 the levels keep getting harder: more buses, a smaller
  // carousel, more mystery buses and more mixed-up passenger lines. By level
  // 100 there is almost no slack: one wrong bus fills a bay for good.
  // Returns 0 up to level 45, rising to 1 at level 100.
  const late = (n) => Math.min(1, Math.max(0, (n - 45) / 55));
  const SHAPES = [
    { name: 'ring', fill: 0.62, has: (u, v) => { const r = Math.hypot(u, v); return r > 0.42 && r < 1.08; } },
    { name: 'plus', fill: 0.62, has: (u, v) => Math.abs(u) < 0.4 || Math.abs(v) < 0.4 },
    { name: 'diamond', fill: 0.55, has: (u, v) => Math.abs(u) + Math.abs(v) < 1.08 },
    { name: 'L', fill: 0.6, has: (u, v) => u < -0.15 || v > 0.15 },
  ];

  // Special pieces that show up as levels go on
  const TUNNEL = 22;      // a tunnel is a 2x2-cell block in the lot
  function levelFeatures(n) {
    return {
      mystery: n >= 8 ? Math.min(0.35, 0.1 + (n - 8) * 0.01) + 0.15 * late(n) : 0,   // share of buses hiding their color
      // share of buses that turn around whenever any bus leaves (flip levels only)
      flips: n >= 12 && n % 3 === 0 ? Math.min(0.5, 0.25 + (n - 12) * 0.008) : 0,
      tunnels: n >= 15 && n % 3 !== 0 ? (n >= 30 ? 2 : 1) : 0,  // flip levels have no tunnels
      shape: isHard(n) ? SHAPES[(n / 10 - 1) % SHAPES.length] : null,
      ice: n >= 56 ? 0.08 + 0.07 * late(n) : 0,     // share of buses frozen until enough others leave
      bombs: n >= 58 ? 0.05 + 0.2 * late(n) ** 2 : 0,   // share of buses that must leave within a number of moves
      locks: n >= 60 ? 0.06 + 0.06 * late(n) : 0,   // share of buses locked until a bus of the key color leaves
      cones: n >= 64 ? 2 + Math.round(4 * late(n)) : 0,  // fixed obstacles in the lot
      gates: n >= 70 ? 1 + (n >= 82) + (n >= 94) : 0,   // barriers that open and close every few moves
    };
  }
  // Where the next bus out of a tunnel parks: right in front of its mouth
  function tunnelMouth(t, len) {
    const d = TUNNEL / 2 + 1 + (len + 2) / 2;
    return { x: t.x + Math.cos(t.ang) * d, y: t.y + Math.sin(t.ang) * d, ang: t.ang, len, wid: BUS_W };
  }

  // Later levels: buses packed tightly on a grid of 12-unit cells, arrows
  // along the grid. A bus is 2 cells wide and 3, 4 or 5 cells long.
  function packGrid(n, target, rng, nTunnels, tunnels, shape, nCones) {
    const C = 12, ri = (k) => Math.floor(rng() * k);
    // Size the block so the buses fill most of it
    const area = (target * 8.4) / 0.82 / (shape ? shape.fill : 1), aspect = LW / LH;
    const cols = Math.min(Math.floor(LW / C), Math.round(Math.sqrt(area * aspect)));
    const rows = Math.min(Math.floor(LH / C), Math.round(area / cols));
    const ox = (LW - cols * C) / 2, oy = (LH - rows * C) / 2;
    const used = new Array(cols * rows).fill(false);
    // Cells outside the level's shape start out taken
    if (shape) {
      for (let yy = 0; yy < rows; yy++) for (let xx = 0; xx < cols; xx++) {
        if (!shape.has(((xx + 0.5) / cols) * 2 - 1, ((yy + 0.5) / rows) * 2 - 1)) used[yy * cols + xx] = true;
      }
    }
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

    // Traffic cones: one cell each, never move. They sit with the tunnels so
    // they count as obstacles everywhere.
    for (let tries = 0, placed = 0; placed < nCones && tries < 300; tries++) {
      const gx = ri(cols), gy = ri(rows);
      if (!isFree(gx, gy, 1, 1)) continue;
      take(gx, gy, 1, 1);
      tunnels.push({ x: ox + (gx + 0.5) * C, y: oy + (gy + 0.5) * C, ang: 0, len: 10, wid: 10, cone: true, queue: [] });
      placed++;
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
    // the empty cells left over, where gates can go
    buses.free = [];
    for (let yy = 0; yy < rows; yy++) for (let xx = 0; xx < cols; xx++) if (!used[yy * cols + xx]) buses.free.push([ox + (xx + 0.5) * C, oy + (yy + 0.5) * C]);
    return buses;
  }

  // Gates sit on empty cells. Gate n is shut for n moves, then open for n
  // moves, and so on; phase shifts where in that cycle it starts. Moves are
  // counted as buses leave the lot. Replay the winning order to see which
  // move sends a bus through each empty cell, and only put a gate where it is
  // open at every one of those moves, so the winning order still works.
  const gateOpen = (t, moves) => Math.floor((moves + t.phase) / t.gate) % 2 === 1;
  // Where each bus in the winning order is, and how many moves have been
  // made, when its turn comes
  function orderTrace(buses, tunnels, order) {
    const lot = buses.map((b) => ({ ...b, ref: b }));
    const tq = tunnels.map((t) => t.queue.slice());
    const trace = [];
    for (let i = 0; i < order.length; i++) {
      const b = lot.find((o) => o.ref === order[i]);
      if (!b) return null;
      trace.push({ bus: { ...b }, moves: i });
      lot.splice(lot.indexOf(b), 1);
      for (const o of lot) if (o.flip) o.ang += Math.PI;
      tunnels.forEach((t, k) => {
        if (!tq[k].length) return;
        const m = tunnelMouth(t, tq[k][0].len);
        if (lot.some((o) => obbOverlap(m, o))) return;
        const spec = tq[k].shift();
        lot.push({ ...m, flip: spec.flip, ref: spec });
      });
    }
    return trace;
  }
  // The same for a solution plan after level 100, where linked buses leave
  // together and a transfer is a move that keeps the bus in the lot
  function planTrace(L) {
    const lot = L.buses.map((b) => ({ ...b, ref: b }));
    const trace = [];
    let moves = 0, sent = 0;   // sent: buses gone to a bay, which is what ice and bombs count
    for (const a of L.solution) {
      const group = a.ids.map((id) => lot.find((o) => o.ref.seq === id));
      if (group.some((o) => !o)) return null;
      for (const o of group) trace.push({ bus: { ...o }, ref: o.ref, moves, sent, transfer: !!a.transfer });
      if (a.transfer) { Object.assign(group[0], group[0].ref.transfer); moves++; continue; }
      for (const o of group) lot.splice(lot.indexOf(o), 1);
      for (let k = 0; k < group.length; k++) {
        for (const o of lot) { if (o.flip) o.ang += Math.PI; if (o.turntable) o.ang += Math.PI / 2; }
        towStep(lot, L.tunnels);
      }
      moves += group.length; sent += group.length;
    }
    return trace;
  }
  // The chapter planner may reorder departures (to dodge a parade), so fit
  // ice, bombs and locks to the order it settled on
  function fitPiecesToPlan(L, trace) {
    const before = [];
    for (const t of trace) {
      if (t.transfer) continue;
      const b = t.ref;
      if (b.ice) b.ice = Math.min(b.ice, t.sent);
      if (b.bomb) b.bomb = t.sent + Math.max(1, b.bomb - b.seq);
      if (b.lock != null && !before.includes(b.lock)) b.lock = null;
      before.push(b.color);
    }
  }
  function placeGates(free, tunnels, trace, count, rng, avoid = []) {
    if (!trace) return;
    const cells = free.map(([x, y]) => ({ x, y, ang: 0, len: 10, wid: 10, hits: [], dirs: [] })).filter((c) => !avoid.some((o) => obbOverlap(c, o)));
    for (const { bus, moves } of trace) for (const c of cells) if (pathHit(bus, [c])) { c.hits.push(moves); c.dirs.push(bus.ang); }
    // busier cells first, then try the gate sizes in a random order
    const cand = cells.filter((c) => c.hits.length).sort((a, c) => c.hits.length - a.hits.length + (rng() - 0.5) * 2);
    let placed = 0;
    for (const c of cand) {
      if (placed >= count) break;
      if (tunnels.some((t) => t.gate && Math.hypot(t.x - c.x, t.y - c.y) < 40)) continue;
      const fits = [];
      for (const n of [1, 2, 3]) for (let ph = 0; ph < 2 * n; ph++) {
        const g = { gate: n, phase: ph };
        if (c.hits.every((i) => gateOpen(g, i))) fits.push(g);
      }
      if (!fits.length) continue;
      const g = fits[Math.floor(rng() * fits.length)];
      // the barrier arm lies across the way the first bus through it goes
      tunnels.push({ x: c.x, y: c.y, ang: 0, len: 10, wid: 10, cone: true, gate: g.gate, phase: g.phase, arm: c.dirs[0] + Math.PI / 2, lift: 0, queue: [] });
      placed++;
    }
  }

  // Clears the lot in a random order that the rules allow, turning buses
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
        lot.push({ ...m, cap: spec.cap, flip: spec.flip, ref: spec });
      });
    }
    return null;
  }

  // Builds a level from its number. The same number always gives the same
  // level. A level is only kept if the lot can be cleared, and the passenger
  // line is built by playing that clearing order with a few bays, so every
  // level is solvable.
  function genLevel(n, firstAttempt = 0) {
    const advanced = A.profile(n);
    if (advanced) {
      // The tutorial is a small board with only the new rule. Other levels use
      // the older generator at the chapter's difficulty (half or full) with
      // every older piece, except tunnels, whose buses the chapter planner
      // doesn't route. Flip buses would change which exit a bus uses, so they
      // stay off when a rule depends on exits. Alternating chutes cap colours
      // at 8, since with 10 the verified plan too often depends on frame rate.
      const lvl = advanced.level, f = lvl ? levelFeatures(lvl) : null;
      const exits = ['road', 'caravan', 'switches', 'transfers', 'linked', 'turntables', 'towing'].some((k) => advanced[k]);
      const movers = advanced.turntables || advanced.towing;
      const features = f
        ? { ...f, level: lvl, tunnels: 0, gates: 0, flips: exits ? 0 : f.flips, colors: Math.min(2 + Math.floor((lvl + 2) / 3), advanced.alternating ? 8 : COLORS.length) }
        : { mystery: 0, flips: 0, tunnels: 0, shape: null, ice: 0, bombs: 0, locks: 0, cones: 0, gates: 0, target: advanced.target, colors: advanced.colors };
      const p = { ...advanced, colors: features.colors };
      for (let attempt = firstAttempt; attempt < firstAttempt + 160; attempt++) {
        const L = buildLevel(n, attempt, features);
        if (!L || !A.decorate(L, p, mulberry32(n * 997 + attempt * 31), { pathHit, obbOverlap, corners, roadGeometry, towStep })) continue;
        const trace = planTrace(L);
        if (!trace) continue;
        fitPiecesToPlan(L, trace);
        if (f && f.gates && !movers && L.buses.free) {
          const landing = L.buses.filter((b) => b.transfer).map((b) => ({ ...b, ...b.transfer }));
          placeGates(L.buses.free, L.tunnels, trace, f.gates, mulberry32(n * 31 + attempt), landing);
        }
        L.ringLevel = lvl || 20;
        return L;
      }
      throw new Error('Could not construct the advanced level');
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const L = buildLevel(n, attempt, levelFeatures(n));
      if (L) return L;
    }
    return buildLevel(n, 0, { mystery: 0, flips: 0, tunnels: 0, shape: null, ice: 0, bombs: 0, locks: 0, cones: 0, gates: 0 });
  }

  // feats.level, when given, is the level whose difficulty to build at; the
  // level number n still picks the random seed
  function buildLevel(seedN, attempt, feats) {
    const rng = mulberry32(seedN * 7919 + 13 + attempt * 104729);
    const ri = (k) => Math.floor(rng() * k);
    const n = feats.level || seedN;
    const packed = n > 4;
    const target = feats.target || (packed ? Math.min(8 + n, 50 + Math.round(14 * late(n))) : 5 + Math.floor(n * 1.15));
    const nc = feats.colors || Math.min(2 + Math.floor((n + 2) / 3), COLORS.length, target);
    const tunnels = [];
    const buses = packed ? packGrid(n, target, rng, feats.tunnels, tunnels, feats.shape, feats.cones) : [];
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

    // Flip levels: some buses (marked with a turn-around sign) flip whenever
    // any bus leaves. Each bus was placed with a clear way out in the direction
    // it will face when its turn comes (last placed leaves first), so wind each
    // flipper back by the number of buses that leave before it.
    if (feats.flips) {
      buses.forEach((b, j) => {
        if (rng() >= feats.flips) return;
        b.flip = true;
        if ((buses.length - 1 - j) % 2) b.ang += Math.PI;
      });
    }
    for (const b of buses) if (rng() < feats.mystery) b.mystery = true;
    for (const t of tunnels) for (const q of t.queue) if (rng() < feats.mystery) q.mystery = true;

    const order = feats.flips ? buses.slice().reverse() : solveOrder(buses, tunnels, rng);
    if (!order) return null;

    // Colors: every color appears at least once (tunnel buses included)
    const cols = order.map((_, i) => (i < nc ? i : ri(nc)));
    for (let i = cols.length - 1; i > 0; i--) {
      const j = ri(i + 1);
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }
    order.forEach((b, i) => { b.color = cols[i]; b.seq = i; });  // seq: place in a known winning order
    // Ice, bombs and locks only go on buses that start in the lot, and only ask
    // for what the winning order already gives them: an ice count no bigger
    // than the number of buses that leave before it, a bomb count bigger than
    // that (by less and less slack as levels go on), and a key color that some
    // earlier bus in the order has.
    const inLot = new Set(buses);
    order.forEach((b, i) => {
      if (!inLot.has(b)) return;
      if (i >= 3 && i <= 24 && rng() < feats.ice) b.ice = Math.min(12, i - ri(Math.ceil(i / 2)));
      else if (i >= 1 && i <= 14 + Math.round(46 * late(n)) && rng() < feats.bombs) b.bomb = i + 1 + ri(4 - Math.round(3 * late(n)));
      else if (i >= 2 && rng() < feats.locks) {
        const keys = order.slice(Math.max(0, i - 6), i).map((o) => o.color).filter((c) => c !== b.color);
        if (keys.length) b.lock = keys[ri(keys.length)];
      }
    });

    if (feats.gates && buses.free) placeGates(buses.free, tunnels, orderTrace(buses, tunnels, order), feats.gates, rng);

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
      let i = rng() < 0.65 - 0.4 * late(n) ? 0 : ri(open.length);
      // Same-colored buses fill oldest first, matching how boarding works in play
      i = open.findIndex((o) => o.color === open[i].color);
      const s = open[i];
      // Passengers arrive in clumps of one color, sometimes a whole busload
      const run = rng() < 0.4 - 0.3 * late(n) ? s.need : LANES * (1 + ri(Math.min(s.need / LANES, 6 - Math.round(4 * late(n)))));
      for (let r = 0; r < run; r++) queue.push(s.color);
      s.need -= run;
      if (s.need <= 0) open.splice(i, 1);
    }
    return { buses, tunnels, queue, attempt };
  }

  // ---------- Layout ----------
  let dpr = 1, cw = 0, ch = 0, crowdH = 0, slotTop = 0, slotH = 0;
  let lotX = 0, lotY = 0, ls = 1, lotTop = 0, slotW = 0, slotX0 = 0, slotGap = 6, slotScale = 1;
  const ROAD = 16, CURB = 2, LOT_PAD = 3;   // road width, curb, asphalt beyond the lot's play area
  let road = { x0: 0, x1: 0, y0: 0, y1: 0 };  // the road's center line around the lot
  let asphalt = { x: 0, y: 0, w: 0, h: 0 };
  let ringXL = 0, ringXR = 0, ringYT = 0, ringYB = 0, ringR = 20, ringLen = 1, feedTop = 0;
  const Q_SP = 13, RING_SCALE = 0.86, LANE_W = 10;  // people walk 4 abreast, rows Q_SP apart
  const BELT_W = LANES * LANE_W + 4;                // width of the carousel belt and the chutes
  const ROW_SP = 15;                                 // carousel length per row of seats
  const FEED_ROWS = 5;    // rows of each feeder line you can see; the rest is off screen

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    crowdH = Math.round(Math.max(190, Math.min(ch * 0.28, 224)));
    slotTop = crowdH; slotH = 60;
    // The road runs round the screen's edges below the bays and the asphalt
    // fills everything inside it. The lot's play area is centred on it.
    const e = ROAD / 2, in_ = ROAD + CURB + LOT_PAD;
    road = { x0: e, x1: cw - e, y0: slotTop + slotH + e, y1: ch - e };
    asphalt = { x: ROAD + CURB, y: slotTop + slotH + ROAD + CURB, w: cw - 2 * (ROAD + CURB), h: ch - slotTop - slotH - 2 * (ROAD + CURB) };
    lotTop = slotTop + slotH + in_;
    slotW = Math.min(44, (cw - 20 - slotGap * 7) / 8);
    slotX0 = (cw - (slotW * 8 + slotGap * 7)) / 2;
    slotScale = Math.min((slotH - 12) / BUS_LEN[40], (slotW - 8) / BUS_W);

    if (G) { fitLot(); ringLayout(); }
  }
  // Zoom the lot so this level's buses fill the asphalt. The box is taken
  // once at the start of a level so the view doesn't move while playing.
  const PARADE_INSET = 20, PARADE_CLEARANCE = 22;
  function lotMetrics(box, parade = false) {
    const in_ = ROAD + CURB + LOT_PAD + (parade ? PARADE_CLEARANCE : 0), top = slotTop + slotH + in_;
    const W = cw - 2 * in_, H = ch - top - in_;
    const scale = Math.min(W / (box.x1 - box.x0), H / (box.y1 - box.y0), 1.7);
    return { scale, x: cw / 2 - (box.x0 + box.x1) / 2 * scale, y: top + H / 2 - (box.y0 + box.y1) / 2 * scale };
  }
  function roadGeometry(L) {
    const m = lotMetrics(levelBox(L.buses, L.tunnels), true);
    return { scale:m.scale, bounds:{x0:(road.x0+PARADE_INSET-m.x)/m.scale, y0:(road.y0+PARADE_INSET-m.y)/m.scale, x1:(road.x1-PARADE_INSET-m.x)/m.scale, y1:(road.y1-PARADE_INSET-m.y)/m.scale} };
  }
  function fitLot() {
    const c=G?.rules?.caravan;
    if(c) {
      // Keep the generated route and turn positions fixed during a resize.
      // Fit that whole route inside the road, preserving the verified puzzle.
      const b=c.bounds;
      ls=Math.min((road.x1-road.x0-2*PARADE_INSET)/(b.x1-b.x0),(road.y1-road.y0-2*PARADE_INSET)/(b.y1-b.y0));
      lotX=(road.x0+road.x1-(b.x0+b.x1)*ls)/2;
      lotY=(road.y0+road.y1-(b.y0+b.y1)*ls)/2;
    } else {
      const m=lotMetrics((G && G.box)||{x0:0,y0:0,x1:LW,y1:LH});
      ls=m.scale;lotX=m.x;lotY=m.y;
    }
  }
  function levelBox(buses = G.buses, tunnels = G.tunnels) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (pts) => pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    buses.forEach((b) => add(corners(b.x, b.y, b.ang, b.len, BUS_W)));
    tunnels.forEach((t) => add(corners(t.x, t.y, t.ang, t.len, t.wid)));
    buses.filter(b => b.transfer).forEach(b => add(corners(b.transfer.x, b.transfer.y, b.transfer.ang, b.len, b.wid)));
    const m = 8;
    return { x0: Math.max(0, x0 - m), y0: Math.max(0, y0 - m), x1: Math.min(LW, x1 + m), y1: Math.min(LH, y1 + m) };
  }

  // Carousel: a stadium-shaped loop just above the bays, with two feeder lines
  // coming down into its top corners. Its size follows the number of rows it
  // holds, and its shape (round or long and flat) changes from level to level.
  function ringLayout() {
    feedTop = FEED_ROWS * Q_SP + 14;
    ringYB = crowdH - BELT_W / 2 - 6;
    const minR = BELT_W / 2 + 18;
    const rows = G.ring.length / LANES, maxR = Math.max(minR, (ringYB - feedTop - BELT_W / 2) / 2);
    ringR = Math.max(minR, Math.min(maxR * [1, 0.72, 0.5][save.level % 3], (rows * ROW_SP * 0.6) / (2 * Math.PI)));
    // Leave a thumb-sized pocket on either side for the compact controls.
    const maxL1 = cw - 2 * (60 + ringR + BELT_W / 2);
    const L1 = Math.max(BELT_W + 22, Math.min(maxL1, (rows * ROW_SP - 2 * Math.PI * ringR) / 2));
    ringYT = ringYB - 2 * ringR;
    ringXL = (cw - L1) / 2; ringXR = ringXL + L1;
    ringLen = 2 * L1 + 2 * Math.PI * ringR;
    $('#playfield').style.setProperty('--control-top', `${Math.round(ringYT + ringR - 26 + (G.rules?.switchEvery ? 20 : 0))}px`);
    // The chutes: each comes down from off the top of the screen in a sweeping
    // curve and drops straight onto the belt at one of its top corners.
    // Stored as points from the belt end outwards, with distance along the way.
    chutes = [0, 1].map((side) => {
      const angle = side ? -Math.PI / 4 : -Math.PI * 3 / 4;
      const center = side ? ringXR : ringXL;
      const ex = center + Math.cos(angle) * (ringR + BELT_W / 2 - 2);
      const ey = ringYT + ringR + Math.sin(angle) * (ringR + BELT_W / 2 - 2);
      const sx = side ? cw - 32 : 32;
      const P = [[ex, ey], [ex + (side ? 1 : -1) * 20, ey - 22], [sx, ey * 0.35], [sx, -40]];
      const pts = [];
      let d = 0, prev = null;
      for (let i = 0; i <= 80; i++) {
        const t = i / 80, u = 1 - t;
        const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0];
        const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
        if (prev) d += Math.hypot(x - prev.x, y - prev.y);
        prev = { x, y, d };
        pts.push(prev);
      }
      return pts;
    });
    if (!G.validating) paintScenery();
  }
  let chutes = [[], []];

  // The scenery behind everything is painted once per level and screen size
  const bg = document.createElement('canvas');
  let sceneryGeometry = null;
  function paintScenery() {
    bg.width = canvas.width; bg.height = canvas.height;
    const c = bg.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    sceneryGeometry = {
      cw, ch, crowdH, slotTop, slotH, level: save.level, road, roadW: ROAD, curb: CURB, asphalt,
      lot: { x: lotX, y: lotY, w: LW * ls, h: LH * ls },
      ring: { xl: ringXL, xr: ringXR, yt: ringYT, yb: ringYB, r: ringR, belt: BELT_W },
    };
    window.Scenery.paint(c, sceneryGeometry);
  }
  // Point on a chute, d measured from where it meets the belt, with the
  // direction people walk there (towards the belt)
  function chutePoint(side, d) {
    const pts = chutes[side];
    let i = 1;
    while (i < pts.length - 1 && pts[i].d < d) i++;
    const a = pts[i - 1], b = pts[i], f = Math.max(0, Math.min(1.5, (d - a.d) / ((b.d - a.d) || 1)));
    const l = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, tx: (a.x - b.x) / l, ty: (a.y - b.y) / l };
  }
  // Two feeder lines: the left one empties into the carousel first, then the right.
  // G.leftN people at the front of G.queue are in the left line.
  const activeFeed = () => {
    if (!G.rules?.switchEvery) return G.leftN > 0 ? 0 : 1;
    const side = Math.floor(G.arrivals / G.rules.switchEvery) % 2;
    if (G.planning) return side;
    return side === 0 ? (G.leftN ? 0 : 1) : (G.queue.length > G.leftN ? 1 : 0);
  };
  const feedEntry = side => side ? ringXR - ringXL + Math.PI * ringR / 4 : ringLen - Math.PI * ringR / 4;
  // Person i of a feeder line, standing in groups of LANES across it
  function feedSpot(side, i) {
    const shift = G.rules ? G.feedShift[side] / LANES : side === activeFeed() ? G.shift / LANES : 0;
    const p = chutePoint(side, Q_SP * 0.6 + (Math.floor(i / LANES) + shift) * Q_SP);
    const off = ((i % LANES) - (LANES - 1) / 2) * LANE_W;
    return { x: p.x - p.ty * off, y: p.y + p.tx * off };
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
  // A row's color when all 4 people in it share one, else null (rows fill and empty together)
  const rowColor = (k) => (G.ring[k] !== null && G.ring[k + 1] === G.ring[k] && G.ring[k + 2] === G.ring[k] && G.ring[k + 3] === G.ring[k] ? G.ring[k] : null);
  // True for the stretch of the carousel that runs past the bays: the bottom
  // straight plus the bottom half of each end
  function nearBays(s) {
    s = ((s % ringLen) + ringLen) % ringLen;
    const L1 = ringXR - ringXL, A = Math.PI * ringR;
    return s > L1 + A / 2 && s < 2 * L1 + A * 1.5;
  }
  function seatPoint(k) {
    const s = seatS(k), p = ringPoint(s), q = ringPoint(s + 1);
    const tx = q.x - p.x, ty = q.y - p.y, l = Math.hypot(tx, ty) || 1;
    const off = ((k % LANES) - (LANES - 1) / 2) * LANE_W;
    return { x: p.x - (ty / l) * off, y: p.y + (tx / l) * off };
  }

  function slotRect(i) {
    return { x: slotX0 + i * (slotW + slotGap), y: slotTop + 5, w: slotW, h: slotH - 10 };
  }

  // ---------- Game state ----------
  let G = null;
  const bays = () => G.validating ? 4 : Math.min(MAX_BAYS, save.bays + G.tempBays);

  // The carousel gets smaller as levels go on, which is what makes them harder
  const ringSeats = (n) => LANES * Math.round((n < 5 ? 36 : Math.max(16 - Math.round(8 * late(n)), 32 - Math.floor(n / 2))) * (isHard(n) ? 0.8 : 1));

  const advancedCache = new Map();
  function initLevel(L, validating = false, planning = false) {
    G = {
      buses: L.buses.map((b, i) => makeBus(b, i)),
      tunnels: L.tunnels.map(t => ({ ...t, queue: t.queue.map(q => ({ ...q })), shake: 0 })),
      queue: L.queue.slice(), total: L.queue.length,
      slots: new Array(8).fill(null), tempBays: 0, arrivals: 0,
      shift: 0, feedShift: [0, 0], boardT: 0, particles: [], vipMode: false,
      ring: new Array(ringSeats(L.ringLevel || save.level)).fill(null), ringOff: 0, enter: {},
      modal: false, won: false, stuckT: 0, checkT: 0, failDismissed: false,
      rules: L.rules ? { ...L.rules, caravan: L.rules.caravan ? { ...L.rules.caravan, bounds:{...L.rules.caravan.bounds} } : undefined } : undefined, solution: L.solution, switched: false,
      paradeMoves:0, paradeFrom:0, paradeT:0, linkFocus:null, linkFocusT:0, chuteSlide:[0,0],
      fog: L.rules?.fog ? { ...L.rules.fog, lifted: false, fade: 1 } : null,
      rv: L.rules?.rv ? { mode: 'road', count: L.rules.rv.first, stay: 0, slot: -1, seen: 0, d: 0, t: 1 } : null,
      validating, planning, recordedFeeds: [[], []], validationFailed: false,
    };
    for (let k = 0; k < G.ring.length && G.queue.length; k++) G.ring[k] = G.queue.shift();
    G.leftN = LANES * Math.ceil(G.queue.length / LANES / 2);
    if (L.feeds) { G.queue = L.feeds[0].concat(L.feeds[1]); G.leftN = L.feeds[0].length; }
    for (const t of G.tunnels) if (t.gate) t.lift = gateOpen(t, 0) ? 1 : 0;
    G.box = levelBox(); fitLot(); ringLayout(); revealFree();
    G.chuteSlide = [0,1].map(side => chuteGateState(side).open ? 1 : 0);
  }
  // Someone on the carousel can board bus b
  const canTake = (b) => { const load = A.loading(b); return G.ring.some((p) => p !== null && colorOf(p) === load.color && (G.rules ? seatsOf(p) : LANES) <= load.left); };
  // Nothing more will happen until the next tap: nobody can board or join
  // the carousel. Playing the plan only from such moments keeps the result
  // the same at any frame rate.
  const settled = () => !G.particles.length && G.shift <= 0.05 && G.feedShift.every(f => f <= 0.05) &&
    !G.buses.some(b => b.state === 'slot' && A.loading(b).left >= (G.rules ? 1 : LANES) && canTake(b)) &&
    !(G.queue.length && G.ring.some((c, k) => (G.rules || k % LANES === 0) && c === null));
  function runSolution(dt = 0.04, maxSteps = 120000) {
    let step = 0, index = 0;
    while (step++ < maxSteps) {
      update(dt);
      if (G.won) return { won: true, steps: step };
      if (G.boom || G.validationFailed || G.modal) return { won: false, index, reason: 'stuck' };
      if (movingBuses() || !settled()) continue;
      const action = G.solution[index];
      if (!action) continue;
      const b = G.buses.find(o => o.seq === action.ids[0]);
      if (tryDispatch(b, false)) index++;
    }
    return { won: false, index, reason: 'timeout' };
  }
  function startLevel() {
    setPowerPanel(false);
    let L;
    if (save.level > 100) {
      const key = `${save.level}:${cw}:${ch}`;
      L = advancedCache.get(key);
      if (!L) {
        let attempt = 0;
        for (let retry = 0; retry < 48; retry++) {
          L = genLevel(save.level, attempt); attempt = L.attempt + 1;
          initLevel(L, true, !!L.rules.switchEvery);
          if (!runSolution().won) { L = null; continue; }
          if (L.rules.switchEvery) {
            L.feeds = G.recordedFeeds.map(q => q.slice());
            initLevel(L, true);
            if (!runSolution().won) { L = null; continue; }
            // Switching chutes can change which colour reaches a bay first.
            // Reject plans that depend on the verification frame rate.
            let robust = true;
            for (const dt of [1 / 60, 0.05]) {
              initLevel(L, true);
              if (!runSolution(dt).won) { robust = false; break; }
            }
            if (!robust) { L = null; continue; }
          }
          break;
        }
        if (!L) throw new Error('Could not verify a four-bay solution');
        if (advancedCache.size >= 8) advancedCache.delete(advancedCache.keys().next().value);
        advancedCache.set(key, L);
      }
    } else L = genLevel(save.level);
    initLevel(L);
    updateHUD(); introduceNewPieces();
    const theme = window.Scenery.themeFor(save.level);
    if (isHard(save.level) && !G.modal) toast(`${theme.icon} ${theme.name}: HARD level! Double coins if you clear it 💪`, 2400);
    else if (!G.modal) toast(`${theme.icon} ${theme.name}`, 1400);
  }
  function makeBus(b, id) {
    return { ...b, id, state: 'lot', filled: 0, pending: 0, slot: -1, t: 0, ex: 0, bumpT: 0, bumpD: 0, shake: 0, flash: 0, flipT: 0, emergeT: 0, turnT: 0, towT: 0, towD: 0,
      color: b.cycle ? b.cycle[0] : b.color };
  }

  // Obstacles in the lot: parked buses and tunnels
  const obstacles = () => lotBuses().concat(G.buses.filter(b => b.state === 'transferring').map(b => ({ ...b, ...b.transfer })), G.tunnels.filter(t => !t.gate || !gateOpen(t, G.arrivals)));
  const roadBlock = b => A.blocked(b, G.rules, G.arrivals, G.switched);
  const movingBuses = () => G.buses.some(b => ['exiting', 'driving', 'flying', 'transferring'].includes(b.state));

  // A mystery bus shows its color once nothing blocks its way out
  function revealFree() {
    const obs = obstacles();
    for (const b of obs) {
      if (b.mystery && !b.tunnel && !fogged(b) && !pathHit(b, obs) && !roadBlock(b)) { b.mystery = false; b.flash = 0.4; }
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
    if (G.rules) for (const [key, name, explanation] of A.chapters) {
      if (G.rules.profile[key] && !seen[key]) { seen[key] = true; notes.push(`<li><b>${name}</b> ${explanation}</li>`); }
    }
    if (G.buses.some((b) => b.mystery) && !seen.mystery) {
      seen.mystery = true;
      notes.push('<li><b>Mystery buses ❓</b> hide their color until nothing is blocking their way out.</li>');
    }
    if (G.buses.some((b) => b.flip) && !seen.flip) {
      seen.flip = true;
      notes.push('<li><b>Flip buses 🔄</b> carry a turn-around sign. They turn around each time any bus leaves the lot.</li>');
    }
    if (G.buses.some((b) => b.ice) && !seen.ice) {
      seen.ice = true;
      notes.push('<li><b>Ice buses 🧊</b> are frozen. The number counts down each time a bus leaves the lot, and at zero the ice melts.</li>');
    }
    if (G.buses.some((b) => b.bomb) && !seen.bomb) {
      seen.bomb = true;
      notes.push('<li><b>Bomb buses 💣</b> count down each time another bus leaves the lot. Get them out before they hit zero!</li>');
    }
    if (G.buses.some((b) => b.lock != null) && !seen.lock) {
      seen.lock = true;
      notes.push('<li><b>Locked buses 🔒</b> open when a bus the color of the padlock leaves the lot.</li>');
    }
    if (G.tunnels.some((t) => t.gate) && !seen.gate) {
      seen.gate = true;
      notes.push('<li><b>Gates 🚧</b> open and close as buses leave the lot. The number shows how many more moves until it changes.</li>');
    }
    if (G.tunnels.some((t) => t.cone && !t.gate) && !seen.cone) {
      seen.cone = true;
      notes.push('<li><b>Traffic cones</b> never move. Find a way around them.</li>');
    }
    if (G.tunnels.some((t) => !t.cone) && !seen.tunnel) {
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
    if (b.towT > 0) d -= b.towD * easeInOut(b.towT / 0.35);
    x += Math.cos(b.ang) * d; y += Math.sin(b.ang) * d;
    if (b.shake > 0) { x += Math.sin(b.shake * 60) * 1.5; }
    if (b.emergeT > 0) {
      // slide out of the tunnel behind it
      const back = (b.emergeT / 0.35) * (b.len / 2 + TUNNEL / 2);
      x -= Math.cos(b.ang) * back; y -= Math.sin(b.ang) * back;
    }
    const ang = b.ang - Math.PI * (b.flipT / 0.3) - (Math.PI / 2) * easeInOut(b.turnT / 0.35);
    return { x: lotX + x * ls, y: lotY + y * ls, ang, s: ls };
  }
  function slotPose(i) {
    const r = slotRect(i);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, ang: -Math.PI / 2, s: slotScale };
  }
  // The way a bus drives to its bay: straight on until it reaches the road,
  // round the road (whichever way is shorter) to the top, along the top to
  // below its bay, then up into the bay. Screen coordinates.
  function buildRoute(b) {
    const p = lotPose(b, b.ex), dx = Math.cos(b.ang), dy = Math.sin(b.ang);
    const { x0, x1, y0, y1 } = road, W = x1 - x0, H = y1 - y0, P = 2 * (W + H);
    // where the bus meets the road going straight on
    let t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (x1 - p.x) / dx);
    if (dx < -1e-6) t = Math.min(t, (x0 - p.x) / dx);
    if (dy > 1e-6) t = Math.min(t, (y1 - p.y) / dy);
    if (dy < -1e-6) t = Math.min(t, (y0 - p.y) / dy);
    if (!isFinite(t) || t < 0) t = 0;
    const hx = Math.max(x0, Math.min(x1, p.x + dx * t)), hy = Math.max(y0, Math.min(y1, p.y + dy * t));
    // positions along the road, clockwise from the top left corner
    const along = (x, y) => (Math.abs(y - y0) < 0.5 ? x - x0 : Math.abs(x - x1) < 0.5 ? W + (y - y0) : Math.abs(y - y1) < 0.5 ? W + H + (x1 - x) : 2 * W + H + (y1 - y));
    const at = (u) => {
      u = ((u % P) + P) % P;
      if (u <= W) return [x0 + u, y0];
      if (u <= W + H) return [x1, y0 + u - W];
      if (u <= 2 * W + H) return [x1 - (u - W - H), y1];
      return [x0, y1 - (u - 2 * W - H)];
    };
    const bay = slotPose(b.slot), tx = Math.max(x0, Math.min(x1, bay.x));
    const u0 = along(hx, hy), u1 = tx - x0;
    const cw2 = (((u1 - u0) % P) + P) % P, ccw = P - cw2, dir = cw2 <= ccw ? 1 : -1, len = Math.min(cw2, ccw);
    const pts = [[p.x, p.y], [hx, hy]];
    const corners = [0, W, W + H, 2 * W + H];
    // corners passed on the way, in order
    const passed = corners.map((c) => ({ c, d: dir > 0 ? (((c - u0) % P) + P) % P : (((u0 - c) % P) + P) % P })).filter((o) => o.d > 0.5 && o.d < len - 0.5).sort((a, c) => a.d - c.d);
    for (const o of passed) pts.push(at(o.c));
    pts.push([tx, y0]);
    if (tx !== bay.x) pts.push([bay.x, y0]);   // the top road runs the full width
    pts.push([bay.x, bay.y]);
    const route = [];
    let d = 0;
    pts.forEach(([x, y], i) => { if (i) d += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]); route.push({ x, y, d }); });
    return route;
  }
  function routePoint(route, d) {
    let i = 1;
    while (i < route.length - 1 && route[i].d < d) i++;
    const a = route[i - 1], c = route[i], f = Math.max(0, Math.min(1, (d - a.d) / ((c.d - a.d) || 1)));
    return { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f };
  }

  function poseOf(b) {
    switch (b.state) {
      case 'lot': return lotPose(b);
      case 'exiting': return lotPose(b, b.ex);
      case 'transferring': {
        const source = roadPoint(A.exit(b)), target = { x: lotX + b.transfer.x * ls, y: lotY + b.transfer.y * ls };
        if (b.t < 0.5) return { x: lerp(b.from.x, source.x, b.t * 2), y: lerp(b.from.y, source.y, b.t * 2), ang: b.ang, s: ls, alpha: 1 - b.t * 2 };
        return { ...target, ang: b.transfer.ang, s: ls, alpha: b.t * 2 - 1 };
      }
      case 'flying': {
        const to = slotPose(b.slot), t = easeInOut(Math.min(1, b.t));
        return { x: lerp(b.from.x, to.x, t), y: lerp(b.from.y, to.y, t) - Math.sin(Math.PI * t) * 20,
          ang: lerpAngle(b.from.ang, to.ang, t), s: lerp(b.from.s, to.s, t) };
      }
      case 'driving': {
        const R = b.route, end = R[R.length - 1].d, d = Math.min(b.dist, end);
        const p = routePoint(R, d), a = routePoint(R, Math.max(0, d - 7)), c = routePoint(R, Math.min(end, d + 7));
        const ang = c.x === a.x && c.y === a.y ? -Math.PI / 2 : Math.atan2(c.y - a.y, c.x - a.x);
        // shrink to bay size on the last stretch up into the bay
        const last = end - R[R.length - 2].d, f = Math.max(0, Math.min(1, 1 - (end - d) / (last || 1)));
        return { x: p.x, y: p.y, ang, s: lerp(ls, slotScale, f) };
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
    // Dismiss the tray without also making a move underneath it.
    if (!$('#powerPanel').hidden) { setPowerPanel(false); return; }
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
    tryDispatch(b, true);
  });

  function tryDispatch(b, notify = true) {
    if (!b || b.state !== 'lot' || G.modal || G.won) return false;
    const fail = message => { if (notify && !G.validating) { toast(message); b.shake = 0.3; sound('bump'); } return false; };
    G.failDismissed = false;
    if (b.link && notify) { G.linkFocus = b.link; G.linkFocusT = 1.5; }
    if (G.paradeT > 0) return false;
    if (fogged(b)) return fail('Hidden in the fog. Send every windmill bus first.');
    if (b.ice > 0) return fail(`Frozen! ${b.ice} more buses must leave first`);
    if (b.lock != null) return fail(`Locked: a ${COLOR_NAMES[b.lock]} bus must leave first`);
    if (G.vipMode) {
      if (G.slots[0]) return fail('The VIP bay is busy');
      // One VIP rescues one bus, separating it from its linked partner.
      if (b.link) G.buses.filter(o => o.link === b.link).forEach(o => { o.link = null; });
      if (b.transfer) b.transferred = true;
      G.vipMode = false; spendBooster('vip'); sendToSlot(b, 0, true); return true;
    }
    const group = b.link ? lotBuses().filter(o => o.link === b.link).sort((a, c) => a.seq - c.seq) : [b];
    for (const o of group) {
      if (o.ice || o.lock != null) return fail('Both linked buses must be unlocked');
      const hit = pathHit(o, obstacles());
      if (hit) {
        if (notify) { o.bumpT = BUMP_DUR; o.bumpD = Math.max(0, hit.d - 2); hit.other.shake = 0.35; }
        return fail(group.length > 1 ? 'Clear both linked buses’ paths first' : 'Another bus is in the way');
      }
      const block = roadBlock(o);
      if (block) return fail(block === 'road' ? `Road opens after ${G.rules.road.until - G.arrivals} more departures` : block === 'caravan' ? 'The parade blocks this exit. Send another bus first.' : 'This barrier is closed. Dispatch the switch-pad bus.');
    }
    if (b.transfer && !b.transferred) {
      const destination = { ...b, ...b.transfer };
      if (obstacles().some(o => o !== b && obbOverlap(destination, o))) return fail('The transfer destination is occupied');
      b.from = lotPose(b); b.state = 'transferring'; b.t = 0; G.arrivals++; afterDeparture(b);
      advanceParade(); revealFree(); sound('magic'); return true;
    }
    const slots = [];
    for (let i = 1; i <= bays(); i++) if (!G.slots[i]) slots.push(i);
    if (slots.length < group.length) return fail(group.length > 1 ? 'Linked buses need two free bays' : 'All bays are full!');
    // Reserve both bays and remove both linked buses before advancing any rule.
    group.forEach((o, i) => { o.state = 'exiting'; G.slots[slots[i]] = o; });
    group.forEach((o, i) => sendToSlot(o, slots[i], false, true));
    advanceParade(); revealFree(); sound('go');
    return true;
  }

  function canDispatch(b) {
    const group = b.link ? lotBuses().filter(o => o.link === b.link) : [b];
    const obs = obstacles();
    if (group.some(fogged)) return false;
    if (group.some(o => o.ice || o.lock != null || pathHit(o, obs) || roadBlock(o))) return false;
    if (b.transfer && !b.transferred) return !obs.some(o => o !== b && obbOverlap({ ...b, ...b.transfer }, o));
    return G.slots.slice(1, bays() + 1).filter(slot => !slot).length >= group.length;
  }

  function sendToSlot(b, slot, direct, defer = false) {
    G.slots[slot] = b;
    b.slot = slot;
    b.arrive = ++G.arrivals;
    if (b.switchPad && !b.switchUsed) { G.switched = !G.switched; b.switchUsed = true; }
    if (direct) { b.from = lotPose(b); b.state = 'flying'; b.t = 0; }
    else { b.state = 'exiting'; b.ex = 0; }
    // Flip buses turn around whenever a bus leaves the lot
    for (const o of lotBuses()) {
      if (o === b) continue;
      if (o.flip) { o.ang += Math.PI; o.flipT = 0.3; }
      if (o.turntable) { o.ang += Math.PI / 2; o.turnT = G.validating ? 0 : 0.35; }
      // Ice melts a little, and the key opens locks of its color
      if (o.ice > 0) { o.ice--; if (!o.ice) o.flash = 0.4; }
      if (o.lock === b.color) { o.lock = null; o.flash = 0.4; }
      if (o.bomb > 0 && !--o.bomb && !G.boom) { G.boom = o; setTimeout(() => showBoom(o), 450); }
    }
    afterDeparture(b);
    if (!defer) { advanceParade(); revealFree(); sound('go'); }
  }

  // Chameleons change colour, tow trucks close up, and the fog lifts once
  // the last windmill bus has gone
  function afterDeparture(b) {
    for (const o of lotBuses()) if (o.cycle && o !== b) { o.color = o.cycle[G.arrivals % o.cycle.length]; o.flash = 0.25; }
    if (G.buses.some(o => o.tow && o.state === 'lot')) {
      const lot = lotBuses().filter(o => o !== b);
      for (const [o, d] of towStep(lot, G.tunnels.filter(t => !t.gate || !gateOpen(t, G.arrivals)))) { o.towD = d; o.towT = G.validating ? 0 : 0.35; }
    }
    if (G.fog && !G.fog.lifted && !lotBuses().some(o => o.windmill && o !== b)) { G.fog.lifted = true; if (!G.validating) sound('magic'); }
  }
  const fogged = (b) => !!(G.fog && !G.fog.lifted && b.inFog);

  function advanceParade() {
    if (!G.rules?.caravan) return;
    G.paradeFrom = G.paradeMoves;
    G.paradeT = G.validating || reducedMotion.matches ? 0 : 0.42;
    if (!G.paradeT) G.paradeMoves = G.arrivals;
  }
  function chuteGateState(side) {
    const empty = side ? G.queue.length === G.leftN : G.leftN === 0;
    const both = G.leftN > 0 && G.queue.length > G.leftN;
    return { open:!empty && activeFeed() === side, empty,
      remaining:both && G.rules?.switchEvery ? G.rules.switchEvery - G.arrivals % G.rules.switchEvery : null };
  }

  // ---------- Update ----------
  function update(dt) {
    if (!G || G.modal) return;
    G.linkFocusT = Math.max(0, G.linkFocusT - dt);
    if (G.paradeT > 0) {
      G.paradeT = reducedMotion.matches ? 0 : Math.max(0, G.paradeT - dt);
      G.paradeMoves = lerp(G.paradeFrom, G.arrivals, easeInOut(1 - G.paradeT / 0.42));
    }
    if (G.rules?.switchEvery) G.chuteSlide = G.chuteSlide.map((lift, side) => {
      const target = chuteGateState(side).open ? 1 : 0;
      return reducedMotion.matches ? target : lerp(lift, target, Math.min(1, dt * 12));
    });
    for (const t of G.tunnels) if (t.gate) t.lift += ((gateOpen(t, G.arrivals) ? 1 : 0) - t.lift) * Math.min(1, dt * 9);
    for (const b of G.buses) {
      if (b.shake > 0) b.shake = Math.max(0, b.shake - dt);
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
      if (b.flipT > 0) b.flipT = Math.max(0, b.flipT - dt);
      if (b.turnT > 0) b.turnT = Math.max(0, b.turnT - dt);
      if (b.towT > 0) b.towT = Math.max(0, b.towT - dt);
      if (b.emergeT > 0) b.emergeT = Math.max(0, b.emergeT - dt);
      switch (b.state) {
        case 'lot':
          if (b.bumpT > 0) b.bumpT = Math.max(0, b.bumpT - dt);
          break;
        case 'exiting': {
          b.ex += (300 + b.ex * 4) * dt;
          const x = b.x + Math.cos(b.ang) * b.ex, y = b.y + Math.sin(b.ang) * b.ex;
          // once its middle is past the lot's edge it heads for the road
          const sx = lotX + x * ls, sy = lotY + y * ls;
          if (sx < asphalt.x || sx > asphalt.x + asphalt.w || sy < asphalt.y || sy > asphalt.y + asphalt.h || b.ex > 1500) {
            b.route = buildRoute(b);
            b.state = 'driving'; b.dist = 0; b.v = 300 + b.ex;
          }
          break;
        }
        case 'driving':
          b.v = Math.min(900, b.v + 1400 * dt);
          b.dist += b.v * dt;
          if (b.dist >= b.route[b.route.length - 1].d) { b.state = 'slot'; b.t = 0; }
          break;
        case 'flying':
          b.t += dt / FLY_DUR;
          if (b.t >= 1) { b.state = 'slot'; b.t = 0; }
          break;
        case 'transferring':
          b.t += dt / 0.8;
          if (b.t >= 1) { Object.assign(b, { x: b.transfer.x, y: b.transfer.y, ang: b.transfer.ang, transferred: true, state: 'lot', emergeT: 0.2 }); revealFree(); }
          break;
        case 'leaving':
          b.t += dt / LEAVE_DUR;
          if (b.t >= 1) b.state = 'gone';
          break;
      }
    }

    // Carousel turns; empty places refill as their row passes the active entrance.
    G.shift = Math.max(0, G.shift - dt * 40);
    G.feedShift = G.feedShift.map(shift => Math.max(0, shift - dt * 40));
    for (const k in G.enter) if ((G.enter[k].t += dt / 0.3) >= 1) delete G.enter[k];
    const prevOff = G.ringOff;
    // Tapping the crowd speeds the carousel up for a moment
    G.boostT = Math.max(0, (G.boostT || 0) - dt);
    G.ringOff += RING_SPEED * (G.boostT > 0 ? 2.5 : 1) * dt;
    for (let k = 0; k < G.ring.length; k += LANES) {
      const side = activeFeed(), s0 = feedEntry(side);
      const a = Math.floor((seatBase(k) + prevOff - s0) / ringLen), crossed = Math.floor((seatBase(k) + G.ringOff - s0) / ringLen);
      if (a === crossed || !G.queue.length) continue;
      if (!G.rules && G.ring[k] !== null) continue;
      let fed = 0;
      for (let j = 0; j < LANES && G.queue.length; j++) {
        if (G.ring[k + j] !== null) continue;
        // Each empty seat is filled independently; occupied neighbours survive.
        if (!G.planning && (side ? G.queue.length === G.leftN : G.leftN === 0)) break;
        G.enter[k + j] = { ...feedSpot(side, fed), t: 0 };
        const index = G.planning ? 0 : side ? G.leftN : 0;
        const color = G.queue.splice(index, 1)[0];
        G.ring[k + j] = color;
        if (G.planning) G.recordedFeeds[side].push(color);
        else if (!side) G.leftN--;
        fed++;
      }
      G.shift += fed; G.feedShift[side] += fed;
    }

    updateRV(dt);
    if (G.fog?.lifted) G.fog.fade = Math.max(0, G.fog.fade - dt / 0.9);

    // Boarding: matching riders hop onto a parked bus as they pass
    // in front of its bay along the bottom of the carousel. Bays beyond the
    // ends of a small carousel are reached from its curved ends.
    G.boardT -= dt;
    while (G.boardT <= 0) {
      let pick = null;
      const parked = G.buses.filter(b => b.state === 'slot').map(b => ({ b, load: A.loading(b) }));
      for (const { b, load } of parked) {
        if (load.left < (G.rules ? 1 : LANES)) continue;
        const to = slotPose(b.slot), tx = Math.max(ringXL - ringR * 0.7, Math.min(ringXR + ringR * 0.7, to.x));
        for (let k = 0; k < G.ring.length; k += G.rules ? 1 : LANES) {
          if ((G.rules ? (G.ring[k] === null ? null : colorOf(G.ring[k])) : rowColor(k)) !== load.color || !nearBays(seatS(k))) continue;
          // A passenger takes the oldest bus of their color with room for them
          const need = G.rules ? seatsOf(G.ring[k]) : LANES;
          if (load.left < need || parked.some(o => o.b !== b && o.load.color === load.color && o.load.left >= need && o.b.arrive < b.arrive)) continue;
          const p = ringPoint(seatS(k));
          if (Math.abs(p.x - tx) > slotW / 2 + slotGap + 4) continue;
          const d = Math.abs(p.x - tx) + b.arrive * 1000;
          if (!pick || d < pick.d) pick = { d, k, b };
        }
      }
      if (pick) {
        const { b, k } = pick;
        const groupSize = G.rules ? 1 : LANES;
        const color = A.loading(b).color;
        for (let j = 0; j < groupSize; j++) {
          const p = seatPoint(k + j);
          const person = G.ring[k + j];
          G.ring[k + j] = null;
          b.filled += G.rules ? seatsOf(person) : 1; b.pending++;
          G.particles.push({ x0: p.x, y0: p.y, bus: b, t: -j * 0.15, color: G.rules ? person : color });
        }
        G.boardT += BOARD_GAP * groupSize;
        sound('pop');
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
      if (!G.validating) { const finished = G; setTimeout(() => { if (G === finished) showWin(); }, 350); }
    }

    checkStuck(dt);
  }

  function checkStuck(dt) {
    const waiting = G.queue.length > 0 || G.ring.some((c) => c !== null);
    if (G.won || G.modal || G.failDismissed || !waiting) { G.stuckT = 0; return; }
    const busy = G.paradeT > 0 || movingBuses() || G.particles.length || G.shift > 0.05 ||
      G.buses.some((b) => b.state === 'exiting' || b.state === 'driving' || b.state === 'flying' || (b.state === 'lot' && b.bumpT > 0));
    if (busy) { G.stuckT = 0; return; }
    G.checkT -= dt;
    if (G.checkT > 0) { if (G.stuckT > 0) G.stuckT += dt; return; }
    G.checkT = 0.25;
    const canBoard = G.buses.some(b => b.state === 'slot' && A.loading(b).left >= (G.rules ? 1 : LANES) && canTake(b));
    const canFeed = G.queue.length > 0 && G.ring.some((c, k) => (G.rules || k % LANES === 0) && c === null);
    let stuck = false;
    if (!canBoard && !canFeed) {
      stuck = !lotBuses().some(b => canDispatch(b));
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

  function drawPerson(x, y, person, s = 1) {
    const col = COLORS[colorOf(person)];
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x + 1, y + 3 * s, 5.5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    // round body, head on top, and a shine on the head
    ctx.fillStyle = col.c; ctx.strokeStyle = col.d; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 6 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col.l;
    ctx.beginPath(); ctx.arc(x, y - 2.6 * s, 3.7 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(x - 1.2 * s, y - 3.8 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
    if (person >= BAG) {
      // a silver roll-aboard suitcase in front of them, with ribs and a
      // pulled-up handle, so it shows even in a crowded row
      const bx = x + 1.5 * s, by = y - 1 * s, w = 7.5 * s, h = 9 * s;
      const g = ctx.createLinearGradient(bx, 0, bx + w, 0);
      g.addColorStop(0, '#f8fafc'); g.addColorStop(0.5, '#cbd5e1'); g.addColorStop(1, '#94a3b8');
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.1 * s;
      ctx.beginPath(); ctx.moveTo(bx + w / 2, by); ctx.lineTo(bx + w / 2, by - 4 * s); ctx.lineTo(bx + w / 2 - 2 * s, by - 4 * s); ctx.stroke();
      ctx.fillStyle = g; rr(bx, by, w, h, 1.8 * s); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(51,65,85,0.55)'; ctx.lineWidth = 0.7 * s;
      for (const f of [0.3, 0.5, 0.7]) { ctx.beginPath(); ctx.moveTo(bx + w * f, by + 1.2 * s); ctx.lineTo(bx + w * f, by + h - 1.2 * s); ctx.stroke(); }
    }
  }

  function drawBus(b, pose, mode) {
    const col = b.mystery && mode === 'arrow' ? MYSTERY : COLORS[A.loading(b).color], L = b.len, W = b.wid;
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

    if (b.stages && !(b.mystery && mode === 'arrow')) {
      const inner = L - 13;
      b.stages.forEach((stage, i) => {
        const x = -L / 2 + 4 + i * inner / 2;
        ctx.fillStyle = COLORS[stage.color].l; rr(x, -W / 2 + 5, inner / 2, W - 10, 2); ctx.fill();
        ctx.save(); ctx.translate(x + inner / 4, 3); ctx.rotate(-pose.ang);
        ctx.fillStyle = COLORS[stage.color].c; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#14253b'; ctx.font = '900 6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), 0, 0.5); ctx.restore();
      });
    }

    if (b.mystery && mode === 'arrow') {
      // a big "?" with just the arrowhead, so the direction still shows
      ctx.fillStyle = '#fff'; ctx.font = '900 14px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(b.flip ? L * 0.06 : -L * 0.08, 0); ctx.rotate(-pose.ang); ctx.fillText('?', 0, 1); ctx.restore();
      const xh = L * 0.36, xb = L * 0.2;
      ctx.beginPath(); ctx.moveTo(xh, 0); ctx.lineTo(xb, -5.5); ctx.lineTo(xb, 5.5); ctx.closePath(); ctx.fill();
    }
    if (mode === 'arrow' && !b.mystery) {
      ctx.save(); if (b.stages) { ctx.translate(0, -3.5); ctx.scale(1, 0.48); }
      const x0 = b.flip ? -L / 2 + 16 : -L * 0.26, x1 = L * 0.16, xh = L * 0.3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [style, lw] of [['rgba(15,23,42,0.45)', 5.5], ['#fff', 3.2]]) {
        ctx.strokeStyle = style; ctx.fillStyle = style; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xh, 0); ctx.lineTo(x1 - 1, -5.5); ctx.lineTo(x1 - 1, 5.5); ctx.closePath();
        ctx.stroke(); ctx.fill();
      }
      ctx.restore();
    } else {
      // roof fills up from the back as passengers board
      const frac = (b.filled - b.pending) / b.cap, inner = L - 13;
      ctx.fillStyle = 'rgba(15,23,42,0.12)'; rr(-L / 2 + 4, -W / 2 + 5, inner, W - 10, 3); ctx.fill();
      if (frac > 0) { ctx.fillStyle = col.d; rr(-L / 2 + 4, -W / 2 + 5, Math.max(4, inner * frac), W - 10, 3); ctx.fill(); }
    }
    if (b.flip && mode === 'arrow') {
      // turn-around sign: a white disc with a circular arrow, on the back of the roof
      const cx = -L / 2 + 8.5;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(15,23,42,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, 0, 5.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#1e40af'; ctx.fillStyle = '#1e40af'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, 0, 3.1, -Math.PI * 0.35, Math.PI * 1.25); ctx.stroke();
      const ax = cx + 3.1 * Math.cos(-Math.PI * 0.35), ay = 3.1 * Math.sin(-Math.PI * 0.35);
      ctx.beginPath(); ctx.moveTo(ax + 2.2, ay - 0.6); ctx.lineTo(ax - 1.2, ay - 2.2); ctx.lineTo(ax - 0.2, ay + 1.6); ctx.closePath(); ctx.fill();
    }
    if (mode === 'arrow' && b.ice > 0) {
      // block of ice with the count on top
      ctx.fillStyle = 'rgba(186,230,253,0.55)'; rr(-L / 2 - 2, -W / 2 - 2, L + 4, W + 4, 7); ctx.fill();
      ctx.strokeStyle = '#f0f9ff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-L / 2 + 3, -W / 2 + 6); ctx.lineTo(-L / 2 + 9, -W / 2 + 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L / 2 - 9, W / 2 - 1); ctx.lineTo(L / 2 - 3, W / 2 - 6); ctx.stroke();
      ctx.save(); ctx.rotate(-pose.ang);
      ctx.font = '900 13px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = '#0369a1'; ctx.strokeText(String(b.ice), 0, 1);
      ctx.fillStyle = '#fff'; ctx.fillText(String(b.ice), 0, 1);
      ctx.restore();
    }
    if (mode === 'arrow' && b.bomb > 0) {
      // bomb with a lit fuse and the moves left, drawn upright
      const hot = b.bomb <= 2 ? 0.5 + 0.5 * Math.sin(clock * 12) : 0;
      ctx.save(); ctx.rotate(-pose.ang);
      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(4, -5); ctx.quadraticCurveTo(7, -9, 9, -8); ctx.stroke();
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(9, -8, 1.8 + hot, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${17 + 200 * hot},24,39)`; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = '900 10px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText(String(b.bomb), 0, 0.8);
      ctx.restore();
    }
    if (mode === 'arrow' && b.lock != null) {
      // padlock in the key color, drawn upright
      const k = COLORS[b.lock];
      ctx.save(); ctx.rotate(-pose.ang);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(0, -2, 3.6, Math.PI, 0); ctx.lineTo(3.6, 1); ctx.moveTo(-3.6, 1); ctx.lineTo(-3.6, -2); ctx.stroke();
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = k.c; ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.3;
      rr(-6, 0, 12, 9, 2.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(0, 4, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if ((b.link || (b.transfer && !b.transferred)) && mode === 'arrow') {
      ctx.save(); ctx.rotate(-pose.ang); ctx.fillStyle = b.link ? linkColor(b.link) : '#0891b2';
      rr(-10, W / 2 + 1, 20, 12, 4); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '800 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.link ? `↔${b.link}` : 'T ↗', 0, W / 2 + 7); ctx.restore();
    }
    if (b.cycle && mode === 'arrow') {
      // the colours it cycles through, the current one ringed
      const k = b.cycle.length, cur = G.arrivals % k;
      for (let i = 0; i < k; i++) {
        const cx = -L / 2 + 8 + i * 8.5;
        ctx.fillStyle = COLORS[b.cycle[i]].c; ctx.strokeStyle = i === cur ? '#fff' : 'rgba(15,23,42,0.5)'; ctx.lineWidth = i === cur ? 1.8 : 1;
        ctx.beginPath(); ctx.arc(cx, W / 2 - 4, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    if (b.windmill && mode === 'arrow') {
      // a little windmill on the back of the roof, sails turning
      const cx = -L / 2 + 9, cy = -W / 2 + 6;
      ctx.save(); ctx.translate(cx, cy);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(15,23,42,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.rotate(clock * 3);
      ctx.fillStyle = '#0f766e';
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1.6, -5); ctx.lineTo(-1.2, -5); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    if (b.tow && mode === 'arrow') {
      // a little tow truck hitched over the front, with its amber beacon
      const fx = L / 2 - 12;
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(fx - 5, 0); ctx.lineTo(fx + 1, 0); ctx.stroke();
      ctx.fillStyle = '#f59e0b'; ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1;
      rr(fx, -W / 2 + 0.5, 12, W - 1, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(30,58,95,0.85)'; ctx.fillRect(fx + 8, -W / 2 + 3, 2.2, W - 6);
      ctx.fillStyle = `rgba(254,215,170,${0.6 + 0.4 * Math.sin(clock * 9)})`;
      ctx.beginPath(); ctx.arc(fx + 4, 0, 2, 0, Math.PI * 2); ctx.fill();
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

  function drawCone(t) {
    ctx.save();
    ctx.translate(lotX + t.x * ls, lotY + t.y * ls); ctx.scale(ls, ls);
    ctx.fillStyle = 'rgba(15,23,42,0.22)'; rr(-5, -3.5, 11, 11, 2); ctx.fill();
    ctx.fillStyle = '#1f2937'; rr(-6, -6, 12, 12, 2); ctx.fill();     // square base
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fdba74'; ctx.beginPath(); ctx.arc(0, 0, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // A barrier arm across a cell, raised when open. The badge counts the moves
  // until it changes.
  function drawGate(t) {
    const open = gateOpen(t, G.arrivals);
    const left = t.gate - ((G.arrivals + t.phase) % t.gate);
    ctx.save();
    ctx.translate(lotX + t.x * ls, lotY + t.y * ls); ctx.scale(ls * 1.6, ls * 1.6);
    ctx.fillStyle = open ? 'rgba(22,163,74,0.75)' : 'rgba(220,38,38,0.8)'; rr(-6, -6, 12, 12, 2.5); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.save();
    ctx.rotate(t.arm);
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.arc(-6.5, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6.5, 0, 1.6, 0, Math.PI * 2); ctx.fill();
    // the arm swings up from its post at -6.5
    // raised, it points up at you, so from above it looks short
    ctx.translate(-6.5, 0); ctx.scale(1 - t.lift * 0.75, 1);
    ctx.fillStyle = '#fff'; rr(0, -1.8, 13.5, 3.6, 1.5); ctx.fill();
    ctx.fillStyle = '#ef4444';
    for (let x = 1.5; x < 13; x += 4) ctx.fillRect(x, -1.8, 2, 3.6);
    ctx.restore();
    ctx.fillStyle = open ? '#16a34a' : '#dc2626';
    ctx.beginPath(); ctx.arc(5.5, -5.5, 4.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 6.5px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(left), 5.5, -5.2);
    ctx.restore();
  }

  function roadPoint({ side, position }) {
    return side % 2 ? { x: lotX + LW * position * ls, y: side === 1 ? road.y1 : road.y0 }
      : { x: side === 0 ? road.x1 : road.x0, y: lotY + LH * position * ls };
  }
  function roadMark(z, label, color, ghost = false, inset = 0) {
    const a = roadPoint({ side: z.side, position: Math.max(0, z.center - z.half) });
    const b = roadPoint({ side: z.side, position: Math.min(1, z.center + z.half) });
    const c = roadPoint({ side: z.side, position: z.center });
    c.x += z.side === 0 ? -inset : z.side === 2 ? inset : 0;
    c.y += z.side === 1 ? -inset : z.side === 3 ? inset : 0;
    ctx.save(); ctx.globalAlpha = ghost ? 0.38 : 1;
    ctx.lineCap = 'butt'; ctx.strokeStyle = color; ctx.lineWidth = ROAD - 3;
    ctx.setLineDash(ghost ? [3, 4] : []);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(c.x, c.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#17283d'; ctx.font = '900 12px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, c.x, c.y + 0.5); ctx.restore();
  }
  function linkColor(id) { return ['#087a86', '#824db3'][(id - 1) % 2]; }
  function drawLinkedHighlights() {
    const linked = lotBuses().filter(b => b.link), done = new Set();
    for (const b of linked) {
      const p = lotPose(b), focus = G.linkFocus === b.link && G.linkFocusT > 0;
      const alpha = focus && !reducedMotion.matches ? 0.8 + Math.sin(sceneryClock * 5) * 0.2 : 0.75;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.scale(p.s, p.s);
      ctx.globalAlpha = alpha;
      rr(-b.len / 2 - 1.5, -b.wid / 2 - 1.5, b.len + 3, b.wid + 3, 7);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = focus ? 5 : 3.5; ctx.stroke();
      ctx.strokeStyle = linkColor(b.link); ctx.lineWidth = focus ? 2.7 : 1.7; ctx.stroke(); ctx.restore();
      if (focus && !done.has(b.link)) {
        done.add(b.link);
        const partner = linked.find(o => o !== b && o.link === b.link);
        if (!partner) continue;
        const q = lotPose(partner);
        ctx.save(); ctx.lineCap = 'round'; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = linkColor(b.link); ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
    }
  }
  function paradeIndicator() {
    const c=G.rules.caravan, travel=A.caravanTravel(c,G.paradeMoves);
    const p=A.caravanPoint(c,travel.center);
    return { x:lotX+p.x*ls-p.ty*13, y:lotY+p.y*ls+p.tx*13,
      angle:Math.atan2(p.ty,p.tx)+(travel.direction>0?0:Math.PI), positions:travel.positions };
  }
  function drawParade() {
    const c=G.rules?.caravan;
    if(!c)return;
    const scale=c.spacing*ls/22, kind=window.Scenery.themeFor(save.level).parade||'elephant';
    A.caravanMembers(c,G.paradeMoves).forEach((p,i)=>{
      const stride=G.paradeT>0&&!reducedMotion.matches?Math.sin(sceneryClock*20+i):0;
      window.ParadeArt.draw(ctx,{x:lotX+p.x*ls,y:lotY+p.y*ls,angle:p.facing,kind,stride,scale});
    });
    // One attached movement badge; the numeral stays upright on every side.
    const badge=paradeIndicator();
    ctx.save();ctx.translate(badge.x,badge.y);ctx.rotate(badge.angle);
    ctx.fillStyle='#183c5540';rr(-17,-7,34,18,8);ctx.fill();
    ctx.fillStyle='#245d73';rr(-17,-9,34,18,8);ctx.fill();
    ctx.strokeStyle='#edf8f5';ctx.lineWidth=1.5;ctx.stroke();
    ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    ctx.moveTo(2,0);ctx.lineTo(11,0);ctx.moveTo(7,-4);ctx.lineTo(11,0);ctx.lineTo(7,4);ctx.stroke();
    ctx.translate(-7,0);ctx.rotate(-badge.angle);ctx.fillStyle='#fff';
    ctx.font='900 12px -apple-system, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(String(badge.positions),0,.5);ctx.restore();
  }
  function chuteGateGeometry(side) {
    const p=chutePoint(side,3), outward=side?-1:1;
    return { p, outward, angle:Math.atan2(p.ty,p.tx),
      counter:{x:p.x+(side?37:-37),y:p.y+16,r:11},
      front:lerp(-BELT_W/2+1,BELT_W/2+5,G.chuteSlide[side]), outer:BELT_W/2+5 };
  }
  function drawChuteGates() {
    if(!G.rules?.switchEvery)return;
    for(const side of [0,1]) {
      const state=chuteGateState(side), gate=chuteGateGeometry(side), {p,counter,front,outer}=gate;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(gate.angle);ctx.scale(1,gate.outward);
      // The telescoping steel panel slides across the lane into its outer
      // housing: down-left for the left chute, down-right for the right.
      const metal=ctx.createLinearGradient(-5,0,5,0);
      metal.addColorStop(0,'#657580');metal.addColorStop(.45,'#c0cbd1');metal.addColorStop(1,'#7f909a');
      if(outer-front>.2) {
        ctx.fillStyle='#243b4940';rr(-2,front+2,8,outer-front,2);ctx.fill();
        ctx.fillStyle=metal;rr(-4,front,8,outer-front,2);ctx.fill();
        ctx.strokeStyle='#415460';ctx.lineWidth=1.2;ctx.stroke();
        ctx.strokeStyle='#71838e';ctx.lineWidth=1;
        for(let i=1;i<6;i++){const y=lerp(front,outer,i/6);ctx.beginPath();ctx.moveTo(-3,y);ctx.lineTo(3,y);ctx.stroke();}
        ctx.fillStyle='#435967';rr(-5,front-1,10,4,1.5);ctx.fill();
      }
      ctx.fillStyle='#718591';rr(-7,outer-2,14,12,3);ctx.fill();
      ctx.fillStyle=metal;rr(-6,outer-3,12,10,2);ctx.fill();
      ctx.strokeStyle='#425865';ctx.lineWidth=1.2;ctx.stroke();
      for(const y of [outer,outer+4]){ctx.fillStyle='#435764';ctx.beginPath();ctx.arc(0,y,1,0,Math.PI*2);ctx.fill();}
      ctx.restore();
      // The counter's mounting arm and badge sit outside the passenger lane.
      const mount={x:p.x-p.ty*gate.outward*(outer+4),y:p.y+p.tx*gate.outward*(outer+4)};
      ctx.save();ctx.strokeStyle='#667d8b';ctx.lineWidth=3;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(mount.x,mount.y);ctx.lineTo(counter.x,counter.y);ctx.stroke();
      ctx.fillStyle='#20374435';ctx.beginPath();ctx.arc(counter.x,counter.y+2,counter.r+1,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=state.empty?'#71828c':'#344c5d';ctx.beginPath();ctx.arc(counter.x,counter.y,counter.r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#dbe6e9';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='#fff';ctx.font='900 13px -apple-system, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(state.empty?'✓':state.remaining===null?'›':String(state.remaining),counter.x,counter.y+.5);ctx.restore();
    }
  }

  // The RV squatter. It counts departures while it circles the road; at zero
  // it waits for a free bay and takes it at once, stays for its number of
  // departures, then drives off and the count starts again.
  const RV_SPOT = { rv: true };
  function updateRV(dt) {
    const rv = G.rv, R = G.rules?.rv;
    if (!rv) return;
    rv.t = Math.min(1, rv.t + dt / 0.6);
    for (; rv.seen < G.arrivals; rv.seen++) {
      if (rv.mode === 'road' && --rv.count <= 0) rv.mode = 'waiting';
      else if (rv.mode === 'parked' && --rv.stay <= 0) {
        G.slots[rv.slot] = null; rv.from = rv.slot; rv.slot = -1;
        rv.mode = 'road'; rv.count = R.gap; rv.t = 0;
      }
    }
    if (rv.mode === 'waiting') {
      const i = freeSlot();
      if (i > 0) { G.slots[i] = RV_SPOT; rv.slot = i; rv.mode = 'parked'; rv.stay = R.stay; rv.t = 0; rv.fromD = rv.d; }
    }
    // it drives round the road, slowing to a crawl along the top while it waits
    if (rv.mode !== 'parked' && rv.t >= 1) rv.d += dt * (rv.mode === 'waiting' ? 12 : 55);
  }
  function rvRoadPose(d) {
    const { x0, x1, y0, y1 } = road, w = x1 - x0, h = y1 - y0, P = 2 * (w + h);
    d = ((d % P) + P) % P;
    if (d < w) return { x: x0 + d, y: y0, ang: 0 };
    if (d < w + h) return { x: x1, y: y0 + d - w, ang: Math.PI / 2 };
    if (d < 2 * w + h) return { x: x1 - (d - w - h), y: y1, ang: Math.PI };
    return { x: x0, y: y1 - (d - 2 * w - h), ang: -Math.PI / 2 };
  }
  function drawRVBody(pose) {
    ctx.save(); ctx.translate(pose.x, pose.y); ctx.rotate(pose.ang); ctx.scale(pose.s, pose.s);
    const L = 46, W = 21;
    ctx.fillStyle = 'rgba(15,23,42,0.22)'; rr(-L / 2 + 1.5, -W / 2 + 3, L, W, 6); ctx.fill();
    ctx.fillStyle = '#c9b48a'; rr(-L / 2, -W / 2, L, W, 6); ctx.fill();
    ctx.fillStyle = '#fbf6ea'; rr(-L / 2 + 1.3, -W / 2 + 1.3, L - 2.6, W - 2.6, 5); ctx.fill();
    ctx.fillStyle = '#d97706'; ctx.fillRect(-L / 2 + 3, -W / 2 + 1.3, L - 12, 3); ctx.fillRect(-L / 2 + 3, W / 2 - 4.3, L - 12, 3);
    ctx.fillStyle = '#7dd3fc'; rr(L / 2 - 8, -W / 2 + 3, 5.5, W - 6, 2); ctx.fill();      // windscreen
    ctx.fillStyle = '#e7dcc4'; rr(-L / 2 + 6, -5, 14, 10, 2); ctx.fill();                    // roof hatch
    ctx.fillStyle = '#475569'; ctx.fillRect(-L / 2 - 2.5, -6, 2.5, 12);                       // spare wheel rack
    ctx.restore();
  }
  function drawRV() {
    const rv = G.rv;
    if (!rv) return;
    let pose;
    const roadPose = rvRoadPose(rv.d), rs = Math.min(ls, 0.85);
    if (rv.mode === 'parked') {
      const bay = slotPose(rv.slot), from = rvRoadPose(rv.fromD ?? rv.d), t = easeInOut(rv.t);
      pose = { x: lerp(from.x, bay.x, t), y: lerp(from.y, bay.y, t), ang: t < 1 ? -Math.PI / 2 : bay.ang, s: lerp(rs, slotScale, t) };
    } else if (rv.t < 1 && rv.from != null) {
      const bay = slotPose(rv.from), t = easeInOut(rv.t);
      pose = { x: lerp(bay.x, roadPose.x, t), y: lerp(bay.y, roadPose.y, t), ang: Math.PI / 2, s: lerp(slotScale, rs, t) };
    } else pose = { ...roadPose, s: rs };
    drawRVBody(pose);
    // counter: departures until it squats, or until it leaves the bay
    const n = rv.mode === 'parked' ? rv.stay : rv.mode === 'waiting' ? '!' : rv.count;
    const bx = pose.x + 10, by = pose.y - 12, warn = rv.mode !== 'road';
    ctx.fillStyle = warn ? '#dc2626' : '#d97706';
    ctx.beginPath(); ctx.arc(bx, by, 8.5 + (rv.mode === 'waiting' ? Math.sin(clock * 8) : 0), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 11px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), bx, by + 0.5);
  }

  // A steel turntable under the bus, with a quarter-turn arrow
  function drawTurntable(b) {
    const x = lotX + b.x * ls, y = lotY + b.y * ls, r = (b.len / 2 + 2) * ls;
    ctx.save();
    ctx.fillStyle = '#64748b'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(226,232,240,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r - 4 * ls, 0, Math.PI * 2); ctx.stroke();
    // clockwise arrow round the rim
    const a0 = -Math.PI * 0.95, a1 = -Math.PI * 0.6;
    ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r - 2 * ls, a0, a1); ctx.stroke();
    const hx = x + Math.cos(a1) * (r - 2 * ls), hy = y + Math.sin(a1) * (r - 2 * ls);
    ctx.fillStyle = '#fde047'; ctx.beginPath();
    ctx.moveTo(hx + Math.cos(a1 + Math.PI / 2) * 5, hy + Math.sin(a1 + Math.PI / 2) * 5);
    ctx.lineTo(hx + Math.cos(a1) * 4, hy + Math.sin(a1) * 4); ctx.lineTo(hx - Math.cos(a1) * 4, hy - Math.sin(a1) * 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // Fog over its band of the lot (out to the asphalt's edge where the band
  // touches the lot's edge) and over every bus that reaches into it. It
  // drifts gently, shows how many windmill buses are left, and fades once
  // they have all gone.
  function drawFog() {
    const F = G.fog;
    if (!F || F.fade <= 0) return;
    const X = (x) => lotX + x * ls, Y = (y) => lotY + y * ls, A_ = asphalt;
    const x0 = F.x0 <= 0 ? A_.x : X(F.x0), x1 = F.x1 >= LW ? A_.x + A_.w : X(F.x1);
    const y0 = F.y0 <= 0 ? A_.y : Y(F.y0), y1 = F.y1 >= LH ? A_.y + A_.h : Y(F.y1);
    ctx.save(); ctx.globalAlpha = F.fade;
    ctx.beginPath(); ctx.rect(A_.x, A_.y, A_.w, A_.h); ctx.clip();
    ctx.fillStyle = 'rgba(226,232,240,0.95)';
    rr(x0, y0, x1 - x0, y1 - y0, 18); ctx.fill();
    for (const b of G.buses) if (b.state === 'lot' && b.inFog) {
      ctx.save(); ctx.translate(X(b.x), Y(b.y)); ctx.rotate(b.ang);
      rr((-b.len / 2 - 4) * ls, (-b.wid / 2 - 4) * ls, (b.len + 8) * ls, (b.wid + 8) * ls, 10 * ls); ctx.fill();
      ctx.restore();
    }
    // soft billows drifting over it
    ctx.fillStyle = 'rgba(248,250,252,0.7)';
    const w = x1 - x0, h = y1 - y0, n = Math.max(5, Math.round((w + h) / 45));
    for (let i = 0; i < n; i++) {
      const u = (i * 0.618 + 0.3) % 1, v = (i * 0.371 + 0.2) % 1, drift = Math.sin(clock * 0.5 + i * 1.7) * 8;
      ctx.beginPath(); ctx.arc(x0 + u * w + drift, y0 + v * h, 16 + (i % 3) * 8, 0, Math.PI * 2); ctx.fill();
    }
    // windmill buses still to go
    const left = lotBuses().filter((b) => b.windmill).length;
    if (left && !F.lifted) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      ctx.fillStyle = 'rgba(15,118,110,0.9)'; rr(cx - 26, cy - 13, 52, 26, 13); ctx.fill();
      ctx.save(); ctx.translate(cx - 11, cy); ctx.rotate(clock * 3); ctx.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2.2, -8); ctx.lineTo(-1.6, -8); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = '900 14px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`×${left}`, cx + 9, cy + 1);
    }
    ctx.restore();
  }

  function drawAdvanced() {
    if (!G.rules) return;
    const r = G.rules;
    ctx.save();
    if (!r.switchEvery) {
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; rr(cw / 2 - 54, ringYT + ringR - 14, 108, 28, 8); ctx.fill();
      ctx.fillStyle = '#334155'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 9px -apple-system, sans-serif';
      ctx.fillText(`${G.arrivals} DEPARTURES`, cw / 2, ringYT + ringR);
    }
    if (r.road && G.arrivals < r.road.until) {
      const z = { side: r.road.side, center: 0.5, half: 0.5 };
      roadMark(z, String(r.road.until - G.arrivals), '#f59e0b');
      for (const pos of [0.18, 0.82]) {
        const p = roadPoint({ side: z.side, position: pos });
        ctx.font = '18px sans-serif'; ctx.fillText('🚧', p.x, p.y);
      }
    }
    if (r.switches) r.switches.zones.forEach((z, i) => roadMark(z, i ? 'B' : 'A', '#7c3aed', i !== (G.switched ? 1 : 0)));
    const linked = new Set();
    for (const b of lotBuses()) {
      const p = lotPose(b);
      if (b.link && !linked.has(b.link)) {
        linked.add(b.link);
        const partner = lotBuses().find(o => o !== b && o.link === b.link);
        if (partner) {
          const q = lotPose(partner);
          ctx.strokeStyle = linkColor(b.link); ctx.lineWidth = 3; ctx.setLineDash([3, 5]);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      if (b.switchPad) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.scale(ls, ls);
        ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 4; ctx.setLineDash([4, 3]);
        rr(-b.len / 2 - 4, -b.wid / 2 - 4, b.len + 8, b.wid + 8, 5); ctx.stroke(); ctx.setLineDash([]);
        ctx.rotate(-p.ang); ctx.fillStyle = '#6d28d9'; ctx.font = '900 8px sans-serif'; ctx.fillText('A ↔ B', 0, b.wid / 2 + 11); ctx.restore();
      }
    }
    for (const b of G.buses.filter(o => o.transfer && !o.transferred)) {
      const p = roadPoint(A.exit(b));
      ctx.fillStyle = '#0891b2'; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '900 11px sans-serif'; ctx.fillText('T', p.x, p.y);
      ctx.save(); ctx.translate(lotX + b.transfer.x * ls, lotY + b.transfer.y * ls); ctx.rotate(b.transfer.ang); ctx.scale(ls, ls);
      ctx.fillStyle = 'rgba(8,145,178,0.12)'; ctx.strokeStyle = '#0891b2'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      rr(-b.len / 2 - 3, -b.wid / 2 - 3, b.len + 6, b.wid + 6, 6); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#08788f'; ctx.font = '900 12px sans-serif'; ctx.fillText('T →', 0, 0); ctx.restore();
    }
    ctx.restore();
  }

  let clock = 0, sceneryClock = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Scenery: the themed plaza where the crowd waits, and the parking lot
    ctx.drawImage(bg, 0, 0, cw, ch);
    window.Scenery.animate(ctx, sceneryGeometry, sceneryClock);
    // The two chutes, curving in from off the top of the screen
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const side of [0, 1]) {
      ctx.beginPath();
      chutes[side].forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y + 4)));
      ctx.strokeStyle = 'rgba(15,23,42,0.12)'; ctx.lineWidth = BELT_W + 12; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = BELT_W + 8; ctx.stroke();
      ctx.strokeStyle = side === activeFeed() || !G.queue.length ? '#9aa6bb' : '#b4bccb'; ctx.lineWidth = BELT_W; ctx.stroke();
    }
    ctx.lineCap = 'round';
    // Carousel belt with seat markers that show it turning
    const belt = () => {
      ctx.beginPath();
      ctx.moveTo(ringXL, ringYT); ctx.lineTo(ringXR, ringYT);
      ctx.arc(ringXR, ringYT + ringR, ringR, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(ringXL, ringYB);
      ctx.arc(ringXL, ringYT + ringR, ringR, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath();
    };
    ctx.fillStyle = window.Scenery.themeFor(save.level).garden; belt(); ctx.fill();
    ctx.strokeStyle = 'rgba(15,23,42,0.12)'; ctx.lineWidth = BELT_W + 12; belt(); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = BELT_W + 8; ctx.stroke();
    ctx.strokeStyle = '#8f9ab0'; ctx.lineWidth = BELT_W; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < G.ring.length; k++) {
      if (k % LANES) continue;
      const p = ringPoint(seatS(k));
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
    }

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

    drawAdvanced();

    // Parking lot pieces
    for (const t of G.tunnels) if (!t.gate) (t.cone ? drawCone : drawTunnel)(t);

    // People riding the carousel, bobbing as they march; new arrivals walk in
    // from the chute
    const walk = G.boostT > 0 ? 22 : 13;
    for (let k = 0; k < G.ring.length; k++) {
      if (G.ring[k] === null) continue;
      let p = seatPoint(k);
      const e = G.enter[k];
      if (e) { const t = easeInOut(e.t); p = { x: lerp(e.x, p.x, t), y: lerp(e.y, p.y, t) - Math.sin(Math.PI * e.t) * 3 }; }
      drawPerson(p.x, p.y - Math.abs(Math.sin(clock * walk + k * 1.7)) * 1.6, G.ring[k], RING_SCALE);
    }
    // Feeder lines (back of each line drawn first). Only the front few rows
    // show; the rest fade off the top of the screen.
    const lines = [G.queue.slice(0, G.leftN), G.queue.slice(G.leftN)];
    for (const side of [0, 1]) {
      const line = lines[side], n = Math.min(line.length, (FEED_ROWS + 1) * LANES);
      for (let i = n - 1; i >= 0; i--) {
        const p = feedSpot(side, i);
        const bob = side === activeFeed() && G.shift > 0 ? Math.abs(Math.sin(clock * 16 + i * 1.7)) * 1.6 : 0;
        if (p.y < -10) continue;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.y / (feedTop * 0.5)));  // fade out up the chute
        drawPerson(p.x, p.y - bob, line[i], RING_SCALE);
        ctx.globalAlpha = 1;
      }
    }

    // Buses: parked first, moving ones on top
    for (const b of G.buses) if (b.state === 'lot' && b.turntable) drawTurntable(b);
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
    drawFog();
    drawLinkedHighlights();
    drawParade();
    drawChuteGates();
    // Gates on top of parked buses so they are easy to spot
    for (const t of G.tunnels) if (t.gate) drawGate(t);
    for (const b of G.buses) {
      if (b.state === 'slot' || b.state === 'leaving') drawBus(b, poseOf(b), 'seats');
    }
    drawRV();
    for (const b of G.buses) {
      if (b.state === 'exiting' || b.state === 'driving' || b.state === 'flying' || b.state === 'transferring') drawBus(b, poseOf(b), (b.state === 'flying' && b.t > 0.5) || (b.state === 'driving' && b.dist > b.route[b.route.length - 2].d) ? 'seats' : 'arrow');
    }
    // Seats-left badges under bays
    for (const b of G.buses) {
      if (b.state !== 'slot') continue;
      const r = slotRect(b.slot), left = b.cap - b.filled;
      const load = A.loading(b), col = COLORS[load.color];
      ctx.fillStyle = col.c; rr(r.x + 4, r.y + r.h - 12, r.w - 8, 17, 6); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = b.color === 9 || b.color === 3 ? '#0f172a' : '#fff';
      ctx.font = '900 13px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.stages ? `${load.index + 1}:${load.left}` : String(left), r.x + r.w / 2, r.y + r.h - 3.5);
    }
    // Passengers hopping on
    for (const p of G.particles) {
      const to = slotPose(p.bus.slot), t = easeInOut(Math.max(0, Math.min(1, p.t)));
      drawPerson(lerp(p.x0, to.x, t), lerp(p.y0, to.y, t) - Math.sin(Math.PI * t) * 18, p.color, RING_SCALE * (1 - t * 0.3));
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; clock += dt;
    if (!reducedMotion.matches && !G.modal && !G.won && !document.hidden) sceneryClock += dt;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- HUD, boosters, modals ----------
  function updateProgress() {
    if (G.validating) return;
    const left = G.queue.length + G.ring.filter((c) => c !== null).length;
    const pct = G.total ? (100 * (G.total - left)) / G.total : 0;
    $('#progFill').style.width = pct + '%';
  }
  function updateHUD() {
    const theme = window.Scenery.themeFor(save.level);
    $('#themeName').textContent = theme.icon + ' ' + theme.name;
    $('#lvl').innerHTML = 'LEVEL ' + save.level + (isHard(save.level) ? ' <span class="hard">HARD</span>' : '');
    $('#coins').textContent = '🪙 ' + save.coins;
    document.querySelectorAll('.boost[data-k]').forEach((el) => {
      const k = el.dataset.k, n = save.boosters[k];
      const cnt = el.querySelector('.cnt');
      cnt.textContent = n;
      el.setAttribute('aria-label', `${k === 'vip' ? 'VIP' : k === 'sort' ? 'Sort' : 'Shuffle'}, ${n} available${k === 'vip' && G.vipMode ? ', selected' : ''}`);
      cnt.classList.toggle('zero', n <= 0);
      el.classList.toggle('active', k === 'vip' && G && G.vipMode);
    });
    $('#btnBoosters').classList.toggle('active', !!(G && G.vipMode));
    $('#btnBoosters').setAttribute('aria-label', G && G.vipMode ? 'Power-ups, VIP selected' : 'Power-ups');
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
        const cols = g.map(b => ({ color: b.color, stages: b.stages }));
        for (let i = cols.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [cols[i], cols[j]] = [cols[j], cols[i]];
        }
        g.forEach((b, i) => { if (b.color !== cols[i].color || b.stages !== cols[i].stages) changed = true; Object.assign(b, cols[i]); b.flash = 0.4; });
      }
      if (!changed) { toast('Nothing to shuffle'); return; }
      spendBooster('shuffle'); sound('magic');
      return;
    }
    if (k === 'sort') {
      const need = {};
      for (const b of G.buses) {
        if (['slot', 'flying', 'driving', 'exiting'].includes(b.state)) { const load = A.loading(b); need[load.color] = (need[load.color] || 0) + load.left; }
      }
      for (const c of G.ring) if (c !== null && need[colorOf(c)] > 0) need[colorOf(c)] -= seatsOf(c);
      const reorder = queue => {
        const win = queue.slice(0, 240), front = [], rest = [], unit = G.rules ? 1 : LANES;
        for (let i = 0; i < win.length; i += unit) {
          const group = win.slice(i, i + unit), color = colorOf(group[0]), seats = group.reduce((a, c) => a + seatsOf(c), 0);
          if (need[color] >= seats) { front.push(...group); need[color] -= seats; } else rest.push(...group);
        }
        return front.concat(rest, queue.slice(240));
      };
      let newQ;
      if (G.rules?.switchEvery) {
        const lines = [G.queue.slice(0, G.leftN), G.queue.slice(G.leftN)], side = activeFeed();
        lines[side] = reorder(lines[side]); lines[1 - side] = reorder(lines[1 - side]);
        newQ = lines[0].concat(lines[1]);
      } else newQ = reorder(G.queue);
      if (newQ.every((c, i) => c === G.queue[i])) { toast('No matching passengers to move forward yet'); return; }
      G.queue = newQ;
      spendBooster('sort'); sound('magic');
    }
  }
  function setPowerPanel(open, restoreFocus = false) {
    $('#powerPanel').hidden = !open;
    $('#btnBoosters').setAttribute('aria-expanded', String(open));
    if (restoreFocus) $('#btnBoosters').focus();
  }
  $('#btnBoosters').addEventListener('click', () => {
    unlockAudio();
    if (!G.modal && !G.won) setPowerPanel($('#powerPanel').hidden);
  });
  document.querySelectorAll('.boost[data-k]').forEach((el) => el.addEventListener('click', () => {
    setPowerPanel(false, true);
    onBooster(el.dataset.k);
  }));
  document.addEventListener('pointerdown', (e) => {
    if (!$('#powerDock').contains(e.target)) setPowerPanel(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#powerPanel').hidden) { setPowerPanel(false, true); e.preventDefault(); }
  });
  $('#powerDock').addEventListener('focusout', (e) => {
    if (e.relatedTarget && !$('#powerDock').contains(e.relatedTarget)) setPowerPanel(false);
  });
  $('#btnShop').addEventListener('click', () => { unlockAudio(); setPowerPanel(false); openShop(); });
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
    setPowerPanel(false);
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
    const reward = (10 + Math.min(40, save.level * 2)) * (isHard(save.level) ? 2 : 1);
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
    if (G.validating) { G.validationFailed = true; return; }
    const anyBooster = Object.values(save.boosters).some((n) => n > 0);
    const canExtra = bays() < MAX_BAYS;
    sound('fail');
    showModal(`<div class="big">🚌💨</div><h2>Out of space!</h2>
      <p>${G.rules ? 'No passengers can board and no bus can make a legal departure. Try a different order of moves.' : 'The carousel is full and nobody on it matches a bus in the bays.'}</p>
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

  // A bomb bus ran out of moves. Defusing it gives a few more moves.
  function showBoom(b) {
    if (G.won || b.state !== 'lot') { G.boom = null; return; }
    b.shake = 0.6; sound('fail');
    showModal(`<div class="big">💥</div><h2>Boom!</h2>
      <p>A bomb bus ran out of moves before it got out of the lot.</p>
      <button class="btn gold" data-a="defuse" ${save.coins < DEFUSE_PRICE ? 'disabled' : ''}>Defuse it: 3 more moves · ${DEFUSE_PRICE} 🪙</button>
      <button class="btn" data-a="restart">Try again</button>`,
      {
        defuse: () => {
          save.coins -= DEFUSE_PRICE; persist();
          b.bomb = 3; b.flash = 0.4; G.boom = null; closeModal(); updateHUD();
        },
        restart: () => { closeModal(); startLevel(); },
      });
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
      ${G.rules ? '<button class="btn blue" data-a="rules">This level’s rules</button>' : ''}
      <button class="btn gray" data-a="sound">Sound: ${save.sound ? 'On' : 'Off'}</button>`;
    showModal(render(), {
      sound: () => { save.sound = !save.sound; persist(); $('#card').innerHTML = render(); },
      rules: () => { $('#card').innerHTML = '<h2>This level’s rules</h2><ul class="howto">' + A.chapters.filter(([key]) => G.rules.profile[key]).map(([, name, explanation]) => `<li><b>${name}</b> ${explanation}</li>`).join('') + '</ul><button class="btn" data-a="close">Resume</button>'; },
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
    if (G?.validating || !save.sound || !AC) return;
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
  window.__bus = { genLevel, initLevel, update, lotPose, pathHit, lotBuses, obstacles, freeSlot, levelFeatures, startLevel, tryDispatch, canDispatch, runSolution, activeFeed, chuteGateState, chuteGateGeometry, paradeIndicator, feedEntry, chutePoint, ringPoint, seatPoint, draw, get G() { return G; }, get save() { return save; }, get sceneryTime() { return sceneryClock; }, get geometry() { return { cw, ch, ringR, ringYT, ringYB, ringXL, ringXR, ringLen, crowdH, slotTop, ls, lotX, lotY, road }; } };
})();
