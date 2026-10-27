// Sarah's Bus Jam. Copyright (C) 2026 Peter Hudson. GPL-3.0-or-later.
// Pure rules for the chapters after level 100. No clocks or screen coordinates.
'use strict';
(() => {
  const chapters = [
    ['road', 'Road crews', 'A road crew closes one exit for the shown number of departures. Bumps and waiting do not advance it.'],
    ['pairs', 'Mixed pairs', 'Passengers now board individually. Rows can contain two pairs of colours; empty places refill without moving the people beside them.'],
    ['caravan', 'Elephant parade', 'The elephants move one marked section after each departure. Only exit paths crossing their section are blocked. The dotted section shows their next stop.'],
    ['linked', 'Linked buses', 'Buses with the same chain number leave together. Clear both paths and keep two bays free. The pair advances departure counters by two.'],
    ['switches', 'Switch pads', 'A bus on the striped switch pad changes the road barriers when it leaves: A opens and B closes. The barrier letters match the pad.'],
    ['trios', 'Pairs and singles', 'Rows can now contain a pair and two single passengers. Every person boards separately.'],
    ['stages', 'Two-stage routes', 'These buses load colour 1 first, then colour 2. Both coloured stages are shown on the roof. Fill both stages to free the bay.'],
    ['alternating', 'Alternating chutes', 'The active chute switches every two departures. Its label shows the countdown. When that chute empties, the other one takes over.'],
    ['transfers', 'Transfer tunnels', 'A T-marked bus first travels through tunnel T and returns at the matching outlined space, turned to the shown direction. This takes one departure, but no bay. Tap it again to send it to the station.'],
    ['singles', 'Four-colour rows', 'Rows can contain four different colours. Plan for individual passengers and partially filled buses.'],
  ];
  function profile(n) {
    if (n <= 100) return null;
    const chapter = Math.min(9, Math.floor((n - 101) / 10)), lesson = (n - 101) % 10;
    const keys = n <= 200 ? [chapters[chapter][0]] : [
      ['road', 'pairs', 'linked'], ['caravan', 'stages', 'trios'], ['switches', 'linked', 'singles'],
      ['alternating', 'pairs', 'stages'], ['transfers', 'switches', 'trios'],
      ['caravan', 'linked', 'transfers'], ['alternating', 'singles', 'linked'],
      ['road', 'stages', 'transfers'], ['switches', 'alternating', 'singles'],
      ['caravan', 'switches', 'linked', 'stages', 'alternating', 'transfers', 'singles'],
    ][(n - 201) % 10].slice();
    if (n <= 200 && lesson >= 4 && chapter > 0) keys.push(chapters[chapter - 1][0]);
    const p = Object.fromEntries(keys.map(k => [k, true]));
    p.mix = p.singles ? 1 : p.trios ? 3 : p.pairs ? 2 : 4;
    p.teaching = n <= 200 && lesson < 3;
    p.target = p.teaching ? 18 : Math.min(42, 24 + Math.floor((n - 101) / 20) * 2);
    p.colors = p.teaching ? 4 : Math.min(8, 5 + Math.floor((n - 101) / 40));
    return p;
  }
  // Exit sides: right, bottom, left, top. Normalized position along that side.
  function exit(b) {
    const dx = Math.cos(b.ang), dy = Math.sin(b.ang);
    const tx = dx > 1e-6 ? (330 - b.x) / dx : dx < -1e-6 ? -b.x / dx : Infinity;
    const ty = dy > 1e-6 ? (290 - b.y) / dy : dy < -1e-6 ? -b.y / dy : Infinity;
    const d = Math.min(tx, ty);
    const side = tx < ty ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
    return { side, position: side % 2 ? (b.x + dx * d) / 330 : (b.y + dy * d) / 290,
      half: b.wid / 2 / (side % 2 ? 330 : 290), d };
  }
  const zone = index => ({ side: Math.floor(index / 3), center: (index % 3 + 0.5) / 3, half: 0.09 });
  const crosses = (b, z) => { const e = exit(b); return e.side === z.side && Math.abs(e.position - z.center) < z.half + e.half; };
  function caravanZone(road, moves) {
    const t = (road.phase + moves) % 16;
    // Go down the right, across the bottom, then up the left, and back.
    const index = t <= 8 ? t : 16 - t;
    const z = zone(index);
    if (z.side === 1 || z.side === 2) z.center = 1 - z.center;
    return z;
  }
  function blocked(b, rules, moves, switched) {
    if (!rules) return null;
    if (rules.road && moves < rules.road.until && exit(b).side === rules.road.side) return 'road';
    if (rules.caravan && crosses(b, caravanZone(rules.caravan, moves))) return 'caravan';
    if (rules.switches && crosses(b, rules.switches.zones[switched ? 1 : 0])) return 'switches';
    return null;
  }
  const stages = b => b.stages || [{ color: b.color, count: b.cap }];
  function loading(b) {
    if (!b.stages) return { color: b.color, left: b.cap - b.filled, index: 0 };
    let before = 0;
    for (let index = 0; index < b.stages.length; index++) {
      const stage = b.stages[index];
      if (b.filled < before + stage.count) return { color: stage.color, left: before + stage.count - b.filled, index };
      before += stage.count;
    }
    return { color: stages(b).at(-1).color, left: 0, index: stages(b).length - 1 };
  }

  // Decorate a known clearing order, then verify every planned move against
  // the new road rules. Passenger/bay validation runs through game.update.
  function decorate(L, p, rng, api) {
    const order = L.buses.slice().sort((a, b) => a.seq - b.seq), { pathHit, obbOverlap } = api;
    const rules = { profile: p, switchEvery: p.alternating ? 2 : 0 };
    if (p.stages) {
      order.filter((_, i) => i % 6 === 2).forEach(b => {
        b.mystery = false;
        b.stages = [{ color: b.color, count: b.cap / 2 }, { color: (b.color + 1 + Math.floor(rng() * (p.colors - 1))) % p.colors, count: b.cap / 2 }];
      });
    }
    if (p.transfers) {
      const b = order[Math.min(3, order.length - 1)];
      let destination = null;
      for (let y = 30; y <= 260 && !destination; y += 24) for (let x = 30; x <= 300 && !destination; x += 24) {
        const candidate = { ...b, x, y, ang: b.ang + Math.PI / 2, len: b.len + 8, wid: b.wid + 8 };
        const pts = api.corners(x, y, candidate.ang, candidate.len, candidate.wid);
        if (pts.some(([px, py]) => px < 4 || px > 326 || py < 4 || py > 286)) continue;
        if (L.buses.some(o => obbOverlap(candidate, o)) || pathHit(candidate, order.filter(o => o.seq > b.seq))) continue;
        destination = { x, y, ang: candidate.ang };
      }
      if (!destination) return null;
      b.transfer = { ...destination, label: 'T' }; b.mystery = false;
    }
    if (p.linked) {
      let linked = 0;
      for (let i = 0; i < order.length - 1; i++) {
        const a = order[i], b = order[i + 1];
        if (a.transfer || b.transfer || a.link || b.link || pathHit(b, order.slice(i))) continue;
        a.link = b.link = ++linked;
        if (linked === (p.teaching ? 1 : 2)) break;
        i++;
      }
      if (!linked) return null;
    }
    const plan = [], trace = [];
    let moves = 0;
    for (let i = 0; i < order.length; i++) {
      const b = order[i];
      if (b.transfer) { plan.push({ ids: [b.seq], transfer: true }); trace.push({ bus: b, moves }); moves++; }
      const group = b.link ? [b, order[++i]] : [b];
      plan.push({ ids: group.map(o => o.seq) });
      group.forEach(o => trace.push({ bus: o.transfer ? { ...o, ...o.transfer } : o, moves }));
      moves += group.length;
    }
    if (p.road) {
      const options = [0, 1, 2].map(side => ({ side, until: Math.min(4, trace.find(t => exit(t.bus).side === side)?.moves || 0) })).filter(r => r.until > 0);
      if (!options.length) return null;
      rules.road = options[Math.floor(rng() * options.length)];
    }
    if (p.caravan) {
      const phases = Array.from({ length: 16 }, (_, phase) => ({ phase })).filter(road => trace.every(t => !crosses(t.bus, caravanZone(road, t.moves))));
      if (!phases.length) return null;
      rules.caravan = phases[Math.floor(rng() * phases.length)];
    }
    if (p.switches) {
      const options = [];
      for (let i = 2; i < order.length - 2; i++) {
        const pad = order[i];
        if (pad.transfer || pad.link) continue;
        const turn = trace.find(t => t.bus.seq === pad.seq).moves;
        const before = trace.filter(t => t.moves <= turn), after = trace.filter(t => t.moves > turn);
        const openLater = Array.from({ length: 9 }, (_, j) => zone(j)).filter(z => before.every(t => !crosses(t.bus, z)) && after.some(t => crosses(t.bus, z)));
        const closeLater = Array.from({ length: 9 }, (_, j) => zone(j)).filter(z => after.every(t => !crosses(t.bus, z)) && before.some(t => crosses(t.bus, z)));
        if (openLater.length && closeLater.length) options.push({ pad, zones: [openLater[0], closeLater[0]] });
      }
      if (!options.length) return null;
      const pick = options[Math.floor(rng() * options.length)];
      pick.pad.switchPad = true; rules.switches = { zones: pick.zones };
    }
    // Four active buses at most. A linked pair is never split across batches.
    const queue = [];
    for (let offset = 0; offset < order.length;) {
      let end = Math.min(order.length, offset + 4);
      if (end < order.length && order[end - 1].link && order[end - 1].link === order[end].link) end--;
      const active = order.slice(offset, end).map(b => stages(b).map(s => ({ ...s })));
      let rowPosition = 0, previous = -1;
      while (active.some(s => s.length)) {
        const choices = active.map((s, i) => s.length ? i : -1).filter(i => i >= 0);
        const different = choices.filter(i => active[i][0].color !== previous);
        const pool = different.length ? different : choices;
        const chosen = pool[Math.floor(rng() * pool.length)], stage = active[chosen][0];
        const unit = p.mix === 4 ? 4 : p.mix === 2 ? 2 : p.mix === 3 && rowPosition % 4 === 0 ? 2 : 1;
        const count = Math.min(unit, stage.count);
        for (let j = 0; j < count; j++) queue.push(stage.color);
        stage.count -= count; rowPosition += count; previous = stage.color;
        if (!stage.count) active[chosen].shift();
      }
      offset = end;
    }
    L.queue = queue; L.rules = rules; L.solution = plan;
    return L;
  }
  const api = { chapters, profile, exit, zone, crosses, caravanZone, blocked, stages, loading, decorate };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.Advanced = api;
})();
