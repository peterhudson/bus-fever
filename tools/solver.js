// Plays each level in the generator's winning order with 4 bays and no boosters.
// Usage: python3 -m http.server 8123 & node tools/solver.js FROM TO
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('sarah-bus-jam-v1', JSON.stringify({level:1, seenHowTo:true})));
  await p.goto(process.env.URL || 'http://localhost:8123/'); await p.waitForTimeout(300);
  const res = await p.evaluate(({from, to}) => {
    const B = window.__bus, cv = document.getElementById('game'), fails = [];
    for (let lvl = from; lvl <= to; lvl++) {
      B.save.level = lvl; B.save.bays = 4; B.save.seenPieces = new Proxy({}, { get: () => true }); B.startLevel();
      const G = B.G; let result = 'timeout';
      for (let steps = 0; steps < 80000; steps++) {
        B.update(0.02);
        if (G.won) { result = 'win'; break; }
        if (G.boom) { result = 'boom'; break; }
          if (G.modal) { result = 'stuck'; document.getElementById('modal').hidden = true; G.modal = false; break; }
        const busy = G.buses.some(x => x.state === 'exiting' || x.state === 'flying' || (x.state === 'lot' && x.bumpT > 0));
        if (busy || B.freeSlot() < 0) continue;
        const lot = B.lotBuses(); if (!lot.length) continue;
        const next = lot.reduce((a, x) => (x.seq < a.seq ? x : a));
        const placed = G.buses.filter(x => x.state !== 'lot').length;
        if (next.seq !== placed) continue;   // next in order still inside a tunnel
        const r = cv.getBoundingClientRect(), ps = B.lotPose(next);
        cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + ps.x, clientY: r.top + ps.y, bubbles: true }));
      }
      if (result !== 'win') fails.push(lvl + ':' + result);
    }
    return `levels ${from}-${to}: ${fails.length ? 'FAILED ' + fails.join(' ') : 'all won'}`;
  }, { from: +process.argv[2], to: +process.argv[3] });
  console.log(res, errs.length ? errs : '');
  await b.close();
})();
