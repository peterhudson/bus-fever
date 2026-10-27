// Sarah's Bus Jam. Copyright (C) 2026 Peter Hudson. GPL-3.0-or-later.
// Small top-down parade sprites. Every theme uses the same blocking footprint.
'use strict';
(() => {
  function draw(ctx, {x, y, angle, kind = 'elephant', stride = 0, scale = 1}) {
    ctx.save();
    {
      // Screen-space offset keeps the sunlight consistent through every turn.
      ctx.save(); ctx.translate(x + 1.4, y + 2.6); ctx.rotate(angle);ctx.scale(scale,scale);
      for (const [rx, ry, opacity] of [[11, 8, .07], [9, 6, .15]]) {
        ctx.fillStyle = `rgba(36,39,32,${opacity})`; ctx.beginPath(); ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.translate(x,y); ctx.rotate(angle);ctx.scale(scale,scale);
    const oval = (x,y,rx,ry,c) => { ctx.fillStyle=c; ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill(); };
    const dot = (x,y,r,c) => oval(x,y,r,r,c);
    const box = (x,y,w,h,c,r=2) => { ctx.fillStyle=c;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill(); };
    const line = (points,c,width=1.5) => { ctx.strokeStyle=c;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke(); };
    const poly = (points,c) => { ctx.fillStyle=c;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill(); };
    const eyes = (x, y=2) => { dot(x,-y,.65,'#213849');dot(x,y,.65,'#213849'); };
    const feet = c => { for (const side of [-1,1]) for(const front of [-1,1]) oval(front*4+stride*side*front,side*5.5,2.3,1.8,c); };
    switch (kind) {
      case 'elephant':
        feet('#6c8293'); line([[-7,0],[-10,1.5]],'#6c8293',1);
        oval(-2,0,8,5.6,'#8fa5b4'); oval(3,-4.5,4,3.6,'#a9bcc7'); oval(3,4.5,4,3.6,'#a9bcc7');
        oval(5,0,4.7,4.7,'#8a9fae');
        ctx.strokeStyle='#8a9fae';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(8,0);ctx.quadraticCurveTo(14,0,12,4);ctx.stroke();
        line([[8,-2.4],[10.4,-2.7]],'#fff4d9',1.2);line([[8,2.4],[10,3]],'#fff4d9',1.2);
        oval(-3,-1.6,4.3,2.2,'#b4c7d0');eyes(7);break;
      case 'horse':
        feet('#714b3e');line([[-7,0],[-11,-1+stride]],'#614537',3);
        oval(-2,0,7,4.6,'#be8758');oval(3.5,0,4.7,3.3,'#c99669');oval(7.7,0,3.2,2.4,'#e8c29a');
        poly([[3,-2],[3,-5],[6,-2]],'#805d42');poly([[3,2],[3,5],[6,2]],'#805d42');
        line([[-2,0],[3,0]],'#674a38',2);oval(-3,-1.5,3.4,1.5,'#dba576');eyes(6,1.8);dot(9.3,0,.9,'#73523f');break;
      case 'penguin':
        oval(-6,-3+stride,2.4,1.5,'#f4a345');oval(-6,3-stride,2.4,1.5,'#f4a345');
        oval(-1,-5,6,1.7,'#34485e');oval(-1,5,6,1.7,'#34485e');oval(-1,0,8,5.8,'#34485e');
        oval(0,0,6.1,3.8,'#fff9e7');dot(5.5,0,4,'#34485e');poly([[8,-1.5],[12,0],[8,1.5]],'#f7b146');
        dot(6,-2,.85,'#fff9e7');dot(6,2,.85,'#fff9e7');eyes(6.3,2);break;
      case 'lion':
        feet('#be853e');line([[-7,0],[-10,-2],[-11,-4]],'#d9a24a',1.5);dot(-11,-4,1.6,'#8b5c35');
        oval(-2,0,7,4.8,'#e7b65b');dot(5,0,6.2,'#b97438');dot(4,-4.5,2,'#dba04a');dot(4,4.5,2,'#dba04a');
        oval(6,0,4.4,3.9,'#f3c66e');oval(9,0,1.9,2,'#ffe1a0');eyes(7,2);dot(10,0,.9,'#73503d');
        line([[0,-4],[0,4]],'#56bdd7',2);break;
      case 'flamingo':
        line([[-3,-2],[-10,-3+stride]],'#a75d76',1);line([[-3,2],[-10,3-stride]],'#a75d76',1);
        oval(-3,0,6,4.3,'#ef85a6');oval(-4,-1.5,4.5,1.9,'#ffb5c9');
        ctx.strokeStyle='#f99fbb';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,1);ctx.bezierCurveTo(8,5,2,-4,8,-2);ctx.stroke();
        dot(8,-2,2.6,'#f99fbb');line([[10,-2],[11.5,0]],'#423d52',2);dot(9,-3,.7,'#333b49');break;
      case 'luggage':
        for(const y of [-6,6])for(const x of [-5,5])oval(x,y,2,1.4,'#4a5963');
        box(-9,-5.5,18,11,'#87a5b4');line([[8,0],[12,0]],'#8ea2ac',1.5);
        box(-7,-4,9,8,'#e7a44e');line([[-4,-4],[-4,4]],'#ffe5a8',1.5);box(2,-4,5.5,8,'#6aafc7');
        line([[3.5,-5.5],[6,-5.5]],'#36546b',1.3);box(-6,-2,2,2,'#fff6da',.5);break;
      case 'robot':
        feet('#657b91');box(-7,-5,11,10,'#55b5c5');box(-5,-3,6,6,'#a0e2df');
        box(4,-4.5,7,9,'#6c8dba');box(6,-3,4,6,'#2d506d');dot(8,-1.5,1,'#b3f5e8');dot(8,1.5,1,'#b3f5e8');
        line([[5,-4],[6,-7]],'#6b8298',1);dot(6,-7,1.5,'#f9c35c');break;
      case 'train':
        for(const y of [-6,6])for(const x of [-5,4])dot(x,y,1.7,'#33485d');
        box(-10,-5.5,20,11,'#e16d66');box(-9,-5,7,10,'#72a2c9');box(-7,-3,3,6,'#bce1e4',1);
        box(-1,-4,9,8,'#f29468');dot(5,0,2.4,'#425d70');line([[11,-4],[11,4]],'#e8c77d',2);break;
      case 'seagull':
      case 'duck': {
        const gull=kind==='seagull',body=gull?'#f4f5e5':'#f4cb59';
        oval(-5,-3+stride,2,1,'#e4a444');oval(-5,3-stride,2,1,'#e4a444');
        poly([[-5,-3],[-10,0],[-5,3]],body);oval(-2,0,7,4.8,body);
        oval(-3,-2.5,4.6,1.8,gull?'#bccad1':'#ffe397');oval(-3,2.5,4.6,1.8,gull?'#bccad1':'#ffe397');
        dot(5.5,0,3.8,body);box(8,-1.5,3.5,3,'#e7a349',1);eyes(7,1.8);break;
      }
      case 'skier':
        for(const y of [-5,5]){line([[-10,y],[10,y]],'#f6d47e',2);line([[-8,y*1.5],[3,y]],'#e9f4eb',.9);}
        box(-6,-4,12,8,'#71aace');box(-6,-3,4,6,'#465f90');oval(6,0,4,4.5,'#efbb5e');
        line([[7,-3],[7,3]],'#4a6788',2);line([[4,-4],[4,4]],'#f3e9cd',1.5);break;
      case 'dinosaur':
        feet('#4c9b79');poly([[-6,-3],[-13,0],[-6,3]],'#70b88a');oval(-2,0,7,5,'#70b88a');
        oval(6,0,5.5,3.8,'#88c897');oval(8,0,3.2,2.5,'#a6d6a4');
        for(const x of [-6,-2,2])poly([[x-1,-.5],[x+1,-.5],[x,-3]],'#e9c16b');eyes(7,2.3);dot(10,-1,.6,'#4c8069');dot(10,1,.6,'#4c8069');break;
      case 'dog':
        feet('#b28057');line([[-7,0],[-10,-3+stride]],'#9b694b',2);oval(-2,0,7,4.5,'#d0a478');oval(-1,-1,3,3,'#f4e1bc');
        oval(6,0,4.5,3.5,'#dcb487');oval(4,-3.4,3.4,1.8,'#80543f');oval(4,3.4,3.4,1.8,'#80543f');
        oval(9,0,2,2,'#f5e4c5');eyes(7,2);dot(10,0,.9,'#3c4147');line([[1,-3.5],[1,3.5]],'#e77c6e',1.5);break;
    }
    ctx.restore();
  }
  window.ParadeArt = { draw };
})();
