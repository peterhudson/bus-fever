// Like solver.js, but makes ONE mistake per level: at a random point it sends
// a free bus that's well ahead in the winning order, then plays on as well as
// it can (next bus in order whenever a bay frees). Reports how often that
// single mistake loses the level.
// Usage: python3 -m http.server 8123 & node tools/mistake.js '[90,100]' TRIES
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('sarah-bus-jam-v1', JSON.stringify({level:1, seenHowTo:true})));
  await p.goto(process.env.URL || 'http://localhost:8123/'); await p.waitForTimeout(300);
  const res = await p.evaluate(({levels, tries}) => {
    const B = window.__bus, cv = document.getElementById('game'), out = [];
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const lvl of levels) {
      let lost = 0, ran = 0;
      for (let t = 0; t < tries; t++) {
        B.save.level = lvl; B.save.bays = 4; B.save.seenPieces = new Proxy({}, { get: () => true }); B.startLevel();
        const G = B.G, total = G.buses.length + G.tunnels.reduce((a, x) => a + x.queue.length, 0);
        const mistakeAt = 3 + Math.floor(rnd() * total * 0.6); let taps = 0, mistaken = false, result = 'timeout';
        for (let steps = 0; steps < 80000; steps++) {
          B.update(0.02);
          if (G.won) { result = 'win'; break; }
          if (G.boom) { result = 'boom'; break; }
          if (G.modal) { result = 'stuck'; document.getElementById('modal').hidden = true; G.modal = false; break; }
          const busy = G.buses.some(x => x.state === 'exiting' || x.state === 'flying' || (x.state === 'lot' && x.bumpT > 0));
          if (busy || B.freeSlot() < 0) continue;
          const lot = B.lotBuses(); if (!lot.length) continue;
          const obs = B.obstacles(), free = lot.filter(x => !B.pathHit(x, obs) && !x.ice && !x.locked);
          let pick = null;
          if (!mistaken && taps >= mistakeAt) {
            const next = Math.min(...lot.map(x => x.seq));
            const far = free.filter(x => x.seq > next + 3);
            if (far.length) { pick = far[Math.floor(rnd() * far.length)]; mistaken = true; }
          }
          if (!pick) { const ok = free.sort((a, c) => a.seq - c.seq); pick = ok[0]; }
          if (!pick) continue;
          const r = cv.getBoundingClientRect(), ps = B.lotPose(pick);
          cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + ps.x, clientY: r.top + ps.y, bubbles: true }));
          taps++;
        }
        if (!mistaken) continue;
        ran++; if (result !== 'win') lost++;
      }
      out.push(`${lvl}:${lost}/${ran}`);
    }
    return out.join(' ');
  }, { levels: JSON.parse(process.argv[2]), tries: +process.argv[3] || 4 });
  console.log(res);
  await b.close();
})();
