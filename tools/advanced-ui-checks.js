// Run inside the game document, alongside tools/ui-checks.js.
function checkAdvancedUI() {
  const B = window.__bus, $ = s => document.querySelector(s), results = [];
  const check = (condition, text) => { if (!condition) throw new Error(text); results.push(text); };
  const start = n => { B.save.level=n; B.save.bays=4; B.save.sound=false; B.save.boosters={vip:3,sort:3,shuffle:3}; B.save.seenPieces=new Proxy({}, {get:()=>true}); B.startLevel(); B.G.modal=false; $('#modal').hidden=true; return B.G; };
  const boost = k => { $('#btnBoosters').click(); $(`[data-k="${k}"]`).click(); };
  const press = b => { const p=B.lotPose(b), r=$('#game').getBoundingClientRect(); $('#game').dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+p.x,clientY:r.top+p.y,bubbles:true})); };
  let G=start(131), b=G.buses.find(b=>b.link===1), partner=G.buses.find(o=>o!==b&&o.link===b.link);
  boost('vip'); press(b);
  check(b.state==='flying' && b.slot===0 && !b.link && !partner.link && partner.state==='lot', 'VIP separates exactly one linked bus');
  check(B.save.boosters.vip===2, 'Linked rescue spends one VIP');
  G=start(181); b=G.buses.find(b=>b.transfer); boost('vip'); press(b);
  check(b.state==='flying' && b.transferred && G.arrivals===1, 'VIP skips the transfer and clears its portal marker');
  G=start(171); b=G.buses[0]; Object.assign(b,{state:'slot',slot:1,color:0,cap:16,filled:8,stages:[{color:0,count:8},{color:1,count:8}]}); G.buses=[b];G.slots[1]=b;
  G.ring.fill(2);G.queue=[0,1,3,1,0,1,3,1];G.leftN=4;boost('sort');
  check(G.queue[0]===1 && G.queue[4]===1 && G.leftN===4, 'Sort uses the current stage and preserves both chute lengths');
  check(G.queue.filter(c=>c===1).length===4 && B.save.boosters.sort===2, 'Sort preserves individual passengers and spends one charge');
  G=start(161); G.buses=G.buses.slice(0,2); const a=G.buses[0], c=G.buses[1];
  Object.assign(a,{cap:16,color:0,stages:[{color:0,count:8},{color:1,count:8}]}); Object.assign(c,{cap:16,color:2,stages:undefined});
  const random=Math.random;try{Math.random=()=>0;boost('shuffle');}finally{Math.random=random;}
  check(a.color===2 && !a.stages && c.color===0 && c.stages[1].color===1, 'Shuffle moves complete two-stage routes without changing passenger demand');
  check(B.save.boosters.shuffle===2, 'Route shuffle spends one charge');
  G=start(210); $('#btnMenu').click(); $('[data-a="rules"]').click();
  check($('#card').textContent.includes('Elephant parade') && $('#card').textContent.includes('Transfer tunnels'), 'Menu explains every rule in the combined level');
  $('[data-a="close"]').click();
  check(!G.modal, 'Rules close and resume play');
  const g=B.geometry;check(g.ringR-22>=18, 'Carousel island has at least 36 pixels of clear vertical space');
  const left=B.ringPoint(B.feedEntry(0)),right=B.ringPoint(B.feedEntry(1));
  check(left.x<g.ringXL && right.x>g.ringXR && left.y>g.ringYT && right.y>g.ringYT, 'Chutes enter on the upper curved corners');
  const before=G.arrivals; B.update(1);check(G.arrivals===before, 'Waiting does not change advanced counters');
  B.draw(); return results;
}
if(typeof module!=='undefined')module.exports=checkAdvancedUI;
