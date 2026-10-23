// Plays levels 1-50 with a simple "dig out the blocked bus" strategy and
// prints win/stuck per level. Used to check level difficulty.
// Usage: python3 -m http.server 8123 & node tools/autoplay.js [bays]
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('sarah-bus-jam-v1', JSON.stringify({level:1, seenHowTo:true})));
  await p.goto('process.env.URL || "http://localhost:8123/"');
  await p.waitForTimeout(300);
  const res = await p.evaluate(({bays}) => {
    const B = window.__bus, cv = document.getElementById('game');
    const out = [];
    for (let lvl = 1; lvl <= 50; lvl++) {
      B.save.level = lvl; B.save.bays = bays; B.startLevel();
      const G = B.G; let taps = 0, steps = 0, result = 'timeout';
      while (steps++ < 60000) {
        B.update(0.02);
        if (G.won) { result = 'win'; break; }
        if (G.modal) { result = 'stuck'; document.getElementById('modal').hidden = true; G.modal = false; break; }
        const busy = G.particles.length || G.buses.some(x => x.state==='exiting'||x.state==='flying'||(x.state==='lot'&&x.bumpT>0));
        if (busy || B.freeSlot() < 0) continue;
        // demand: colors in queue order not covered by bay capacity
        const cover = {}; for (const x of G.buses) if (x.state==='slot') cover[x.color]=(cover[x.color]||0)+x.cap-x.filled;
        const front = G.queue[0];
        if (cover[front] > 0) continue;
        const lot = B.lotBuses(), free = lot.filter(x => !B.pathHit(x, lot));
        let best=null, bi=Infinity;
        for (const x of free) { let i = G.queue.findIndex((c,k)=> c===x.color); if (i<0) i=1e9; if (i<bi){bi=i;best=x;} }
        if (best && best.color !== front) {
          // dig: follow the blocker chain from the least-buried front-color bus
          let bestChain = null;
          for (const t of lot.filter(x => x.color === front)) {
            let cur = t, chain = 0;
            for (let g = 0; g < 20; g++) { const h = B.pathHit(cur, lot); if (!h) break; cur = h.other; chain++; }
            if (!B.pathHit(cur, lot) && (!bestChain || chain < bestChain[1])) bestChain = [cur, chain];
          }
          if (bestChain && B.freeSlot() >= 0) best = bestChain[0];
        }
        if (!best) continue;
        const r = cv.getBoundingClientRect(), ps = B.lotPose(best);
        cv.dispatchEvent(new PointerEvent('pointerdown', {clientX: r.left+ps.x, clientY: r.top+ps.y, bubbles:true}));
        taps++;
      }
      out.push(`${lvl}:${result}`);
    }
    return out.join(' ');
  }, {bays: +process.argv[2] || 4});
  console.log(res); console.log('errors', errs);
  await b.close();
})();
