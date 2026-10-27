// Sarah's Bus Jam. Copyright (C) 2026 Peter Hudson. Licensed under GPL-3.0-or-later, see LICENSE.
// Background scenery: the plaza where the crowd waits (themed per level) and
// the parking lot. Detailed scenery is cached; lightweight props animate on top.
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

  // Miniature scenery is drawn in CSS pixels, with soft offset shadows and
  // raised roofs. Only a few moving props are redrawn each frame.
  function box(x, y, w, h, fill, radius = 3) {
    ctx.fillStyle = fill; rr(x, y, w, h, radius); ctx.fill();
  }
  function line(points, color, width = 1) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  }
  function poly(points, color) {
    ctx.fillStyle = color; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
  }
  function wash(w, h, top, bottom) {
    const gradient = ctx.createLinearGradient(0, 0, w * 0.3, h);
    gradient.addColorStop(0, top); gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  }
  function roof(x, y, w, h, color, trim = '#fff3d6') {
    box(x + 4, y + 9, w, h, '#18383b25', 5);
    box(x, y + 5, w, h, trim, 4);
    box(x, y, w, h, color, 4);
    poly([[x + 2, y + 2], [x + w / 2, y + h / 2], [x + w - 2, y + 2]], '#ffffff28');
    poly([[x + 2, y + h - 2], [x + w / 2, y + h / 2], [x + w - 2, y + h - 2]], '#122b3b20');
    line([[x + 5, y + h / 2], [x + w - 5, y + h / 2]], '#ffffff40');
  }
  function windows(x, y, count, color = '#acdce2', size = 5) {
    for (let i = 0; i < count; i++) { box(x + i * (size + 4), y, size, 5, color, 1); }
  }
  function flowerbed(x, y, width, rnd, flowers = '#ffe5a1') {
    box(x + 2, y + 3, width, 11, '#25493c20', 5);
    box(x, y, width, 11, '#e6d9b7', 5); box(x + 2, y + 2, width - 4, 7, '#42855b', 4);
    for (let i = 4; i < width - 3; i += 5) circle(x + i, y + 3 + rnd() * 5, 1.7, flowers);
  }
  function bench(x, y, vertical = false) {
    ctx.save(); ctx.translate(x, y); if (vertical) ctx.rotate(Math.PI / 2);
    box(-10, -3, 23, 9, '#1e3b3a22', 2);
    line([[-7, -5], [-7, 6]], '#46686c', 2); line([[7, -5], [7, 6]], '#46686c', 2);
    box(-11, -4, 22, 3, '#c48b4e', 1); box(-11, 0, 22, 3, '#e9b674', 1); ctx.restore();
  }
  function fence(x, y, w, color = '#f4edd3') {
    line([[x, y + 2], [x + w, y + 2]], color, 2);
    for (let v = 0; v <= w; v += 7) box(x + v, y - 3, 2, 11, color, 1);
  }
  function sign(x, y, text, color = '#27566b') {
    ctx.font = '800 7px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const width = ctx.measureText(text).width + 14;
    box(x - width / 2, y - 6, width, 13, '#17344222', 3);
    box(x - width / 2, y - 8, width, 13, color, 3);
    ctx.fillStyle = '#fff9e6'; ctx.fillText(text, x, y - 1);
  }
  function flag(x, y, color, time = 0) {
    line([[x, y], [x, y + 22]], '#f7f4df', 2);
    const flutter = Math.sin(time * 1.8) * 2;
    poly([[x + 1, y], [x + 17, y + 2 + flutter], [x + 15, y + 12 + flutter], [x + 1, y + 10]], color);
    line([[x + 2, y + 2], [x + 13, y + 4 + flutter]], '#ffffff50', 1);
  }
  function plane(x, y, scale = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.translate(2, 3);
    poly([[-27, 0], [-5, -4], [4, -23], [11, -23], [7, -3], [24, -2], [28, -10], [32, -10], [30, 0], [32, 10], [28, 10], [24, 2], [7, 3], [11, 23], [4, 23], [-5, 4]], '#1c45502b');
    ctx.translate(-2, -3);
    poly([[-27, 0], [-5, -4], [4, -23], [11, -23], [7, -3], [24, -2], [28, -10], [32, -10], [30, 0], [32, 10], [28, 10], [24, 2], [7, 3], [11, 23], [4, 23], [-5, 4]], '#f7fcff');
    line([[-17, 0], [25, 0]], '#2a87ac', 2); box(-19, -2, 4, 4, '#2d536a', 1);
    ctx.restore();
  }
  function ferry(x, y) {
    ctx.save(); ctx.translate(x, y);
    line([[-45, -6], [-35, -3]], '#ffffff70', 2); line([[-47, 5], [-36, 3]], '#ffffff70', 2);
    box(-32, -12, 65, 28, '#08597433', 11);
    box(-32, -15, 65, 28, '#f9f4db', 11); box(-28, -11, 54, 20, '#326e91', 7);
    box(-21, -8, 39, 14, '#fffdf1', 3); windows(-16, -4, 4, '#64b9ca', 4);
    box(-5, -7, 10, 12, '#ef785f', 2); line([[23, -8], [23, 5]], '#e7c477', 2);
    ctx.restore();
  }
  function taxi(x, y, color = '#f5c557') {
    box(x + 2, y + 3, 23, 11, '#18313f30', 4); box(x, y, 23, 11, color, 4);
    box(x + 6, y + 1, 10, 9, '#325869', 2); box(x + 9, y + 2, 4, 7, color, 1);
    circle(x + 2, y + 2, 1, '#fff2b8'); circle(x + 2, y + 9, 1, '#fff2b8');
  }

  const THEMES = [
    { name: 'Stadium', icon: '🏟️', garden: '#94c781', asphalt: '#a3b3ac', curb: '#e2e6ce', plaza(w, h, rnd) {
      stripes(w, h, '#82bd74', '#8bc57b', 23, true);
      ctx.strokeStyle = '#df936e'; ctx.lineWidth = 16; ctx.beginPath(); ctx.ellipse(w / 2, 80, w * 0.4, 64, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#f8e3c3'; ctx.lineWidth = 1;
      for (const r of [60, 65, 70]) { ctx.beginPath(); ctx.ellipse(w / 2, 80, w * 0.4, r, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = '#f4f6dbb0'; ctx.strokeRect(w / 2 - 62, 32, 124, 93);
      ctx.beginPath(); ctx.arc(w / 2, 79, 20, 0, Math.PI * 2); ctx.stroke(); line([[w / 2 - 62, 79], [w / 2 + 62, 79]], '#f4f6dbb0');
      roof(w / 2 - 65, 5, 130, 29, '#4f8196');
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 18; i++) box(w / 2 - 59 + i * 6.5, 9 + row * 7, 4, 4, ['#ffd77c', '#e96f65', '#fff4dc', '#67bec5'][(i + row) % 4], 1);
      }
      sign(w / 2, 15, 'HOME  2 : 1  AWAY', '#304c5c');
      [20, w - 20].forEach(x => { tree(x, 82, 1.2); bench(x, 109); });
      fence(12, h - 12, 40); fence(w - 52, h - 12, 40);
    } },
    { name: 'County fair', icon: '🎡', garden: '#9cc782', asphalt: '#b2b3a1', curb: '#f3dfb2', plaza(w, h, rnd) {
      wash(w, h, '#a5cf7c', '#cadb9e');
      line([[0, 99], [w * 0.3, 82], [w * 0.7, 82], [w, 110]], '#efd4a1', 26);
      line([[w / 2, 58], [w / 2, h]], '#f5dfb5', 23);
      for (const [x, c] of [[28, '#f2807c'], [w - 29, '#76bbd2'], [w / 2 - 77, '#d18cb4'], [w / 2 + 77, '#eebc55']]) {
        tent(x, 57, 28, c, '#fff2cf'); box(x - 11, 72, 22, 10, c, 2); windows(x - 7, 73, 2, '#fff3d2');
      }
      line([[w / 2 - 16, 84], [w / 2, 42], [w / 2 + 16, 84]], '#6a8e9c', 4);
      box(w / 2 - 24, 82, 48, 8, '#e7bf79', 3);
      bunting(0, 10, w, 10, 18, ['#f38181', '#f3ca62', '#68b8d0', '#b194cf']);
      flowerbed(9, h - 17, 42, rnd); flowerbed(w - 51, h - 17, 42, rnd, '#f4b0a7');
      sign(w / 2, 105, 'THE FAIR', '#bd7167');
    } },
    { name: 'Music festival', icon: '🎸', garden: '#777298', asphalt: '#9a9dac', curb: '#c8c5d8', plaza(w, h, rnd) {
      wash(w, h, '#343653', '#8a7698');
      speckle(w, h, rnd, 100, '#f8dfaa60', 0.8);
      roof(w / 2 - 68, 10, 136, 47, '#4d5376', '#a59cb9');
      box(w / 2 - 48, 19, 96, 31, '#25283f', 3);
      for (const x of [w / 2 - 61, w / 2 + 50]) {
        box(x, 24, 11, 26, '#20283b', 2); circle(x + 5.5, 31, 3, '#576780'); circle(x + 5.5, 43, 3, '#576780');
      }
      line([[w / 2 - 68, 13], [w / 2 + 68, 13]], '#b0b0c8', 2);
      for (let i = 0; i < 7; i++) circle(w / 2 - 59 + i * 20, 13, 2, ['#f5a7d9', '#9ae5ed', '#ffe09b'][i % 3]);
      [25, w - 25].forEach((x, i) => { tent(x, 65, 30, i ? '#66bbce' : '#da8eae', '#f8e4c7'); bench(x, 91); });
      bunting(0, 4, w, 4, 5, ['#f7d89d', '#eaa3bf', '#a7d9e4']);
      sign(w / 2, 63, 'LIVE TONIGHT', '#69557b');
    } },
    { name: 'Airport', icon: '✈️', garden: '#b5c9ba', asphalt: '#aab5be', curb: '#e0e6df', plaza(w, h, rnd) {
      tiles(w, h, '#bfcecd', '#8aa3a429', 30);
      box(0, 76, w, 31, '#72939b', 0);
      ctx.setLineDash([10, 10]); line([[0, 92], [w, 92]], '#f9d580', 2); ctx.setLineDash([]);
      roof(w / 2 - 70, 12, 140, 38, '#6195a9', '#e7edf0');
      for (let i = 0; i < 6; i++) { box(w / 2 - 62 + i * 21, 17, 15, 23, '#94ced7', 2); line([[w / 2 - 61 + i * 21, 18], [w / 2 - 49 + i * 21, 38]], '#d0eef375'); }
      box(w / 2 - 17, 45, 34, 11, '#edf6ef', 2); sign(w / 2, 61, 'DEPARTURES', '#48768a');
      for (const x of [22, w - 22]) { roof(x - 10, 17, 20, 23, '#729bae'); circle(x, 20, 8, '#c0e6e4'); line([[x, 12], [x, 3]], '#637d91', 2); }
      for (const x of [20, w - 34]) { box(x, 119, 14, 8, '#eab570', 2); box(x, 130, 14, 8, '#e0a563', 2); }
      flowerbed(10, h - 17, 40, rnd); flowerbed(w - 50, h - 17, 40, rnd);
    } },
    { name: 'Factory', icon: '🏭', garden: '#b5bda2', asphalt: '#b0b2aa', curb: '#e6d7b8', plaza(w, h, rnd) {
      tiles(w, h, '#c8c2b0', '#938c7622', 22);
      roof(w / 2 - 65, 25, 130, 38, '#bb7864', '#e0b894');
      for (let i = 0; i < 5; i++) {
        const x = w / 2 - 64 + i * 26;
        poly([[x, 26], [x + 23, 10], [x + 23, 26]], '#e1aa88'); line([[x + 3, 25], [x + 20, 14]], '#b4d2ce', 3);
      }
      windows(w / 2 - 56, 52, 12, '#ecd29c', 5);
      for (const x of [w / 2 - 43, w / 2 + 40]) { box(x - 5, 5, 10, 25, '#926555', 2); box(x - 6, 5, 12, 5, '#d9b39a', 1); }
      sign(w / 2, 76, 'WORKS No. 05', '#62796e');
      for (const x of [20, w - 35]) {
        box(x + 2, 52, 23, 25, '#203b3b22', 3); box(x, 48, 23, 25, '#9aaba8', 3);
        circle(x + 11, 59, 8, '#c7d1c6'); circle(x + 11, 59, 5, '#7e9693');
        box(x, 88, 20, 14, '#c7915b', 2); line([[x + 2, 90], [x + 18, 100]], '#f2d7a5');
      }
      for (let x = 0; x < w; x += 14) poly([[x, h - 8], [x + 5, h - 8], [x + 11, h], [x + 6, h]], '#e8c770');
    } },
    { name: 'Train station', icon: '🚆', garden: '#bdc9ae', asphalt: '#acb4b6', curb: '#e1dece', plaza(w, h, rnd) {
      tiles(w, h, '#e0d6bb', '#b0a38725', 19);
      box(0, 9, w, 37, '#9b9f90', 0);
      for (let x = 0; x < w; x += 11) box(x, 12, 4, 31, '#777f74', 0);
      line([[0, 17], [w, 17]], '#e1e7df', 2); line([[0, 38], [w, 38]], '#e1e7df', 2);
      line([[0, 50], [w, 50]], '#f4c76a', 4);
      roof(w / 2 - 70, 65, 140, 25, '#668e80', '#e0b985');
      for (let x = w / 2 - 60; x < w / 2 + 70; x += 20) line([[x, 68], [x, 87]], '#b4d0b860');
      sign(w / 2, 74, 'CENTRAL STATION', '#3d655f');
      [22, w - 22].forEach(x => { bench(x, 72); flowerbed(x - 13, 93, 26, rnd, '#e8aa96'); });
      circle(w / 2, 110, 9, '#f5edce'); circle(w / 2, 110, 7, '#fffaf0'); line([[w / 2, 105], [w / 2, 110], [w / 2 + 4, 112]], '#546e70', 1.3);
    } },
    { name: 'Ferry port', icon: '⛴️', garden: '#b9cdb9', asphalt: '#a4b5b5', curb: '#e3dbbb', plaza(w, h, rnd) {
      wash(w, h, '#4bafba', '#91cfc4'); waves(w, h, rnd, '#e5f4db45');
      box(w / 2 - 52, 69, 104, h, '#ba9d77', 3);
      for (let y = 73; y < h; y += 7) line([[w / 2 - 50, y], [w / 2 + 50, y]], '#ead4a580');
      for (const x of [w / 2 - 48, w / 2 + 48]) for (let y = 74; y < h; y += 23) { circle(x, y, 3, '#725e4e'); circle(x, y - 1, 1.5, '#dcc2a0'); }
      roof(w / 2 - 37, 85, 74, 30, '#73958d', '#e5d2a3'); sign(w / 2, 101, 'FERRY TERMINAL', '#426c73');
      for (const x of [23, w - 23]) {
        circle(x, 81, 16, '#e0d0a5'); circle(x + 3, 81, 9, '#274e5f25');
        circle(x, 77, 10, '#f5e6ca'); circle(x, 77, 7, '#df7e69'); circle(x, 77, 4, '#f6d488');
      }
      [17, w - 17].forEach(x => { circle(x, 26, 3, '#f3bb78'); circle(x, 26, 1.2, '#fff2cc'); });
    } },
    { name: 'School', icon: '🏫', garden: '#a5c78e', asphalt: '#b5b0a5', curb: '#e5d5b7', plaza(w, h, rnd) {
      wash(w, h, '#b0cf91', '#d5ddac');
      box(w / 2 - 74, 65, 148, 80, '#d9ae8c', 8);
      roof(w / 2 - 64, 20, 128, 36, '#c27d60', '#f0cb98');
      windows(w / 2 - 55, 44, 12, '#aad2cb', 5);
      roof(w / 2 - 18, 10, 36, 50, '#d69d65', '#fae0ae');
      box(w / 2 - 7, 47, 14, 15, '#5f8781', 2);
      circle(w / 2, 28, 7, '#fff4da'); line([[w / 2, 24], [w / 2, 28], [w / 2 + 3, 30]], '#7a6954', 1.2);
      for (let i = 0; i < 4; i++) { ctx.strokeStyle = '#fff4d8b0'; ctx.lineWidth = 1; ctx.strokeRect(w / 2 - 48, 77 + i * 11, 11, 11); }
      ctx.strokeRect(w / 2 + 26, 79, 27, 27); line([[w / 2 + 40, 79], [w / 2 + 40, 106]], '#fff4d8b0');
      [22, w - 22].forEach(x => { tree(x, 45, 1.5, '#5e9c68', '#88b97b'); bench(x, 80); });
      fence(8, h - 14, 43); fence(w - 51, h - 14, 43);
    } },
    { name: 'Beach', icon: '🏖️', garden: '#dccf99', asphalt: '#b6b7a9', curb: '#f1dfb2', plaza(w, h, rnd) {
      wash(w, h, '#f3dda7', '#f8e7be'); speckle(w, h, rnd, 160, '#caa87535', 0.8);
      wash(w, 90, '#41a8b7', '#82d1c6');
      ctx.fillStyle = '#f3dda7'; ctx.beginPath(); ctx.moveTo(0, 81); ctx.bezierCurveTo(w * 0.3, 109, w * 0.6, 57, w, 86); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
      for (const [x, color] of [[26, '#e98e83'], [w - 26, '#71b7c7'], [w / 2 + 39, '#e9b85e']]) { box(x - 6, 100, 13, 22, '#ffffffb0', 2); tent(x, 93, 23, color, '#fff0ca'); }
      palm(20, 42, 1.3); palm(w - 22, 38, 1.5);
      roof(w / 2 - 22, 110, 44, 23, '#d9a16e', '#f5e1bb'); sign(w / 2, 123, 'SURF CLUB', '#548c8c');
      for (let i = 0; i < 7; i++) circle(9 + rnd() * (w - 18), 97 + rnd() * 28, 1.5, '#fff6dc');
    } },
    { name: 'Ski resort', icon: '⛷️', garden: '#c8dce0', asphalt: '#acb9c3', curb: '#edf4f3', plaza(w, h, rnd) {
      wash(w, h, '#b4d2df', '#ecf2e9');
      for (let i = -1; i < 6; i++) {
        const x = i * w / 4, peak = 5 + (i % 2) * 12;
        poly([[x - 60, 91], [x + 20, peak], [x + 94, 91]], '#9ebbc7');
        poly([[x + 20, peak], [x + 94, 91], [x + 20, 70]], '#8eabb9');
        poly([[x - 4, peak + 28], [x + 20, peak], [x + 44, peak + 28], [x + 25, peak + 21], [x + 12, peak + 32]], '#f6f5e9');
      }
      poly([[0, 84], [w * 0.35, 64], [w, 108], [w, h], [0, h]], '#e9f1e9');
      roof(w / 2 - 38, 76, 76, 33, '#9f7665', '#d3bfa0');
      poly([[w / 2 - 41, 84], [w / 2, 61], [w / 2 + 41, 84]], '#fbf7e9');
      windows(w / 2 - 27, 96, 6, '#f6d090', 5); sign(w / 2, 115, 'ALPINE LODGE', '#718d93');
      for (const x of [17, 38, w - 18, w - 39]) pine(x, 90 + (x % 3) * 9, 1.4, true);
      line([[0, 22], [w, 40]], '#5f7f8b', 1.5);
      line([[14, 21], [14, 72]], '#7799a6', 3); line([[w - 14, 39], [w - 14, 83]], '#7799a6', 3);
    } },
    { name: 'Theme park', icon: '🎢', garden: '#bec695', asphalt: '#b2acb5', curb: '#e9d8c3', plaza(w, h, rnd) {
      wash(w, h, '#d9d9a4', '#e9ddb5');
      line([[0, 103], [w / 2, 75], [w, 103]], '#efc4b0', 26);
      roof(w / 2 - 29, 44, 58, 39, '#c49bb2', '#f8dec0');
      for (const [dx, tall] of [[-32, 32], [0, 48], [32, 32]]) {
        box(w / 2 + dx - 9, 74 - tall, 18, tall, '#f7d6b3', 2);
        poly([[w / 2 + dx - 13, 75 - tall], [w / 2 + dx, 51 - tall], [w / 2 + dx + 13, 75 - tall]], '#8f9fcb');
        box(w / 2 + dx - 3, 81 - tall, 6, 10, '#9b9fc1', 3);
      }
      box(w / 2 - 7, 65, 14, 20, '#8a859c', 7);
      for (let x = 0; x < w; x += 28) line([[x, 19 + Math.sin(x / 47) * 8], [x, 45]], '#c59aa3', 2);
      const track = []; for (let x = -4; x <= w + 4; x += 4) track.push([x, 19 + Math.sin(x / 47) * 8]);
      line(track, '#c77788', 5); line(track, '#f7e8c5', 1);
      [25, w - 25].forEach((x, i) => { tent(x, 75, 28, i ? '#87bbc0' : '#dc9da9', '#fff0d0'); flowerbed(x - 16, 103, 32, rnd, '#e8a4be'); });
      sign(w / 2, 97, 'WONDER PARK', '#a47899');
    } },
    { name: 'Downtown', icon: '🏙️', garden: '#a7c3ad', asphalt: '#a5afb9', curb: '#d9ded5', plaza(w, h, rnd) {
      tiles(w, h, '#c9d6ce', '#8da59a30', 18);
      for (let i = 0; i < 6; i++) {
        const bw = w / 6, x = i * bw + 3, y = 8 + (i % 2) * 9;
        roof(x, y, bw - 6, 32 + (i % 3) * 4, ['#7e9ba5', '#b58c83', '#769c91'][i % 3], '#e3d6ba');
        windows(x + 6, y + 23, Math.floor((bw - 14) / 9), '#f3da9d');
        box(x + 7, y + 5, 14, 10, '#bcd2ca', 2); line([[x + 9, y + 8], [x + 18, y + 8]], '#809d9d');
      }
      box(0, 99, w, 28, '#77939a', 0);
      ctx.setLineDash([10, 12]); line([[0, 113], [w, 113]], '#e5ddab', 1.5); ctx.setLineDash([]);
      for (const x of [15, w - 32]) for (let i = 0; i < 5; i++) box(x, 101 + i * 5, 17, 3, '#e6e9d9', 0);
      circle(w / 2 + 3, 75, 25, '#3a625a20'); circle(w / 2, 72, 25, '#e8dfbd'); circle(w / 2, 72, 21, '#7bafb3'); circle(w / 2, 72, 16, '#94c9c6'); circle(w / 2, 72, 5, '#e4eed8');
      [27, w - 27].forEach(x => { tree(x, 75, 1.15); bench(x, 143); });
      flowerbed(w / 2 - 63, 68, 27, rnd, '#e5b58b'); flowerbed(w / 2 + 36, 68, 27, rnd, '#e5b58b');
    } },
  ];


  const paradeKinds = ['lion','horse','flamingo','luggage','robot','train','seagull','duck','penguin','skier','dinosaur','dog'];
  THEMES.forEach((theme,index) => { theme.index=index; theme.parade=paradeKinds[index]; });
  // Wildlife scenes join the parade rotation; ordinary levels retain their
  // original twelve-theme cycle. Dirt lots keep the grey elephants legible.
  const WILDLIFE = [
    { name:'African savanna', icon:'🌍', garden:'#b8bc77', asphalt:'#d5b176', curb:'#c6a36f', earth:'#e3c691', parade:'elephant', wildlife:'savanna', plaza(w,h,rnd) {
      wash(w,h,'#e8ce91','#b7bc79');
      poly([[0,29],[w*.22,8],[w*.43,35],[w*.72,12],[w,28],[w,77],[0,77]],'#d8bb7f');
      poly([[0,54],[w*.3,26],[w*.59,51],[w*.84,31],[w,52],[w,101],[0,101]],'#c3ad72');
      line([[w*.59,78],[w*.73,108],[w,h]],'#ead09a',19);
      const acacia=(x,y,scale)=>{ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);shadow(2,8,21);line([[0,19],[-1,-4],[-13,-13]],'#85704b',4);line([[-1,2],[13,-10]],'#85704b',3);for(const [a,b,r]of[[-17,-13,12],[-3,-17,16],[15,-12,12]]){circle(a,b,r,'#6e8a57');circle(a-3,b-4,r*.65,'#8ca264');}ctx.restore();};
      acacia(w/2-66,45,.85);acacia(19,97,.6);acacia(w-17,108,.7);
      ctx.fillStyle='#6a9f95';ctx.beginPath();ctx.ellipse(w/2-8,79,34,17,-.1,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#91b4a0';ctx.beginPath();ctx.ellipse(w/2-11,76,27,11,-.1,0,Math.PI*2);ctx.fill();
      tent(w/2+57,44,41,'#c38f59','#efd5a0');box(w/2+39,63,36,10,'#a8794d');box(w/2+51,52,12,18,'#695b43',1);
      sign(w/2,18,'SAVANNA RESERVE','#7f7952');
      for(let i=0;i<28;i++){const x=rnd()*w,y=95+rnd()*(h-95);line([[x-2,y-3],[x,y],[x+2,y-4]],'#9b9e63',1);}
    } },
    { name:'Indian sanctuary', icon:'🌿', garden:'#91b990', asphalt:'#d2ad83', curb:'#c19771', earth:'#e6c7a0', parade:'elephant', wildlife:'india', plaza(w,h,rnd) {
      wash(w,h,'#a9c8a0','#c1d2a2');
      for(const [x,y,r]of[[21,24,26],[w-19,27,29],[w*.28,17,19],[w*.76,15,22]]){circle(x+3,y+4,r,'#648d70');circle(x,y,r,'#79a17c');}
      line([[w/2,58],[w/2-35,78],[w/2-35,100],[w/2,h]],'#e7c396',25);
      box(w/2-55,25,110,40,'#be8468',4);box(w/2-61,19,122,12,'#d8a07b',3);box(w/2-55,30,110,5,'#e5b88c',1);
      box(w/2-16,36,32,29,'#596f5a',15);box(w/2-12,42,24,23,'#71866a',12);
      for(const x of [w/2-49,w/2+35]){box(x,32,14,33,'#d49d77',1);box(x-3,60,20,5,'#e4b68b',1);box(x+4,39,6,9,'#8a705c',3);}
      sign(w/2,25,'INDIAN SANCTUARY','#9a715e');
      ctx.fillStyle='#70a5a1';ctx.beginPath();ctx.ellipse(w/2+13,79,28,14,.1,0,Math.PI*2);ctx.fill();
      for(const [x,y]of[[w/2+4,74],[w/2+21,83]]){circle(x,y,4,'#9ac18a');circle(x-1,y-1,2.4,'#e8acc1');circle(x-1,y-2,1,'#ffe6ad');}
      palm(w/2-73,77,.8);palm(w/2+83,65,.7);palm(17,112,.7);palm(w-19,120,.75);
      flowerbed(w/2-55,89,25,rnd,'#e8bb79');fence(4,h-13,40);fence(w-44,h-13,40);
    } },
  ];
  const PARADE_THEMES = [...WILDLIFE,...THEMES];
  function themeFor(level) {
    level=Math.max(1,level);
    if(window.Advanced?.profile(level)?.caravan) {
      // Mix both the level and chapter so later even-numbered parade levels
      // can visit every scene, instead of only half the original themes.
      const index=level<=130 ? level-121 : (level+Math.floor(level/10))%PARADE_THEMES.length;
      return PARADE_THEMES[index];
    }
    return THEMES[(level-1)%THEMES.length];
  }

  function animate(c, g, time) {
    if (!g) return;
    ctx = c;
    const w = g.cw, h = g.crowdH, middle = w / 2;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    const theme=themeFor(g.level);
    if(theme.wildlife) {
      const x=middle+(theme.wildlife==='india'?13:-8),y=79;
      for(let i=0;i<3;i++){const pulse=(time*.24+i/3)%1;ctx.globalAlpha=(1-pulse)*.4;ctx.strokeStyle='#eef0d0';ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(x,y,5+pulse*15,2+pulse*5,0,0,Math.PI*2);ctx.stroke();}
      ctx.globalAlpha=.6;
      for(let i=0;i<3;i++){const bird=middle-47+((time*7+i*25)%94),yy=9+i*4,flap=Math.sin(time*3+i)*1.5;line([[bird-3,yy+flap],[bird,yy+2],[bird+3,yy+flap]],'#566d5b',1);}
      ctx.restore();return;
    }
    switch (theme.index) {
      case 0: // Stadium pennants and a ball rolling on the pitch.
        flag(middle - 85, 18, '#e78676', time); flag(middle + 79, 18, '#7dbbd2', time + 2);
        circle(middle + Math.sin(time * 0.35) * 28, 77 + Math.cos(time * 0.35) * 9, 3, '#fff8de');
        circle(middle + Math.sin(time * 0.35) * 28 + 0.8, 77 + Math.cos(time * 0.35) * 9, 1.2, '#596d67');
        break;
      case 1: // Ferris wheel: the cabins stay upright as the wheel rotates.
        ctx.strokeStyle = '#e8f0d3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(middle, 43, 31, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 10; i++) {
          const a = i * Math.PI / 5 + time * 0.12, x = middle + Math.cos(a) * 31, y = 43 + Math.sin(a) * 31;
          line([[middle, 43], [x, y]], '#eef3d6', 1.2);
          box(x - 4, y, 8, 7, ['#ee8b81', '#eac35d', '#78b7cc', '#b498c4'][i % 4], 2);
          box(x - 3, y + 1, 6, 2, '#fff3cf', 1);
        }
        circle(middle, 43, 5, '#e5c176'); circle(middle, 43, 2, '#fff4d4');
        break;
      case 2:
        for (let i = 0; i < 3; i++) {
          const x = middle - 42 + i * 42, drift = Math.sin(time * 0.45 + i * 2) * 25;
          poly([[x, 18], [x - 18 + drift, 108], [x + 18 + drift, 108]], ['#ecc7ee20', '#b5e8e620', '#ffdfa920'][i]);
        }
        for (let i = 0; i < 12; i++) { const height = 4 + (1 + Math.sin(time * 1.9 + i * 1.7)) * 7; box(middle - 40 + i * 7, 45 - height, 4, height, ['#ecc0d9', '#95d8d8', '#f8d98e'][i % 3], 1); }
        break;
      case 3:
        plane(w + 40 - ((time * 10 + w * 0.4) % (w + 80)), 91, 0.65);
        circle(16, 34, 2, '#fff0b4'); circle(w - 16, 34, 2, '#fff0b4');
        break;
      case 4:
        for (const x of [middle - 43, middle + 40]) for (let i = 0; i < 4; i++) {
          const phase = (time * 0.16 + i / 4) % 1;
          circle(x + phase * 14, 6 - phase * 24, 3 + phase * 7, `rgba(246,242,223,${(1 - phase) * 0.5})`);
        }
        break;
      case 5: {
        const x = ((time * 15 + w * 0.3) % (w + 180)) - 140;
        for (let i = 0; i < 3; i++) {
          box(x + i * 47 + 2, 21, 44, 18, '#304e5025', 5);
          box(x + i * 47, 18, 44, 18, i === 2 ? '#c67861' : '#5d938c', 5);
          windows(x + i * 47 + 5, 22, 4, '#e9e2b6', 5); line([[x + i * 47 + 4, 32], [x + i * 47 + 39, 32]], '#f7d68f', 2);
        }
        break;
      }
      case 6:
        for (let i = 0; i < 8; i++) { const x = (i * 67 + time * 3) % (w + 20) - 10, y = 14 + (i % 3) * 19; line([[x - 5, y], [x, y + 1.5], [x + 7, y]], '#e6f7df65', 1.2); }
        ferry(((time * 7 + w * 0.65) % (w + 100)) - 50, 41 + Math.sin(time * 0.8) * 1.5);
        break;
      case 7:
        flag(middle + 76, 26, '#e9aa66', time);
        circle(middle + 40, 88 - Math.abs(Math.sin(time * 0.9)) * 7, 3.5, '#d17f63');
        break;
      case 8:
        for (let i = 0; i < 3; i++) {
          const phase = (time * 0.09 + i / 3) % 1;
          ctx.strokeStyle = `rgba(247,255,235,${Math.sin(phase * Math.PI) * 0.65})`; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(0, 54 + phase * 27); ctx.bezierCurveTo(w * 0.3, 79 + phase * 27, w * 0.6, 28 + phase * 27, w, 58 + phase * 27); ctx.stroke();
        }
        break;
      case 9:
        for (let i = 0; i < 4; i++) {
          const x = ((time * 10 + i * (w + 60) / 4) % (w + 60)) - 30, y = 22 + x / w * 18;
          line([[x, y], [x, y + 10]], '#5d7e8a');
          box(x - 7, y + 9, 14, 12, i % 2 ? '#d68e7a' : '#81aebc', 4);
          box(x - 5, y + 11, 10, 5, '#d6e8df', 2); line([[x - 9, y + 24], [x + 9, y + 24]], '#64828d', 1.5);
        }
        break;
      case 10:
        for (let i = 0; i < 3; i++) {
          const x = ((time * 17 + i * 13) % (w + 50)) - 25, y = 19 + Math.sin(x / 47) * 8;
          box(x - 5, y - 5, 10, 7, ['#a484b5', '#eaa267', '#79b9bd'][i], 2); circle(x - 2, y - 5, 1.8, '#f9e2bb');
        }
        break;
      case 11:
        for (let i = 0; i < 3; i++) { const radius = 5 + ((time * 3 + i * 5) % 14); ctx.strokeStyle = '#edf9e285'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(middle, 72, radius, 0, Math.PI * 2); ctx.stroke(); }
        taxi(w - ((time * 14 + w * 0.3) % (w + 32)), 102);
        break;
    }
    ctx.restore();
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // g: { cw, ch, crowdH, slotTop, slotH, lot: {x, y, w, h}, road, roadW, asphalt, ring: {xl, xr, yt, yb, r, belt}, level }
  function paint(c, g) {
    ctx = c;
    const theme = themeFor(g.level), rnd = mulberry32(g.level * 2654435761);
    const { cw, ch, crowdH } = g;

    // The miniature setting stays behind the passenger area. Moving props
    // use the same clip in animate(), so the puzzle always stays clear.
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, crowdH); ctx.clip();
    theme.plaza(cw, crowdH, rnd);
    ctx.restore();

    // Parking lot: the road round the screen's edges, the curb, asphalt
    // filling everything inside, painted stalls and street lights
    const top = g.slotTop + g.slotH, R = g.road, rw = g.roadW, A = g.asphalt;
    ctx.fillStyle = theme.curb; ctx.fillRect(0, top, cw, ch - top);                       // curb
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(0, top, cw, rw); ctx.fillRect(0, top, rw, ch - top);
    ctx.fillRect(cw - rw, top, rw, ch - top); ctx.fillRect(0, ch - rw, cw, rw);          // road
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.rect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0); ctx.stroke(); ctx.setLineDash([]);
    const L = A;
    const paving = ctx.createLinearGradient(0, L.y, cw, L.y + L.h);
    const parade=window.Advanced?.profile(g.level)?.caravan;
    const sand=parade&&theme.parade==='penguin', fair=parade&&theme.parade==='horse';
    const earth=theme.earth||(sand?'#edcf98':fair?'#dfc69c':null);
    paving.addColorStop(0,sand?'#e3be83':fair?'#c8ad82':theme.asphalt);paving.addColorStop(1,earth||'#bfc7c7');
    ctx.fillStyle = paving; rr(L.x, L.y, L.w, L.h, 6); ctx.fill();                   // asphalt
    ctx.save(); rr(L.x, L.y, L.w, L.h, 6); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < (L.w * L.h) / 60; i++) ctx.fillRect(L.x + rnd() * L.w, L.y + rnd() * L.h, 1.5, 1.5);
    if(earth) {
      // Quiet dirt texture stays beneath the puzzle, with no painted stalls.
      for(let i=0;i<48;i++){const x=L.x+rnd()*L.w,y=L.y+rnd()*L.h;ctx.fillStyle='#866d4b12';ctx.beginPath();ctx.ellipse(x,y,2+rnd()*5,1+rnd()*2,rnd()*3,0,Math.PI*2);ctx.fill();}
    } else {
    // stall lines along the top and bottom edges, a dashed lane down the middle
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    const step = Math.max(18, (g.lot.w / 330) * 26);
    for (let x = L.x + step / 2; x < L.x + L.w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, L.y); ctx.lineTo(x, L.y + 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, L.y + L.h); ctx.lineTo(x, L.y + L.h - 12); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(250,204,21,0.55)'; ctx.setLineDash([12, 10]);
    ctx.beginPath(); ctx.moveTo(L.x + 8, L.y + L.h / 2); ctx.lineTo(L.x + L.w - 8, L.y + L.h / 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    // street lights on the lot's corners
    if(!earth) [[L.x, L.y], [L.x + L.w, L.y], [L.x, L.y + L.h], [L.x + L.w, L.y + L.h]].forEach(([x, y], i) => lamp(x + (i % 2 ? -4 : 4), y + (i < 2 ? 4 : -4), i % 2 ? -1 : 1, 0.8));
  }

  window.Scenery = { paint, animate, themeFor, count: THEMES.length + WILDLIFE.length, baseCount: THEMES.length };
})();
