// Loads the real game rules with a minimal DOM; does not emulate rendering.
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
module.exports = function loadGame(width = 390, height = 764) {
  const elements = new Map(), listeners = {};
  const context = new Proxy({}, { get: (o, k) => o[k] || (k === 'measureText' ? () => ({ width: 20 }) : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {}), set: (o, k, v) => (o[k] = v, true) });
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: true, clientWidth: width, clientHeight: height, dataset: {}, style: { setProperty() {} }, classList: { toggle() {}, remove() {} },
      addEventListener() {}, setAttribute() {}, getContext: () => context, querySelector: sub => element(selector + sub), contains: () => false,
    });
    return elements.get(selector);
  }
  const sandbox = { console, performance, Math, structuredClone, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {},
    localStorage: { getItem: () => JSON.stringify({ level: 1, seenHowTo: true, sound: false }), setItem() {} },
    document: { querySelector: element, querySelectorAll: () => [], createElement: element, addEventListener() {}, hidden: false },
  };
  sandbox.window = { devicePixelRatio: 1, addEventListener(event, fn) { listeners[event]=fn; }, matchMedia: () => ({ matches: false }),
    Scenery: { paint() {}, animate() {}, themeFor: () => ({ name: 'Test', icon: '', garden: '#aaa' }) } };
  vm.createContext(sandbox);
  for (const file of ['advanced.js', 'parade-art.js', 'game.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
  const B = sandbox.window.__bus;
  B.save.seenPieces = new Proxy({}, { get: () => true });
  return { B, A: sandbox.window.Advanced, sandbox, resize(width,height) { for(const e of elements.values()){e.clientWidth=width;e.clientHeight=height;} listeners.resize(); } };
};
