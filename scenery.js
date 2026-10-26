// Sarah's Bus Jam. Copyright (C) 2026 Peter Hudson. Licensed under GPL-3.0-or-later, see LICENSE.
// Background scenery: the plaza where the crowd waits (themed per level) and
// the parking lot. Painted once per level into an offscreen canvas.
'use strict';
(() => {
  let ctx = null;

  // ---------- Small drawing helpers (top-down view) ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circle(x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  function shadow(x, y, r) { ctx.fillStyle = 'rgba(15,23,42,0.18)'; ctx.beginPath(); ctx.ellipse(x + r * 0.25, y + r * 0.35, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
  function shrub(x, y, s, c1 = '#3f9e43', c2 = '#5cc45a') {
    shadow(x, y, 7 * s);
    circle(x - 4 * s, y + 1 * s, 5 * s, c1); circle(x + 4 * s, y + 1 * s, 5 * s, c1); circle(x, y - 3 * s, 6 * s, c1);
    circle(x - 1.5 * s, y - 4 * s, 3 * s, c2); circle(x + 3 * s, y - 1 * s, 2.4 * s, c2);
  }
  function tree(x, y, s, c1 = '#2f8a3c', c2 = '#4fb85a') {
    shadow(x, y, 11 * s);
    circle(x, y, 10 * s, c1); circle(x - 3 * s, y - 3 * s, 6 * s, c2); circle(x + 4 * s, y + 2 * s, 3 * s, c2);
  }
  function pine(x, y, s, snow) {
    shadow(x, y, 9 * s);
    for (let i = 0; i < 3; i++) {
      const r = (9 - i * 2.6) * s;
      ctx.fillStyle = i % 2 ? '#2e7d4f' : '#23663f';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr2 = k % 2 ? r * 0.6 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
      ctx.closePath(); ctx.fill();
    }
    if (snow) circle(x - 1 * s, y - 1 * s, 2.5 * s, '#f8fafc');
  }
  function palm(x, y, s) {
    shadow(x, y, 12 * s);
    ctx.fillStyle = '#3aa655';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 6 * s, y + Math.sin(a) * 6 * s, 7 * s, 2.6 * s, a, 0, Math.PI * 2); ctx.fill();
    }
    circle(x, y, 2.6 * s, '#8a5a2b');
  }
  // Street light from above: pole base, arm and a lamp with a warm glow
  function lamp(x, y, dir, s = 1) {
    const g = ctx.createRadialGradient(x + dir * 10 * s, y, 0, x + dir * 10 * s, y, 22 * s);
    g.addColorStop(0, 'rgba(255,236,160,0.45)'); g.addColorStop(1, 'rgba(255,236,160,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + dir * 10 * s, y, 22 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#475569'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dir * 10 * s, y); ctx.stroke();
    circle(x, y, 3 * s, '#334155');
    ctx.fillStyle = '#e2e8f0'; rr(x + dir * 10 * s - 4 * s, y - 2.5 * s, 8 * s, 5 * s, 2 * s); ctx.fill();
    circle(x + dir * 10 * s, y, 1.6 * s, '#fde68a');
  }
  function tent(x, y, w, c1, c2) {
    ctx.fillStyle = 'rgba(15,23,42,0.18)'; rr(x - w / 2 + 3, y - w / 2 + 4, w, w, 3); ctx.fill();
    const n = 6;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? c1 : c2;
      ctx.beginPath(); ctx.moveTo(x, y);
      const a0 = (i / n) * Math.PI * 2 + Math.PI / 4, a1 = ((i + 1) / n) * Math.PI * 2 + Math.PI / 4;
      ctx.lineTo(x + Math.cos(a0) * w * 0.7, y + Math.sin(a0) * w * 0.7); ctx.lineTo(x + Math.cos(a1) * w * 0.7, y + Math.sin(a1) * w * 0.7);
      ctx.closePath(); ctx.fill();
    }
    circle(x, y, 2, '#fff');
  }
  function bunting(x0, y0, x1, y1, sag, cols) {
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1); ctx.stroke();
    const n = Math.max(3, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 12));
    for (let i = 1; i < n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * x0 + 2 * u * t * (x0 + x1) / 2 + t * t * x1, y = u * u * y0 + 2 * u * t * ((y0 + y1) / 2 + sag) + t * t * y1;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 7); ctx.closePath(); ctx.fill();
    }
  }
  function stripes(w, h, a, b, step, vertical) {
    ctx.fillStyle = a; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b;
    for (let v = 0; v < (vertical ? w : h); v += step * 2) vertical ? ctx.fillRect(v, 0, step, h) : ctx.fillRect(0, v, w, step);
  }
  function tiles(w, h, base, line, step) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    for (let x = 0.5; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0.5; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }
  function speckle(w, h, rnd, n, col, r = 1.2) {
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, r * (0.5 + rnd()), 0, Math.PI * 2); ctx.fill(); }
  }
  function waves(w, h, rnd, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    for (let i = 0; i < (w * h) / 900; i++) {
      const x = rnd() * w, y = rnd() * h;
      ctx.beginPath(); ctx.arc(x, y, 5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
  }

  // ---------- Themes ----------
  // Each theme paints the plaza (w x h, the top of the screen). `side` lists
  // free spots beside the carousel where props look good.
  const THEMES = [
    { name: 'Stadium', icon: '🏟️', verge: 'grass', plaza(w, h, rnd, side) {
      stripes(w, h, '#5fbf5a', '#55b350', 22, true);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w / 2, h * 0.45, Math.min(w, h) * 0.22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
      // stands along the top
      for (let r = 0; r < 3; r++) { ctx.fillStyle = ['#94a3b8', '#a8b4c6', '#bcc6d4'][r]; ctx.fillRect(0, r * 9, w, 9); }
      speckle(w, 27, rnd, w / 3, 'rgba(239,68,68,0.8)', 1.4); speckle(w, 27, rnd, w / 4, 'rgba(59,130,246,0.8)', 1.4);
      side.forEach((p) => { ctx.fillStyle = '#f8fafc'; rr(p.x - 9, p.y - 6, 18, 12, 2); ctx.fill(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.stroke(); });
    } },
    { name: 'County fair', icon: '🎡', verge: 'grass', plaza(w, h, rnd, side) {
      ctx.fillStyle = '#86cf6a'; ctx.fillRect(0, 0, w, h);
      speckle(w, h, rnd, w / 2, 'rgba(255,255,255,0.35)', 1);
      ctx.fillStyle = '#d9b77c'; ctx.fillRect(0, h * 0.62, w, 14);  // dirt path
      bunting(0, 10, w, 10, 14, ['#ef4444', '#facc15', '#3b82f6', '#22c55e']);
      side.forEach((p, i) => (i % 2 ? tent(p.x, p.y, 22, '#ef4444', '#fff') : shrub(p.x, p.y, 1.2)));
      // ferris wheel in a corner
      const fx = w * 0.1, fy = h * 0.32, fr = Math.min(28, w * 0.09);
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.stroke();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr); ctx.stroke(); circle(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr, 3.5, ['#ef4444', '#facc15', '#3b82f6', '#a855f7'][k % 4]); }
    } },
    { name: 'Music festival', icon: '🎸', verge: 'grass', plaza(w, h, rnd, side) {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3b2a6b'); g.addColorStop(1, '#6d4fa8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // stage lights sweeping down
      ['rgba(244,114,182,0.25)', 'rgba(96,165,250,0.25)', 'rgba(250,204,21,0.22)'].forEach((c, i) => {
        const x = w * (0.2 + i * 0.3);
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 60 + i * 30, h); ctx.lineTo(x + 20 + i * 30, h); ctx.closePath(); ctx.fill();
      });
      speckle(w, h, rnd, w / 2, 'rgba(255,255,255,0.5)', 0.9);
      side.forEach((p, i) => tent(p.x, p.y, 20, ['#f472b6', '#38bdf8', '#facc15'][i % 3], '#1e1b4b'));
    } },
    { name: 'Airport', icon: '✈️', verge: 'concrete', plaza(w, h, rnd, side) {
      ctx.fillStyle = '#9ca3af'; ctx.fillRect(0, 0, w, h);
      speckle(w, h, rnd, w, 'rgba(255,255,255,0.12)', 1.2);
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(0, h * 0.18); ctx.lineTo(w, h * 0.18); ctx.stroke(); ctx.setLineDash([]);
      // a parked plane in a corner, from above
      const px = w * 0.86, py = h * 0.36, s = Math.min(1.2, w / 330);
      ctx.fillStyle = 'rgba(15,23,42,0.18)'; ctx.beginPath(); ctx.ellipse(px + 4, py + 6, 8 * s, 34 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.ellipse(px, py, 7 * s, 32 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px, py - 6 * s); ctx.lineTo(px + 30 * s, py + 6 * s); ctx.lineTo(px - 30 * s, py + 6 * s); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px, py + 22 * s); ctx.lineTo(px + 12 * s, py + 30 * s); ctx.lineTo(px - 12 * s, py + 30 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2563eb'; ctx.fillRect(px - 1.5 * s, py - 26 * s, 3 * s, 50 * s);
      side.forEach((p) => { ctx.fillStyle = '#f97316'; rr(p.x - 6, p.y - 8, 12, 16, 2); ctx.fill(); });  // baggage carts
    } },
    { name: 'Factory', icon: '🏭', verge: 'concrete', plaza(w, h, rnd, side) {
      tiles(w, h, '#b8b1a6', 'rgba(87,83,78,0.25)', 24);
      ctx.fillStyle = '#facc15'; for (let x = 0; x < w; x += 16) { ctx.save(); ctx.translate(x, h * 0.86); ctx.rotate(-0.6); ctx.fillRect(0, 0, 6, 12); ctx.restore(); }
      ctx.fillStyle = '#7c2d12'; ctx.fillRect(0, 0, w, 16); ctx.fillStyle = '#9a3412';
      for (let x = 0; x < w; x += 14) ctx.fillRect(x, 0, 12, 6);
      side.forEach((p) => { circle(p.x + 2, p.y + 3, 9, 'rgba(15,23,42,0.18)'); circle(p.x, p.y, 9, '#64748b'); circle(p.x, p.y, 5, '#334155'); });  // chimneys from above
    } },
    { name: 'Train station', icon: '🚆', verge: 'concrete', plaza(w, h, rnd, side) {
      tiles(w, h, '#d6d3d1', 'rgba(120,113,108,0.25)', 18);
      ctx.fillStyle = '#facc15'; ctx.fillRect(0, h * 0.2, w, 4);
      ctx.fillStyle = '#78716c'; ctx.fillRect(0, 0, w, h * 0.2);
      ctx.fillStyle = '#a8a29e'; for (let x = 0; x < w; x += 10) ctx.fillRect(x, 2, 5, h * 0.2 - 4);  // sleepers
      ctx.fillStyle = '#e7e5e4'; ctx.fillRect(0, h * 0.06, w, 2); ctx.fillRect(0, h * 0.14, w, 2);  // rails
      side.forEach((p) => { ctx.fillStyle = '#1e3a8a'; rr(p.x - 10, p.y - 4, 20, 8, 2); ctx.fill(); });  // benches
    } },
    { name: 'Ferry port', icon: '⛴️', verge: 'concrete', plaza(w, h, rnd, side) {
      ctx.fillStyle = '#c9b48a'; ctx.fillRect(0, 0, w, h);  // boardwalk
      ctx.strokeStyle = 'rgba(120,85,40,0.35)'; ctx.lineWidth = 1;
      for (let y = 0.5; y < h; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      const sea = h * 0.3;
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(0, 0, w, sea); waves(w, sea, rnd, 'rgba(255,255,255,0.55)');
      // ferry
      const fx = w * 0.82, fy = sea * 0.5;
      ctx.fillStyle = '#f8fafc'; rr(fx - 34, fy - 9, 68, 18, 9); ctx.fill(); ctx.fillStyle = '#ef4444'; rr(fx - 14, fy - 5, 22, 10, 3); ctx.fill();
      side.forEach((p) => { circle(p.x, p.y, 5, '#334155'); circle(p.x, p.y, 2.5, '#94a3b8'); });  // bollards
    } },
    { name: 'School', icon: '🏫', verge: 'grass', plaza(w, h, rnd, side) {
      ctx.fillStyle = '#e8b796'; ctx.fillRect(0, 0, w, h);  // brick-red playground
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      // hopscotch and four square
      for (let i = 0; i < 5; i++) ctx.strokeRect(14, 14 + i * 14, 14, 14);
      ctx.strokeRect(w - 54, 14, 40, 40); ctx.beginPath(); ctx.moveTo(w - 34, 14); ctx.lineTo(w - 34, 54); ctx.moveTo(w - 54, 34); ctx.lineTo(w - 14, 34); ctx.stroke();
      side.forEach((p) => tree(p.x, p.y, 0.9));
    } },
    { name: 'Beach', icon: '🏖️', verge: 'sand', plaza(w, h, rnd, side) {
      ctx.fillStyle = '#f5dfa3'; ctx.fillRect(0, 0, w, h); speckle(w, h, rnd, w, 'rgba(180,140,60,0.25)', 0.9);
      ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.14);
      for (let x = w; x >= 0; x -= 20) ctx.quadraticCurveTo(x - 5, h * 0.18, x - 10, h * 0.14);
      ctx.closePath(); ctx.fill();
      side.forEach((p, i) => {
        if (i % 2) palm(p.x, p.y, 1);
        else { ctx.fillStyle = 'rgba(15,23,42,0.15)'; ctx.beginPath(); ctx.arc(p.x + 3, p.y + 4, 11, 0, Math.PI * 2); ctx.fill(); tent(p.x, p.y, 20, '#f43f5e', '#fff'); }
      });
    } },
    { name: 'Ski resort', icon: '⛷️', verge: 'snow', plaza(w, h, rnd, side) {
      ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, w, h); speckle(w, h, rnd, w / 2, 'rgba(148,163,184,0.35)', 1);
      ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) { const x = rnd() * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 30, h * 0.3, x - 30, h * 0.6, x + 10, h); ctx.stroke(); }  // ski tracks
      side.forEach((p) => pine(p.x, p.y, 1.1, true));
      pine(w * 0.06, h * 0.2, 1.2, true); pine(w * 0.94, h * 0.25, 1.2, true);
    } },
    { name: 'Theme park', icon: '🎢', verge: 'grass', plaza(w, h, rnd, side) {
      tiles(w, h, '#fde68a', 'rgba(217,119,6,0.18)', 20);
      // roller coaster track snaking across the top
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 18); for (let x = 0; x <= w; x += 30) ctx.quadraticCurveTo(x + 15, x % 60 ? 4 : 34, x + 30, 18); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
      side.forEach((p, i) => (i % 2 ? circle(p.x, p.y, 7, ['#f472b6', '#60a5fa', '#a78bfa'][i % 3]) : shrub(p.x, p.y, 1.1)));  // balloons and shrubs
    } },
    { name: 'Downtown', icon: '🏙️', verge: 'concrete', plaza(w, h, rnd, side) {
      tiles(w, h, '#cbd5e1', 'rgba(100,116,139,0.25)', 16);
      // rooftops along the top
      let x = 0;
      while (x < w) {
        const bw = 30 + rnd() * 30, c = ['#64748b', '#475569', '#94a3b8', '#7c8aa0'][Math.floor(rnd() * 4)];
        ctx.fillStyle = c; ctx.fillRect(x, 0, bw - 3, 18 + rnd() * 10);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + 4, 4, 6, 6);
        x += bw;
      }
      side.forEach((p) => tree(p.x, p.y, 0.8));
    } },
  ];

  const VERGE = {
    grass: { base: '#8fd27a', dots: 'rgba(255,255,255,0.3)', prop: (x, y, s) => shrub(x, y, s) },
    concrete: { base: '#cfd6df', dots: 'rgba(100,116,139,0.2)', prop: (x, y, s) => shrub(x, y, s * 0.9, '#3f8f4a', '#5bb562') },
    sand: { base: '#f3dfa6', dots: 'rgba(180,140,60,0.25)', prop: (x, y, s) => palm(x, y, s) },
    snow: { base: '#eef3f8', dots: 'rgba(148,163,184,0.35)', prop: (x, y, s) => pine(x, y, s, true) },
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // g: { cw, ch, crowdH, slotTop, slotH, lot: {x, y, w, h}, ring: {xl, xr, yt, yb, r, belt}, level }
  function paint(c, g) {
    ctx = c;
    const theme = themeFor(g.level), rnd = mulberry32(g.level * 2654435761);
    const { cw, ch, crowdH } = g;

    // Plaza. Props go in the spots beside the carousel, if there's room.
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, crowdH); ctx.clip();
    const side = [];
    const left = g.ring.xl - g.ring.r - g.ring.belt / 2 - 6, right = g.ring.xr + g.ring.r + g.ring.belt / 2 + 6;
    const ys = [crowdH * 0.55, crowdH * 0.82];
    if (left > 30) ys.forEach((y) => side.push({ x: left / 2, y }));
    if (cw - right > 30) ys.forEach((y) => side.push({ x: (right + cw) / 2, y }));
    theme.plaza(cw, crowdH, rnd, side);
    ctx.restore();

    // Parking lot: verge, the road around it, curb, asphalt, painted stalls,
    // lights and shrubs
    const v = VERGE[theme.verge], top = g.slotTop + g.slotH, R = g.road, rw = g.roadW;
    ctx.fillStyle = v.base; ctx.fillRect(0, top, cw, ch - top);
    ctx.fillStyle = v.dots;
    for (let i = 0; i < (cw * (ch - top)) / 400; i++) { ctx.beginPath(); ctx.arc(rnd() * cw, top + rnd() * (ch - top), 1 + rnd(), 0, Math.PI * 2); ctx.fill(); }
    // the road: full width along the top, and a loop round the lot
    const roadPath = () => {
      ctx.beginPath();
      ctx.moveTo(-20, R.y0); ctx.lineTo(cw + 20, R.y0);
      ctx.moveTo(R.x0, R.y0); ctx.lineTo(R.x0, R.y1); ctx.lineTo(R.x1, R.y1); ctx.lineTo(R.x1, R.y0);
    };
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    roadPath(); ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = rw + g.curb * 2; ctx.stroke();
    roadPath(); ctx.strokeStyle = '#4b5563'; ctx.lineWidth = rw; ctx.stroke();
    roadPath(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 7]); ctx.stroke(); ctx.setLineDash([]);
    // asphalt lot inside the loop
    const pad = g.pad, L = { x: g.lot.x - pad, y: g.lot.y - pad, w: g.lot.w + pad * 2, h: g.lot.h + pad * 2 };
    ctx.fillStyle = '#e5e7eb'; rr(L.x - g.curb, L.y - g.curb, L.w + g.curb * 2, L.h + g.curb * 2, 8); ctx.fill();   // curb
    ctx.fillStyle = '#a3abb8'; rr(L.x, L.y, L.w, L.h, 6); ctx.fill();                                               // asphalt
    ctx.save(); rr(L.x, L.y, L.w, L.h, 6); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < (L.w * L.h) / 60; i++) ctx.fillRect(L.x + rnd() * L.w, L.y + rnd() * L.h, 1.5, 1.5);
    // stall lines along the top and bottom edges, a dashed lane down the middle
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    const step = Math.max(18, (g.lot.w / 330) * 26);
    for (let x = L.x + step / 2; x < L.x + L.w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, L.y); ctx.lineTo(x, L.y + 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, L.y + L.h); ctx.lineTo(x, L.y + L.h - 14); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(250,204,21,0.55)'; ctx.setLineDash([12, 10]);
    ctx.beginPath(); ctx.moveTo(L.x + 8, L.y + L.h / 2); ctx.lineTo(L.x + L.w - 8, L.y + L.h / 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // street lights on the lot's corners, props on the verge outside the road
    [[L.x, L.y], [L.x + L.w, L.y], [L.x, L.y + L.h], [L.x + L.w, L.y + L.h]].forEach(([x, y], i) => lamp(x, y, i % 2 ? -1 : 1, 0.8));
    const outL = R.x0 - rw / 2 - g.curb, outR = R.x1 + rw / 2 + g.curb, below = R.y1 + rw / 2 + g.curb;
    if (outL > 16) {
      const sc = Math.min(1, outL / 28);
      for (let y = R.y0 + rw + 20; y < R.y1 - 10; y += 46) { v.prop(outL / 2, y, sc); v.prop((outR + cw) / 2, y + 20, sc); }
    }
    if (ch - below > 18) for (let x = 18; x < cw; x += 44 + rnd() * 20) v.prop(x, (below + ch) / 2, Math.min(0.9, (ch - below) / 30));
  }

  const themeFor = (level) => THEMES[(Math.max(1, level) - 1) % THEMES.length];
  window.Scenery = { paint, themeFor, count: THEMES.length };
})();
