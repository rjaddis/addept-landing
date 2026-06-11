/* Addept Automotive — v5 "stepped cinema" engine.
   Noomo-style section navigation: the page parks at a section; a scroll gesture
   plays the video to the next stop. Oryzo-style scrubbed text choreography with
   directional entrances, hairline rules that draw across the screen, and a
   floating-card services section with depth, parallax and hover physics.
   Frame engine, colour grade, ghost words and machine-tracked annotations carry
   over from v4 (bitmap window, sub-frame blending, ±2 substitution cap). */
(function () {
  "use strict";
  if (document.getElementById("alp-root")) return;

  // ── Config ─────────────────────────────────────────────────────────────────
  var SCRIPT_BASE = (function () {
    var s = document.currentScript;
    if (s && s.src) return s.src.replace(/\/[^/]*$/, "");
    return "";
  })();
  var FRAME_BASE = SCRIPT_BASE + "/frames/";
  var TOTAL_FRAMES = 238; // frames 239+ carry Gearbook branding — never load them
  var INITIAL_BATCH = 24;
  var PHONE_DISPLAY = "027 439 3403";
  var PHONE_TEL = "tel:+64274393403";
  var EMAIL = "addeptauto@gmail.com";
  var CAL_URL = "https://api.leadconnectorhq.com/widget/booking/jk0S1digTnc8PT4F1AmO";
  var BADGE = SCRIPT_BASE + "/addept-logo-badge.svg";
  var MAPS = "https://maps.google.com/?q=35B+Brookes+Road,+Frankton,+Queenstown+9300";
  var introActive = true; // gates input + section render until the loader's badge-burst hands off

  function frameSrc(i) {
    var n = String(i + 1); while (n.length < 4) n = "0" + n;
    return FRAME_BASE + "frame_" + n + ".jpg";
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { return t * t * (3 - 2 * t); }
  function easeIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  /* expo pair snaps to exactly 0/1 at the bounds — the parked render runs once
     and freezes, so settled states must not hold residual sub-pixel values */
  function expoOut(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function expoIn(t) { return t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, 10 * (t - 1)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ── Styles ─────────────────────────────────────────────────────────────────
  var css = ""
  + "#alp-root{position:fixed;inset:0;overflow:hidden;background:#000;z-index:999990;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;color:#fff;overscroll-behavior:none;}"
  + "#alp-root.alp-flowmode{overflow-y:auto;}"
  + ":where(#alp-root) *,:where(#alp-root) *::before,:where(#alp-root) *::after{box-sizing:border-box;margin:0;padding:0;}"
  + "#alp-canvas{position:fixed;inset:0;width:100vw;height:100vh;z-index:0;transform-origin:50% 60%;will-change:transform;}"
  + ".alp-vignette{position:fixed;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse 85% 75% at 50% 45%,transparent 35%,rgba(0,0,0,.6) 100%);}"
  + "#alp-dim{position:fixed;inset:0;pointer-events:none;z-index:2;}"
  + "#alp-glow{position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;box-shadow:inset 0 0 140px 10px rgba(255,166,77,.5),inset 0 0 60px 4px rgba(255,120,40,.28);}"
  /* ghost words */
  + ".alp-ghost{position:fixed;top:50%;left:0;z-index:4;pointer-events:none;font-weight:800;font-size:clamp(5rem,16vw,15rem);letter-spacing:-.04em;color:rgba(255,255,255,.07);white-space:nowrap;will-change:transform,opacity;opacity:0;}"
  /* annotations */
  + ".alp-anno{position:fixed;z-index:9;pointer-events:none;opacity:0;will-change:transform,opacity;left:0;top:0;}"
  + ".alp-anno .alp-abox{position:absolute;inset:0;border:1px dashed rgba(255,255,255,.38);}"
  + ".alp-anno i{position:absolute;width:14px;height:14px;border-style:solid;border-color:#fff;border-width:0;}"
  + ".alp-anno i.tl{top:-2px;left:-2px;border-top-width:2px;border-left-width:2px;}"
  + ".alp-anno i.tr{top:-2px;right:-2px;border-top-width:2px;border-right-width:2px;}"
  + ".alp-anno i.bl{bottom:-2px;left:-2px;border-bottom-width:2px;border-left-width:2px;}"
  + ".alp-anno i.br{bottom:-2px;right:-2px;border-bottom-width:2px;border-right-width:2px;}"
  + ".alp-anno .alp-alabel{position:absolute;left:0;display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:7px;background:rgba(5,5,5,.78);border:1px solid rgba(255,255,255,.12);font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.78);white-space:nowrap;}"
  + ".alp-anno .alp-alabel b{display:block;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.8);flex-shrink:0;}"
  + ".alp-anno .alp-alabel.top{bottom:calc(100% + 12px);}"
  + ".alp-anno .alp-aline{position:absolute;left:24px;width:1px;background:rgba(255,255,255,.3);height:12px;}"
  + ".alp-anno .alp-aline.top{bottom:100%;}"
  + "@media (max-width:900px){.alp-anno,.alp-float,.alp-orn{display:none;}}"
  /* sections */
  + ".alp-section{position:fixed;inset:0;z-index:10;display:flex;align-items:center;pointer-events:none;opacity:0;visibility:hidden;}"
  + ".alp-section.alp-top{align-items:flex-start;}"
  + ".alp-section.alp-top .alp-inner{padding-top:max(13vh,100px);}"
  + ".alp-section .alp-inner{pointer-events:auto;will-change:transform;width:100%;}"
  /* masked word reveal: .alp-wm clips, .alp-w slides within it. Vertical
     padding + negative margin widen the clip window for ascenders/descenders
     without affecting layout; no horizontal padding (would eat word spacing) */
  + ".alp-wm{display:inline-block;overflow:hidden;vertical-align:top;padding:.12em 0 .18em;margin:-.12em 0 -.18em;}"
  + ".alp-w{display:inline-block;transform:translateY(130%);}"
  /* deco: blueprint boxes that draw themselves around key content */
  + ".alp-box{position:relative;display:inline-block;padding:30px 34px;}"
  + ".alp-box .alp-be{position:absolute;display:block;background:rgba(255,255,255,.16);transform:scaleX(0);}"
  + ".alp-box .alp-be.t{left:0;right:0;top:0;height:1px;}"
  + ".alp-box .alp-be.b{left:0;right:0;bottom:0;height:1px;}"
  + ".alp-box .alp-be.l{top:0;bottom:0;left:0;width:1px;transform:scaleY(0);}"
  + ".alp-box .alp-be.r{top:0;bottom:0;right:0;width:1px;transform:scaleY(0);}"
  + ".alp-box.alp-dash .alp-be.t,.alp-box.alp-dash .alp-be.b{background:repeating-linear-gradient(90deg,rgba(255,255,255,.3) 0 5px,transparent 5px 11px);}"
  + ".alp-box.alp-dash .alp-be.l,.alp-box.alp-dash .alp-be.r{background:repeating-linear-gradient(180deg,rgba(255,255,255,.3) 0 5px,transparent 5px 11px);}"
  + ".alp-box.alp-corners .alp-be{display:none;}"
  + ".alp-box .alp-bc{position:absolute;width:13px;height:13px;border-style:solid;border-color:rgba(255,255,255,.8);border-width:0;opacity:0;}"
  + ".alp-box .alp-bc.tl{top:-2px;left:-2px;border-top-width:2px;border-left-width:2px;}"
  + ".alp-box .alp-bc.tr{top:-2px;right:-2px;border-top-width:2px;border-right-width:2px;}"
  + ".alp-box .alp-bc.bl{bottom:-2px;left:-2px;border-bottom-width:2px;border-left-width:2px;}"
  + ".alp-box .alp-bc.br{bottom:-2px;right:-2px;border-bottom-width:2px;border-right-width:2px;}"
  + ".alp-box .alp-btab{position:absolute;top:0;left:22px;transform:translateY(-50%);display:inline-flex;align-items:center;gap:7px;padding:4px 11px;border-radius:6px;background:rgba(5,5,5,.85);border:1px solid rgba(255,255,255,.14);font-size:9px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.6);white-space:nowrap;opacity:0;}"
  /* floating frosted micro-cards, drifting ornaments, pulse dots */
  + ".alp-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#9ef0b4;box-shadow:0 0 10px rgba(158,240,180,.75);animation:alp-pdot 2.2s ease-in-out infinite;flex-shrink:0;}"
  + ".alp-dot.alp-off{background:#f0a89e;box-shadow:0 0 10px rgba(240,168,158,.7);}"
  + "@keyframes alp-pdot{0%,100%{opacity:.35}50%{opacity:1}}"
  + ".alp-float{position:absolute;z-index:14;pointer-events:none;opacity:0;will-change:transform,opacity,filter;}"
  + ".alp-float a{pointer-events:auto;color:inherit;text-decoration:none;}"
  + ".alp-fbob{animation:alp-bob 8s ease-in-out infinite;}"
  + ".alp-fpx{transition:transform 1.1s cubic-bezier(.16,.8,.26,1);}"
  + ".alp-fchip{display:inline-flex;align-items:center;gap:9px;padding:11px 16px;border-radius:10px;font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.85);"
  +   "background:linear-gradient(165deg,rgba(255,255,255,.13),rgba(255,255,255,.05));-webkit-backdrop-filter:blur(12px) saturate(1.1);backdrop-filter:blur(12px) saturate(1.1);"
  +   "border:1px solid rgba(255,255,255,.2);box-shadow:0 18px 50px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.25);white-space:nowrap;}"
  + ".alp-fchip svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;}"
  + ".alp-fcard2{display:block;min-width:178px;padding:14px 16px;border-radius:12px;background:linear-gradient(165deg,rgba(255,255,255,.13),rgba(255,255,255,.05));-webkit-backdrop-filter:blur(14px) saturate(1.1);backdrop-filter:blur(14px) saturate(1.1);border:1px solid rgba(255,255,255,.2);box-shadow:0 22px 60px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.25);}"
  + ".alp-fcard2 .alp-ft{display:flex;align-items:center;gap:7px;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:9px;}"
  + ".alp-fcard2 .alp-fr{display:flex;align-items:center;gap:8px;padding:3.5px 0;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.85);}"
  + ".alp-fcard2 .alp-fr svg{width:12px;height:12px;stroke:#9ef0b4;fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;}"
  + ".alp-clock{display:block;width:46px;height:46px;margin:2px auto 8px;}"
  + ".alp-clock .alp-hand-h{animation:alp-rot 43200s linear infinite;transform-origin:22px 22px;}"
  + ".alp-clock .alp-hand-m{animation:alp-rot 3600s linear infinite;transform-origin:22px 22px;}"
  + "@keyframes alp-rot{to{transform:rotate(360deg)}}"
  + ".alp-orn{position:absolute;z-index:5;pointer-events:none;opacity:0;color:rgba(255,255,255,.15);font-size:19px;font-weight:300;will-change:transform,opacity;}"
  + ".alp-orn span{display:flex;gap:28px;animation:alp-drift 17s ease-in-out infinite;}"
  + ".alp-orn i{font-style:normal;}"
  + "@keyframes alp-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(12px,-15px)}}"
  /* cta sonar rings */
  + ".alp-ringwrap{position:absolute;left:50%;top:50%;width:130px;height:130px;transform:translate(-50%,-50%);pointer-events:none;}"
  + ".alp-ringwrap i{position:absolute;inset:0;border-radius:50%;border:1px solid rgba(255,255,255,.35);opacity:0;animation:alp-ring 3.3s cubic-bezier(.2,.6,.4,1) infinite;}"
  + ".alp-ringwrap i:nth-child(2){animation-delay:1.1s;}"
  + ".alp-ringwrap i:nth-child(3){animation-delay:2.2s;}"
  + "@keyframes alp-ring{0%{transform:scale(.5);opacity:0}16%{opacity:.45}70%,100%{transform:scale(1.6);opacity:0}}"
  /* hairline rules that draw across */
  + ".alp-hr{display:block;height:1px;background:rgba(255,255,255,.22);margin:26px 0;transform:scaleX(0);will-change:transform;}"
  /* meta row (Noomo style) */
  + ".alp-meta{display:flex;align-items:center;gap:12px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.45);}"
  + ".alp-meta .alp-chip{padding:3px 10px;border:1px solid rgba(255,255,255,.25);border-radius:99px;color:rgba(255,255,255,.7);}"
  /* loading — badge assembly: the emblem scales up with real progress under a
     big rolling counter, then shatters into its traced pieces as the camera
     pushes through into the film (Hubtown-style burst, automotive exploded view) */
  + "#alp-loader{position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#000;transition:background .6s ease;}"
  + "#alp-loader.alp-lout{background:rgba(0,0,0,0);}"
  + "#alp-lcore{position:relative;transform-origin:50% 50%;will-change:transform;}"
  /* the emblem develops in from a blur, then floats; a light sheen sweeps
     across the artwork once (masked to the badge shape) as it arrives */
  + "#alp-lbadge{width:clamp(300px,44vw,560px);opacity:0;will-change:transform,filter;}"
  + "#alp-lbadge.alp-lin{animation:alp-bdev 1s cubic-bezier(.2,.7,.3,1) forwards,alp-bfloat 7s ease-in-out 1.4s infinite;}"
  + "@keyframes alp-bdev{0%{opacity:0;filter:blur(12px);transform:scale(.94)}100%{opacity:1;filter:blur(0);transform:scale(1)}}"
  + "@keyframes alp-bfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}"
  + "#alp-lbadge svg{width:100%;height:auto;display:block;overflow:visible;}"
  + "#alp-lbadge img{width:100%;display:block;}"
  + "#alp-lsheen{position:absolute;inset:0;pointer-events:none;opacity:0;"
  +   "background:linear-gradient(105deg,transparent 32%,rgba(255,255,255,.3) 46%,rgba(255,255,255,.07) 52%,transparent 64%);background-size:240% 100%;background-position:130% 0;"
  +   "-webkit-mask:url(" + BADGE + ") center/contain no-repeat;mask:url(" + BADGE + ") center/contain no-repeat;}"
  + "#alp-lsheen.alp-on{animation:alp-sheen 1.7s cubic-bezier(.45,0,.3,1) .5s forwards;}"
  + "@keyframes alp-sheen{0%{opacity:0;background-position:130% 0}12%{opacity:1}85%{opacity:.8}100%{opacity:0;background-position:-50% 0}}"
  /* drifting amber embers behind the emblem */
  + "#alp-lembers{position:absolute;inset:0;pointer-events:none;overflow:hidden;}"
  + "#alp-lembers i{position:absolute;top:55%;border-radius:99px;background:#ffc9a0;box-shadow:0 0 6px 2px rgba(255,160,70,.6);opacity:0;animation:alp-ember linear infinite;}"
  + "#alp-lembers i:nth-child(1){left:35%;width:2px;height:2px;animation-duration:6.5s;animation-delay:-2s;}"
  + "#alp-lembers i:nth-child(2){left:39%;width:3px;height:3px;animation-duration:8s;animation-delay:-5.5s;}"
  + "#alp-lembers i:nth-child(3){left:43%;width:2px;height:2px;animation-duration:5.5s;animation-delay:-3.4s;}"
  + "#alp-lembers i:nth-child(4){left:46%;width:2px;height:2px;animation-duration:7.5s;animation-delay:-1s;}"
  + "#alp-lembers i:nth-child(5){left:50%;width:3px;height:3px;animation-duration:6s;animation-delay:-4.6s;}"
  + "#alp-lembers i:nth-child(6){left:53%;width:2px;height:2px;animation-duration:8.5s;animation-delay:-7s;}"
  + "#alp-lembers i:nth-child(7){left:57%;width:2px;height:2px;animation-duration:5s;animation-delay:-2.7s;}"
  + "#alp-lembers i:nth-child(8){left:61%;width:3px;height:3px;animation-duration:7s;animation-delay:-5s;}"
  + "#alp-lembers i:nth-child(9){left:65%;width:2px;height:2px;animation-duration:6.8s;animation-delay:-.8s;}"
  + "#alp-lembers i:nth-child(10){left:48%;width:2px;height:2px;animation-duration:9s;animation-delay:-6.2s;}"
  + "#alp-lembers i:nth-child(11){left:41%;width:2px;height:2px;animation-duration:7.8s;animation-delay:-3s;}"
  + "#alp-lembers i:nth-child(12){left:55%;width:2px;height:2px;animation-duration:6.2s;animation-delay:-1.6s;}"
  + "#alp-lembers i:nth-child(13){left:30%;width:2px;height:2px;animation-duration:9.5s;animation-delay:-4s;}"
  + "#alp-lembers i:nth-child(14){left:69%;width:2px;height:2px;animation-duration:8.8s;animation-delay:-6.8s;}"
  + "#alp-lembers i:nth-child(15){left:25%;width:2px;height:2px;animation-duration:10s;animation-delay:-2.3s;}"
  + "#alp-lembers i:nth-child(16){left:74%;width:2px;height:2px;animation-duration:9.2s;animation-delay:-7.6s;}"
  + "@keyframes alp-ember{0%{transform:translateY(16vh) translateX(0) scale(1);opacity:0}7%{opacity:.9}28%{transform:translateY(2vh) translateX(7px) scale(.95);opacity:.55}55%{transform:translateY(-12vh) translateX(-6px) scale(.8);opacity:.65}100%{transform:translateY(-28vh) translateX(4px) scale(.45);opacity:0}}"
  /* orbit stroke that draws itself around the emblem with an amber pen-tip */
  + "#alp-larc{position:absolute;left:-16%;top:-20%;width:132%;height:140%;pointer-events:none;overflow:visible;}"
  + "#alp-larc path{fill:none;stroke-linecap:round;}"
  + "#alp-larc .alp-arcb{stroke:rgba(255,255,255,.32);stroke-width:2.2;}"
  + "#alp-larc .alp-arct{stroke:#ffa64d;stroke-width:3;filter:drop-shadow(0 0 6px rgba(255,166,77,.8));}"
  /* odometer counter, bottom centre — each digit rolls in a masked column;
     the workshop line takes its place at 100 */
  + "#alp-lpct{position:absolute;bottom:26px;left:0;right:0;text-align:center;font-size:13px;font-weight:600;letter-spacing:.18em;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.85);transition:opacity .35s;}"
  + ".alp-odc{display:inline-block;height:1.1em;overflow:hidden;vertical-align:top;}"
  + ".alp-odw{display:block;transition:transform .55s cubic-bezier(.22,.85,.3,1);}"
  + ".alp-odw b{display:block;height:1.1em;line-height:1.1em;font-weight:600;}"
  /* tagline matches the counter's cut; letters drop into place one by one,
     then the trailing dots count up in the beat before the burst */
  + "#alp-lstat{position:absolute;bottom:26px;left:0;right:0;text-align:center;font-size:13px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.85);opacity:0;}"
  + "#alp-lstat.alp-on{opacity:1;}"
  + "#alp-lstat em{font-style:normal;display:inline-block;opacity:0;transform:translateY(-.9em);}"
  + "#alp-lstat.alp-on em{animation:alp-lfall .24s cubic-bezier(.25,.9,.3,1.18) forwards;}"
  + "@keyframes alp-lfall{to{opacity:1;transform:translateY(0)}}"
  + "#alp-lstat i{font-style:normal;display:inline-block;margin-left:3px;opacity:0;}"
  + "#alp-lstat.alp-on i:nth-child(1){animation:alp-dot .14s ease .46s forwards;}"
  + "#alp-lstat.alp-on i:nth-child(2){animation:alp-dot .14s ease .66s forwards;}"
  + "#alp-lstat.alp-on i:nth-child(3){animation:alp-dot .14s ease .86s forwards;}"
  + "@keyframes alp-dot{to{opacity:1}}"
  /* the point everything collapses into, then streaks out of — the offset
     warm/cool shadows smear into chromatic fringes when the beam stretches */
  + "#alp-ldot{position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:99px;background:radial-gradient(circle,#fff 0%,#fff 32%,#ffb877 62%,rgba(255,150,60,0) 100%);box-shadow:0 0 22px 6px rgba(255,166,77,.55),0 -3px 9px rgba(255,84,36,.5),0 3px 9px rgba(255,224,168,.5);opacity:0;transform:scale(.2);will-change:transform,opacity,filter;}"
  + "#alp-ldot.alp-on{transition:transform .2s cubic-bezier(.2,.8,.3,1.4),opacity .18s ease;opacity:1;transform:scale(1);}"
  /* one-frame exposure breath as the film takes over */
  + "#alp-lveil{position:absolute;inset:0;pointer-events:none;background:#fff;opacity:0;}"
  + "#alp-lveil.alp-on{animation:alp-veil 1s ease-out forwards;}"
  + "@keyframes alp-veil{0%{opacity:0}22%{opacity:.12}100%{opacity:0}}"
  /* amber aurora around the edges — three blurred blobs lapping in from
     offscreen, each drifting on its own slow orbit; a soft rim glow and the
     parent breathe modulate the whole thing. Flares on burst. */
  + "#alp-lglow{position:absolute;inset:0;pointer-events:none;opacity:0;overflow:hidden;box-shadow:inset 0 0 130px 10px rgba(255,166,77,.18),inset 0 0 54px 4px rgba(255,120,40,.1);}"
  + "#alp-lglow i{position:absolute;display:block;border-radius:50%;filter:blur(46px);will-change:transform;}"
  + "#alp-lglow i:nth-child(1){width:70vw;height:46vh;left:-12vw;top:-30vh;background:radial-gradient(ellipse,rgba(255,166,77,.32),transparent 65%);animation:alp-aur1 7.5s ease-in-out infinite alternate;}"
  + "#alp-lglow i:nth-child(2){width:46vw;height:40vh;right:-26vw;top:22vh;background:radial-gradient(ellipse,rgba(255,120,40,.26),transparent 65%);animation:alp-aur2 9s ease-in-out infinite alternate;}"
  + "#alp-lglow i:nth-child(3){width:64vw;height:42vh;left:-10vw;bottom:-26vh;background:radial-gradient(ellipse,rgba(255,196,112,.24),transparent 65%);animation:alp-aur3 6.5s ease-in-out infinite alternate;}"
  /* multi-stop wander paths with a little rotation so the lobes change shape
     as they roam — the right blob stays mostly offscreen, dancing vertically */
  + "@keyframes alp-aur1{0%{transform:translate(-9vw,1vh) rotate(-4deg) scale(1)}35%{transform:translate(4vw,-3vh) rotate(5deg) scale(1.16)}70%{transform:translate(11vw,4vh) rotate(-3deg) scale(1.04)}100%{transform:translate(16vw,-2vh) rotate(8deg) scale(1.26)}}"
  + "@keyframes alp-aur2{0%{transform:translate(2vw,-7vh) rotate(3deg) scale(1.1)}40%{transform:translate(-2vw,3vh) rotate(-6deg) scale(.92)}75%{transform:translate(1vw,9vh) rotate(4deg) scale(1.06)}100%{transform:translate(0,-4vh) rotate(-3deg) scale(1.18)}}"
  + "@keyframes alp-aur3{0%{transform:translate(12vw,2vh) rotate(5deg) scale(1.06)}30%{transform:translate(2vw,-3vh) rotate(-4deg) scale(1.22)}65%{transform:translate(-6vw,1vh) rotate(6deg) scale(1)}100%{transform:translate(-10vw,-3vh) rotate(-7deg) scale(1.3)}}"
  + "#alp-lglow.alp-on{animation:alp-glowin 1.6s ease .4s forwards,alp-lbreathe 5.6s ease-in-out 2.2s infinite;}"
  + "@keyframes alp-glowin{to{opacity:1}}"
  + "@keyframes alp-lbreathe{0%,100%{opacity:1}50%{opacity:.6}}"
  + "@media (max-width:760px){#alp-lbadge{width:78vw;}}"
  + "#alp-fx{position:fixed;inset:0;z-index:1000001;pointer-events:none;}"
  + ".alp-nocursor,.alp-nocursor *{cursor:none!important;}"
  /* nav */
  + "#alp-nav{position:fixed;top:0;left:0;right:0;z-index:30;display:flex;align-items:center;justify-content:space-between;padding:18px 32px;}"
  + "#alp-nav .alp-brand{font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#fff;text-decoration:none;white-space:nowrap;transition:opacity .25s;}"
  + "#alp-nav .alp-brand:hover{opacity:.8;}"
  + "#alp-nav .alp-brand b{font-weight:800;}"
  + "#alp-nav .alp-brand span{font-weight:400;color:rgba(255,255,255,.75);}"
  + "#alp-nav a.alp-call{padding:9px 20px;border-radius:99px;border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.8);font-family:'Space Grotesk',Inter,sans-serif;font-weight:600;text-transform:uppercase;font-size:12px;letter-spacing:.14em;text-decoration:none;background:rgba(10,10,10,.45);transition:background .25s,color .25s,transform .25s;white-space:nowrap;}"
  + "#alp-nav a.alp-call:hover{background:#fff;color:#000;transform:scale(1.04);}"
  /* dots */
  + "#alp-dots{position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:30;display:flex;flex-direction:column;gap:9px;transition:opacity .4s;}"
  + "#alp-dots button{position:relative;display:flex;align-items:center;justify-content:flex-end;background:none;border:none;cursor:pointer;padding:2px;}"
  + "#alp-dots button i{display:block;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.2);transition:all .3s;}"
  + "#alp-dots button.alp-on i{width:8px;height:8px;background:rgba(255,255,255,.85);}"
  + "#alp-dots button:hover i{background:rgba(255,255,255,.7);transform:scale(1.3);}"
  + "#alp-dots button span{position:absolute;right:18px;padding:2px 8px;border-radius:5px;font-size:9px;color:rgba(255,255,255,.65);background:rgba(0,0,0,.7);opacity:0;transition:opacity .2s;white-space:nowrap;pointer-events:none;}"
  + "#alp-dots button:hover span{opacity:1;}"
  /* type */
  + ".alp-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:5px 13px;border-radius:99px;border:1px solid rgba(255,255,255,.12);background:rgba(10,10,10,.55);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:22px;}"
  + ".alp-h1{font-weight:800;line-height:1.08;letter-spacing:-.03em;font-size:clamp(1.5rem,3.2vw,2.4rem);}"
  + ".alp-h2{font-weight:800;line-height:1.05;letter-spacing:-.025em;font-size:clamp(1.9rem,4.5vw,3rem);}"
  + ".alp-giant{font-family:'Space Grotesk',Inter,sans-serif;font-weight:500;line-height:1.04;letter-spacing:.005em;text-transform:uppercase;font-size:clamp(2.6rem,6.2vw,5.6rem);}"
  + ".alp-heroh{font-family:'Space Grotesk',Inter,sans-serif;font-weight:500;line-height:1.04;letter-spacing:.005em;text-transform:uppercase;font-size:38px;}"
  + ".alp-herodim{color:rgba(255,255,255,.45);margin-top:26px;font-size:40px;}"
  + ".alp-hbrk{position:relative;display:inline-block;padding:14px 16px 12px;margin:18px 0 0 -16px;}"
  + ".alp-hbrk i{position:absolute;width:15px;height:15px;border-style:solid;border-color:rgba(255,255,255,.85);border-width:0;}"
  + ".alp-hbrk i.tl{top:0;left:0;border-top-width:2px;border-left-width:2px;}"
  + ".alp-hbrk i.tr{top:0;right:0;border-top-width:2px;border-right-width:2px;}"
  + ".alp-hbrk i.bl{bottom:0;left:0;border-bottom-width:2px;border-left-width:2px;}"
  + ".alp-hbrk i.br{bottom:5px;right:0;border-bottom-width:2px;border-right-width:2px;}"
  + ".alp-section.alp-hero-low{align-items:flex-end;}"
  + ".alp-section.alp-hero-low .alp-inner{box-sizing:border-box;width:clamp(480px,48%,620px);max-width:none;padding:0 0 14vh 56px;position:relative;left:100px;top:-25px;}"
  + ".alp-hwrap{transform:scale(1.13);transform-origin:left bottom;}"
  + ".alp-lead{margin-top:18px;color:rgba(255,255,255,.58);line-height:1.65;font-size:clamp(.98rem,1.8vw,1.2rem);max-width:30em;}"
  + ".alp-ticks{margin-top:26px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;font-size:11px;letter-spacing:.05em;color:#fff;}"
  + ".alp-ticks span{display:inline-flex;align-items:center;gap:6px;}"
  + ".alp-ticks svg{width:12px;height:12px;}"
  /* buttons */
  + ".alp-btn{display:inline-flex;align-items:center;gap:10px;padding:15px 30px;border-radius:99px;font-family:'Space Grotesk',Inter,sans-serif;font-weight:600;text-transform:uppercase;font-size:12px;letter-spacing:.14em;text-decoration:none;cursor:pointer;border:none;transition:transform .3s cubic-bezier(.2,.8,.2,1),background .3s,color .3s,box-shadow .3s;}"
  + ".alp-btn-light{background:#fff;color:#000;box-shadow:0 18px 50px rgba(0,0,0,.35);}"
  + ".alp-btn-light:hover{transform:translateY(-3px) scale(1.04);box-shadow:0 26px 60px rgba(0,0,0,.5);}"
  + ".alp-btn-ghost{background:rgba(20,20,20,.55);color:#fff;border:1px solid rgba(255,255,255,.22);}"
  + ".alp-btn-ghost:hover{background:#fff;color:#000;transform:translateY(-3px);}"
  + ".alp-btnrow{margin-top:30px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;}"
  /* floating service cards — Noomo frosted glass fleet.
     The heading/copy live on their own fixed layer BELOW the sections so the
     cards' backdrop-filter can sample them (Chromium can't blur siblings
     inside the same stacking context). */
  + "#alp-svc-layer{position:fixed;inset:0;z-index:8;pointer-events:none;opacity:0;visibility:hidden;will-change:transform;}"
  + "#alp-svc-head{position:absolute;left:6vw;top:11vh;max-width:66vw;}"
  + "#alp-svc-side{position:absolute;right:6vw;top:17vh;width:min(21vw,300px);font-size:12.5px;line-height:1.7;color:rgba(255,255,255,.55);text-align:left;}"
  + "#alp-svc-meta{position:absolute;left:6vw;bottom:7vh;}"
  /* Monument layout on 1140×1260 panes: centered title top, split rule,
     copy middle, caps footer at the base; thick double-glazed glass skin */
  + ".alp-fcard{position:absolute;left:0;top:0;width:clamp(270px,21vw,370px);aspect-ratio:1140/1260;container-type:inline-size;cursor:default;will-change:transform;pointer-events:auto;}"
  + ".alp-fcard .alp-fin{position:absolute;inset:0;padding:9.6cqw 8.4cqw 7cqw;border-radius:4px;color:#181520;overflow:hidden;display:flex;flex-direction:column;text-align:center;"
  +   "background:linear-gradient(168deg,rgba(252,253,255,.16) 0%,rgba(237,239,246,.085) 42%,rgba(196,201,215,.14) 100%),rgba(237,239,246,.085);"
  +   "-webkit-backdrop-filter:blur(18px) saturate(1.15);backdrop-filter:blur(18px) saturate(1.15);"
  +   "border:1px solid rgba(255,255,255,.32);"
  +   "box-shadow:-12px 14px 0 -1px rgba(196,214,209,.5),-6px 7px 0 0 rgba(225,236,233,.55),-2px 3px 0 0 rgba(245,250,248,.5),0 44px 110px rgba(0,0,0,.5),0 10px 26px rgba(0,0,0,.28),inset 0 2px 0 rgba(255,255,255,.5),inset 2px 0 0 rgba(255,255,255,.28),inset 0 -2px 0 rgba(120,128,150,.28),inset -2px 0 0 rgba(150,156,175,.2);"
  +   "transition:transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s;}"
  /* specular sheen — a soft diagonal light streak across the glass */
  + ".alp-fcard .alp-fin::after{content:'';position:absolute;inset:-40% -60%;pointer-events:none;"
  +   "background:linear-gradient(115deg,transparent 38%,rgba(255,255,255,.10) 47%,rgba(255,255,255,.03) 52%,transparent 60%);}"
  + ".alp-fcard h3{margin:0;font-size:7.4cqw;font-weight:800;letter-spacing:-.015em;line-height:1.1;color:#181520;}"
  + ".alp-frules{display:flex;align-items:center;gap:4cqw;margin:5.2cqw 0 0;}"
  + ".alp-frules i{flex:1;height:1px;background:rgba(24,21,32,.28);}"
  + ".alp-fcard p{margin:6.4cqw auto 0;font-size:4.5cqw;line-height:1.65;font-weight:500;color:#181520;opacity:.72;max-width:92%;letter-spacing:0;}"
  + ".alp-fcard .alp-ffoot{margin-top:auto;padding-top:4.5cqw;font-size:2.9cqw;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#181520;opacity:.68;}"
  + "@keyframes alp-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}"
  /* hours */
  + ".alp-hours{margin:30px auto 0;max-width:420px;width:100%;}"
  + ".alp-hrow{display:flex;justify-content:space-between;gap:24px;padding:13px 4px;font-size:14px;position:relative;transition:padding-left .3s;}"
  + ".alp-hrow:hover{padding-left:10px;}"
  + ".alp-hours .alp-hr{margin:0;}"
  + ".alp-hrow b{color:rgba(255,255,255,.85);font-weight:600;}"
  + ".alp-hrow span{color:rgba(255,255,255,.45);}"
  /* scroll cue */
  + "#alp-hint{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:20;display:flex;align-items:center;gap:8px;padding:7px 16px;border-radius:99px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.6);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.45);transition:opacity .4s;}"
  + "#alp-hint svg{width:13px;height:13px;animation:alp-bounce 1.6s infinite;}"
  + "@keyframes alp-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}"
  /* progress counter */
  + "#alp-count{position:fixed;left:32px;bottom:22px;z-index:20;font-size:10px;letter-spacing:.3em;color:rgba(255,255,255,.4);display:flex;align-items:center;gap:14px;transition:opacity .4s;}"
  + "#alp-count .alp-cline{width:54px;height:1px;background:rgba(255,255,255,.15);position:relative;overflow:hidden;display:block;}"
  + "#alp-count .alp-cline i{position:absolute;inset:0;background:rgba(255,255,255,.7);transform-origin:left;transform:scaleX(0);transition:transform .8s cubic-bezier(.2,.8,.2,1);display:block;}"
  /* flow content */
  + "#alp-spacer{height:100vh;}"
  + "#alp-flow{position:relative;z-index:12;}"
  + "#alp-flowfade{height:26vh;background:linear-gradient(to bottom,rgba(5,5,5,0),#050505);}"
  + "#alp-flowbody{background:#050505;}"
  + ".alp-fsec{max-width:1040px;margin:0 auto;padding:70px 24px;}"
  + ".alp-fhead{text-align:center;margin-bottom:40px;}"
  + ".alp-fhead .alp-lead{margin-left:auto;margin-right:auto;}"
  + "#alp-calcard{background:#fff;border-radius:18px;padding:10px;box-shadow:0 30px 80px rgba(0,0,0,.5);min-height:600px;}"
  + "#alp-calcard iframe{width:100%;min-height:600px;border:none;border-radius:12px;display:block;}"
  /* faq — hairline list, Noomo awards style */
  + ".alp-faq{max-width:820px;margin:0 auto;border-bottom:1px solid rgba(255,255,255,.14);}"
  + ".alp-qa{border-top:1px solid rgba(255,255,255,.14);}"
  + ".alp-qa button{width:100%;display:flex;align-items:baseline;gap:18px;padding:22px 6px;background:none;border:none;color:rgba(255,255,255,.88);font-size:16px;font-weight:600;font-family:inherit;text-align:left;cursor:pointer;transition:padding-left .35s cubic-bezier(.2,.8,.2,1),color .25s;}"
  + ".alp-qa button .alp-qn{font-size:10px;letter-spacing:.2em;color:rgba(255,255,255,.35);min-width:30px;}"
  + ".alp-qa button .alp-qarrow{margin-left:auto;color:rgba(255,255,255,.4);transition:transform .3s;font-size:18px;line-height:1;}"
  + ".alp-qa button:hover{padding-left:18px;color:#fff;}"
  + ".alp-qa.alp-open .alp-qarrow{transform:rotate(45deg);}"
  + ".alp-qa .alp-a{max-height:0;overflow:hidden;transition:max-height .35s ease;}"
  + ".alp-qa .alp-a p{padding:0 6px 22px 48px;font-size:14px;line-height:1.7;color:rgba(255,255,255,.5);max-width:620px;}"
  /* contact */
  + ".alp-contact{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:900px;margin:0 auto;}"
  + ".alp-cbox{padding:26px 22px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);text-align:center;transition:transform .35s cubic-bezier(.2,.8,.2,1),border-color .3s,background .3s;}"
  + ".alp-cbox:hover{transform:translateY(-6px);border-color:rgba(255,255,255,.25);background:rgba(255,255,255,.05);}"
  + ".alp-cbox .alp-clabel{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:10px;}"
  + ".alp-cbox a{color:#fff;text-decoration:none;font-size:15px;font-weight:600;line-height:1.5;}"
  + ".alp-cbox a:hover{text-decoration:underline;}"
  + ".alp-cbox p{color:rgba(255,255,255,.6);font-size:13px;line-height:1.7;}"
  + ".alp-footer{padding:36px 24px 46px;text-align:center;color:rgba(255,255,255,.25);font-size:12px;border-top:1px solid rgba(255,255,255,.06);margin-top:30px;}"
  /* layout */
  + ".alp-left{padding-left:7vw;padding-right:5vw;max-width:820px;}"
  + ".alp-center{margin:0 auto;text-align:center;padding:0 6vw;max-width:820px;}"
  + ".alp-center .alp-lead{margin-left:auto;margin-right:auto;}"
  + ".alp-center .alp-hr{margin-left:auto;margin-right:auto;max-width:420px;}"
  /* mobile */
  + "@media (max-width:760px){"
  +   ".alp-heroh{font-size:26px;}"
  +   ".alp-herodim{font-size:27px;}"
  +   ".alp-section.alp-hero-low .alp-inner{width:100%;padding:0 22px 12vh;left:0;top:0;}"
  +   ".alp-hwrap{transform:none;}"
  +   "#alp-nav{padding:14px 16px;}"
  +   "#alp-nav .alp-brand{font-size:13px;}"
  +   "#alp-dots{display:none;}"
  +   "#alp-count{left:16px;}"
  +   ".alp-left,.alp-center{padding-left:22px;padding-right:22px;text-align:left;max-width:100%;}"
  +   ".alp-center .alp-lead{margin-left:0;}"
  +   ".alp-center .alp-hr{margin-left:0;}"
  +   ".alp-hours{margin-left:0;}"
  +   "#alp-svc-head{left:22px;top:12vh;max-width:88vw;}"
  +   "#alp-svc-side{display:none;}"
  +   "#alp-svc-meta{left:22px;bottom:4vh;right:22px;}"
  +   ".alp-fcard{width:74vw;filter:none!important;}"
  +   ".alp-contact{grid-template-columns:1fr;}"
  +   ".alp-fsec{padding:48px 16px;}"
  +   ".alp-box{padding:22px 18px;}"
  +   ".alp-box .alp-btab{left:12px;}"
  + "}";

  // ── Content ────────────────────────────────────────────────────────────────
  var check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  var SERVICES = [
    ["Service & Routine Maintenance", "Fresh oil, new filters and a careful once over of everything that wears. The quiet routine that keeps your car reliable between visits.", "Regular care · No surprises"],
    ["Brake Services", "Pads, rotors and fluid inspected, machined or replaced. Feel the pedal firm up and trust every stop from the school run to the Crown Range.", "Stop as confidently as you go"],
    ["Engine Diagnostics & Repair", "Check light on? We read what your engine is trying to say, trace the fault to its source and fix it before it grows into a bill.", "Find it early · Fix it once"],
    ["Transmission Services", "Smooth shifts are no accident. We service, repair and rebuild manual and automatic gearboxes so every gear lands clean for years.", "Deep work · Done in house"],
    ["Suspension & Steering", "Shocks, struts, bushes and springs tuned for our roads. Your car hugs the bends on the Crown Range and floats over the gravel.", "Comfort · Control"],
    ["Exhaust System Repairs", "From a quiet hum to a clean burn. We repair and replace mufflers, converters and pipes so your car breathes the way it was built to.", "Quiet · Clean · Legal"],
    ["Auto Electrical", "Flat battery, ghost faults, dead sensors. We chase the gremlins through every wire and put things right the first time.", "Starters · Alternators · Wiring"],
    ["WOF Repairs", "Failed your WOF? Bring us the sheet. We fix every fail, big or small, and get you back on the road fully legal.", "We fix the fails"]
  ];
  /* fleet: evenly spaced cards riding one arc track like Noomo's — enter
     bottom-right, crest mid-screen, descend out left. Per-card: only jitter,
     tilt, depth and bob vary: [yJitter vh, rotZ, rotY, depth, bobDur] */
  /* [yJitter vh, rotZ, rotY, depth, bobDur, rotX] — irregular tilts, no pattern */
  var FLEET = [
    [1, -2.6, 9, 0.9, 7.2, 1.2], [-3, 1.2, -5, 0.62, 8.4, 2.1], [2, 2.8, 12, 0.5, 9.1, 0.8], [-1, -1.1, 7, 0.85, 8.8, 1.8],
    [3, 1.9, -11, 0.55, 7.6, 2.4], [-2, -3.2, 6, 0.95, 8.1, 1.0], [0, 0.8, -8, 0.5, 9.4, 1.6], [-1, -1.7, 10, 0.72, 8.6, 2.0]
  ];
  var FLEET_SPAN = 140;        // vw a single card travels across the screen
  var FLEET_GAP = 26;          // vw between cards on the track (even spacing)
  var FLEET_WHEEL_SPAN = 2800; // wheel px to cross the whole fleet
  var svcCards = SERVICES.map(function (s, i) {
    var c = FLEET[i];
    return '<div class="alp-fcard" data-i="' + i + '" data-depth="' + c[3] + '" style="z-index:6;">'
      + '<div class="alp-fin" style="transform:perspective(900px) rotateY(' + c[2] + 'deg) rotateX(' + c[5] + 'deg) rotateZ(' + c[1] + 'deg);">'
      + "<h3>" + s[0] + "</h3>"
      + '<div class="alp-frules"><i></i><i></i></div>'
      + "<p>" + s[1] + "</p>"
      + '<div class="alp-ffoot">' + s[2] + "</div>"
      + "</div></div>";
  }).join("");

  var FAQS = [
    ["How often should I get my car serviced?", "Regular maintenance is crucial — typically every 12 months or 10,000 km."],
    ["What is included in a service?", "We replace the engine oil and oil filter, and check all other fluids, filters, suspension, bushes, brakes and tyres."],
    ["How do I know if my brakes need replacing?", "Look for signs like squealing noises or increased stopping distances."],
    ["What should I do if my check engine light comes on?", "It's a warning — bring your car in for diagnostics so we can identify the issue promptly."],
    ["Can you do pre-purchase inspections?", "Yes. We give a vehicle you're about to buy or sell a thorough inspection and list anything it may need now or in the near future."]
  ];
  var faqHtml = FAQS.map(function (qa, i) {
    return '<div class="alp-qa"><button type="button"><span class="alp-qn">0' + (i + 1) + "</span>" + qa[0]
      + '<span class="alp-qarrow">+</span></button><div class="alp-a"><p>' + qa[1] + "</p></div></div>";
  }).join("");

  /* deco builders: floating frosted chips, drifting "+" ornaments, draw-in
     boxes. Floats nest three wrappers so the layers never fight over one
     transform: outer = scrub choreography, middle = CSS bob, inner = mouse
     parallax (damped by a CSS transition). */
  var IC_PHONE = '<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>';
  var IC_MAIL = '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>';
  var CLOCK_SVG = '<svg class="alp-clock" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.25)"/>'
    + '<line x1="22" y1="4" x2="22" y2="7" stroke="rgba(255,255,255,.4)"/><line x1="40" y1="22" x2="37" y2="22" stroke="rgba(255,255,255,.4)"/>'
    + '<line x1="22" y1="40" x2="22" y2="37" stroke="rgba(255,255,255,.4)"/><line x1="4" y1="22" x2="7" y2="22" stroke="rgba(255,255,255,.4)"/>'
    + '<g id="alp-hh"><g class="alp-hand-h"><line x1="22" y1="22" x2="22" y2="13.5" stroke="rgba(255,255,255,.9)" stroke-width="2.4" stroke-linecap="round"/></g></g>'
    + '<g id="alp-mh"><g class="alp-hand-m"><line x1="22" y1="22" x2="22" y2="8.5" stroke="rgba(255,255,255,.55)" stroke-width="1.6" stroke-linecap="round"/></g></g>'
    + '<circle cx="22" cy="22" r="1.8" fill="#fff"/></svg>';
  function flo(x, y, depth, dur, dly, html) {
    return '<div class="alp-float" data-fd="' + depth + '" style="left:' + x + 'vw;top:' + y + 'vh;">'
      + '<div class="alp-fbob" style="animation-duration:' + dur + 's;animation-delay:-' + dly + 's;">'
      + '<div class="alp-fpx">' + html + "</div></div></div>";
  }
  function orn(x, y, n, dly) {
    var plus = "";
    for (var oi = 0; oi < n; oi++) plus += "<i>+</i>";
    return '<div class="alp-orn" style="left:' + x + 'vw;top:' + y + 'vh;"><span style="animation-delay:-' + dly + 's;">' + plus + "</span></div>";
  }
  var ODIGITS = (function () {
    var s = "";
    for (var d = 0; d < 10; d++) s += "<b>" + d + "</b>";
    return s;
  })();
  /* tagline pre-split into letters, each with its own fall delay (~13ms apart) */
  var TAG_HTML = (function () {
    var t = "Quicker than your last quote", s = "", k = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (c === " ") { s += " "; continue; }
      s += '<em style="animation-delay:' + (k * 13) + 'ms">' + c + "</em>";
      k++;
    }
    return s;
  })();
  function boxO(cls, tab, style) {
    return '<div class="alp-box' + (cls ? " " + cls : "") + '"' + (style ? ' style="' + style + '"' : "") + ">"
      + '<i class="alp-be t"></i><i class="alp-be r"></i><i class="alp-be b"></i><i class="alp-be l"></i>'
      + '<i class="alp-bc tl"></i><i class="alp-bc tr"></i><i class="alp-bc bl"></i><i class="alp-bc br"></i>'
      + (tab ? '<span class="alp-btab"><b style="display:inline-block;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.8);animation:alp-pdot 2.4s ease-in-out infinite;"></b>' + tab + "</span>" : "");
  }

  /* Sections: each parks the video at a scene; transitions play the footage. */
  var SEC = [
    { id: "hero", stop: 2.9536, enter: [0, 10], exit: [0, -11], html:
      '<div class="alp-inner alp-left">'
      + '<div class="alp-hwrap">'
      + '<div class="alp-eyebrow alp-rise">Queenstown’s Independent Workshop</div>'
      + '<div class="alp-hbrk">'
      +   '<i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>'
      +   '<h1 class="alp-heroh alp-split">We’ll tell you\nwhat’s actually\nwrong with your\ncar.</h1>'
      + "</div>"
      + '<h2 class="alp-heroh alp-herodim alp-split">Wild concept, we\nknow.</h2>'
      + '<i class="alp-hr" data-o="l" style="max-width:360px;"></i>'
      + '<div class="alp-btnrow alp-rise"><a class="alp-btn alp-btn-light" href="#alp-booking">Make a booking</a>'
      + '<a class="alp-btn alp-btn-ghost" href="#alp-booking">Request estimate</a></div>'
      + '<div class="alp-ticks alp-rise"><span>' + check + "Euro &amp; Japanese specialists</span><span>" + check + "Tuning &amp; emissions solutions</span></div>"
      + "</div>"
      + "</div>" },
    { id: "about", stop: 15.6118, enter: [22, 0], exit: [-18, 0],
      deco: flo(9, 30, 0.8, 8, 0.8, '<span class="alp-fchip">' + check + "Comprehensive Diagnostics</span>")
        + flo(76, 60, 0.9, 9.5, 2.9, '<span class="alp-fchip">' + check + "Tyre &amp; Battery Marketplace</span>")
        + orn(14, 70, 2, 4) + orn(83, 22, 3, 9),
      html:
      '<div class="alp-inner alp-center">'
      + boxO("", "02 · The Workshop")
      + '<i class="alp-hr" data-o="r"></i>'
      + '<h2 class="alp-giant alp-split">First-rate repairs.\nTop-tier care.</h2>'
      + '<i class="alp-hr" data-o="l"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;">Your go-to for peak vehicle performance and reliability — comprehensive diagnostics, routine maintenance, diesel engine solutions and WOF repairs, plus a tyre &amp; battery marketplace.</p>'
      + "</div>"
      + "</div>" },
    { id: "services", stop: 27.0042, enter: [0, -12], exit: [0, -12], svc: true, html:
      '<div class="alp-inner" style="position:absolute;inset:0;">'
      + '<div id="alp-svc-cards">' + svcCards + "</div>"
      + "</div>" },
    { id: "inspections", stop: 42.1941, enter: [-22, 0], exit: [16, 0],
      deco: flo(69, 26, 0.9, 8, 2, '<div class="alp-fcard2"><div class="alp-ft">Inspection Report</div>'
          + '<div class="alp-fr">' + check + "Mechanical</div>"
          + '<div class="alp-fr">' + check + "Structural</div>"
          + '<div class="alp-fr">' + check + "Service history</div></div>")
        + flo(63, 68, 0.6, 9.5, 4.2, '<span class="alp-fchip"><b class="alp-dot"></b>No surprises</span>')
        + orn(88, 52, 2, 3),
      html:
      '<div class="alp-inner alp-left">'
      + boxO("alp-dash", "04 · Inspection Bay")
      + '<div class="alp-eyebrow alp-rise">Pre-Purchase Inspections</div>'
      + '<h2 class="alp-h2 alp-split">Buying? Selling?\nKnow first.</h2>'
      + "</div>"
      + '<i class="alp-hr" data-o="l" style="max-width:420px;"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;">We give any vehicle you’re about to buy or sell a thorough inspection — and list anything it needs now or in the near future. No surprises after the handshake.</p>'
      + '<div class="alp-btnrow alp-rise"><a class="alp-btn alp-btn-ghost" href="' + PHONE_TEL + '">Call ' + PHONE_DISPLAY + "</a></div>"
      + "</div>" },
    { id: "overhauls", stop: 60.3376, enter: [0, 14], exit: [0, -12], top: true,
      deco: flo(63, 74, 0.85, 8.5, 1.8, '<span class="alp-fchip">' + check + "Engine &amp; Gearbox Rebuilds</span>")
        + flo(81, 62, 0.6, 10, 5, '<span class="alp-fchip">' + check + "Intricate Auto Electrical</span>")
        + orn(8, 80, 3, 6),
      html:
      '<div class="alp-inner alp-left" style="max-width:600px;">'
      + '<div class="alp-eyebrow alp-rise">European & Japanese Specialists</div>'
      + '<h2 class="alp-h2 alp-split">Overhauls are\nour specialty.</h2>'
      + '<i class="alp-hr" data-o="l" style="max-width:380px;"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;font-size:clamp(.92rem,1.5vw,1.05rem);">Engine and transmission overhauls and intricate auto electrical work — the deep jobs other shops send away.</p>'
      + "</div>" },
    { id: "hours", stop: 79.3249, enter: [20, 0], exit: [-16, 0],
      deco: flo(73, 26, 0.95, 8, 2.6, '<div class="alp-fcard2" style="text-align:center;">'
          + '<div class="alp-ft" style="justify-content:center;">Frankton · Queenstown</div>'
          + CLOCK_SVG
          + '<div class="alp-fr" id="alp-open" style="justify-content:center;"><b class="alp-dot"></b>Mon – Thu · 7am – 5pm</div></div>')
        + flo(10, 58, 0.7, 9, 4.4, '<a class="alp-fchip" href="' + MAPS + '" target="_blank" rel="noopener"><b class="alp-dot"></b>35B Brookes Rd</a>')
        + orn(85, 74, 2, 5),
      html:
      '<div class="alp-inner alp-center">'
      + '<h2 class="alp-giant alp-split">Drop in.\nWe’ll sort it.</h2>'
      + boxO("", "06 · Workshop Hours", "width:min(480px,100%);margin-top:26px;")
      + '<div class="alp-hours" style="margin-top:0;">'
      + '<i class="alp-hr" data-o="l" style="margin:18px 0 0;"></i>'
      + '<div class="alp-hrow alp-rise"><b>Monday – Thursday</b><span>7:00am – 5:00pm</span></div>'
      + '<i class="alp-hr" data-o="r" style="margin:0;"></i>'
      + '<div class="alp-hrow alp-rise"><b>Friday</b><span>By appointment only</span></div>'
      + '<i class="alp-hr" data-o="l" style="margin:0;"></i>'
      + '<div class="alp-hrow alp-rise"><b>Saturday – Sunday</b><span>Closed</span></div>'
      + '<i class="alp-hr" data-o="r" style="margin:0;"></i>'
      + "</div>"
      + "</div>"
      + '<p class="alp-lead alp-rise" style="font-size:13px;margin-top:22px;color:rgba(255,255,255,.35);">35B Brookes Road, Frankton, Queenstown 9300</p>'
      + "</div>" },
    { id: "cta", stop: 95.3586, enter: [0, 13], exit: [0, -10],
      deco: flo(70, 30, 0.85, 8, 1, '<a class="alp-fchip" href="' + PHONE_TEL + '">' + IC_PHONE + "Call " + PHONE_DISPLAY + "</a>")
        + flo(13, 60, 0.7, 9.5, 3.8, '<a class="alp-fchip" href="mailto:' + EMAIL + '">' + IC_MAIL + "Email the workshop</a>")
        + orn(82, 72, 3, 8) + orn(7, 16, 2, 2),
      html:
      '<div class="alp-inner alp-center">'
      + boxO("alp-corners", "07 · Book It In")
      + '<h2 class="alp-h1 alp-split" style="font-size:clamp(2.2rem,5.5vw,3.8rem);">Book your\nvehicle in.</h2>'
      + '<i class="alp-hr" data-o="l"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;">One more scroll — or pick up the phone for an estimate first.</p>'
      + '<div class="alp-btnrow alp-rise" style="justify-content:center;position:relative;"><span class="alp-ringwrap"><i></i><i></i><i></i></span><a class="alp-btn alp-btn-light" href="#alp-booking">Make a booking</a></div>'
      + '<p class="alp-rise" style="margin-top:18px;font-size:12px;color:rgba(255,255,255,.3);">' + PHONE_DISPLAY + " &nbsp;·&nbsp; " + EMAIL + "</p>"
      + "</div>"
      + "</div>" }
  ];

  var GHOSTS = [
    ["SERVICING", 5, 13], ["DIAGNOSTICS", 18, 26], ["INSPECTIONS", 33, 40.5],
    ["OVERHAULS", 46.5, 56], ["QUEENSTOWN", 65, 77], ["BOOK IT IN", 84, 91.5]
  ];

  /* Annotations — per-frame machine-tracked */
  var ANNOS = [
    { label: "Thorough pre-purchase inspections", side: "top", in: 39.24, out: 43.2,
      keys: [
        [39.24,61.3,42.8,44.4,38.4], [39.66,60.4,42.7,44.5,38.5], [40.08,58.2,42.7,44.7,38.6], [40.51,55.9,42.7,44.8,38.8],
        [40.93,53.6,42.7,45.0,38.9], [41.35,51.5,42.8,45.1,39.0], [41.77,49.8,42.9,45.3,39.2], [42.19,48.3,43.1,45.4,39.3],
        [42.62,46.6,43.2,45.6,39.4], [43.04,44.8,43.4,45.7,39.6], [43.46,42.7,43.5,45.9,39.7], [43.88,40.6,43.7,46.0,39.8],
        [44.3,38.6,43.9,46.2,40.0], [44.73,36.9,44.0,46.3,40.1], [45.15,35.5,44.2,46.5,40.2], [45.57,34.3,44.3,46.6,40.4],
        [45.99,33.1,44.4,46.8,40.5], [46.41,32.0,44.5,46.9,40.6], [46.84,31.0,44.5,47.1,40.8], [47.26,30.1,44.6,47.2,40.9],
        [47.68,29.4,44.6,47.4,41.0], [48.1,28.9,44.7,47.5,41.2], [48.52,28.8,44.8,47.9,41.4]
      ] },
    { label: "Engine & transmission overhauls", side: "top", in: 52.74, out: 70.6,
      keys: [
        [52.74,46.5,25.3,21.1,27.2], [53.16,46.8,25.4,21.1,27.2], [53.59,47.2,25.7,21.1,27.2], [54.01,47.7,26.0,21.1,27.2],
        [54.43,48.3,26.4,21.1,27.2], [54.85,48.9,26.8,21.1,27.2], [55.27,49.5,27.2,21.1,27.2], [55.7,50.0,27.6,21.1,27.2],
        [56.12,50.5,27.9,21.1,27.2], [56.54,51.0,28.3,21.1,27.2], [56.96,51.4,28.5,21.1,27.2], [57.38,51.8,28.7,21.1,27.2],
        [57.81,52.1,28.9,21.1,27.2], [58.23,52.4,29.0,21.1,27.2], [58.65,52.6,29.1,21.1,27.2], [59.07,52.8,29.2,21.1,27.2],
        [59.49,53.0,29.3,21.1,27.2], [59.92,53.2,29.4,21.1,27.2], [60.34,53.5,29.5,21.1,27.2], [60.76,53.8,29.6,21.1,27.2],
        [61.18,54.1,29.7,21.1,27.2], [61.6,54.4,29.8,21.1,27.2], [62.03,54.8,29.9,21.1,27.2], [62.45,55.2,30.0,21.1,27.2],
        [62.87,55.6,30.1,21.1,27.2], [63.29,56.1,30.2,21.1,27.2], [63.71,56.7,30.4,21.1,27.2], [64.14,57.3,30.5,21.1,27.2],
        [64.56,57.9,30.7,21.1,27.2], [64.98,58.5,30.9,21.1,27.2], [65.4,59.1,31.0,21.1,27.2], [65.82,59.7,31.2,21.1,27.2],
        [66.24,60.2,31.4,21.1,27.2], [66.67,60.7,31.5,21.1,27.2], [67.09,61.0,31.6,21.1,27.2], [67.51,61.2,31.7,21.1,27.2],
        [67.93,61.3,31.8,21.1,27.2], [68.35,61.3,31.9,21.1,27.2], [68.78,61.3,32.0,21.1,27.2], [69.2,61.2,32.2,21.1,27.2],
        [69.62,61.2,32.4,21.1,27.2], [70.04,61.1,32.6,21.1,27.2], [70.46,61.1,32.7,21.1,27.2], [70.89,61.2,32.8,21.1,27.2]
      ] }
  ];

  var GRADE = [
    [0, 0, 0, 0, 0.14], [11, 8, 6, 10, 0.30], [20, 36, 16, 6, 0.26],
    [30, 30, 14, 10, 0.40], [37, 30, 12, 28, 0.30], [50, 10, 10, 10, 0.46],
    [70, 8, 8, 8, 0.46], [77, 0, 6, 12, 0.42], [92, 0, 0, 0, 0.58], [100, 0, 0, 0, 0.62]
  ];

  // ── DOM ────────────────────────────────────────────────────────────────────
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var fontLink = document.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap";
  document.head.appendChild(fontLink);

  var root = document.createElement("div");
  root.id = "alp-root";
  root.innerHTML =
      '<canvas id="alp-canvas"></canvas>'
    + '<div class="alp-vignette"></div>'
    + '<div id="alp-dim"></div>'
    + '<div id="alp-glow"></div>'
    + GHOSTS.map(function (g) { return '<div class="alp-ghost">' + g[0] + "</div>"; }).join("")
    + ANNOS.map(function (a) {
        return '<div class="alp-anno"><div class="alp-abox"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div>'
          + '<div class="alp-aline ' + a.side + '"></div>'
          + '<div class="alp-alabel ' + a.side + '"><b></b>' + a.label + "</div></div>";
      }).join("")
    + '<div id="alp-svc-layer">'
    +   '<div id="alp-svc-head"><div class="alp-meta alp-rise" style="margin-bottom:20px;"><span class="alp-chip">Workshop</span><span>Servicing / Repairs / Electrical</span></div>'
    +   '<h2 class="alp-giant alp-split" style="font-size:clamp(2.9rem,7.3vw,6.6rem);">Everything\nunder the\nhood — and\naround it.</h2></div>'
    +   '<div id="alp-svc-side" class="alp-rise">Eight specialties, one workshop. From routine servicing to the deep jobs other shops send away — handled in-house by people who care about doing it properly.</div>'
    +   '<div id="alp-svc-meta"><i class="alp-hr" data-o="l" style="margin:0 0 14px;width:min(420px,38vw);"></i><div class="alp-meta alp-rise"><span class="alp-chip">08 Services</span><span>European &amp; Japanese specialists</span></div></div>'
    +   orn(68, 12, 2, 3) + orn(44, 76, 3, 8)
    + "</div>"
    + SEC.map(function (s) {
        return '<div class="alp-section' + (s.top ? " alp-top" : "") + (s.id === "hero" ? " alp-hero-low" : "") + '" data-sec="' + s.id + '">' + s.html + (s.deco || "") + "</div>";
      }).join("")
    + '<div id="alp-nav">'
    +   '<a class="alp-brand" href="#top"><b>Addept</b> <span>Automotive</span></a>'
    +   '<a class="alp-call" href="' + PHONE_TEL + '">Call now</a>'
    + "</div>"
    + '<div id="alp-dots">' + SEC.map(function (s, i) {
        var labels = { hero: "Home", about: "About", services: "Services", inspections: "Inspections", overhauls: "Overhauls", hours: "Hours", cta: "Book" };
        return '<button type="button" data-idx="' + i + '" aria-label="' + labels[s.id] + '"><span>' + labels[s.id] + "</span><i></i></button>";
      }).join("") + "</div>"
    + '<div id="alp-count"><span id="alp-cnum">01</span><span class="alp-cline"><i></i></span><span>0' + SEC.length + "</span></div>"
    + '<div id="alp-hint">' + chevron + "<span>Scroll</span></div>"
    + '<div id="alp-spacer"></div>'
    + '<div id="alp-flow"><div id="alp-flowfade"></div><div id="alp-flowbody">'
    +   '<div class="alp-fsec" id="alp-booking">'
    +     '<div class="alp-fhead"><div class="alp-eyebrow">Bookings</div>'
    +     '<h2 class="alp-h2">Make a booking</h2>'
    +     '<p class="alp-lead">Choose a date and time that suits you, and we’ll see you then. Prefer to talk it through? Call <a href="' + PHONE_TEL + '" style="color:#fff;">' + PHONE_DISPLAY + "</a>.</p></div>"
    +     '<div id="alp-calcard"><iframe data-src="' + CAL_URL + '" scrolling="no" id="jk0S1digTnc8PT4F1AmO_alp" title="Addept Automotive Bookings"></iframe></div>'
    +   "</div>"
    +   '<div class="alp-fsec" id="alp-faqs">'
    +     '<div class="alp-fhead"><div class="alp-eyebrow">FAQs</div><h2 class="alp-h2">Common questions</h2></div>'
    +     '<div class="alp-faq">' + faqHtml + "</div>"
    +   "</div>"
    +   '<div class="alp-fsec" id="alp-contact">'
    +     '<div class="alp-fhead"><div class="alp-eyebrow">Contact</div><h2 class="alp-h2">Get in touch</h2></div>'
    +     '<div class="alp-contact">'
    +       '<div class="alp-cbox"><div class="alp-clabel">Phone</div><a href="' + PHONE_TEL + '">' + PHONE_DISPLAY + "</a></div>"
    +       '<div class="alp-cbox"><div class="alp-clabel">Email</div><a href="mailto:' + EMAIL + '">' + EMAIL + "</a></div>"
    +       '<div class="alp-cbox"><div class="alp-clabel">Workshop</div><a href="' + MAPS + '" target="_blank" rel="noopener">35B Brookes Road, Frankton,<br>Queenstown 9300</a></div>'
    +     "</div>"
    +     '<div class="alp-cbox" style="max-width:420px;margin:14px auto 0;"><div class="alp-clabel">Operating hours</div><p>Monday – Thursday: 7:00am – 5:00pm<br>Friday: By appointment only<br>Saturday – Sunday: Closed</p></div>'
    +   "</div>"
    +   '<div class="alp-footer">Copyright © Addept Automotive 2026. Full Rights Reserved.</div>'
    + "</div></div>"
    + '<div id="alp-loader"><div id="alp-lglow"><i></i><i></i><i></i></div>'
    +   '<div id="alp-lembers"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>'
    +   '<div id="alp-lcore"><div id="alp-lbadge"></div><div id="alp-lsheen"></div>'
    +     '<svg id="alp-larc" viewBox="0 0 1000 640" preserveAspectRatio="none">'
    +       '<path class="alp-arcb" d="M 96 522 A 442 224 -11 1 1 916 426" pathLength="1000"/>'
    +       '<path class="alp-arct" d="M 96 522 A 442 224 -11 1 1 916 426" pathLength="1000"/>'
    +     "</svg>"
    +   "</div>"
    +   '<div id="alp-ldot"></div>'
    +   '<div id="alp-lpct"><span class="alp-odc"><span class="alp-odw" id="alp-odt">' + ODIGITS + '</span></span><span class="alp-odc"><span class="alp-odw" id="alp-odo">' + ODIGITS + "</span></span></div>"
    +   '<div id="alp-lstat">' + TAG_HTML + "<i>.</i><i>.</i><i>.</i></div>"
    +   '<div id="alp-lveil"></div>'
    + "</div>";
  document.body.appendChild(root);

  Array.prototype.forEach.call(root.querySelectorAll(".alp-split"), function (el) {
    var lines = el.textContent.split("\n");
    el.innerHTML = lines.map(function (line) {
      return line.split(" ").map(function (w) {
        return '<span class="alp-wm"><span class="alp-w">' + w + "</span></span>";
      }).join(" ");
    }).join("<br>");
  });

  /* live workshop clock + open/closed status, real Queenstown time. The hands
     get their position from an SVG attribute rotation; CSS keyframes on the
     inner group keep them sweeping from there (compositor only, no JS ticks). */
  (function () {
    var st = document.getElementById("alp-open");
    if (!st) return;
    try {
      var parts = new Intl.DateTimeFormat("en-US", { timeZone: "Pacific/Auckland", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
      var wd = "", hr = 0, mi = 0;
      parts.forEach(function (p) {
        if (p.type === "weekday") wd = p.value;
        else if (p.type === "hour") hr = +p.value % 24;
        else if (p.type === "minute") mi = +p.value;
      });
      var open = ["Mon", "Tue", "Wed", "Thu"].indexOf(wd) !== -1 && hr >= 7 && hr < 17;
      st.innerHTML = '<b class="alp-dot' + (open ? "" : " alp-off") + '"></b>' + (open ? "Open now" : "Currently closed");
      var hh = document.getElementById("alp-hh"), mh = document.getElementById("alp-mh");
      if (hh) hh.setAttribute("transform", "rotate(" + ((hr % 12) * 30 + mi * 0.5).toFixed(1) + " 22 22)");
      if (mh) mh.setAttribute("transform", "rotate(" + (mi * 6) + " 22 22)");
    } catch (err) { /* Intl/timezone unavailable — keep the static hours line */ }
  })();

  var calLoaded = false;
  function loadCalendar() {
    if (calLoaded) return;
    calLoaded = true;
    var nativeSIV = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () {
      var flow = document.getElementById("alp-flow");
      if (flow && flow.contains(this)) {
        var nearBooking = root.scrollTop > flow.offsetTop - root.clientHeight * 1.5;
        if (!nearBooking) return;
      }
      return nativeSIV.apply(this, arguments);
    };
    var ifr = document.getElementById("jk0S1digTnc8PT4F1AmO_alp");
    ifr.src = ifr.getAttribute("data-src");
    var fe = document.createElement("script");
    fe.src = "https://link.msgsndr.com/js/form_embed.js";
    fe.async = true;
    document.body.appendChild(fe);
  }

  // ── Frame engine (v4, unchanged) ───────────────────────────────────────────
  var canvas = document.getElementById("alp-canvas");
  var ctx = canvas.getContext("2d");
  var frames = new Array(TOTAL_FRAMES).fill(null);
  var loadedCount = 0, firstReady = false;
  var drawnFrame = -1;
  var loader = document.getElementById("alp-loader");
  var lCore = document.getElementById("alp-lcore");
  var lBadge = document.getElementById("alp-lbadge");
  var lSheen = document.getElementById("alp-lsheen");
  var lPct = document.getElementById("alp-lpct");
  var lOdT = document.getElementById("alp-odt");
  var lOdO = document.getElementById("alp-odo");
  var lStat = document.getElementById("alp-lstat");
  var lGlow = document.getElementById("alp-lglow");
  var lDot = document.getElementById("alp-ldot");
  var lVeil = document.getElementById("alp-lveil");
  var arcB = loader.querySelector(".alp-arcb");
  var arcT = loader.querySelector(".alp-arct");
  var batchLoaded = 0, badgeSvg = null, badgeReady = false;
  var loaderT0 = performance.now(), LOADER_MIN_MS = 2600, shownPct = 0, bursting = false;
  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* badge svg is inlined for crisp scaling; cross-origin embeds fall back to
     an <img> — the collapse animates the wrapper either way */
  fetch(BADGE).then(function (r) { return r.text(); }).then(function (txt) {
    lBadge.innerHTML = txt;
    badgeSvg = lBadge.querySelector("svg");
    if (badgeSvg) { badgeSvg.removeAttribute("width"); badgeSvg.removeAttribute("height"); }
    badgeReady = true; lBadge.classList.add("alp-lin"); lSheen.classList.add("alp-on"); lGlow.classList.add("alp-on");
  }).catch(function () {
    lBadge.innerHTML = '<img src="' + BADGE + '" alt="Addept Automotive">';
    badgeReady = true; lBadge.classList.add("alp-lin"); lSheen.classList.add("alp-on"); lGlow.classList.add("alp-on");
  });

  /* the handoff, in three beats: the emblem and its orbit stroke collapse
     into a single glowing point; the point holds for a blink; then it streaks
     out horizontally like a light trail while the black shell dissolves and
     the hero choreography populates beneath (startIntro gets a head start
     past the transition's empty lead-in). The counter hands its spot to the
     workshop line for the ride out. */
  function burst() {
    bursting = true;
    loader.style.pointerEvents = "none";
    lPct.style.opacity = 0;
    lStat.style.opacity = 1;
    lStat.classList.add("alp-on"); // dots tick up in the beat before the streak
    if (REDUCE) {
      loader.style.transition = "opacity .5s ease";
      loader.style.opacity = 0;
      setTimeout(function () { loader.style.display = "none"; introActive = false; startIntro(); }, 520);
      return;
    }
    /* wind-up: the amber tip whips one full lap while the emblem swells —
       anticipation before the drop */
    var curOff = parseFloat(arcT.style.strokeDashoffset || "34") || 0;
    arcT.style.opacity = 1;
    arcT.style.transition = "stroke-dashoffset .42s cubic-bezier(.45,0,.55,1)";
    arcT.style.strokeDashoffset = (curOff - 1000).toFixed(1);
    lCore.style.transition = "transform .42s cubic-bezier(.55,-.25,.65,1)";
    lCore.style.transform = "scale(1.26)";
    /* collapse into the point */
    setTimeout(function () {
      lCore.style.transition = "transform .5s cubic-bezier(.7,0,.95,.7)";
      lCore.style.transform = "scale(.012)";
    }, 400);
    setTimeout(function () {
      lCore.style.visibility = "hidden";
      lDot.classList.add("alp-on");
    }, 880);
    /* the beam: chromatic-fringed light streak + a one-frame exposure breath */
    setTimeout(function () {
      lDot.style.transition = "transform .55s cubic-bezier(.8,0,.9,.55), opacity .3s ease .25s, filter .55s ease";
      lDot.style.transform = "scale(220,.4)";
      lDot.style.filter = "blur(6px)";
      lDot.style.opacity = "0";
      lVeil.classList.add("alp-on");
      loader.classList.add("alp-lout");
      lGlow.style.animation = "none";
      lGlow.style.opacity = "1";
    }, 1100);
    setTimeout(function () { introActive = false; startIntro(); tT = tDur * 0.46; }, 1200);
    setTimeout(function () { lGlow.style.transition = "opacity .8s ease"; lGlow.style.opacity = "0"; lStat.style.opacity = 0; }, 1650);
    setTimeout(function () { loader.style.display = "none"; }, 2300);
  }

  /* loader heartbeat: a bare zero-padded counter tracking min(real batch
     progress, a minimum dwell); the orbit stroke draws around the emblem with
     an amber tip leading the line. Stops itself at the burst. */
  (function loaderTick() {
    if (bursting) return;
    requestAnimationFrame(loaderTick);
    var tq = Math.min((performance.now() - loaderT0) / LOADER_MIN_MS, 1);
    var dq = Math.min(batchLoaded / Math.min(INITIAL_BATCH, TOTAL_FRAMES), 1);
    var target = Math.min(tq, dq) * 100;
    shownPct += (target - shownPct) * 0.14;
    if (target >= 100 && shownPct > 99.1) shownPct = 100;
    var pInt = Math.min(Math.floor(shownPct), 99);
    lOdT.style.transform = "translateY(-" + Math.floor(pInt / 10) * 1.1 + "em)";
    lOdO.style.transform = "translateY(-" + (pInt % 10) * 1.1 + "em)";
    var p = shownPct / 100;
    arcB.style.strokeDasharray = "1000";
    arcB.style.strokeDashoffset = (1000 * (1 - p)).toFixed(1);
    arcT.style.strokeDasharray = "34 966";
    arcT.style.strokeDashoffset = (34 - 1000 * p).toFixed(1);
    arcT.style.opacity = p > 0.02 && p < 0.995 ? 1 : 0;
    if (!REDUCE) lCore.style.transform = "scale(" + (1 + p * 0.18).toFixed(4) + ")";
    if (shownPct >= 100 && firstReady && badgeReady) burst();
  })();
  var crop = { sx: 0, sy: 0, scale: 1, imgW: 1600, imgH: 900 };
  var DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  var HAS_BITMAP = typeof createImageBitmap === "function";
  var BMP_AHEAD = 26, BMP_BEHIND = 10, BMP_MAX = 44, BMP_INFLIGHT_MAX = 3;
  var bitmaps = new Map();
  var bmpInflight = 0, bmpResizeOk = true;
  var bmpW = Math.min(1600, Math.ceil(window.innerWidth * DPR));
  var scrollDir = 1;

  function makeBitmap(idx) {
    bitmaps.set(idx, null); bmpInflight++;
    var img = frames[idx];
    var p = (bmpResizeOk && bmpW < img.naturalWidth)
      ? createImageBitmap(img, { resizeWidth: bmpW, resizeQuality: "medium" })
      : createImageBitmap(img);
    p.then(function (bm) {
      if (bitmaps.get(idx) === null) bitmaps.set(idx, bm); else bm.close();
      bmpInflight--;
    }).catch(function () {
      bmpInflight--;
      if (bmpResizeOk) { bmpResizeOk = false; bitmaps.delete(idx); }
      else bitmaps.delete(idx);
    });
  }

  function tendBitmaps(center) {
    if (!HAS_BITMAP) return;
    for (var d = 0; d <= BMP_AHEAD && bmpInflight < BMP_INFLIGHT_MAX; d++) {
      var i = center + d * scrollDir;
      if (i >= 0 && i < TOTAL_FRAMES && frames[i] && !bitmaps.has(i)) makeBitmap(i);
      if (d > 0 && d <= BMP_BEHIND) {
        var j = center - d * scrollDir;
        if (j >= 0 && j < TOTAL_FRAMES && frames[j] && !bitmaps.has(j) && bmpInflight < BMP_INFLIGHT_MAX) makeBitmap(j);
      }
    }
    if (bitmaps.size > BMP_MAX) {
      var ks = [];
      bitmaps.forEach(function (v, k) { if (v) ks.push(k); });
      ks.sort(function (a, b) { return Math.abs(b - center) - Math.abs(a - center); });
      for (var e = 0; e < ks.length && bitmaps.size > BMP_MAX; e++) {
        if (Math.abs(ks[e] - center) <= BMP_AHEAD) break;
        bitmaps.get(ks[e]).close(); bitmaps.delete(ks[e]);
      }
    }
  }

  function getDrawable(i) {
    if (!HAS_BITMAP) return { img: frames[i], exact: true };
    var bm = bitmaps.get(i);
    if (bm) return { img: bm, exact: true };
    for (var d = 1; d <= 2; d++) {
      bm = bitmaps.get(i - d * scrollDir);
      if (bm) return { img: bm, exact: false };
      bm = bitmaps.get(i + d * scrollDir);
      if (bm) return { img: bm, exact: false };
    }
    return { img: frames[i], exact: true };
  }

  function drawImageCover(img) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    if (canvas.width !== Math.round(vw * DPR) || canvas.height !== Math.round(vh * DPR)) {
      canvas.width = Math.round(vw * DPR); canvas.height = Math.round(vh * DPR);
    }
    var ir = iw / ih, cr = vw / vh;
    var sw, sh, sx, sy;
    if (ir > cr) { sh = ih; sw = sh * cr; sx = (iw - sw) / 2; sy = 0; }
    else { sw = iw; sh = sw / cr; sx = 0; sy = (ih - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    crop.sx = sx; crop.sy = sy; crop.scale = vw / sw; crop.imgW = iw; crop.imgH = ih;
  }
  function v2s(vx, vy) {
    return [(vx / 100 * crop.imgW - crop.sx) * crop.scale, (vy / 100 * crop.imgH - crop.sy) * crop.scale];
  }

  function loadFrame(i, cb) {
    if (frames[i]) { cb && cb(); return; }
    var img = new Image();
    img.onload = function () {
      frames[i] = img; loadedCount++;
      if (i === 0 && !firstReady) {
        firstReady = true;
        drawImageCover(img); drawnFrame = 0; // frame 0 waits beneath the loader
      }
      cb && cb();
    };
    img.onerror = function () { cb && cb(); };
    img.src = frameSrc(i);
  }

  (function preload() {
    var batch = Math.min(INITIAL_BATCH, TOTAL_FRAMES);
    for (var i = 0; i < batch; i++) loadFrame(i, function () {
      if (++batchLoaded === batch) {
        var next = batch;
        (function chain() { if (next >= TOTAL_FRAMES) return; loadFrame(next++, chain); })();
      }
    });
  })();

  // ── State machine ──────────────────────────────────────────────────────────
  var MODE = "story";
  var cur = 0, fromIdx = -1, toIdx = 0;
  var transitioning = false, tT = 0, tDur = 1, tFrom = SEC[0].stop, tTo = SEC[0].stop;
  var pNow = SEC[0].stop;
  var wheelAcc = 0, lastWheelT = 0, cooldownUntil = 0;
  var fleetT = 0, fleetGoal = 0, fleetAcc = 0; // services card-fleet travel (0..1)

  var dim = document.getElementById("alp-dim");
  var glow = document.getElementById("alp-glow");
  var nav = document.getElementById("alp-nav");
  var hint = document.getElementById("alp-hint");
  var dots = document.getElementById("alp-dots");
  var count = document.getElementById("alp-count");
  var cnum = document.getElementById("alp-cnum");
  var cline = count.querySelector(".alp-cline i");
  var secEls = Array.prototype.slice.call(root.querySelectorAll(".alp-section"));
  var ghostEls = Array.prototype.slice.call(root.querySelectorAll(".alp-ghost"));
  var annoEls = Array.prototype.slice.call(root.querySelectorAll(".alp-anno"));
  var dotEls = Array.prototype.slice.call(root.querySelectorAll("#alp-dots button"));
  var spacer = document.getElementById("alp-spacer");

  var secHeads = secEls.map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".alp-w"));
  });
  var secCopy = secEls.map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".alp-rise"));
  });
  var secLines = secEls.map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".alp-hr"));
  });
  var svcIdx = -1;
  SEC.forEach(function (s, i) { if (s.svc) svcIdx = i; });
  var svcCardEls = Array.prototype.slice.call(root.querySelectorAll(".alp-fcard"));
  var svcLayer = document.getElementById("alp-svc-layer");
  var svcHeads = Array.prototype.slice.call(svcLayer.querySelectorAll(".alp-w"));
  var svcCopy = Array.prototype.slice.call(svcLayer.querySelectorAll(".alp-rise"));
  var svcLayerLines = Array.prototype.slice.call(svcLayer.querySelectorAll(".alp-hr"));
  var svcOrns = Array.prototype.slice.call(svcLayer.querySelectorAll(".alp-orn"));
  var secBoxes = secEls.map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".alp-box")).map(function (b) {
      return { t: b.querySelector(".alp-be.t"), r: b.querySelector(".alp-be.r"),
        bm: b.querySelector(".alp-be.b"), l: b.querySelector(".alp-be.l"),
        cs: Array.prototype.slice.call(b.querySelectorAll(".alp-bc")),
        tab: b.querySelector(".alp-btab") };
    });
  });
  var secFloats = secEls.map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".alp-float, .alp-orn"));
  });
  var secPx = secEls.map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".alp-float")).map(function (f) {
      return { el: f.querySelector(".alp-fpx"), d: parseFloat(f.getAttribute("data-fd")) || 0.6 };
    });
  });

  function hideSvcLayer() {
    if (svcLayer.style.visibility !== "hidden") { svcLayer.style.opacity = 0; svcLayer.style.visibility = "hidden"; }
  }
  /* Text choreography — the single source of truth for how copy populates and
     leaves. Headings (.alp-w) ride a masked slide: up from below the clip on
     enter (expo-out), staggered lift out on exit (expo-in), travel direction
     and stagger order following scrollDir. Supporting copy (.alp-rise) focuses
     in from a blur and blurs back out. Every channel keeps
     last-start + window <= 1 so enterQ=1/exitQ=0 is exactly settled — the
     parked render runs once and freezes there. */
  function styleTextFx(heads, copy, lines, boxes, floats, enterQ, exitQ, dirX) {
    var n = heads.length, k, st;
    if (exitQ > 0) {
      var stagO = Math.min(0.055, 0.5 / Math.max(n - 1, 1));
      for (k = 0; k < n; k++) {
        var o = scrollDir > 0 ? k : n - 1 - k;
        var e = expoIn(clamp01((exitQ - o * stagO) / 0.45));
        heads[k].style.transform = "translateY(" + (-scrollDir * e * 130).toFixed(2) + "%)";
      }
    } else {
      var stag = Math.min(0.05, 0.45 / Math.max(n - 1, 1));
      for (k = 0; k < n; k++) {
        var r = expoOut(clamp01((enterQ - k * stag) / 0.5));
        heads[k].style.transform = "translateY(" + ((1 - r) * 130).toFixed(2) + "%)";
      }
    }
    var m = copy.length;
    if (exitQ > 0) {
      var stagCO = 0.3 / Math.max(m, 1);
      for (k = 0; k < m; k++) {
        var oc = scrollDir > 0 ? k : m - 1 - k;
        var ec = expoIn(clamp01((exitQ - oc * stagCO) / 0.5));
        st = copy[k].style;
        st.opacity = (1 - ec).toFixed(3);
        st.transform = "translateY(" + (-scrollDir * ec * 0.5).toFixed(3) + "em)";
        st.filter = ec <= 0 ? "" : "blur(" + (ec * 6).toFixed(2) + "px)";
      }
    } else {
      var stagC = 0.55 / Math.max(m, 1);
      for (k = 0; k < m; k++) {
        var rc = expoOut(clamp01((enterQ - k * stagC) / 0.45));
        st = copy[k].style;
        st.opacity = rc.toFixed(3);
        st.transform = "translate(" + (dirX * (1 - rc) * 1.6).toFixed(2) + "vw," + ((1 - rc) * 0.6).toFixed(3) + "em)";
        st.filter = rc >= 1 ? "" : "blur(" + ((1 - rc) * 6).toFixed(2) + "px)";
      }
    }
    var nL = lines.length, lstag = Math.min(0.12, 0.15 / Math.max(nL - 1, 1));
    for (k = 0; k < nL; k++) {
      var lq = ease(clamp01((enterQ - 0.35 - k * lstag) / 0.5));
      var le = exitQ > 0 ? expoIn(clamp01((exitQ - k * 0.1) / 0.45)) : 0;
      var oR = lines[k].getAttribute("data-o") === "r";
      /* exit collapses toward the side opposite the draw-in origin */
      lines[k].style.transformOrigin = (exitQ > 0 ? !oR : oR) ? "right" : "left";
      lines[k].style.transform = "scaleX(" + (lq * (1 - le)).toFixed(3) + ")";
    }
    /* blueprint boxes: top edge traces first, sides drop, bottom closes,
       corner brackets snap on, label tab slides in last */
    for (k = 0; k < boxes.length; k++) {
      var bx = boxes[k], c;
      if (exitQ > 0) {
        var bs = 1 - expoIn(clamp01(exitQ / 0.35));
        if (bx.t) { bx.t.style.transformOrigin = "right"; bx.t.style.transform = "scaleX(" + bs.toFixed(3) + ")"; }
        if (bx.bm) { bx.bm.style.transformOrigin = "left"; bx.bm.style.transform = "scaleX(" + bs.toFixed(3) + ")"; }
        if (bx.l) { bx.l.style.transformOrigin = "bottom"; bx.l.style.transform = "scaleY(" + bs.toFixed(3) + ")"; }
        if (bx.r) { bx.r.style.transformOrigin = "bottom"; bx.r.style.transform = "scaleY(" + bs.toFixed(3) + ")"; }
        for (c = 0; c < bx.cs.length; c++) bx.cs[c].style.opacity = bs.toFixed(3);
        if (bx.tab) bx.tab.style.opacity = bs.toFixed(3);
      } else {
        var rt = expoOut(clamp01((enterQ - 0.3) / 0.4));
        var rs = expoOut(clamp01((enterQ - 0.42) / 0.4));
        var rb = expoOut(clamp01((enterQ - 0.54) / 0.42));
        if (bx.t) { bx.t.style.transformOrigin = dirX < 0 ? "right" : "left"; bx.t.style.transform = "scaleX(" + rt.toFixed(3) + ")"; }
        if (bx.l) { bx.l.style.transformOrigin = "top"; bx.l.style.transform = "scaleY(" + rs.toFixed(3) + ")"; }
        if (bx.r) { bx.r.style.transformOrigin = "top"; bx.r.style.transform = "scaleY(" + rs.toFixed(3) + ")"; }
        if (bx.bm) { bx.bm.style.transformOrigin = dirX < 0 ? "left" : "right"; bx.bm.style.transform = "scaleX(" + rb.toFixed(3) + ")"; }
        for (c = 0; c < bx.cs.length; c++) {
          var rc = expoOut(clamp01((enterQ - 0.6 - c * 0.025) / 0.32));
          bx.cs[c].style.opacity = rc.toFixed(3);
          bx.cs[c].style.transform = "scale(" + (0.4 + rc * 0.6).toFixed(3) + ")";
        }
        if (bx.tab) {
          var rtab = expoOut(clamp01((enterQ - 0.7) / 0.3));
          bx.tab.style.opacity = rtab.toFixed(3);
          bx.tab.style.transform = "translateY(calc(-50% + " + ((1 - rtab) * 8).toFixed(1) + "px))";
        }
      }
    }
    /* floats: blur-pop in late (foreground arrives last), fly out with depth */
    var F = floats.length;
    if (F) {
      var stagF = 0.07, winF = Math.max(0.2, 1 - 0.5 - (F - 1) * stagF);
      for (k = 0; k < F; k++) {
        st = floats[k].style;
        if (exitQ > 0) {
          var oF = scrollDir > 0 ? k : F - 1 - k;
          var eF = expoIn(clamp01((exitQ - oF * 0.06) / 0.45));
          st.opacity = (1 - eF).toFixed(3);
          st.transform = "translateY(" + (-scrollDir * eF * 3).toFixed(2) + "em) scale(" + (1 - eF * 0.06).toFixed(3) + ")";
          st.filter = eF <= 0 ? "" : "blur(" + (eF * 8).toFixed(2) + "px)";
        } else {
          var rF = expoOut(clamp01((enterQ - 0.5 - k * stagF) / winF));
          st.opacity = rF.toFixed(3);
          st.transform = "translateY(" + ((1 - rF) * 2.4).toFixed(2) + "em) scale(" + (0.92 + rF * 0.08).toFixed(3) + ")";
          st.filter = rF >= 1 ? "" : "blur(" + ((1 - rF) * 10).toFixed(2) + "px)";
        }
      }
    }
  }

  var svcTextSettled = false;
  function showSvcLayer(enterQ, exitQ, vis, dx, dy) {
    svcLayer.style.visibility = "visible";
    svcLayer.style.opacity = vis.toFixed(3);
    svcLayer.style.transform = "translate(" + dx.toFixed(2) + "vw," + dy.toFixed(2) + "vh)";
    /* parked at services the RAF loop runs every frame for the card fleet —
       skip the text loops once they've settled */
    var settled = enterQ >= 1 && exitQ <= 0;
    if (!settled || !svcTextSettled) {
      styleTextFx(svcHeads, svcCopy, svcLayerLines, [], svcOrns, enterQ, exitQ, 0);
      svcTextSettled = settled;
    }
  }

  function startIntro() {
    transitioning = true; fromIdx = -1; toIdx = 0; tFrom = SEC[0].stop; tTo = SEC[0].stop; tT = 0; tDur = 1.15;
  }

  function goTo(idx) {
    if (transitioning || MODE !== "story") return;
    if (idx >= SEC.length) { enterFlow(); return; }
    if (idx < 0 || idx === cur) return;
    if (idx === svcIdx) { var fwd = idx > cur; fleetT = fleetGoal = fwd ? 0 : 1; fleetAcc = 0; }
    transitioning = true; fromIdx = cur; toIdx = idx;
    tFrom = pNow; tTo = SEC[idx].stop; tT = 0;
    tDur = Math.min(2.3, 0.75 + Math.abs(tTo - tFrom) * 0.05);
    scrollDir = tTo > tFrom ? 1 : -1;
    wheelAcc = 0;
  }
  function goNext() { goTo(cur + 1); }
  function goPrev() { goTo(cur - 1); }

  function enterFlow() {
    if (transitioning) return;
    transitioning = true; fromIdx = cur; toIdx = -2;
    tFrom = pNow; tTo = 100; tT = 0; tDur = 1.15; scrollDir = 1;
  }
  function finishEnterFlow() {
    MODE = "flow";
    root.classList.add("alp-flowmode");
    loadCalendar();
    var t0 = null, startTop = root.scrollTop, target = spacer.offsetHeight;
    function step(ts) {
      if (!t0) t0 = ts;
      var q = easeIO(Math.min((ts - t0) / 750, 1));
      root.scrollTop = startTop + (target - startTop) * q;
      if (q < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function exitFlow() {
    if (transitioning) return;
    MODE = "story";
    root.classList.remove("alp-flowmode");
    root.scrollTop = 0;
    transitioning = true; fromIdx = -1; toIdx = SEC.length - 1;
    tFrom = 100; tTo = SEC[SEC.length - 1].stop; tT = 0; tDur = 1.0; scrollDir = -1;
    cooldownUntil = performance.now() + 500;
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  root.addEventListener("wheel", function (e) {
    if (introActive) { e.preventDefault(); return; }
    if (MODE === "flow") {
      if (root.scrollTop <= 0 && e.deltaY < -40 && !transitioning) { e.preventDefault(); exitFlow(); }
      return;
    }
    e.preventDefault();
    if (transitioning) return;
    var now = performance.now();
    if (now < cooldownUntil) return;
    if (cur === svcIdx) {
      // services stop: scroll drives the card fleet across the screen
      var before = fleetGoal;
      fleetGoal = clamp01(fleetGoal + e.deltaY / FLEET_WHEEL_SPAN);
      if ((before >= 1 && e.deltaY > 0) || (before <= 0 && e.deltaY < 0)) {
        fleetAcc += e.deltaY;
        if (fleetAcc > 140) goNext();
        else if (fleetAcc < -140) goPrev();
      } else fleetAcc = 0;
      return;
    }
    if (now - lastWheelT > 320) wheelAcc = 0;
    lastWheelT = now;
    wheelAcc += e.deltaY;
    if (wheelAcc > 110) goNext();
    else if (wheelAcc < -110) goPrev();
  }, { passive: false });

  var touchY = null, touchUsed = false;
  root.addEventListener("touchstart", function (e) {
    touchY = e.touches[0].clientY; touchUsed = false;
  }, { passive: true });
  root.addEventListener("touchmove", function (e) {
    if (introActive) { e.preventDefault(); return; }
    if (MODE === "flow") {
      if (root.scrollTop <= 0 && touchY !== null && e.touches[0].clientY - touchY > 70 && !transitioning && !touchUsed) {
        touchUsed = true; exitFlow();
      }
      return;
    }
    e.preventDefault();
    if (transitioning || touchY === null) return;
    if (cur === svcIdx) {
      var step = touchY - e.touches[0].clientY;
      touchY = e.touches[0].clientY;
      var was = fleetGoal;
      fleetGoal = clamp01(fleetGoal + step / (FLEET_WHEEL_SPAN * 0.45));
      if (!touchUsed && ((was >= 1 && step > 0) || (was <= 0 && step < 0))) {
        fleetAcc += step;
        if (fleetAcc > 90) { touchUsed = true; goNext(); }
        else if (fleetAcc < -90) { touchUsed = true; goPrev(); }
      } else if (was < 1 && was > 0) fleetAcc = 0;
      return;
    }
    if (touchUsed) return;
    var dy = touchY - e.touches[0].clientY;
    if (dy > 70) { touchUsed = true; goNext(); }
    else if (dy < -70) { touchUsed = true; goPrev(); }
  }, { passive: false });

  window.addEventListener("keydown", function (e) {
    if (introActive) return;
    if (MODE !== "story" || transitioning) return;
    var down = e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ";
    var up = e.key === "ArrowUp" || e.key === "PageUp";
    if (!down && !up) return;
    e.preventDefault();
    if (cur === svcIdx) {
      if (down) { if (fleetGoal >= 1) goNext(); else fleetGoal = Math.min(1, fleetGoal + 0.34); }
      else { if (fleetGoal <= 0) goPrev(); else fleetGoal = Math.max(0, fleetGoal - 0.34); }
      return;
    }
    if (down) goNext(); else goPrev();
  });

  dotEls.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (MODE === "flow") return;
      goTo(parseInt(btn.getAttribute("data-idx"), 10));
    });
  });

  root.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a[href^='#']") : null;
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    e.preventDefault();
    if (id === "alp-booking") {
      if (MODE === "flow") {
        var el = document.getElementById(id);
        if (el) root.scrollTo({ top: el.offsetTop - 20, behavior: "smooth" });
      } else enterFlow();
      return;
    }
    if (id === "top") {
      if (MODE === "flow") exitFlow();
      else goTo(0);
    }
  });

  // ── Molten cursor companion (desktop): the droplet IS the pointer — pinned
  // dead-on it, stretching along velocity like hot metal — shedding long-lived
  // physical sparks: white-hot streaks that cool through amber to ember red,
  // fall under gravity, flicker, and occasionally pop and split mid-air.
  // The rAF loop sleeps when the pointer rests and the last spark has died.
  var FINE = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (FINE && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) (function () {
    var c = document.createElement("canvas");
    c.id = "alp-fx";
    root.appendChild(c);
    root.classList.add("alp-nocursor");
    var fctx = c.getContext("2d");
    var W = 0, H = 0, FDPR = 1;
    /* canvas is a replaced element: inset:0 does NOT stretch it, so the CSS
       size must be set explicitly or the bitmap displays at intrinsic size
       (2x on retina -> sparks drift away from the pointer). DPR re-read on
       every resize so browser zoom / monitor moves stay calibrated. */
    function fxSize() {
      FDPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      c.width = W * FDPR; c.height = H * FDPR;
      c.style.width = W + "px"; c.style.height = H + "px";
    }
    fxSize(); window.addEventListener("resize", fxSize);
    var tx = -100, ty = -100, ox = -100, oy = -100, lvx = 0, lvy = 0;
    var sparks = [], fxRun = false, lastMove = 0;
    function addSpark(x, y, vx, vy, hot) {
      if (sparks.length > 420) return;
      sparks.push({ x: x, y: y, vx: vx, vy: vy, life: 1,
        dk: 0.0045 + Math.random() * 0.009,
        r: hot ? 1.3 + Math.random() * 1.5 : 0.6 + Math.random() * 1.1 });
    }
    function spawnTail(x, y, dirx, diry, sp) {
      var m = Math.sqrt(dirx * dirx + diry * diry) || 1;
      var bx = -dirx / m, by = -diry / m;
      var j = (Math.random() - 0.5) * 1.8;
      var v = 0.7 + Math.random() * 2.1 + sp * 0.05;
      addSpark(x, y, bx * v - by * j, by * v + bx * j - 0.25, Math.random() < 0.2);
    }
    function wake() { if (!fxRun) { fxRun = true; requestAnimationFrame(fxStep); } }
    window.addEventListener("mousemove", function (e) {
      tx = e.clientX; ty = e.clientY; lastMove = performance.now();
      if (ox < -50) { ox = tx; oy = ty; }
      wake();
    }, { passive: true });
    window.addEventListener("mousedown", function (e) {
      for (var i = 0; i < 18; i++) {
        var a = Math.random() * 6.283, sp2 = 1.2 + Math.random() * 3.4;
        addSpark(e.clientX, e.clientY, Math.cos(a) * sp2, Math.sin(a) * sp2 - 0.8, Math.random() < 0.4);
      }
      lastMove = performance.now();
      wake();
    }, { passive: true });
    /* colour cools with life: white-hot -> amber -> ember red */
    function tone(life) {
      return life > 0.75 ? "255,246,222" : life > 0.45 ? "255,198,112" : life > 0.22 ? "255,138,56" : "206,82,40";
    }
    function fxStep() {
      var pox = ox, poy = oy;
      ox = tx; oy = ty; /* pinned dead-on the pointer */
      var mvx = ox - pox, mvy = oy - poy;
      lvx = lvx * 0.7 + mvx * 0.3; lvy = lvy * 0.7 + mvy * 0.3;
      var speed = Math.sqrt(lvx * lvx + lvy * lvy);
      if (speed > 0.5 && pox > -50) {
        var nT = Math.min(14, 1 + Math.ceil(speed * 0.6));
        for (var sT = 0; sT < nT; sT++) {
          var tt = Math.random();
          spawnTail(pox + mvx * tt, poy + mvy * tt, lvx, lvy, speed);
        }
      }
      fctx.setTransform(FDPR, 0, 0, FDPR, 0, 0);
      fctx.clearRect(0, 0, W, H);
      fctx.globalCompositeOperation = "lighter";
      fctx.lineCap = "round";
      if (ox > -50) {
        var ang = Math.atan2(lvy, lvx), st = Math.min(speed * 0.045, 1.6);
        fctx.save();
        fctx.translate(ox, oy); fctx.rotate(ang); fctx.scale(1 + st, Math.max(1 - st * 0.35, 0.55));
        var g = fctx.createRadialGradient(0, 0, 0, 0, 0, 12);
        g.addColorStop(0, "rgba(255,240,210,.9)");
        g.addColorStop(0.35, "rgba(255,166,77,.38)");
        g.addColorStop(1, "rgba(255,120,40,0)");
        fctx.fillStyle = g;
        fctx.beginPath(); fctx.arc(0, 0, 12, 0, 6.283); fctx.fill();
        fctx.restore();
      }
      for (var i = sparks.length - 1; i >= 0; i--) {
        var s = sparks[i];
        s.vy += 0.05;                  /* gravity */
        s.vx *= 0.988; s.vy *= 0.988;  /* drag */
        s.x += s.vx; s.y += s.vy;
        s.life -= s.dk;
        if (s.life <= 0 || s.y > H + 50 || s.x < -60 || s.x > W + 60) { sparks.splice(i, 1); continue; }
        /* a spark occasionally pops and splits mid-flight */
        if (s.life < 0.85 && s.life > 0.25 && sparks.length < 400 && Math.random() < 0.005) {
          for (var k2 = 0; k2 < 2; k2++) {
            var ra = (Math.random() - 0.5) * 1.6;
            var ca = Math.cos(ra), sa = Math.sin(ra);
            addSpark(s.x, s.y, (s.vx * ca - s.vy * sa) * 0.7, (s.vx * sa + s.vy * ca) * 0.7 - 0.3, false);
          }
          s.dk *= 1.8; /* the parent burns out quicker after popping */
        }
        var al = Math.pow(s.life, 1.4) * (0.72 + Math.random() * 0.28); /* flicker */
        var spd2 = s.vx * s.vx + s.vy * s.vy;
        if (spd2 > 0.04) {
          /* motion streak along the velocity — how real sparks read */
          fctx.strokeStyle = "rgba(" + tone(s.life) + "," + al.toFixed(3) + ")";
          fctx.lineWidth = s.r * (0.5 + s.life * 0.9);
          fctx.beginPath();
          fctx.moveTo(s.x, s.y);
          fctx.lineTo(s.x - s.vx * 2.4, s.y - s.vy * 2.4);
          fctx.stroke();
        } else {
          fctx.fillStyle = "rgba(" + tone(s.life) + "," + al.toFixed(3) + ")";
          fctx.beginPath(); fctx.arc(s.x, s.y, s.r * (0.4 + s.life * 0.6), 0, 6.283); fctx.fill();
        }
      }
      if (performance.now() - lastMove > 300 && sparks.length === 0) {
        fxRun = false;
        return;
      }
      requestAnimationFrame(fxStep);
    }
  })();

  // mouse parallax + card hover tilt
  var mx = 0.5, my = 0.5;
  window.addEventListener("mousemove", function (e) {
    mx = e.clientX / window.innerWidth; my = e.clientY / window.innerHeight;
    /* float parallax: event-driven (no idle RAF work), damped by the .alp-fpx
       CSS transition so the chips lag the cursor like they have mass */
    if (MODE === "story" && !transitioning) {
      var pxs = secPx[cur];
      for (var pi = 0; pi < pxs.length; pi++) {
        pxs[pi].el.style.transform = "translate(" + ((mx - 0.5) * -pxs[pi].d * 34).toFixed(1) + "px," + ((my - 0.5) * -pxs[pi].d * 20).toFixed(1) + "px)";
      }
    }
  }, { passive: true });
  svcCardEls.forEach(function (card) {
    var inner = card.querySelector(".alp-fin");
    var baseTilt = inner.style.transform; // constant glass-sheet tilt from markup
    card.addEventListener("mousemove", function (e) {
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      inner.style.transform = "perspective(900px) rotateY(" + (px * 9).toFixed(1) + "deg) rotateX(" + (-py * 9).toFixed(1) + "deg) scale(1.05)";
      card.style.zIndex = 9;
    });
    card.addEventListener("mouseleave", function () {
      inner.style.transform = baseTilt;
      card.style.zIndex = 6;
    });
  });

  // fleet renderer: all cards ride one arc track at the same speed with even
  // spacing — in from bottom-right, rainbow crest mid-screen, out bottom-left.
  // All cards sit above the headline; the text blurs through the glass.
  var FLEET_TOTAL = (FLEET.length - 1) * FLEET_GAP + FLEET_SPAN;
  function renderFleet(vis) {
    var T = fleetT * FLEET_TOTAL;
    for (var i = 0; i < svcCardEls.length; i++) {
      var c = FLEET[i], el = svcCardEls[i];
      var s = T - i * FLEET_GAP; // this card's distance along its own journey
      if (s < -28 || s > FLEET_SPAN + 28) {
        if (el.style.opacity !== "0") { el.style.opacity = 0; el.style.pointerEvents = "none"; }
        continue;
      }
      var x = 110 - s; // vw: 110 (offscreen right) → -30 (offscreen left)
      var u = clamp01(s / FLEET_SPAN);
      // rainbow arc + slow individual float (period from the card's bob config)
      var bob = Math.sin(performance.now() / 1000 * (6.283 / c[4]) + i * 1.9) * 1.3;
      var y = 58 - Math.sin(Math.PI * u) * 34 + c[0] + bob;
      var sc = 0.92 + c[3] * 0.08;
      var pax = (mx - 0.5) * c[3] * -26;
      var pay = (my - 0.5) * c[3] * -16;
      el.style.opacity = vis.toFixed(3);
      el.style.pointerEvents = "auto";
      el.style.transform = "translate(" + x.toFixed(2) + "vw," + y.toFixed(2) + "vh) translate(" + pax.toFixed(1) + "px," + pay.toFixed(1) + "px) scale(" + sc.toFixed(3) + ")";
    }
  }

  Array.prototype.forEach.call(root.querySelectorAll(".alp-qa button"), function (btn) {
    btn.addEventListener("click", function () {
      var qa = btn.parentElement;
      var open = qa.classList.contains("alp-open");
      Array.prototype.forEach.call(root.querySelectorAll(".alp-qa.alp-open"), function (o) {
        o.classList.remove("alp-open"); o.querySelector(".alp-a").style.maxHeight = "0";
      });
      if (!open) {
        qa.classList.add("alp-open");
        var a = qa.querySelector(".alp-a");
        a.style.maxHeight = a.scrollHeight + "px";
      }
    });
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  function grade(p) {
    var a = GRADE[0], b = GRADE[GRADE.length - 1];
    for (var i = 0; i < GRADE.length - 1; i++) {
      if (p >= GRADE[i][0] && p <= GRADE[i + 1][0]) { a = GRADE[i]; b = GRADE[i + 1]; break; }
    }
    var t = b[0] === a[0] ? 0 : (p - a[0]) / (b[0] - a[0]);
    function mix(i2) { return a[i2] + (b[i2] - a[i2]) * t; }
    return "rgba(" + Math.round(mix(1)) + "," + Math.round(mix(2)) + "," + Math.round(mix(3)) + "," + mix(4).toFixed(3) + ")";
  }

  function annoRect(a, p) {
    var keys = a.keys;
    if (p <= keys[0][0]) return keys[0];
    var last = keys[keys.length - 1];
    if (p >= last[0]) return last;
    for (var i = 0; i < keys.length - 1; i++) {
      if (p >= keys[i][0] && p <= keys[i + 1][0]) {
        var t = (p - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
        return [p,
          lerp(keys[i][1], keys[i + 1][1], t), lerp(keys[i][2], keys[i + 1][2], t),
          lerp(keys[i][3], keys[i + 1][3], t), lerp(keys[i][4], keys[i + 1][4], t)];
      }
    }
    return last;
  }

  function styleSectionState(i, enterQ, exitQ) {
    var s = SEC[i], el = secEls[i];
    var vis = enterQ * (1 - exitQ);
    if (vis <= 0.004) {
      if (el.style.visibility !== "hidden") { el.style.opacity = 0; el.style.visibility = "hidden"; }
      if (s.svc) hideSvcLayer();
      return;
    }
    el.style.visibility = "visible";
    el.style.opacity = 1;
    var inner = el.firstElementChild;
    var dx = s.enter[0] * (1 - enterQ) + s.exit[0] * exitQ;
    var dy = s.enter[1] * (1 - enterQ) + s.exit[1] * exitQ;
    inner.style.transform = "translate(" + dx.toFixed(2) + "vw," + dy.toFixed(2) + "vh)";
    /* the staggered word/copy exit is the fade — the block itself only lets go
       at the very end, otherwise the choreography would leave half-transparent */
    inner.style.opacity = exitQ > 0 ? (1 - expoIn(exitQ)).toFixed(3) : 1;

    styleTextFx(secHeads[i], secCopy[i], secLines[i], secBoxes[i], secFloats[i], enterQ, exitQ,
      s.enter[0] > 0 ? 1 : s.enter[0] < 0 ? -1 : 0);
    if (s.svc) {
      showSvcLayer(enterQ, exitQ, vis, dx, dy);
      renderFleet(vis);
    }
  }

  var lastTs = null, parkedDirty = true;

  function render(p, force) {
    var fpos = Math.min(Math.max((p / 100) * (TOTAL_FRAMES - 1), 0), TOTAL_FRAMES - 1);
    var i0 = Math.floor(fpos), i1 = Math.min(i0 + 1, TOTAL_FRAMES - 1);
    var fa = fpos - i0;
    tendBitmaps(Math.round(fpos));
    var dkey = (fpos * 64) | 0;
    if (dkey !== drawnFrame || force) {
      var d0 = getDrawable(i0);
      if (d0.img) {
        drawImageCover(d0.img);
        var d1 = fa > 0.02 ? bitmaps.get(i1) : null;
        if (d1) { ctx.globalAlpha = fa; drawImageCover(d1); ctx.globalAlpha = 1; }
        if (d0.exact && (fa <= 0.02 || d1)) drawnFrame = dkey;
      }
    }

    var hand = clamp01((p - 95) / 5);
    canvas.style.transform = hand > 0 ? "scale(" + (1 + hand * 0.06).toFixed(4) + ")" : "";
    dim.style.background = grade(p);
    var glowOp = clamp01((p - 89) / 5) * (1 - clamp01((p - 99) / 4));
    glow.style.opacity = (glowOp * 0.55).toFixed(3);

    var tq = transitioning ? easeIO(Math.min(tT / tDur, 1)) : 1;
    for (var i = 0; i < SEC.length; i++) {
      if (transitioning) {
        if (i === fromIdx) styleSectionState(i, 1, ease(clamp01(tq / 0.52)));
        else if (i === toIdx) styleSectionState(i, ease(clamp01((tq - 0.4) / 0.6)), 0);
        else {
          if (secEls[i].style.visibility !== "hidden") { secEls[i].style.opacity = 0; secEls[i].style.visibility = "hidden"; }
          if (i === svcIdx) hideSvcLayer();
        }
      } else if (i === cur && MODE === "story" && !introActive) {
        styleSectionState(i, 1, 0);
      } else {
        if (secEls[i].style.visibility !== "hidden") { secEls[i].style.opacity = 0; secEls[i].style.visibility = "hidden"; }
        if (i === svcIdx) hideSvcLayer();
      }
    }

    for (var an = 0; an < ANNOS.length; an++) {
      var a = ANNOS[an], ael = annoEls[an];
      var aq = (p - a.in) / (a.out - a.in);
      if (aq < -0.05 || aq > 1.05) { if (ael.style.opacity !== "0") ael.style.opacity = 0; continue; }
      var aOp = ease(clamp01(aq / 0.16)) * ease(clamp01((1 - aq) / 0.16));
      var rk = annoRect(a, p);
      var tl = v2s(rk[1], rk[2]);
      var br = v2s(rk[1] + rk[3], rk[2] + rk[4]);
      ael.style.opacity = aOp.toFixed(3);
      ael.style.transform = "translate(" + tl[0].toFixed(1) + "px," + tl[1].toFixed(1) + "px)";
      ael.style.width = Math.max(br[0] - tl[0], 20).toFixed(1) + "px";
      ael.style.height = Math.max(br[1] - tl[1], 20).toFixed(1) + "px";
    }

    for (var g = 0; g < GHOSTS.length; g++) {
      var gh = GHOSTS[g], gel = ghostEls[g];
      var gq = (p - gh[1]) / (gh[2] - gh[1]);
      if (gq < -0.1 || gq > 1.1) { if (gel.style.opacity !== "0") gel.style.opacity = 0; continue; }
      gel.style.opacity = Math.sin(Math.PI * clamp01(gq)).toFixed(3);
      gel.style.transform = "translate(" + ((1 - gq) * 110 - 55).toFixed(2) + "vw,-50%)";
    }

    var inFlow = MODE === "flow";
    hint.style.opacity = (inFlow || transitioning) ? 0 : 0.6;
    dots.style.opacity = inFlow ? 0 : 1;
    dots.style.pointerEvents = inFlow ? "none" : "auto";
    count.style.opacity = inFlow ? 0 : 1;
    for (var j = 0; j < dotEls.length; j++) dotEls[j].className = (j === cur && !inFlow) ? "alp-on" : "";
  }

  function setCounter(idx) {
    cnum.textContent = "0" + (idx + 1);
    cline.style.transform = "scaleX(" + ((idx + 1) / SEC.length).toFixed(3) + ")";
  }
  setCounter(0);

  (function tick(ts) {
    requestAnimationFrame(tick);
    try {
      if (document.hidden) { lastTs = null; return; }
      var dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0.016;
      lastTs = ts;
      if (!firstReady) return;
      var needs = false;
      if (transitioning) {
        tT += dt;
        var q = easeIO(Math.min(tT / tDur, 1));
        pNow = lerp(tFrom, tTo, q);
        needs = true;
        if (tT >= tDur) {
          transitioning = false;
          if (toIdx === -2) finishEnterFlow();
          else { cur = toIdx; setCounter(cur); }
          cooldownUntil = performance.now() + 420;
        }
      } else if (MODE === "story" && cur === svcIdx) {
        // fleet travel: lerp toward the scroll-driven goal; parallax tracks the mouse
        fleetT += (fleetGoal - fleetT) * 0.09;
        if (Math.abs(fleetGoal - fleetT) < 0.0004) fleetT = fleetGoal;
        cline.style.transform = "scaleX(" + ((cur + Math.max(fleetT, 0.04)) / SEC.length).toFixed(3) + ")";
        needs = true;
      }
      if (needs || parkedDirty) { parkedDirty = false; render(pNow, false); }
    } catch (e) { /* loop must survive */ }
  })();

  window.addEventListener("resize", function () { drawnFrame = -1; parkedDirty = true; });

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  try { history.scrollRestoration = "manual"; } catch (e) {}
  root.scrollTop = 0;

  render(pNow, true);
})();
