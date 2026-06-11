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
  var LOGO = "https://assets.cdn.filesafe.space/1lKkbgp032mJDSlEuKMu/media/66bab601cbbc6c959ddd0be1.jpeg";
  var MAPS = "https://maps.google.com/?q=35B+Brookes+Road,+Frankton,+Queenstown+9300";

  function frameSrc(i) {
    var n = String(i + 1); while (n.length < 4) n = "0" + n;
    return FRAME_BASE + "frame_" + n + ".jpg";
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { return t * t * (3 - 2 * t); }
  function easeIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
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
  + "@media (max-width:900px){.alp-anno{display:none;}}"
  /* sections */
  + ".alp-section{position:fixed;inset:0;z-index:10;display:flex;align-items:center;pointer-events:none;opacity:0;visibility:hidden;}"
  + ".alp-section.alp-top{align-items:flex-start;}"
  + ".alp-section.alp-top .alp-inner{padding-top:max(13vh,100px);}"
  + ".alp-section .alp-inner{pointer-events:auto;will-change:transform;width:100%;}"
  + ".alp-w{display:inline-block;}"
  /* hairline rules that draw across */
  + ".alp-hr{display:block;height:1px;background:rgba(255,255,255,.22);margin:26px 0;transform:scaleX(0);will-change:transform;}"
  /* meta row (Noomo style) */
  + ".alp-meta{display:flex;align-items:center;gap:12px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.45);}"
  + ".alp-meta .alp-chip{padding:3px 10px;border:1px solid rgba(255,255,255,.25);border-radius:99px;color:rgba(255,255,255,.7);}"
  /* loading */
  + "#alp-loader{position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:#000;transition:opacity .5s ease;}"
  + "#alp-loader img{width:74px;height:74px;border-radius:50%;animation:alp-pulse 1.6s ease-in-out infinite;}"
  + "@keyframes alp-pulse{0%,100%{opacity:.45}50%{opacity:1}}"
  + "#alp-loadbar{width:150px;height:3px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;}"
  + "#alp-loadbar div{height:100%;width:0;background:rgba(255,255,255,.35);border-radius:99px;transition:width .3s ease;}"
  /* nav */
  + "#alp-nav{position:fixed;top:0;left:0;right:0;z-index:30;display:flex;align-items:center;justify-content:space-between;padding:18px 32px;}"
  + "#alp-nav .alp-brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:#fff;}"
  + "#alp-nav .alp-brand img{width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.2);transition:transform .35s cubic-bezier(.2,.8,.2,1);}"
  + "#alp-nav .alp-brand:hover img{transform:rotate(-12deg) scale(1.06);}"
  + "#alp-nav .alp-brand span{font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.9);}"
  + "#alp-nav a.alp-call{padding:9px 20px;border-radius:99px;border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.8);font-size:13px;font-weight:600;text-decoration:none;background:rgba(10,10,10,.45);transition:background .25s,color .25s,transform .25s;white-space:nowrap;}"
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
  + ".alp-h1{font-weight:800;line-height:1.02;letter-spacing:-.03em;font-size:clamp(2.6rem,7vw,5rem);}"
  + ".alp-h2{font-weight:800;line-height:1.05;letter-spacing:-.025em;font-size:clamp(1.9rem,4.5vw,3rem);}"
  + ".alp-giant{font-family:'Space Grotesk',Inter,sans-serif;font-weight:500;line-height:1.04;letter-spacing:.005em;text-transform:uppercase;font-size:clamp(2.6rem,6.2vw,5.6rem);}"
  + ".alp-lead{margin-top:18px;color:rgba(255,255,255,.58);line-height:1.65;font-size:clamp(.98rem,1.8vw,1.2rem);max-width:30em;}"
  + ".alp-ticks{margin-top:26px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;font-size:11px;letter-spacing:.05em;color:rgba(255,255,255,.38);}"
  + ".alp-ticks span{display:inline-flex;align-items:center;gap:6px;}"
  + ".alp-ticks svg{width:12px;height:12px;}"
  /* buttons */
  + ".alp-btn{display:inline-flex;align-items:center;gap:10px;padding:14px 30px;border-radius:99px;font-size:14px;font-weight:700;letter-spacing:.02em;text-decoration:none;cursor:pointer;border:none;transition:transform .3s cubic-bezier(.2,.8,.2,1),background .3s,color .3s,box-shadow .3s;}"
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
  /* card geometry measured from Noomo's actual WebGL textures (revs/rev1-4.png,
     1140×1260): 8.2% padding, logo block 8.2cqw, quote 5.26cqw/1.25, footer
     caps 3.2cqw + role 4.4cqw, ink #181520, near-sharp corners */
  + ".alp-fcard{position:absolute;left:0;top:0;width:clamp(270px,21vw,370px);aspect-ratio:1140/1260;container-type:inline-size;cursor:default;will-change:transform;pointer-events:auto;}"
  + ".alp-fcard .alp-fin{position:absolute;inset:0;padding:8.2cqw;border-radius:3px;color:#181520;overflow:hidden;"
  +   "background:linear-gradient(168deg,rgba(252,253,255,.16) 0%,rgba(237,239,246,.085) 42%,rgba(196,201,215,.14) 100%),rgba(237,239,246,.085);"
  +   "-webkit-backdrop-filter:blur(16px) saturate(1.12);backdrop-filter:blur(16px) saturate(1.12);"
  +   "border:1px solid rgba(255,255,255,.48);"
  +   "box-shadow:-5px 6px 0 -1px rgba(204,208,221,.85),-2px 3px 0 0 rgba(226,229,238,.95),0 34px 90px rgba(0,0,0,.42),0 6px 18px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.7),inset -1px -1px 0 rgba(150,156,175,.35);"
  +   "transition:transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s;}"
  /* specular sheen — a soft diagonal light streak across the glass */
  + ".alp-fcard .alp-fin::after{content:'';position:absolute;inset:-40% -60%;pointer-events:none;"
  +   "background:linear-gradient(115deg,transparent 38%,rgba(255,255,255,.10) 47%,rgba(255,255,255,.03) 52%,transparent 60%);}"
  + ".alp-fcard svg.alp-fico{width:8.2cqw;height:8.2cqw;stroke:#181520;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;margin-bottom:8.4cqw;display:block;}"
  + ".alp-fcard p{font-size:5.26cqw;line-height:1.25;font-weight:500;color:#181520;opacity:.68;letter-spacing:-.005em;}"
  + ".alp-fcard .alp-ffoot{position:absolute;left:8.2cqw;right:8.2cqw;bottom:5cqw;}"
  + ".alp-fcard .alp-ffoot span{display:block;font-size:3.2cqw;letter-spacing:.1em;font-weight:500;color:#181520;opacity:.5;text-transform:uppercase;}"
  + ".alp-fcard .alp-ffoot b{display:block;margin-top:2.6cqw;font-size:4.4cqw;line-height:1.12;font-weight:600;letter-spacing:-.005em;color:#181520;opacity:.95;}"
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
  +   "#alp-nav{padding:14px 16px;}"
  +   "#alp-nav .alp-brand span{display:none;}"
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
  + "}";

  // ── Content ────────────────────────────────────────────────────────────────
  var check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  var SERVICES = [
    ["Service & Routine Maintenance", "Oil changes, tyre rotations, fluid checks and filter replacements — the regular care that keeps your vehicle reliable between visits."],
    ["Brake Services", "Inspection, repair and replacement of brake pads, rotors and fluid — so you stop as confidently as you go."],
    ["Engine Diagnostics & Repair", "We identify and fix engine issues promptly, tune-ups included, before small faults become big bills."],
    ["Transmission Services", "Transmission fluid changes, repair and full replacement — deep work handled in-house by specialists."],
    ["Suspension & Steering", "Repair and maintenance of shocks, struts and steering components for a tight, comfortable drive."],
    ["Exhaust System Repairs", "Mufflers, catalytic converters and exhaust pipes — repaired or replaced, quietly and properly."],
    ["Auto Electrical", "Battery testing and replacement, alternators, and professional fault-finding for stubborn electrical gremlins."],
    ["WOF Repairs", "We don't do the WOF test itself — but we're fully equipped to fix any fails you've encountered."]
  ];
  /* minimal line icons, one per service (oil, brake, engine, gearbox, spring, exhaust, battery, inspection) */
  var ICONS = [
    '<path d="M12 3c3.5 4.5 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.5 6-11Z"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5"/>',
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.4"/><circle cx="12" cy="6.4" r=".4"/><circle cx="17" cy="9.4" r=".4"/><circle cx="17" cy="14.7" r=".4"/><circle cx="12" cy="17.6" r=".4"/><circle cx="7" cy="14.7" r=".4"/><circle cx="7" cy="9.4" r=".4"/>',
    '<path d="M7 8h4l1.5-2H17v2h2.5v3H21v4h-1.5v3H8l-2-2H4.5v-6H6l1-2Z"/><path d="M4.5 12H3"/>',
    '<circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="7" r="2.4"/><circle cx="7" cy="17" r="2.4"/><path d="M7 9.4v5.2M9.4 7H17M17 9.4V12a3 3 0 0 1-3 3H9.4"/>',
    '<path d="M6 4h12M6 20h12M8 4c4 2.2-4 3.4 0 5.6 4 2.2-4 3.4 0 5.6 4 2.2-4 3.2 0 4.8M16 4c4 2.2-4 3.4 0 5.6 4 2.2-4 3.4 0 5.6 4 2.2-4 3.2 0 4.8"/>',
    '<path d="M3 15h9a4 4 0 0 0 4-4V8h5"/><circle cx="18.5" cy="8" r="1.6"/><path d="M3 18h6M3 12h4"/>',
    '<rect x="4" y="7" width="16" height="12" rx="2"/><path d="M8 7V5h3v2M13 7V5h3v2M9.5 13h2.2l-1.4 3 3.2-4h-2.2l1.4-3-3.2 4Z"/>',
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.2V3h6v1.2M9 10l2 2 4-4M9 16h6"/>'
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
      + '<svg class="alp-fico" viewBox="0 0 24 24">' + ICONS[i] + "</svg>"
      + "<p>" + s[1] + "</p>"
      + '<div class="alp-ffoot"><span>Service 0' + (i + 1) + ' / 08 · Addept Workshop</span><b>' + s[0] + "</b></div>"
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

  /* Sections: each parks the video at a scene; transitions play the footage. */
  var SEC = [
    { id: "hero", stop: 1, enter: [0, 10], exit: [0, -11], html:
      '<div class="alp-inner alp-left">'
      + '<div class="alp-eyebrow alp-rise">Queenstown · Independent Mechanics</div>'
      + '<h1 class="alp-h1 alp-split">Your vehicle,\nrunning at its best.</h1>'
      + '<i class="alp-hr" data-o="l"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;">First-rate servicing, diagnostics and repairs — specialising in European and Japanese vehicles, with top-tier customer care and respect for your budget.</p>'
      + '<div class="alp-btnrow alp-rise"><a class="alp-btn alp-btn-light" href="#alp-booking">Make a booking</a>'
      + '<a class="alp-btn alp-btn-ghost" href="' + PHONE_TEL + '">Call ' + PHONE_DISPLAY + "</a></div>"
      + '<div class="alp-ticks alp-rise"><span>' + check + "WOF repair specialists</span><span>" + check + "Diesel engine solutions</span><span>" + check + "Frankton, Queenstown</span></div>"
      + "</div>" },
    { id: "about", stop: 16, enter: [22, 0], exit: [-18, 0], html:
      '<div class="alp-inner alp-center">'
      + '<i class="alp-hr" data-o="r"></i>'
      + '<h2 class="alp-giant alp-split">First-rate repairs.\nTop-tier care.</h2>'
      + '<i class="alp-hr" data-o="l"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;">Your go-to for peak vehicle performance and reliability — comprehensive diagnostics, routine maintenance, diesel engine solutions and WOF repairs, plus a tyre &amp; battery marketplace.</p>'
      + "</div>" },
    { id: "services", stop: 30, enter: [0, -12], exit: [0, -12], svc: true, html:
      '<div class="alp-inner" style="position:absolute;inset:0;">'
      + '<div id="alp-svc-cards">' + svcCards + "</div>"
      + "</div>" },
    { id: "inspections", stop: 42.2, enter: [-22, 0], exit: [16, 0], html:
      '<div class="alp-inner alp-left">'
      + '<div class="alp-eyebrow alp-rise">Pre-Purchase Inspections</div>'
      + '<h2 class="alp-h2 alp-split">Buying? Selling?\nKnow first.</h2>'
      + '<i class="alp-hr" data-o="l" style="max-width:420px;"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;">We give any vehicle you’re about to buy or sell a thorough inspection — and list anything it needs now or in the near future. No surprises after the handshake.</p>'
      + '<div class="alp-btnrow alp-rise"><a class="alp-btn alp-btn-ghost" href="' + PHONE_TEL + '">Call ' + PHONE_DISPLAY + "</a></div>"
      + "</div>" },
    { id: "overhauls", stop: 60, enter: [0, 14], exit: [0, -12], top: true, html:
      '<div class="alp-inner alp-left" style="max-width:600px;">'
      + '<div class="alp-eyebrow alp-rise">European & Japanese Specialists</div>'
      + '<h2 class="alp-h2 alp-split">Overhauls are\nour specialty.</h2>'
      + '<i class="alp-hr" data-o="l" style="max-width:380px;"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;font-size:clamp(.92rem,1.5vw,1.05rem);">Engine and transmission overhauls and intricate auto electrical work — the deep jobs other shops send away.</p>'
      + "</div>" },
    { id: "hours", stop: 81, enter: [20, 0], exit: [-16, 0], html:
      '<div class="alp-inner alp-center">'
      + '<h2 class="alp-giant alp-split">Drop in.\nWe’ll sort it.</h2>'
      + '<div class="alp-hours">'
      + '<i class="alp-hr" data-o="l" style="margin:18px 0 0;"></i>'
      + '<div class="alp-hrow alp-rise"><b>Monday – Thursday</b><span>7:00am – 5:00pm</span></div>'
      + '<i class="alp-hr" data-o="r" style="margin:0;"></i>'
      + '<div class="alp-hrow alp-rise"><b>Friday</b><span>By appointment only</span></div>'
      + '<i class="alp-hr" data-o="l" style="margin:0;"></i>'
      + '<div class="alp-hrow alp-rise"><b>Saturday – Sunday</b><span>Closed</span></div>'
      + '<i class="alp-hr" data-o="r" style="margin:0;"></i>'
      + "</div>"
      + '<p class="alp-lead alp-rise" style="font-size:13px;margin-top:22px;color:rgba(255,255,255,.35);">35B Brookes Road, Frankton, Queenstown 9300</p>'
      + "</div>" },
    { id: "cta", stop: 93, enter: [0, 13], exit: [0, -10], html:
      '<div class="alp-inner alp-center">'
      + '<h2 class="alp-h1 alp-split" style="font-size:clamp(2.2rem,5.5vw,3.8rem);">Book your\nvehicle in.</h2>'
      + '<i class="alp-hr" data-o="l"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;">One more scroll — or pick up the phone for an estimate first.</p>'
      + '<div class="alp-btnrow alp-rise" style="justify-content:center;"><a class="alp-btn alp-btn-light" href="#alp-booking">Make a booking</a></div>'
      + '<p class="alp-rise" style="margin-top:18px;font-size:12px;color:rgba(255,255,255,.3);">' + PHONE_DISPLAY + " &nbsp;·&nbsp; " + EMAIL + "</p>"
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
  fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Space+Grotesk:wght@500;700&display=swap";
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
    + "</div>"
    + SEC.map(function (s) {
        return '<div class="alp-section' + (s.top ? " alp-top" : "") + '" data-sec="' + s.id + '">' + s.html + "</div>";
      }).join("")
    + '<div id="alp-nav">'
    +   '<a class="alp-brand" href="#top"><img src="' + LOGO + '" alt="Addept Automotive"><span>Addept Automotive</span></a>'
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
    + '<div id="alp-loader"><img src="' + LOGO + '" alt=""><div id="alp-loadbar"><div></div></div></div>';
  document.body.appendChild(root);

  Array.prototype.forEach.call(root.querySelectorAll(".alp-split"), function (el) {
    var lines = el.textContent.split("\n");
    el.innerHTML = lines.map(function (line) {
      return line.split(" ").map(function (w) {
        return '<span class="alp-w">' + w + "</span>";
      }).join(" ");
    }).join("<br>");
  });

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
  var loadbar = loader.querySelector("#alp-loadbar div");
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
      loadbar.style.width = Math.round((loadedCount / TOTAL_FRAMES) * 100) + "%";
      if (i === 0 && !firstReady) {
        firstReady = true;
        drawImageCover(img); drawnFrame = 0;
        loader.style.opacity = "0";
        setTimeout(function () { loader.style.display = "none"; }, 550);
        startIntro();
      }
      cb && cb();
    };
    img.onerror = function () { cb && cb(); };
    img.src = frameSrc(i);
  }

  (function preload() {
    var done = 0, batch = Math.min(INITIAL_BATCH, TOTAL_FRAMES);
    for (var i = 0; i < batch; i++) loadFrame(i, function () {
      if (++done === batch) {
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

  var secKids = secEls.map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".alp-w, .alp-rise"));
  });
  var secLines = secEls.map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".alp-hr"));
  });
  var svcIdx = -1;
  SEC.forEach(function (s, i) { if (s.svc) svcIdx = i; });
  var svcCardEls = Array.prototype.slice.call(root.querySelectorAll(".alp-fcard"));
  var svcLayer = document.getElementById("alp-svc-layer");
  var svcLayerKids = Array.prototype.slice.call(svcLayer.querySelectorAll(".alp-w, .alp-rise"));
  var svcLayerLines = Array.prototype.slice.call(svcLayer.querySelectorAll(".alp-hr"));

  function hideSvcLayer() {
    if (svcLayer.style.visibility !== "hidden") { svcLayer.style.opacity = 0; svcLayer.style.visibility = "hidden"; }
  }
  function showSvcLayer(enterQ, exitQ, vis, dx, dy) {
    svcLayer.style.visibility = "visible";
    svcLayer.style.opacity = vis.toFixed(3);
    svcLayer.style.transform = "translate(" + dx.toFixed(2) + "vw," + dy.toFixed(2) + "vh)";
    var n = svcLayerKids.length, stag = 0.55 / Math.max(n, 1);
    for (var k = 0; k < n; k++) {
      var r = ease(clamp01((enterQ - k * stag) / 0.45));
      svcLayerKids[k].style.opacity = r.toFixed(3);
      svcLayerKids[k].style.transform = "translateY(" + ((1 - r) * 0.9).toFixed(3) + "em)";
    }
    for (var L = 0; L < svcLayerLines.length; L++) {
      var lq = ease(clamp01((enterQ - 0.35 - L * 0.12) / 0.5)) * (1 - exitQ);
      svcLayerLines[L].style.transformOrigin = svcLayerLines[L].getAttribute("data-o") === "r" ? "right" : "left";
      svcLayerLines[L].style.transform = "scaleX(" + lq.toFixed(3) + ")";
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

  // mouse parallax + card hover tilt
  var mx = 0.5, my = 0.5;
  window.addEventListener("mousemove", function (e) {
    mx = e.clientX / window.innerWidth; my = e.clientY / window.innerHeight;
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
    inner.style.opacity = vis.toFixed(3);

    var kids = secKids[i], n = kids.length;
    if (n) {
      var stag = 0.55 / n;
      for (var k = 0; k < n; k++) {
        var r = ease(clamp01((enterQ - k * stag) / 0.45));
        var ks = kids[k].style;
        var kdx = s.enter[0] !== 0 ? (s.enter[0] > 0 ? 1 : -1) * (1 - r) * 1.6 : 0;
        var kdy = (1 - r) * 0.9;
        ks.opacity = r.toFixed(3);
        ks.transform = "translate(" + kdx.toFixed(2) + "vw," + kdy.toFixed(3) + "em)";
      }
    }
    if (s.svc) {
      showSvcLayer(enterQ, exitQ, vis, dx, dy);
      renderFleet(vis);
    }
    var lines = secLines[i];
    for (var L = 0; L < lines.length; L++) {
      var lq = ease(clamp01((enterQ - 0.35 - L * 0.12) / 0.5)) * (1 - exitQ);
      lines[L].style.transformOrigin = lines[L].getAttribute("data-o") === "r" ? "right" : "left";
      lines[L].style.transform = "scaleX(" + lq.toFixed(3) + ")";
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
      } else if (i === cur && MODE === "story") {
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
