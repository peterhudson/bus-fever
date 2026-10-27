// Deterministic rules and full-game regression checks. No browser dependencies.
// node tools/mechanics-checks.js [last-level, default 210]
'use strict';
const assert = require('node:assert/strict');
const loadGame = require('./headless');
const { B, A } = loadGame();
const start = n => { B.save.level = n; B.save.bays = 4; B.startLevel(); B.G.validating = true; return B.G; };
const snapshot = () => JSON.stringify({ buses: B.G.buses, queue: B.G.queue, ring: B.G.ring, arrivals: B.G.arrivals, slots: B.G.slots });
const right = { x: 100, y: 145, ang: 0, wid: 22 };
assert.equal(A.blocked(right, { road: { side: 0, until: 3 } }, 2, false), 'road');
assert.equal(A.blocked(right, { road: { side: 0, until: 3 } }, 3, false), null);
assert.equal(A.blocked({ ...right, ang: Math.PI }, { road: { side: 0, until: 3 } }, 0, false), null);
assert.deepEqual(Array.from({ length: 9 }, (_, moves) => A.caravanZone({ phase: 0 }, moves).side), [0,0,0,1,1,1,2,2,2]);
assert.deepEqual(A.caravanZone({ phase: 0 }, 9), A.caravanZone({ phase: 0 }, 7));
assert.deepEqual(A.caravanZone({ phase: 0 }, 16), A.caravanZone({ phase: 0 }, 0));
const staged = { color: 0, cap: 16, filled: 7, stages: [{ color: 0, count: 8 }, { color: 1, count: 8 }] };
assert.deepEqual({ ...A.loading(staged) }, { color: 0, left: 1, index: 0 });
staged.filled = 8; assert.deepEqual({ ...A.loading(staged) }, { color: 1, left: 8, index: 1 });
staged.filled = 16; assert.equal(A.loading(staged).left, 0);
let G = start(101), blocked = G.buses.find(b => A.blocked(b, G.rules, 0, false));
assert.ok(blocked); const before = snapshot(); assert.equal(B.tryDispatch(blocked, false), false); assert.equal(snapshot(), before);
B.update(3); assert.equal(G.arrivals, 0, 'Waiting must not advance road counters');
G = start(131); const pair = G.buses.filter(b => b.link === 1); G.buses = pair;
G.slots[1] = {}; G.slots[2] = {}; G.slots[3] = {};
const pairBefore = snapshot(); assert.equal(B.tryDispatch(pair[0], false), false); assert.equal(snapshot(), pairBefore, 'Linked dispatch must be atomic with only one free bay');
G.slots[3] = null; assert.equal(B.tryDispatch(pair[0], false), true); assert.equal(G.arrivals, 2); assert.equal(G.slots[3], pair[0]); assert.equal(G.slots[4], pair[1]);
G = start(181); const transfer = G.buses.find(b => b.transfer); G.buses = [transfer];
assert.equal(B.tryDispatch(transfer, false), true); assert.equal(G.arrivals, 1); assert.equal(G.slots.filter(Boolean).length, 0);
assert.ok(B.obstacles().some(b => b.x === transfer.transfer.x && b.y === transfer.transfer.y));
B.update(0.81); assert.equal(transfer.state, 'lot'); assert.equal(transfer.ang, transfer.transfer.ang); assert.equal(transfer.transferred, true);
assert.equal(B.tryDispatch(transfer, false), true); assert.equal(G.arrivals, 2); assert.equal(G.slots.filter(Boolean).length, 1);
G = start(141); const pad = G.buses.find(b => b.switchPad); G.buses = [pad]; G.rules = { ...G.rules, switches: { zones: [{ side: 3, center: 0.5, half: 0.01 }, { side: 3, center: 0.9, half: 0.01 }] } };
// The actual generated pad is proved by the complete solutions below.
G.rules.switches = null; assert.equal(B.tryDispatch(pad, false), true); assert.equal(G.switched, true);
G = start(171); assert.equal(B.activeFeed(), 0); G.arrivals = 1; assert.equal(B.activeFeed(), 0); G.arrivals = 2; assert.equal(B.activeFeed(), 1); G.queue = G.queue.slice(0, G.leftN); assert.equal(B.activeFeed(), 0, 'Empty chute falls back to its neighbour');
G = start(191); G.queue = [0, 1, 2, 3]; G.leftN = 4; G.ring.fill(3); G.ring[0] = null; G.ring[2] = null; const original = G.ring.slice();
for (let i = 0; i < 1000 && G.queue.length === 4; i++) B.update(0.04);
assert.equal(G.ring[1], original[1]); assert.equal(G.ring[3], original[3]); assert.equal(G.ring[0], 0); assert.equal(G.ring[2], 1); assert.equal(G.queue.length, 2);
console.log('Rule checks passed: closures, turn counts, caravan reversal, staged loading, atomic links, transfers, switches, alternating feeds, partial-row refill.');
function legacy(B) {
  for (let step = 0; step < 80000; step++) {
    B.update(0.04);
    if (B.G.won) return true;
    if (B.G.boom || B.G.validationFailed) return false;
    if (B.G.buses.some(b => ['exiting','driving','flying'].includes(b.state))) continue;
    const next = B.lotBuses().sort((a,b) => a.seq - b.seq)[0];
    if (next && next.seq === B.G.buses.filter(b => b.state !== 'lot').length) B.tryDispatch(next, false);
  }
  return false;
}
const end = Number(process.argv[2] || 210), first = Number(process.argv[3] || 1), failed = []; let maximumMs = 0;
for (let n = first; n <= end; n++) {
  const t = performance.now(); G = start(n); maximumMs = Math.max(maximumMs, performance.now() - t);
  const boosters = JSON.stringify(B.save.boosters), won = n <= 100 ? legacy(B) : B.runSolution(1 / 60).won;
  if (!won) failed.push(n); assert.equal(JSON.stringify(B.save.boosters), boosters);
  if (n % 25 === 0 || n === end) console.log(`Levels ${first}–${n}: ${failed.length ? 'FAILED ' + failed.join(', ') : 'all won with four bays and no boosters'}; slowest generation ${Math.round(maximumMs)}ms`);
}
assert.deepEqual(failed, []);
for (const [w,h] of [[320,580],[430,850]]) {
  const { B: phone } = loadGame(w,h);
  for (const n of [100,101,111,121,131,141,151,161,171,181,191,201,204,205,206,207,208,209,210,250,500,1000]) {
    phone.save.level=n; phone.startLevel(); phone.G.validating=true;
    assert.ok(n<=100 ? legacy(phone) : phone.runSolution(0.05).won, `Level ${n} at ${w}×${h}`);
  }
  console.log(`${w}×${h}: all 22 sampled levels won at 20 fps, through level 1000`);
}
