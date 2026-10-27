// Browser regression checks for the compact controls and animated themes.
// With a local server running: node tools/ui-checks.js
async function checkUI() {
  const B = window.__bus, $ = s => document.querySelector(s), results = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    results.push(message);
  };
  const start = () => {
    B.save.level = 100; B.save.bays = 4; B.save.sound = false;
    B.save.seenPieces = new Proxy({}, { get: () => true });
    B.startLevel(); B.G.modal = false; $('#modal').hidden = true;
  };
  const press = b => {
    const p = B.lotPose(b), r = $('#game').getBoundingClientRect();
    $('#game').dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + p.x, clientY: r.top + p.y, pointerType: 'touch', bubbles: true }));
  };
  start();
  check($('#powerPanel').hidden && $('#btnBoosters').getAttribute('aria-expanded') === 'false', 'Power-ups start collapsed');
  B.save.boosters = { vip: 3, shuffle: 0, sort: 5 };
  B.startLevel();
  $('#btnBoosters').click();
  check(!$('#powerPanel').hidden && $('#btnBoosters').getAttribute('aria-expanded') === 'true', 'Power-ups expand on tap');
  for (const [key, n] of Object.entries(B.save.boosters)) check($(`[data-k="${key}"] .cnt`).textContent === String(n), `${key} shows its exact inventory, including zero`);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check($('#powerPanel').hidden && document.activeElement === $('#btnBoosters'), 'Escape closes the tray and restores focus');
  $('#btnBoosters').click();
  $('#btnBoosters').click();
  check($('#powerPanel').hidden, 'A second tap collapses the tray');
  const free = B.lotBuses().find(b => !b.ice && b.lock == null && !B.pathHit(b, B.obstacles()));
  check(!!free, 'Fixture has a movable bus');
  $('#btnBoosters').click();
  press(free);
  check($('#powerPanel').hidden && free.state === 'lot', 'Tapping the lot dismisses the tray without moving a bus');
  const hidden = B.lotBuses().find(b => b.mystery && !b.ice && b.lock == null);
  check(!!hidden, 'Fixture has a hidden mystery bus');
  press(hidden);
  check(hidden.mystery && hidden.state === 'lot', 'Blocked mystery buses still stay hidden');
  $('#btnBoosters').click(); $('[data-k="vip"]').click();
  check($('#powerPanel').hidden && B.G.vipMode && B.save.boosters.vip === 3, 'Selecting VIP closes the tray and arms VIP without spending it');
  press(free);
  check(free.state === 'flying' && free.slot === 0 && B.save.boosters.vip === 2 && !B.G.vipMode, 'Selecting a bus spends exactly one VIP and flies it to the VIP bay');
  start();
  const parked = B.G.buses[0];
  Object.assign(parked, { state: 'slot', slot: 1, color: 0, cap: 16, filled: 0 });
  B.G.slots[1] = parked; B.G.ring.fill(1); B.G.queue = [1, 1, 1, 1, 0, 0, 0, 0, 2, 2, 2, 2];
  $('#btnBoosters').click(); $('[data-k="sort"]').click();
  check($('#powerPanel').hidden && B.save.boosters.sort === 4 && B.G.queue.slice(0, 4).every(c => c === 0), 'Sort from the tray moves matching passengers forward and spends one charge');
  start();
  B.G.buses = B.G.buses.slice(0, 2);
  B.G.buses.forEach((b, i) => { b.cap = 16; b.color = i; });
  B.save.boosters.shuffle = 2;
  const random = Math.random;
  try {
    Math.random = () => 0;
    $('#btnBoosters').click(); $('[data-k="shuffle"]').click();
  } finally { Math.random = random; }
  check($('#powerPanel').hidden && B.save.boosters.shuffle === 1 && B.G.buses[0].color === 1 && B.G.buses[1].color === 0, 'Shuffle from the tray swaps colours and spends one charge');
  B.save.boosters.shuffle = 0;
  start();
  $('#btnBoosters').click(); $('[data-k="shuffle"]').click();
  check(B.G.modal && !$('#modal').hidden && $('#powerPanel').hidden && B.save.boosters.shuffle === 0, 'An empty booster opens Shop without spending inventory');
  $('#card [data-a="close"]').click();
  $('#btnShop').click();
  check(B.G.modal && $('#card').textContent.includes('Shop'), 'The relocated Shop button opens Shop');
  $('#card [data-a="close"]').click();
  $('#btnBoosters').click(); $('#btnMenu').click();
  check($('#powerPanel').hidden && B.G.modal, 'Opening a modal closes the tray');
  $('#card [data-a="close"]').click();
  $('#btnBoosters').click(); B.startLevel();
  check($('#powerPanel').hidden, 'Starting a level closes the tray');
  const nextFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  B.G.modal = true;
  const pausedTime = B.sceneryTime;
  await nextFrames();
  check(B.sceneryTime === pausedTime, 'Scenery animation pauses with the game');
  B.G.modal = false;
  const runningTime = B.sceneryTime;
  await nextFrames();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  check(reduced ? B.sceneryTime === runningTime : B.sceneryTime > runningTime, reduced ? 'Reduce Motion keeps scenery still' : 'Scenery animation resumes with the game');

  const gameRect = $('#game').getBoundingClientRect(), powerRect = $('#btnBoosters').getBoundingClientRect(), shopRect = $('#btnShop').getBoundingClientRect();
  check(powerRect.width >= 44 && powerRect.height >= 44 && shopRect.width >= 44 && shopRect.height >= 44, 'Both compact controls retain 44px touch targets');
  check(powerRect.left >= gameRect.left && shopRect.right <= gameRect.right && powerRect.bottom < gameRect.top + 224 && shopRect.bottom < gameRect.top + 224, 'Controls fit beside the carousel on this screen');
  $('#btnBoosters').click();
  const panelRect = $('#powerPanel').getBoundingClientRect();
  check(panelRect.right <= gameRect.right && panelRect.bottom <= gameRect.bottom, 'Expanded tray stays inside the phone screen');
  $('#btnBoosters').click();

  const cv = document.createElement('canvas'); cv.width = 390; cv.height = 720;
  const context = cv.getContext('2d', { willReadFrequently: true });
  const geometry = { cw: 390, ch: 720, crowdH: 214, slotTop: 214, slotH: 60, roadW: 16,
    asphalt: { x: 18, y: 292, w: 354, h: 410 }, road: { x0: 8, x1: 382, y0: 282, y1: 712 },
    lot: { x: 20, y: 310, w: 350, h: 370 }, ring: { xl: 157, xr: 233, yt: 110, yb: 186, r: 38, belt: 44 } };
  for (const level of [...Array.from({length:12},(_,i)=>i+1),121,122]) {
    const g = { ...geometry, level };
    window.Scenery.paint(context, g);
    const lotBefore = context.getImageData(0, 214, 390, 506).data.slice();
    window.Scenery.animate(context, g, 0);
    const first = context.getImageData(0, 0, 390, 214).data.slice();
    window.Scenery.paint(context, g); window.Scenery.animate(context, g, 3);
    const second = context.getImageData(0, 0, 390, 214).data;
    const lotAfter = context.getImageData(0, 214, 390, 506).data;
    check(first.some((v, i) => v !== second[i]), `${window.Scenery.themeFor(level).name} has animated scenery`);
    check(lotBefore.every((v, i) => v === lotAfter[i]), `${window.Scenery.themeFor(level).name} animation stays out of the parking lot`);
  }
  return results;
}

if (typeof module !== 'undefined') {
  module.exports = checkUI;
  if (require.main === module) (async () => {
    const { chromium } = require('playwright');
    const checkAdvancedUI = require('./advanced-ui-checks');
    const browser = await chromium.launch();
    try {
      for (const [width, height, reducedMotion] of [[320, 667, 'no-preference'], [390, 844, 'no-preference'], [430, 932, 'no-preference'], [390, 844, 'reduce']]) {
        const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
        await page.goto(process.env.URL || 'http://localhost:8123/');
        const results = [...await page.evaluate(checkUI), ...await page.evaluate(checkAdvancedUI)];
        console.log(`${width}×${height} (${reducedMotion}): ${results.length} checks passed`);
        await page.close();
      }
    } finally { await browser.close(); }
  })().catch(e => { console.error(e); process.exitCode = 1; });
}
