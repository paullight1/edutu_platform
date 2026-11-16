import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { OrbDesign } from '../../lib/voiceSettingsStore';

/**
 * Voice-mode orb — a WebView canvas engine (RN views can't animate hundreds
 * of particles per frame; Skia isn't in this app and would need a native
 * rebuild). Fully self-contained HTML, no network.
 *
 * Eight designs share one state machine (level swell, thinking swirl,
 * speaking pulses):
 *  - particles: fibonacci point-cloud sphere with noise-folded ridges
 *  - ring:      thick fuchsia aurora ring (wispy additive band, undulating)
 *  - bubble:    glass marble with swirling nebula interior + 4-point star
 *  - robot:     glossy white bot ball, gradient visor, blinking glow eyes
 *  - crystal:   pastel lavender dream sphere with a large soft star
 *  - glass:     dark glossy glass knot with swirling violet ribbons
 *  - blob:      kawaii pastel jelly with navy eyes, squish + bounce
 *  - petals:    halo of 7 glowing pink→indigo pebbles with a chase pulse
 *
 * State flows in via injectJavaScript so level ticks never reload the view.
 */
export type OrbVisualState =
  | 'idle'
  | 'muted'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error';

interface ParticleOrbProps {
  /** Ignored when `fill` is set — the canvas then takes its parent's box. */
  size?: number;
  design: OrbDesign;
  state: OrbVisualState;
  /** 0..1 mic level — swells the orb and fires pulses while listening. */
  level: number;
  reducedMotion: boolean;
  /** Fill the parent (absolute) so the orb's glow bleeds edge-to-edge, rather
   *  than being confined to a `size`×`size` square. */
  fill?: boolean;
}

const ORB_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;padding:0;background:#000;overflow:hidden}canvas{display:block}</style>
</head><body><canvas id="c"></canvas><script>
(function(){
  var canvas=document.getElementById('c'),ctx=canvas.getContext('2d');
  var DPR=Math.min(window.devicePixelRatio||1,2);
  var W,H,CX,CY,R;
  function resize(){
    W=window.innerWidth;H=window.innerHeight;
    canvas.width=W*DPR;canvas.height=H*DPR;
    canvas.style.width=W+'px';canvas.style.height=H+'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
    CX=W/2;CY=H/2;R=Math.min(W,H)*0.30;
  }
  resize();window.addEventListener('resize',resize);

  // ── Shared state machine ─────────────────────────────────────────────
  var PRESETS={
    idle:        {amp:0.10,speed:0.14,scale:1.00,bright:0.85,violet:0.35,pulseEvery:0},
    muted:       {amp:0.05,speed:0.05,scale:0.95,bright:0.40,violet:0.55,pulseEvery:0},
    listening:   {amp:0.13,speed:0.20,scale:1.00,bright:1.00,violet:0.30,pulseEvery:0},
    transcribing:{amp:0.30,speed:0.60,scale:0.94,bright:0.90,violet:0.45,pulseEvery:0},
    thinking:    {amp:0.34,speed:0.90,scale:0.86,bright:0.90,violet:0.65,pulseEvery:0},
    speaking:    {amp:0.22,speed:0.32,scale:1.02,bright:1.10,violet:0.35,pulseEvery:950},
    error:       {amp:0.06,speed:0.08,scale:0.94,bright:0.50,violet:0.85,pulseEvery:0}
  };
  var design='particles',state='idle',reduced=false;
  var cur=Object.assign({},PRESETS.idle),tgt=Object.assign({},PRESETS.idle);
  var level=0,tgtLevel=0,pulses=[],lastPulse=0;

  window.__orb={
    set:function(s){
      if(s.design)design=s.design;
      if(s.state&&PRESETS[s.state]){state=s.state;tgt=Object.assign({},PRESETS[state]);}
      if(typeof s.level==='number')tgtLevel=Math.max(0,Math.min(1,s.level));
      if(typeof s.reducedMotion==='boolean')reduced=s.reducedMotion;
      if(s.pulse)pulses.push({r:R*cur.scale*0.9,a:0.8});
    }
  };

  function n3(x,y,z,t){
    return (Math.sin(x*2.1+t*0.9+Math.sin(y*1.7+t*0.6))
      +Math.sin(y*2.3-t*0.7+Math.sin(z*1.9+t*0.5))
      +Math.sin(z*2.0+t*0.8+Math.sin(x*1.5-t*0.4)))/3;
  }
  function mix(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
  function rgba(c,a){return 'rgba('+(c[0]|0)+','+(c[1]|0)+','+(c[2]|0)+','+Math.max(0,Math.min(1,a)).toFixed(3)+')';}

  // ── Shared ambient field ─────────────────────────────────────────────
  // A state-tinted wash behind whichever design is selected, plus a vignette
  // in front of it. Two jobs: it stops the room reading as a flat black
  // rectangle with a sticker in the middle, and it makes the current state
  // legible peripherally — the whole room shifts colour between listening,
  // thinking and speaking, which no single label can do. Every design gets
  // it, so improving it improves all eight.
  var TINTS={
    idle:        [110,150,255],
    muted:       [108,116,132],
    listening:   [125,211,252],
    transcribing:[186,160,255],
    thinking:    [168,120,255],
    speaking:    [110,231,183],
    error:       [248,113,113]
  };
  var tint=TINTS.idle.slice();
  function drawAmbient(t){
    var want=TINTS[state]||TINTS.idle;
    // Eased toward the target so a state change is a wash, not a hard cut.
    for(var i=0;i<3;i++)tint[i]+=(want[i]-tint[i])*0.05;
    var breathe=reduced?1:1+0.05*Math.sin(t*0.85);
    var rr=R*(2.0*breathe+(state==='listening'?level*0.4:0));
    var g=ctx.createRadialGradient(CX,CY,R*0.12,CX,CY,rr);
    g.addColorStop(0,rgba(tint,0.17*cur.bright));
    g.addColorStop(0.45,rgba(tint,0.065*cur.bright));
    g.addColorStop(1,rgba(tint,0));
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }
  function drawVignette(){
    var g=ctx.createRadialGradient(CX,CY,Math.min(W,H)*0.32,CX,CY,Math.max(W,H)*0.74);
    g.addColorStop(0,'rgba(0,0,0,0)');
    g.addColorStop(1,'rgba(0,0,0,0.55)');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }

  // Shared blink timers (robot + blob — only one design renders at a time).
  var nextBlink=2600,blinkEnd=0;
  function blinkScale(now){
    if(now>nextBlink){blinkEnd=now+130;nextBlink=now+2600+Math.random()*2600;}
    return (!reduced&&now<blinkEnd)?0.08:1;
  }

  // ── Design 1: particle sphere ────────────────────────────────────────
  var N=760,pts=[],GA=Math.PI*(3-Math.sqrt(5));
  for(var i=0;i<N;i++){
    var y=1-(i/(N-1))*2,rad=Math.sqrt(Math.max(0,1-y*y)),th=GA*i;
    pts.push({x:Math.cos(th)*rad,y:y,z:Math.sin(th)*rad});
  }
  var C1=[126,231,250],C2=[96,165,250],C3=[196,132,252];

  function drawParticles(t,rotY,rotX,now){
    var amp=cur.amp+(state==='listening'?level*0.35:0);
    var scl=cur.scale+(state==='listening'?level*0.10:0);
    if(state==='speaking'&&!reduced){scl+=0.05*Math.sin(now/1000*5.4);}
    var cy=Math.cos(rotY),sy=Math.sin(rotY),cxr=Math.cos(rotX),sxr=Math.sin(rotX);
    // Additive blending: overlapping dots accumulate light, so the cloud
    // reads as a lit volume instead of flat confetti — and it makes the pass
    // order-independent, which is why we can skip a per-frame depth sort of
    // 760 points. The core glow underneath gives it a centre to sit around.
    ctx.globalCompositeOperation='lighter';
    var core=ctx.createRadialGradient(CX,CY,0,CX,CY,R*scl*1.15);
    core.addColorStop(0,rgba(mix(C1,C3,cur.violet),0.20*cur.bright));
    core.addColorStop(0.6,rgba(mix(C2,C3,cur.violet),0.07*cur.bright));
    core.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=core;
    ctx.beginPath();ctx.arc(CX,CY,R*scl*1.15,0,Math.PI*2);ctx.fill();
    for(var i=0;i<N;i++){
      var p=pts[i];
      var x=p.x*cy+p.z*sy, z=-p.x*sy+p.z*cy;
      var y2=p.y*cxr-z*sxr, z2=p.y*sxr+z*cxr;
      var nv=(n3(p.x,p.y,p.z,t)+0.5*n3(p.x*2.3,p.y*2.3,p.z*2.3,t*1.35))/1.5;
      var rr=R*scl*(1+nv*amp);
      var px=CX+x*rr, py=CY+y2*rr;
      var depth=(z2+1)/2;
      var boost=0;
      for(var j=0;j<pulses.length;j++){
        var dd=Math.abs(rr-pulses[j].r);
        if(dd<14){var b=pulses[j].a*(1-dd/14);if(b>boost)boost=b;}
      }
      var vmix=Math.max(0,Math.min(1,cur.violet+nv*0.55-y2*0.25));
      var col=vmix<0.5?mix(C1,C2,vmix*2):mix(C2,C3,(vmix-0.5)*2);
      var alpha=(0.16+0.72*depth)*cur.bright+boost;
      var sz=(0.9+1.6*depth)*(1+boost*0.8);
      ctx.fillStyle=rgba(col,alpha);
      ctx.fillRect(px-sz/2,py-sz/2,sz,sz);
    }
    ctx.globalCompositeOperation='source-over';
    drawPulseRings(true);
  }

  // ── Design 2: aurora ring (thick fuchsia band) ───────────────────────
  var RP1=[244,114,182],RP2=[217,70,239],RP3=[129,140,248],RPW=[255,231,248];
  function ringPath(baseR,amp,t,seed,squash){
    var STEPS=88;
    ctx.beginPath();
    for(var i=0;i<=STEPS;i++){
      var a=(i/STEPS)*Math.PI*2;
      var wob=n3(Math.cos(a)+seed,Math.sin(a)-seed,0.5,t*0.9+seed*0.13);
      var rr=baseR*(1+wob*amp)+Math.sin(a*3+t+seed)*baseR*0.02;
      var x=CX+Math.cos(a)*rr, y=CY+Math.sin(a)*rr*squash;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.closePath();
  }
  function drawRing(t,now){
    var baseR=R*1.0*(cur.scale+(state==='listening'?level*0.14:0));
    if(state==='speaking'&&!reduced)baseR*=1+0.04*Math.sin(now/1000*5.2);
    var amp=(cur.amp*0.8+(state==='listening'?level*0.25:0));
    ctx.globalCompositeOperation='lighter';
    // ambient halo
    var g=ctx.createRadialGradient(CX,CY,baseR*0.4,CX,CY,baseR*1.9);
    g.addColorStop(0,'rgba(120,40,160,0)');
    g.addColorStop(0.55,rgba([190,60,200],0.13*cur.bright));
    g.addColorStop(1,'rgba(80,20,120,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // thick soft band
    ringPath(baseR,amp,t,3.7,0.97);
    ctx.strokeStyle=rgba(RP2,0.10*cur.bright);
    ctx.lineWidth=baseR*0.30;ctx.stroke();
    ringPath(baseR,amp,t,3.7,0.97);
    ctx.strokeStyle=rgba(RP1,0.14*cur.bright);
    ctx.lineWidth=baseR*0.15;ctx.stroke();
    // wispy strands across the band
    var strands=18;
    for(var s=0;s<strands;s++){
      var f=s/(strands-1);
      var col=f<0.5?mix(RP1,RP2,f*2):mix(RP2,RP3,(f-0.5)*2);
      var seed=s*7.31;
      var off=1+(s-strands/2)*0.014;
      ringPath(baseR*off,amp,t,seed,0.97);
      ctx.strokeStyle=rgba(col,(0.045+(s%5===0?0.06:0.02))*cur.bright*2);
      ctx.lineWidth=(s%5===0)?4.4:2.0;
      ctx.stroke();
    }
    // bright near-white core strands
    for(var s2=0;s2<4;s2++){
      ringPath(baseR*(1+(s2-1.5)*0.008),amp,t,s2*2.9+11.3,0.97);
      ctx.strokeStyle=rgba(RPW,0.15*cur.bright);
      ctx.lineWidth=1.8;
      ctx.stroke();
    }
    drawPulseRings(false);
    ctx.globalCompositeOperation='source-over';
  }

  // ── Designs 3 + 5: nebula spheres (bubble / crystal) ─────────────────
  function drawStar(cx,cy,r,rot,alpha){
    var inner=r*0.30;
    ctx.beginPath();
    ctx.moveTo(cx+Math.cos(rot)*r, cy+Math.sin(rot)*r);
    for(var i=0;i<4;i++){
      var aIn=rot+i*(Math.PI/2)+Math.PI/4, aNext=rot+(i+1)*(Math.PI/2);
      ctx.quadraticCurveTo(cx+Math.cos(aIn)*inner, cy+Math.sin(aIn)*inner,
        cx+Math.cos(aNext)*r, cy+Math.sin(aNext)*r);
    }
    ctx.closePath();
    ctx.fillStyle='rgba(255,255,255,'+Math.max(0,Math.min(1,alpha)).toFixed(3)+')';
    ctx.fill();
  }
  var BUBBLE_CFG={
    base:'rgba(18,12,40,0.9)',blobAlpha:0.34,swirlMul:1.0,starSize:0.34,starAlpha:1.0,rim:0.22,
    blobs:[
      {c:[139,92,246], o:0.34,sp:0.50,ph:0.0,sz:0.75},
      {c:[109,40,217], o:0.46,sp:0.34,ph:2.1,sz:0.85},
      {c:[59,130,246], o:0.40,sp:0.62,ph:4.0,sz:0.65},
      {c:[224,231,255],o:0.25,sp:0.44,ph:1.2,sz:0.55},
      {c:[196,181,253],o:0.50,sp:0.28,ph:5.1,sz:0.70},
      {c:[147,197,253],o:0.30,sp:0.72,ph:3.2,sz:0.5}
    ]
  };
  var CRYSTAL_CFG={
    base:'rgba(84,74,140,0.35)',blobAlpha:0.42,swirlMul:0.6,starSize:0.46,starAlpha:0.92,rim:0.30,
    blobs:[
      {c:[199,185,255],o:0.32,sp:0.40,ph:0.0,sz:0.85},
      {c:[147,197,253],o:0.44,sp:0.26,ph:2.0,sz:0.75},
      {c:[216,180,254],o:0.38,sp:0.50,ph:4.1,sz:0.80},
      {c:[245,208,254],o:0.26,sp:0.36,ph:1.4,sz:0.65},
      {c:[255,255,255],o:0.46,sp:0.22,ph:5.0,sz:0.60},
      {c:[165,180,252],o:0.30,sp:0.58,ph:3.3,sz:0.7}
    ]
  };
  function drawNebulaSphere(cfg,t,now){
    var BR=R*1.12*(cur.scale+(state==='listening'?level*0.08:0));
    if(state==='speaking'&&!reduced)BR*=1+0.025*Math.sin(now/1000*5.0);
    var swirl=t*(0.5+cur.speed)*cfg.swirlMul;
    ctx.save();
    ctx.beginPath();ctx.arc(CX,CY,BR,0,Math.PI*2);ctx.clip();
    ctx.fillStyle=cfg.base;
    ctx.fillRect(CX-BR,CY-BR,BR*2,BR*2);
    ctx.globalCompositeOperation='lighter';
    for(var i=0;i<cfg.blobs.length;i++){
      var b=cfg.blobs[i];
      var a=swirl*b.sp+b.ph;
      var wob=1+0.18*Math.sin(t*0.9+b.ph*2);
      var bx=CX+Math.cos(a)*BR*b.o*wob;
      var by=CY+Math.sin(a*0.9)*BR*b.o;
      var br=BR*b.sz;
      var gg=ctx.createRadialGradient(bx,by,0,bx,by,br);
      gg.addColorStop(0,rgba(b.c,cfg.blobAlpha*cur.bright));
      gg.addColorStop(1,rgba(b.c,0));
      ctx.fillStyle=gg;
      ctx.beginPath();ctx.arc(bx,by,br,0,Math.PI*2);ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';
    ctx.restore();
    ctx.beginPath();ctx.arc(CX,CY,BR,0,Math.PI*2);
    ctx.strokeStyle='rgba(255,255,255,'+(cfg.rim*cur.bright).toFixed(3)+')';
    ctx.lineWidth=1.6;ctx.stroke();
    ctx.beginPath();ctx.arc(CX,CY,BR-3,Math.PI*1.05,Math.PI*1.55);
    ctx.strokeStyle='rgba(255,255,255,'+(0.35*cur.bright).toFixed(3)+')';
    ctx.lineWidth=3;ctx.lineCap='round';ctx.stroke();
    var starR=BR*cfg.starSize;
    if(state==='listening')starR*=1+level*0.35;
    if(state==='speaking'&&!reduced)starR*=1+0.10*Math.sin(now/1000*6.2);
    if(state==='thinking')starR*=0.85;
    var rot=-Math.PI/2+(state==='thinking'&&!reduced?t*0.5:Math.sin(t*0.4)*0.12);
    var salpha=(0.55+0.35*cur.bright)*cfg.starAlpha;
    if(state==='muted'||state==='error')salpha*=0.5;
    drawStar(CX,CY,starR*1.12,rot,salpha*0.25);
    drawStar(CX,CY,starR,rot,salpha);
    drawPulseRings(false);
  }

  // ── Design 4: robo Edutu ─────────────────────────────────────────────
  function drawRobot(t,now){
    var BR=R*1.06*cur.scale;
    var bob=reduced?0:Math.sin(t*1.5)*R*0.05;
    var by=CY+bob-R*0.04;
    ctx.beginPath();
    ctx.ellipse(CX,CY+R*1.28,BR*0.55+bob*0.6,BR*0.10,0,0,Math.PI*2);
    ctx.fillStyle='rgba(120,130,160,0.12)';
    ctx.fill();
    var g=ctx.createRadialGradient(CX-BR*0.35,by-BR*0.45,BR*0.1,CX,by,BR*1.15);
    g.addColorStop(0,'#FFFFFF');g.addColorStop(0.55,'#F1F2F5');
    g.addColorStop(0.85,'#D4D8DF');g.addColorStop(1,'#B9BEC7');
    ctx.beginPath();ctx.arc(CX,by,BR,0,Math.PI*2);
    ctx.fillStyle=g;ctx.fill();
    var vw=BR*0.62,vh=BR*0.34,vy=by-BR*0.10;
    var rim=ctx.createLinearGradient(CX-vw,vy,CX+vw,vy);
    rim.addColorStop(0,'#7C3AED');rim.addColorStop(0.5,'#EC4899');rim.addColorStop(1,'#F97316');
    var rimGlow=(state==='speaking'&&!reduced)?0.5+0.5*Math.abs(Math.sin(now/1000*5.5)):(state==='listening'?0.5+level*0.5:0.45);
    ctx.beginPath();ctx.ellipse(CX,vy,vw,vh,0,0,Math.PI*2);
    ctx.lineWidth=BR*0.075;ctx.strokeStyle=rim;
    ctx.globalAlpha=0.55+0.45*rimGlow;ctx.stroke();ctx.globalAlpha=1;
    ctx.beginPath();ctx.ellipse(CX,vy,vw*0.94,vh*0.90,0,0,Math.PI*2);
    ctx.fillStyle='#0B0B10';ctx.fill();
    ctx.save();
    ctx.beginPath();ctx.ellipse(CX,vy,vw*0.94,vh*0.90,0,0,Math.PI*2);ctx.clip();
    ctx.beginPath();ctx.ellipse(CX-vw*0.2,vy-vh*0.55,vw*0.9,vh*0.55,-0.15,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.10)';ctx.fill();
    ctx.restore();
    var blink=blinkScale(now);
    var eyeR=BR*0.105;
    if(state==='listening')eyeR*=1+level*0.45;
    var eyeSY=blink;
    if(state==='muted')eyeSY=0.10;
    if(state==='speaking'&&!reduced)eyeSY*=0.75+0.25*Math.abs(Math.sin(now/1000*7.5));
    var lookX=(state==='thinking'&&!reduced)?Math.sin(t*2.6)*BR*0.06:0;
    var dim=(state==='muted'||state==='error')?0.45:1;
    for(var e=-1;e<=1;e+=2){
      var ex=CX+e*vw*0.42+lookX, ey=vy+BR*0.005;
      var eg=ctx.createRadialGradient(ex,ey,0,ex,ey,eyeR*2.4);
      eg.addColorStop(0,'rgba(255,255,255,'+(0.30*dim).toFixed(3)+')');
      eg.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=eg;
      ctx.beginPath();ctx.arc(ex,ey,eyeR*2.4,0,Math.PI*2);ctx.fill();
      ctx.save();
      ctx.translate(ex,ey);ctx.scale(1,Math.max(0.06,eyeSY));
      ctx.beginPath();ctx.arc(0,0,eyeR,0,Math.PI*2);
      ctx.fillStyle='rgba(255,252,250,'+dim.toFixed(3)+')';
      ctx.fill();
      ctx.restore();
    }
    drawPulseRings(false);
  }

  // ── Design 6: glass swirl knot ───────────────────────────────────────
  var GLASS_COLS=[[168,85,247],[236,72,153],[96,165,250],[125,211,252],[216,180,254],[251,191,36],[249,168,212]];
  function drawGlass(t,now){
    var BR=R*1.10*(cur.scale+(state==='listening'?level*0.08:0));
    if(state==='speaking'&&!reduced)BR*=1+0.03*Math.sin(now/1000*5.2);
    var spin=(state==='thinking'&&!reduced)?2.2:1;
    ctx.save();
    ctx.beginPath();ctx.arc(CX,CY,BR,0,Math.PI*2);ctx.clip();
    var g0=ctx.createRadialGradient(CX-BR*0.25,CY-BR*0.25,BR*0.1,CX,CY,BR*1.1);
    g0.addColorStop(0,'#2A1743');g0.addColorStop(0.6,'#160C28');g0.addColorStop(1,'#0A0614');
    ctx.fillStyle=g0;ctx.fillRect(CX-BR,CY-BR,BR*2,BR*2);
    var g1=ctx.createRadialGradient(CX,CY+BR*0.15,0,CX,CY+BR*0.15,BR*0.8);
    g1.addColorStop(0,rgba([192,132,252],0.30*cur.bright));
    g1.addColorStop(0.55,rgba([88,28,135],0.18*cur.bright));
    g1.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g1;ctx.fillRect(CX-BR,CY-BR,BR*2,BR*2);
    ctx.globalCompositeOperation='lighter';
    var ribbons=7;
    for(var i=0;i<ribbons;i++){
      var dir=(i%2===0)?1:-1;
      var rot=t*(0.14+0.035*i)*dir*spin+i*0.9;
      var rx=BR*(0.52+0.14*(i%3)), ry=BR*(0.86-0.10*(i%4));
      var a0=i*1.3+t*0.22*dir, arc=Math.PI*(1.05+0.18*(i%2));
      var col=GLASS_COLS[i%GLASS_COLS.length];
      var glow=(state==='speaking'&&!reduced)?0.6+0.4*Math.abs(Math.sin(now/1000*5.5+i)):(state==='listening'?0.6+level*0.6:0.55);
      ctx.beginPath();ctx.ellipse(CX,CY,rx,ry,rot,a0,a0+arc);
      ctx.strokeStyle=rgba(col,0.11*cur.bright*glow*1.6);
      ctx.lineWidth=BR*0.13;ctx.lineCap='round';ctx.stroke();
      ctx.beginPath();ctx.ellipse(CX,CY,rx*0.98,ry*0.98,rot,a0+0.12,a0+arc-0.12);
      ctx.strokeStyle='rgba(255,255,255,'+(0.16*cur.bright*glow).toFixed(3)+')';
      ctx.lineWidth=1.7;ctx.stroke();
    }
    ctx.globalCompositeOperation='source-over';
    ctx.restore();
    ctx.beginPath();ctx.arc(CX,CY,BR,0,Math.PI*2);
    ctx.strokeStyle='rgba(233,213,255,'+(0.28*cur.bright).toFixed(3)+')';
    ctx.lineWidth=1.5;ctx.stroke();
    ctx.beginPath();ctx.arc(CX,CY,BR-3,Math.PI*1.08,Math.PI*1.5);
    ctx.strokeStyle='rgba(255,255,255,'+(0.4*cur.bright).toFixed(3)+')';
    ctx.lineWidth=3.2;ctx.lineCap='round';ctx.stroke();
    drawPulseRings(false);
  }

  // ── Design 7: kawaii jelly blob ──────────────────────────────────────
  function drawBlob(t,now){
    var BS=R*1.08*(cur.scale+(state==='listening'?level*0.10:0));
    var ph=(state==='speaking'&&!reduced)?now/1000*6:t*2.0;
    var s=(state==='speaking'&&!reduced)?0.085:(reduced?0.015:0.045);
    var sx=1+s*Math.sin(ph), sy=1-s*Math.sin(ph);
    var by0=CY+((state==='speaking'&&!reduced)?-Math.abs(Math.sin(now/1000*6))*R*0.06:(reduced?0:Math.sin(t*1.3)*R*0.03));
    ctx.save();
    ctx.translate(CX,by0);ctx.scale(sx,sy);
    var glow=ctx.createRadialGradient(0,0,BS*0.5,0,0,BS*1.45);
    glow.addColorStop(0,'rgba(240,230,255,0.14)');glow.addColorStop(1,'rgba(240,230,255,0)');
    ctx.fillStyle=glow;
    ctx.beginPath();ctx.arc(0,0,BS*1.45,0,Math.PI*2);ctx.fill();
    // feet bumps
    for(var f=-1;f<=1;f+=2){
      ctx.beginPath();ctx.arc(f*BS*0.28,BS*0.92,BS*0.18,0,Math.PI*2);
      ctx.fillStyle='#E8DBFA';ctx.fill();
    }
    // body
    var bg=ctx.createLinearGradient(0,-BS,0,BS);
    bg.addColorStop(0,'#EAF6FF');bg.addColorStop(0.45,'#EDE4FF');bg.addColorStop(1,'#F7C8E6');
    ctx.beginPath();ctx.arc(0,0,BS,0,Math.PI*2);
    ctx.fillStyle=bg;ctx.fill();
    // colour glow spots
    ctx.globalCompositeOperation='lighter';
    var spots=[[-BS*0.45,BS*0.55,BS*0.4,[255,170,220]],[BS*0.5,-BS*0.4,BS*0.35,[150,220,255]],[BS*0.45,BS*0.6,BS*0.3,[255,190,235]]];
    for(var sp=0;sp<spots.length;sp++){
      var q=spots[sp];
      var sg=ctx.createRadialGradient(q[0],q[1],0,q[0],q[1],q[2]);
      sg.addColorStop(0,rgba(q[3],0.35*cur.bright));sg.addColorStop(1,rgba(q[3],0));
      ctx.fillStyle=sg;
      ctx.beginPath();ctx.arc(q[0],q[1],q[2],0,Math.PI*2);ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';
    // specular highlights
    ctx.beginPath();ctx.ellipse(-BS*0.34,-BS*0.45,BS*0.16,BS*0.09,-0.5,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.85)';ctx.fill();
    ctx.beginPath();ctx.arc(-BS*0.12,-BS*0.58,BS*0.045,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.7)';ctx.fill();
    // eyes
    var blink=blinkScale(now);
    var eyeSY=blink;
    if(state==='muted')eyeSY=0.10;
    if(state==='speaking'&&!reduced)eyeSY*=0.8+0.2*Math.abs(Math.sin(now/1000*7.5));
    var lookX=(state==='thinking'&&!reduced)?Math.sin(t*2.6)*BS*0.06:0;
    var dim=(state==='muted'||state==='error')?0.5:1;
    var eyeRy=BS*0.085*(state==='listening'?1+level*0.35:1);
    for(var e=-1;e<=1;e+=2){
      ctx.save();
      ctx.translate(e*BS*0.28+lookX,-BS*0.08);ctx.scale(1,Math.max(0.08,eyeSY));
      ctx.beginPath();ctx.ellipse(0,0,BS*0.055,eyeRy,0,0,Math.PI*2);
      ctx.fillStyle=rgba([30,42,120],dim);ctx.fill();
      ctx.beginPath();ctx.arc(-BS*0.015,-eyeRy*0.35,BS*0.016,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,'+(0.9*dim).toFixed(3)+')';ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    drawPulseRings(false);
  }

  // ── Design 8: petal halo ─────────────────────────────────────────────
  var PP1=[236,72,153],PP2=[124,58,237];
  function drawPetals(t,now){
    var n=7;
    var haloR=R*0.72*(cur.scale+(state==='listening'?level*0.10:0))*(state==='thinking'?0.85:1);
    var orbit=t*0.25*((state==='thinking'&&!reduced)?3:1);
    var chase=(now/1000*((state==='speaking'&&!reduced)?1.6:0.35))%1;
    var rx=R*0.30*(1+(state==='listening'?level*0.15:0)), ry=rx*0.66;
    for(var pass=0;pass<2;pass++){
      if(pass===0)ctx.globalCompositeOperation='lighter';
      else ctx.globalCompositeOperation='source-over';
      for(var i=0;i<n;i++){
        var frac=i/n;
        var a=orbit+frac*Math.PI*2-Math.PI/2;
        var px=CX+Math.cos(a)*haloR, py=CY+Math.sin(a)*haloR;
        var m=(Math.sin(a)+1)/2;
        var col=mix(PP1,PP2,m);
        var d=Math.abs(((frac-chase)%1+1.5)%1-0.5)*2;
        var hot=Math.max(0,1-d*2.2);
        var tilt=a+Math.PI/2+0.35;
        if(pass===0){
          var gg=ctx.createRadialGradient(px,py,0,px,py,rx*1.9);
          gg.addColorStop(0,rgba(col,(0.16+hot*0.22)*cur.bright));
          gg.addColorStop(1,rgba(col,0));
          ctx.fillStyle=gg;
          ctx.beginPath();ctx.arc(px,py,rx*1.9,0,Math.PI*2);ctx.fill();
        }else{
          ctx.save();
          ctx.translate(px,py);ctx.rotate(tilt);
          var pg=ctx.createRadialGradient(-rx*0.25,-ry*0.35,0,0,0,rx);
          var lite=mix(col,[255,255,255],0.25+hot*0.3);
          pg.addColorStop(0,rgba(lite,(0.95)*Math.min(1,cur.bright+hot*0.3)));
          pg.addColorStop(1,rgba(mix(col,[10,5,30],0.35),0.9*cur.bright));
          ctx.fillStyle=pg;
          ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.ellipse(-rx*0.3,-ry*0.4,rx*0.28,ry*0.16,-0.4,0,Math.PI*2);
          ctx.fillStyle='rgba(255,255,255,'+(0.30+hot*0.25).toFixed(3)+')';ctx.fill();
          ctx.restore();
        }
      }
    }
    drawPulseRings(false);
  }

  // ── Pulse rings (shared) ─────────────────────────────────────────────
  function drawPulseRings(dotted){
    for(var j=pulses.length-1;j>=0;j--){
      var pu=pulses[j];
      if(pu.a<=0||pu.r>Math.max(W,H)){pulses.splice(j,1);continue;}
      // Eased tail — a linear fade pops out of existence at the rim.
      var pa=Math.pow(pu.a,1.5);
      if(dotted){
        var dots=64;
        ctx.fillStyle='rgba(147,197,253,'+(pa*0.55).toFixed(3)+')';
        for(var k2=0;k2<dots;k2++){
          var an=(k2/dots)*Math.PI*2+pu.r*0.002;
          ctx.fillRect(CX+Math.cos(an)*pu.r,CY+Math.sin(an)*pu.r,1.6,1.6);
        }
      }else{
        ctx.beginPath();ctx.arc(CX,CY,pu.r,0,Math.PI*2);
        ctx.strokeStyle='rgba(190,150,253,'+(pa*0.4).toFixed(3)+')';
        ctx.lineWidth=2;ctx.stroke();
      }
    }
  }

  // ── Frame loop ───────────────────────────────────────────────────────
  var t=0,rotY=0,rotX=0,last=performance.now();
  function frame(now){
    var dt=Math.min((now-last)/1000,0.05);last=now;
    var k=1-Math.pow(0.002,dt);
    for(var key in tgt){cur[key]+=(tgt[key]-cur[key])*k;}
    level+=(tgtLevel-level)*(1-Math.pow(0.0001,dt));
    var speed=reduced?cur.speed*0.12:cur.speed;
    t+=dt*(0.55+speed);
    rotY+=dt*speed*1.6;
    rotX=Math.sin(t*0.14)*0.35;

    if(!reduced&&cur.pulseEvery>0&&now-lastPulse>cur.pulseEvery){
      lastPulse=now;pulses.push({r:R*cur.scale*0.9,a:0.7});
    }
    if(!reduced&&state==='listening'&&level>0.62&&now-lastPulse>700){
      lastPulse=now;pulses.push({r:R*cur.scale*0.9,a:0.5});
    }
    for(var j=0;j<pulses.length;j++){pulses[j].r+=dt*R*1.4;pulses[j].a-=dt*0.55;}

    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    drawAmbient(t);
    if(design==='ring')drawRing(t,now);
    else if(design==='bubble')drawNebulaSphere(BUBBLE_CFG,t,now);
    else if(design==='crystal')drawNebulaSphere(CRYSTAL_CFG,t,now);
    else if(design==='robot')drawRobot(t,now);
    else if(design==='glass')drawGlass(t,now);
    else if(design==='blob')drawBlob(t,now);
    else if(design==='petals')drawPetals(t,now);
    else drawParticles(t,rotY,rotX,now);
    drawVignette();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script></body></html>`;

export function ParticleOrb({ size = 320, design, state, level, reducedMotion, fill = false }: ParticleOrbProps) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);

  const push = () => {
    if (!readyRef.current) return;
    webRef.current?.injectJavaScript(
      `window.__orb&&window.__orb.set(${JSON.stringify({ design, state, level, reducedMotion })});true;`,
    );
  };

  useEffect(push, [design, state, level, reducedMotion]);

  return (
    <View pointerEvents="none" style={fill ? StyleSheet.absoluteFill : { width: size, height: size }}>
      <WebView
        ref={webRef}
        source={{ html: ORB_HTML }}
        originWhitelist={['*']}
        style={styles.web}
        scrollEnabled={false}
        overScrollMode="never"
        bounces={false}
        javaScriptEnabled
        domStorageEnabled={false}
        androidLayerType="hardware"
        setBuiltInZoomControls={false}
        onMessage={() => {}}
        onLoadEnd={() => {
          readyRef.current = true;
          push();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  web: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
