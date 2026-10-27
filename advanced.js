// Sarah's Bus Jam. Copyright (C) 2026 Peter Hudson. GPL-3.0-or-later.
// Pure rules for the chapters after level 100. No clocks or screen coordinates.
'use strict';
(() => {
  const chapters = [
    ['road', 'Road crews', 'A road crew closes one exit for the shown number of departures. Bumps and waiting do not advance it.'],
    ['pairs', 'Mixed pairs', 'Passengers now board individually. Rows can contain two pairs of colours; empty places refill without moving the people beside them.'],
    ['caravan', 'Road parades', 'The parade follows the inside edge of the lot on all four sides, including corners. Longer groups block more exits. Faded groups marked 1 and 2 show the next two positions. Each departure advances the parade; the outer driving road stays clear.'],
    ['linked', 'Linked buses', 'Matching outlines and chain numbers identify a pair. Tap either bus to highlight both. They leave together: clear both paths and keep two bays free. The pair counts as two departures.'],
    ['switches', 'Switch pads', 'A bus on the striped switch pad changes the road barriers when it leaves: A opens and B closes. The barrier letters match the pad.'],
    ['trios', 'Pairs and singles', 'Rows can now contain a pair and two single passengers. Every person boards separately.'],
    ['stages', 'Two-stage routes', 'These buses load colour 1 first, then colour 2. Both coloured stages are shown on the roof. Fill both stages to free the bay.'],
    ['alternating', 'Alternating chutes', 'A green open gate feeds passengers; a red lowered gate holds them back. Both gate badges count departures until they switch. An empty chute yields to the other one.'],
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
    p.paradeCount = p.teaching ? 3 : Math.min(12, 4 + Math.floor(Math.max(0, n - 121) / 30));
    return p;
  }
  // Exit sides: right, bottom, left, top. Normalized position along that side.
  function exit(b, bounds = { x0: 0, y0: 0, x1: 330, y1: 290 }) {
    const dx = Math.cos(b.ang), dy = Math.sin(b.ang);
    const tx = dx > 1e-6 ? (bounds.x1 - b.x) / dx : dx < -1e-6 ? (bounds.x0 - b.x) / dx : Infinity;
    const ty = dy > 1e-6 ? (bounds.y1 - b.y) / dy : dy < -1e-6 ? (bounds.y0 - b.y) / dy : Infinity;
    const d = Math.min(tx, ty);
    const side = tx < ty ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
    const width = bounds.x1 - bounds.x0, height = bounds.y1 - bounds.y0;
    return { side, position: side % 2 ? (b.x + dx * d - bounds.x0) / width : (b.y + dy * d - bounds.y0) / height,
      half: b.wid / 2 / (side % 2 ? width : height), d };
  }
  const zone = index => ({ side: Math.floor(index / 3), center: (index % 3 + 0.5) / 3, half: 0.09 });
  const crosses = (b, z) => { const e = exit(b); return e.side === z.side && Math.abs(e.position - z.center) < z.half + e.half; };
  const wrap = (value, length) => ((value % length) + length) % length;
  const caravanPerimeter = c => 2 * (c.bounds.x1 - c.bounds.x0 + c.bounds.y1 - c.bounds.y0);
  function caravanCenter(c, moves) {
    const perimeter = caravanPerimeter(c), t = wrap(c.phase + moves * c.step, perimeter * 2);
    return t <= perimeter ? t : perimeter * 2 - t;
  }
  // Each animal has its own distance along one continuous, rounded route.
  function caravanPoint(c, distance) {
    const { x0, y0, x1, y1 } = c.bounds, w = x1 - x0, h = y1 - y0, perimeter = 2 * (w + h);
    const s = wrap(distance, perimeter), r = Math.min(c.radius, w / 4, h / 4);
    const corners = [[0, x1-r, y0+r, -Math.PI/2], [h, x1-r, y1-r, 0], [h+w, x0+r, y1-r, Math.PI/2], [2*h+w, x0+r, y0+r, Math.PI]];
    for (const [at, x, y, start] of corners) {
      const d = wrap(s - at + perimeter / 2, perimeter) - perimeter / 2;
      if (Math.abs(d) < r) {
        const a = start + (d + r) / (2 * r) * Math.PI / 2;
        return { x: x + r * Math.cos(a), y: y + r * Math.sin(a), tx: -Math.sin(a), ty: Math.cos(a) };
      }
    }
    if (s < h) return { x:x1, y:y0+s, tx:0, ty:1 };
    if (s < h+w) return { x:x1-(s-h), y:y1, tx:-1, ty:0 };
    if (s < 2*h+w) return { x:x0, y:y1-(s-h-w), tx:0, ty:-1 };
    return { x:x0+s-2*h-w, y:y0, tx:1, ty:0 };
  }
  function caravanMembers(c, moves) {
    const center = caravanCenter(c, moves), perimeter = caravanPerimeter(c);
    const forward = wrap(c.phase + moves * c.step, 2 * perimeter) < perimeter;
    return Array.from({ length:c.count }, (_, i) => {
      const p = caravanPoint(c, center + (i - (c.count - 1) / 2) * c.spacing);
      return { ...p, facing: Math.atan2(p.ty, p.tx) + (forward ? 0 : Math.PI) };
    });
  }
  function caravanBlocks(b, c, moves) {
    const e = exit(b, c.bounds), w = c.bounds.x1 - c.bounds.x0, h = c.bounds.y1 - c.bounds.y0;
    const at = [e.position*h, h+(1-e.position)*w, h+w+(1-e.position)*h, 2*h+w+e.position*w][e.side];
    const perimeter = 2*(w+h), d = Math.abs(wrap(at - caravanCenter(c, moves) + perimeter/2, perimeter) - perimeter/2);
    // Include the whole vehicle width and the herd's continuous footprint.
    return d < c.count * c.spacing / 2 + b.wid / 2;
  }
  // Reorder legal departures when a longer herd obstructs the original order.
  function planAroundCaravan(buses, c, pathHit) {
    let remaining = buses.slice(), moves = 0;
    const plan = [], trace = [];
    while (remaining.length) {
      let selected = null;
      for (const b of remaining) {
        const group = b.link ? remaining.filter(o => o.link === b.link) : [b];
        if (group.some(o => pathHit(o, remaining) || caravanBlocks(o, c, moves))) continue;
        selected = group; break;
      }
      if (!selected) return null;
      const b = selected[0];
      selected.forEach(bus => trace.push({bus, moves}));
      if (b.transfer && !b.transferred) {
        plan.push({ids:[b.seq], transfer:true});
        remaining = remaining.map(o => o === b ? {...b, ...b.transfer, transferred:true} : o);
        moves++;
      } else {
        plan.push({ids:selected.map(o => o.seq)});
        remaining = remaining.filter(o => !selected.includes(o));
        moves += selected.length;
      }
    }
    return {plan, trace};
  }
  function blocked(b, rules, moves, switched) {
    if (!rules) return null;
    if (rules.road && moves < rules.road.until && exit(b).side === rules.road.side) return 'road';
    if (rules.caravan && caravanBlocks(b, rules.caravan, moves)) return 'caravan';
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
    let order = L.buses.slice().sort((a, b) => a.seq - b.seq);
    const { pathHit, obbOverlap } = api;
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
    let plan = [], trace = [];
    let moves = 0;
    for (let i = 0; i < order.length; i++) {
      const b = order[i];
      if (b.transfer) { plan.push({ ids: [b.seq], transfer: true }); trace.push({ bus: b, moves }); moves++; }
      const group = b.link ? [b, order[++i]] : [b];
      plan.push({ ids: group.map(o => o.seq) });
      group.forEach(o => trace.push({ bus: o.transfer ? { ...o, ...o.transfer } : o, moves }));
      moves += group.length;
    }
    if (p.caravan) {
      const geometry = api.roadGeometry ? api.roadGeometry(L) : { bounds:{x0:0,y0:0,x1:330,y1:290}, scale:1 };
      const base = { bounds:geometry.bounds, count:p.paradeCount, spacing:22/geometry.scale, radius:12/geometry.scale };
      const perimeter = caravanPerimeter(base), candidates = [];
      for (const speed of [66, 88, 44]) for (let i = 0; i < 96; i++) candidates.push({...base, phase:i*perimeter/48, step:speed/geometry.scale});
      const offset = Math.floor(rng() * candidates.length);
      const phases = candidates.slice(offset).concat(candidates.slice(0, offset));
      let chosen = phases.find(c => trace.every(t => !caravanBlocks(t.bus, c, t.moves)));
      if (!chosen) for (const c of phases.slice(0, 32)) {
        const alternative = planAroundCaravan(order, c, pathHit);
        if (!alternative) continue;
        chosen = c; plan = alternative.plan; trace = alternative.trace;
        order = plan.filter(a => !a.transfer).flatMap(a => a.ids.map(id => L.buses.find(b => b.seq === id)));
        break;
      }
      if (!chosen) return null;
      rules.caravan = chosen;
    }
    if (p.road) {
      const options = [0, 1, 2].map(side => ({ side, until: Math.min(4, trace.find(t => exit(t.bus).side === side)?.moves || 0) })).filter(r => r.until > 0);
      if (!options.length) return null;
      rules.road = options[Math.floor(rng() * options.length)];
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
  const api = { chapters, profile, exit, zone, crosses, caravanPerimeter, caravanCenter, caravanPoint, caravanMembers, caravanBlocks, blocked, stages, loading, decorate };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.Advanced = api;
})();
