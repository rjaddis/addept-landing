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
  var SMS_TEL = "sms:+64274393403";
  var WA_URL = "https://wa.me/64274393403?text=" + encodeURIComponent("Hi Addept, I'd like to ask about ");
  var EMAIL = "addeptauto@gmail.com";
  var CAL_URL = "https://api.leadconnectorhq.com/widget/booking/jk0S1digTnc8PT4F1AmO";
  /* Estimate form now emails straight to EMAIL via Web3Forms (no GHL).
     >>> PASTE YOUR FREE WEB3FORMS ACCESS KEY BELOW <<<
     Get one in ~30s at https://web3forms.com (enter EMAIL, they email you a key). */
  var FORM_ENDPOINT = "https://api.web3forms.com/submit";
  var FORM_KEY = "0f54a4b2-418b-4a4a-8104-6069cd30975c";
  var BADGE = SCRIPT_BASE + "/addept-logo-badge.svg";
  var MAPS = "https://maps.google.com/?q=35B+Brookes+Road,+Frankton,+Queenstown+9300";
  var REVIEWS_URL = "https://www.google.com/maps/search/Addept+Automotive+Queenstown+reviews"; // TODO: swap for the exact place reviews link
  var WORKSHOP_VID = SCRIPT_BASE + "/workshop.mp4"; // owner-supplied; everything degrades gracefully while absent
  var WORKSHOP_VID_MOBILE = SCRIPT_BASE + "/workshop-mobile.mp4"; // trimmed 3–17s middle loop (no logo intro / "always here to help" outro, which crop off a portrait screen)
  var introActive = true; // gates input + section render until the loader's badge-burst hands off

  /* frame format: the original JPEGs — the sharp master, and the fastest to
     decode (hardware path), which is what keeps rapid scroll-scrubbing smooth.
     LITE devices (coarse pointer + small screen, or Save-Data) decode their
     bitmaps at a lighter width to bound memory; every frame is still loaded. */
  var FRAMES_DIR = FRAME_BASE, FRAME_EXT = ".jpg";
  var LITE = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 800)
    || !!(navigator.connection && navigator.connection.saveData);
  function frameSrc(i) {
    var n = String(i + 1); while (n.length < 4) n = "0" + n;
    return FRAMES_DIR + "frame_" + n + FRAME_EXT;
  }
  /* analytics bootstrap: when this script runs somewhere index.html did NOT
     switch GA on (e.g. the GoHighLevel page, which only loads embed.js), turn it
     on here so track() fires anywhere embed.js lives. Guarded on GA_ID so it can
     never double-load alongside the index.html bootstrap. */
  var GA_ID_FALLBACK = "G-NR6Y5X7BQV";
  if (!window.GA_ID && GA_ID_FALLBACK) {
    try {
      window.GA_ID = GA_ID_FALLBACK;
      var _gaS = document.createElement("script");
      _gaS.async = true; _gaS.src = "https://www.googletagmanager.com/gtag/js?id=" + window.GA_ID;
      document.head.appendChild(_gaS);
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { dataLayer.push(arguments); };
      gtag("js", new Date());
      gtag("config", window.GA_ID, { anonymize_ip: true });
    } catch (e) {}
  }
  function track(ev, params) {
    try { if (window.gtag && window.GA_ID) window.gtag("event", ev, params || {}); } catch (e) {}
  }
  /* Google Ads conversion tracking for bookings. The gtag library is already
     loaded for GA4 above; registering the Ads account here lets the conversion
     fire — on the main site AND the GHL-embedded copy. */
  var ADS_ID = "AW-877695182", ADS_BOOK_LABEL = "pFzKCJuVx78cEM6hwqID", _bookingConvFired = false;
  try { if (window.gtag) window.gtag("config", ADS_ID); } catch (e) {}
  function trackBookingConversion() {
    if (_bookingConvFired) return; _bookingConvFired = true;
    try { if (window.gtag) window.gtag("event", "conversion", { send_to: ADS_ID + "/" + ADS_BOOK_LABEL }); } catch (e) {}
    track("booking_conversion");
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { return t * t * (3 - 2 * t); }
  function easeIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  /* expo pair snaps to exactly 0/1 at the bounds — the parked render runs once
     and freezes, so settled states must not hold residual sub-pixel values */
  function expoOut(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function expoIn(t) { return t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, 10 * (t - 1)); }
  function backOut(t) { t = clamp01(t) - 1; return 1 + 2.70158 * t * t * t + 1.70158 * t * t; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ── Styles ─────────────────────────────────────────────────────────────────
  var css = ""
  + "#alp-root{position:fixed;inset:0;overflow:hidden;background:#000;z-index:999990;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;color:#fff;overscroll-behavior:none;-webkit-user-select:none;-moz-user-select:none;user-select:none;}"
  /* no text selection anywhere — keeps the welding-arc cursor from highlighting
     copy as you sweep/drag (form fields stay selectable so you can still type) */
  + "#alp-root input,#alp-root textarea,#alp-root [contenteditable]{-webkit-user-select:text;-moz-user-select:text;user-select:text;}"
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
  /* letter-driven entrance styles: words sit still, letters carry the motion;
     .alp-ltopen additionally opens the word masks so letters can fly free */
  + ".alp-ltsec .alp-w{transform:none;}"
  + ".alp-ltsec .alp-ch{opacity:0;will-change:transform,opacity,filter;}"
  + ".alp-ltopen .alp-wm{overflow:visible;}"
  + ".alp-ch{display:inline-block;}"
  + ".alp-ln{display:inline-block;will-change:transform;}"
  /* booking-page letter reveal: each letter does a soft fade + small upward
     lift as its block scrolls into view — subtle, no blur, gentle stagger.
     Letters hide until their block gets .alp-in (added by an IntersectionObserver). */
  + ".alp-rl{display:inline-block;}"
  + ".alp-rvl:not(.alp-in) .alp-rl{opacity:0;}"
  + ".alp-rvl.alp-in .alp-rl{animation:alp-rvlin .5s ease-out both;animation-delay:calc(var(--d,0) * 240ms);}"
  + "@keyframes alp-rvlin{from{opacity:0;transform:translateY(.32em);}to{opacity:1;transform:translateY(0);}}"
  + "@media (prefers-reduced-motion:reduce){.alp-rvl .alp-rl{opacity:1!important;transform:none!important;animation:none!important;}}"
  /* deco: blueprint boxes that draw themselves around key content */
  + ".alp-box{position:relative;display:inline-block;padding:30px 34px;}"
  + ".alp-box.alp-glass{border-radius:0;padding:36px 30px;background:linear-gradient(165deg,rgba(255,255,255,.035),rgba(255,255,255,.012));-webkit-backdrop-filter:blur(2px) saturate(1.05);backdrop-filter:blur(2px) saturate(1.05);box-shadow:0 22px 60px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.14);}"
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
  + ".alp-hr{display:block;height:1.5px;background:rgba(255,255,255,.32);margin:26px 0;transform:scaleX(0);will-change:transform;}"
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
  + "#alp-lembers i{position:absolute;top:55%;border-radius:99px;background:#ffc9a0;box-shadow:0 0 7px 2px rgba(255,160,70,.7);opacity:0;animation:alp-ember linear infinite;}"
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
  + "#alp-lembers i:nth-child(17){left:33%;width:3px;height:3px;animation-duration:7.2s;animation-delay:-1.4s;}"
  + "#alp-lembers i:nth-child(18){left:37%;width:2px;height:2px;animation-duration:5.8s;animation-delay:-4.1s;}"
  + "#alp-lembers i:nth-child(19){left:45%;width:2px;height:2px;animation-duration:8.2s;animation-delay:-6.4s;}"
  + "#alp-lembers i:nth-child(20){left:49%;width:3px;height:3px;animation-duration:6.4s;animation-delay:-2.9s;}"
  + "#alp-lembers i:nth-child(21){left:52%;width:2px;height:2px;animation-duration:7.6s;animation-delay:-5.2s;}"
  + "#alp-lembers i:nth-child(22){left:58%;width:2px;height:2px;animation-duration:5.4s;animation-delay:-0.6s;}"
  + "#alp-lembers i:nth-child(23){left:62%;width:3px;height:3px;animation-duration:8.6s;animation-delay:-3.7s;}"
  + "#alp-lembers i:nth-child(24){left:67%;width:2px;height:2px;animation-duration:6.9s;animation-delay:-6.9s;}"
  + "#alp-lembers i:nth-child(25){left:28%;width:2px;height:2px;animation-duration:9.4s;animation-delay:-1.9s;}"
  + "#alp-lembers i:nth-child(26){left:71%;width:2px;height:2px;animation-duration:7.4s;animation-delay:-4.8s;}"
  + "#alp-lembers i:nth-child(27){left:22%;width:2px;height:2px;animation-duration:8.4s;animation-delay:-5.8s;}"
  + "#alp-lembers i:nth-child(28){left:78%;width:2px;height:2px;animation-duration:6.6s;animation-delay:-2.2s;}"
  + "#alp-lembers i:nth-child(29){left:4%;top:62%;width:2px;height:2px;animation-duration:8.4s;animation-delay:-3.1s;}"
  + "#alp-lembers i:nth-child(30){left:9%;top:48%;width:2px;height:2px;animation-duration:7.1s;animation-delay:-5.7s;}"
  + "#alp-lembers i:nth-child(31){left:14%;top:70%;width:3px;height:3px;animation-duration:9.3s;animation-delay:-1.2s;}"
  + "#alp-lembers i:nth-child(32){left:18%;top:40%;width:2px;height:2px;animation-duration:6.2s;animation-delay:-4.4s;}"
  + "#alp-lembers i:nth-child(33){left:82%;top:64%;width:2px;height:2px;animation-duration:8.9s;animation-delay:-2.6s;}"
  + "#alp-lembers i:nth-child(34){left:87%;top:46%;width:3px;height:3px;animation-duration:7.7s;animation-delay:-6.3s;}"
  + "#alp-lembers i:nth-child(35){left:92%;top:72%;width:2px;height:2px;animation-duration:9.8s;animation-delay:-0.9s;}"
  + "#alp-lembers i:nth-child(36){left:96%;top:52%;width:2px;height:2px;animation-duration:6.8s;animation-delay:-5.1s;}"
  + "#alp-lembers i:nth-child(37){left:6%;top:82%;width:2px;height:2px;animation-duration:10.2s;animation-delay:-7.4s;}"
  + "#alp-lembers i:nth-child(38){left:38%;top:78%;width:2px;height:2px;animation-duration:7.9s;animation-delay:-2.1s;}"
  + "#alp-lembers i:nth-child(39){left:47%;top:84%;width:3px;height:3px;animation-duration:8.7s;animation-delay:-5.9s;}"
  + "#alp-lembers i:nth-child(40){left:56%;top:76%;width:2px;height:2px;animation-duration:6.5s;animation-delay:-3.8s;}"
  + "#alp-lembers i:nth-child(41){left:64%;top:82%;width:2px;height:2px;animation-duration:9.1s;animation-delay:-1.7s;}"
  + "#alp-lembers i:nth-child(42){left:72%;top:80%;width:2px;height:2px;animation-duration:7.3s;animation-delay:-6.6s;}"
  + "#alp-lembers i:nth-child(43){left:90%;top:34%;width:2px;height:2px;animation-duration:8.1s;animation-delay:-4.9s;}"
  + "#alp-lembers i:nth-child(44){left:11%;top:30%;width:2px;height:2px;animation-duration:9.6s;animation-delay:-2.4s;}"
  + "@keyframes alp-ember{0%{transform:translateY(16vh) translateX(0) scale(1);opacity:0}7%{opacity:.9}28%{transform:translateY(2vh) translateX(7px) scale(.95);opacity:.55}55%{transform:translateY(-12vh) translateX(-6px) scale(.8);opacity:.65}100%{transform:translateY(-28vh) translateX(4px) scale(.45);opacity:0}}"
  /* hyperrealistic mechanical odometer, bottom centre: worn white digits on
     curved black drums set in a cream bezel, classic gold tenths wheel. Each
     drum is a masked column; .alp-odc::after paints the cylinder curvature +
     glass gloss over the digit. The workshop line takes its place at 100.
     Drum geometry: digit-height = window-height = JS roll step = .92em. */
  + "#alp-lpct{--alp-grain:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2290%22%20height%3D%2290%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.8%22%20numOctaves%3D%222%22%20stitchTiles%3D%22stitch%22%2F%3E%3CfeColorMatrix%20type%3D%22saturate%22%20values%3D%220%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%2F%3E%3C%2Fsvg%3E');--alp-blotch:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22140%22%20height%3D%22120%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.22%200.3%22%20numOctaves%3D%223%22%20stitchTiles%3D%22stitch%22%2F%3E%3CfeColorMatrix%20type%3D%22saturate%22%20values%3D%220%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%2F%3E%3C%2Fsvg%3E');position:absolute;bottom:24px;left:0;right:0;text-align:center;font-size:20px;transition:opacity .35s;}"
  + "#alp-lpct .alp-odm{display:inline-flex;align-items:center;padding:.08em .1em;border-radius:.16em;background:var(--alp-grain),linear-gradient(158deg,#efe9d9 0%,#ddd5c0 46%,#bfb69d 100%);background-size:.9em auto,auto;background-blend-mode:soft-light,normal;box-shadow:0 .016em 0 rgba(255,255,255,.5) inset,0 -.025em .022em rgba(0,0,0,.3) inset,.014em 0 0 rgba(255,255,255,.3) inset,-.016em 0 0 rgba(0,0,0,.16) inset,0 .12em .26em rgba(0,0,0,.55),0 .025em .07em rgba(0,0,0,.45);}"
  + ".alp-odbox{position:relative;display:inline-flex;border-radius:.07em;overflow:hidden;background:#040404;box-shadow:0 .035em .07em rgba(0,0,0,.95) inset,0 -.02em .05em rgba(0,0,0,.9) inset,0 0 0 .02em rgba(0,0,0,.85);}"
  + ".alp-odbox::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:2;background:var(--alp-grain);background-size:.62em .62em;mix-blend-mode:overlay;opacity:.22;}"
  + ".alp-odbox::after{content:'';position:absolute;left:0;right:0;top:0;height:42%;pointer-events:none;z-index:5;background:linear-gradient(rgba(255,255,255,.08),rgba(255,255,255,0));}"
  + ".alp-odc{position:relative;display:inline-block;overflow:hidden;height:.92em;width:.8em;vertical-align:top;background:var(--alp-blotch),linear-gradient(90deg,rgba(0,0,0,.55) 0%,rgba(255,255,255,.05) 15%,rgba(255,255,255,.05) 85%,rgba(0,0,0,.55) 100%),linear-gradient(#0e0e0e,#000);background-size:1.6em auto,auto,auto;background-blend-mode:soft-light,normal,normal;box-shadow:inset .02em 0 .02em rgba(255,255,255,.05),inset -.02em 0 .03em rgba(0,0,0,.9);}"
  + ".alp-odc::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:3;background:linear-gradient(102deg,rgba(255,255,255,.08) 0%,rgba(255,255,255,.02) 18%,rgba(255,255,255,0) 42%),linear-gradient(to bottom,rgba(0,0,0,.44) 0%,rgba(0,0,0,.13) 10%,rgba(0,0,0,0) 26%,rgba(255,255,255,.07) 50%,rgba(0,0,0,0) 74%,rgba(0,0,0,.15) 90%,rgba(0,0,0,.46) 100%);}"
  + ".alp-odw{display:block;transition:transform .55s cubic-bezier(.22,.85,.3,1);}"
  /* the tenths wheel spins too fast to read: a continuous loop + vertical blur
     reads as a smeared spinning drum (no digits), settling on 0 when it lands */
  + "@keyframes alp-odspin{from{transform:translateY(0)}to{transform:translateY(-9.2em)}}"
  + ".alp-odw.alp-odspin{animation:alp-odspin .2s linear infinite;filter:blur(1.1px);}"
  + ".alp-odw b{display:block;height:.92em;line-height:.92em;text-align:center;font-family:'Space Grotesk',Inter,sans-serif;font-weight:700;letter-spacing:.005em;background:linear-gradient(#ffffff 0%,#f8f6f0 60%,#ebe6db 100%);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 .006em 0 rgba(0,0,0,.3);}"
  /* tenths wheel: white drum with a black digit */
  + ".alp-odc:last-child{background:var(--alp-blotch),linear-gradient(90deg,rgba(0,0,0,.14) 0%,rgba(255,255,255,.12) 15%,rgba(255,255,255,.12) 85%,rgba(0,0,0,.14) 100%),linear-gradient(#fcfbf8,#e7e4dc);background-size:1.6em auto,auto,auto;background-blend-mode:soft-light,normal,normal;}"
  + ".alp-odc:last-child::after{background:linear-gradient(102deg,rgba(255,255,255,.4) 0%,rgba(255,255,255,.12) 18%,rgba(255,255,255,0) 42%),linear-gradient(to bottom,rgba(0,0,0,.3) 0%,rgba(0,0,0,.1) 11%,rgba(0,0,0,0) 30%,rgba(255,255,255,.22) 50%,rgba(0,0,0,0) 70%,rgba(0,0,0,.11) 89%,rgba(0,0,0,.32) 100%);}"
  + ".alp-odc:last-child .alp-odw b{background:#000;-webkit-background-clip:text;background-clip:text;color:#000;text-shadow:0 .01em 0 rgba(255,255,255,.55);}"
  /* tagline matches the counter's cut; letters drop into place one by one,
     then the trailing dots count up in the beat before the burst */
  + "#alp-lstat{position:absolute;bottom:26px;left:0;right:0;text-align:center;font-size:13px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.85);opacity:0;}"
  + "#alp-lstat.alp-on{opacity:1;}"
  /* centre the words only — the trailing dots hang off the right edge so their
     reserved width doesn't shove the text left of centre */
  + "#alp-lstat .alp-lstat-in{position:relative;display:inline-block;}"
  + "#alp-lstat .alp-lstat-dots{position:absolute;left:100%;top:0;white-space:nowrap;}"
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
  + "@media (max-width:760px){#alp-lbadge{width:78vw;}}"
  + "#alp-fx,#alp-fxt{position:fixed;inset:0;pointer-events:none;}"
  + "#alp-fxt{z-index:1000001;}#alp-fx{z-index:1000002;}"
  + "#alp-mute{position:fixed;bottom:22px;right:32px;z-index:1000003;background:rgba(10,12,16,.55);color:#cfd8e6;border:1px solid rgba(190,215,255,.25);border-radius:999px;padding:6px 14px;font:600 10px Inter,sans-serif;letter-spacing:.14em;cursor:pointer;pointer-events:auto;opacity:.75;transition:opacity .2s;}"
  + "#alp-mute:hover{opacity:1;}"
  + ".alp-nocursor,.alp-nocursor *{cursor:none!important;}"
  /* nav */
  + "#alp-nav{position:fixed;top:0;left:0;right:0;z-index:30;display:flex;align-items:center;justify-content:space-between;padding:18px 32px;}"
  + "#alp-nav .alp-brand{font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#fff;text-decoration:none;white-space:nowrap;transition:opacity .25s;}"
  + "#alp-nav .alp-brand:hover{opacity:.8;}"
  + "#alp-nav .alp-brand b{font-weight:800;}"
  + "#alp-nav .alp-brand span{font-weight:400;color:rgba(255,255,255,.75);}"
  + "#alp-nav .alp-contact{display:flex;align-items:center;gap:10px;}"
  + "#alp-nav .alp-call{padding:9px 18px;border-radius:99px;border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.8);font-family:'Space Grotesk',Inter,sans-serif;font-weight:600;text-transform:uppercase;font-size:12px;letter-spacing:.14em;text-decoration:none;background:rgba(10,10,10,.45);transition:background .25s,color .25s,border-color .3s,transform .35s cubic-bezier(.2,.8,.2,1);white-space:nowrap;cursor:pointer;line-height:1;}"
  + "#alp-nav .alp-call:hover{color:#fff;border-color:rgba(255,255,255,.4);}"
  + ".alp-callwrap{position:relative;display:inline-flex;}"
  + ".alp-call-ic{display:none;}"
  + ".alp-cibtn{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:99px;border:1px solid rgba(255,255,255,.18);background:rgba(10,10,10,.45);color:rgba(255,255,255,.8);transition:background .25s,border-color .3s,transform .35s cubic-bezier(.2,.8,.2,1);}"
  + ".alp-cibtn:hover{border-color:rgba(255,255,255,.4);}"
  + ".alp-cibtn svg{width:19px;height:19px;}"
  + ".alp-citext svg{fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;}"
  + ".alp-citext,.alp-ciwa{display:none;}"
  + ".alp-ciwa .alp-waglyph{width:21px;height:21px;fill:#fff;}"
  + ".alp-callpop{position:absolute;top:calc(100% + 12px);right:0;min-width:212px;padding:16px 18px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(18,18,22,.97);box-shadow:0 18px 50px rgba(0,0,0,.5);z-index:40;}"
  + ".alp-callpop[hidden]{display:none;}"
  + ".alp-callpop-n{font-family:'Space Grotesk',Inter,sans-serif;font-size:22px;font-weight:600;color:#fff;letter-spacing:.02em;-webkit-user-select:all;user-select:all;}"
  + ".alp-callpop-r{display:flex;align-items:center;gap:14px;margin-top:12px;}"
  + ".alp-callpop-copy{padding:7px 14px;border-radius:99px;border:1px solid rgba(255,255,255,.2);background:#fff;color:#000;font-family:'Space Grotesk',Inter,sans-serif;font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:transform .2s;}"
  + ".alp-callpop-copy:hover{transform:translateY(-1px);}"
  + ".alp-callpop-dial{padding:7px 14px;border-radius:99px;border:1px solid rgba(255,255,255,.3);background:transparent;color:rgba(255,255,255,.82);font-family:'Space Grotesk',Inter,sans-serif;font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;white-space:nowrap;cursor:pointer;transition:transform .2s,background .25s,color .25s,border-color .25s;}"
  + ".alp-callpop-dial:hover{background:#fff;color:#000;border-color:#fff;transform:translateY(-1px);}"
  + ".alp-callpop-wa{display:flex;align-items:center;gap:9px;margin-top:13px;padding-top:13px;border-top:1px solid rgba(255,255,255,.12);font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.8);text-decoration:none;transition:color .2s;}"
  + ".alp-callpop-wa:hover{color:#fff;}"
  + ".alp-callpop-wa svg{width:18px;height:18px;}"
  + ".alp-callpop-wa .alp-waglyph{fill:rgba(255,255,255,.85);transition:fill .2s;}"
  + ".alp-callpop-wa:hover .alp-waglyph{fill:#fff;}"
  /* dots */
  + "#alp-dots{position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:30;display:flex;flex-direction:column;gap:9px;transition:opacity .4s;}"
  + "#alp-dots button{position:relative;display:flex;align-items:center;justify-content:flex-end;background:none;border:none;cursor:pointer;padding:7px 6px;}"
  + "#alp-dots button i{display:block;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.2);transition:all .3s;}"
  + "#alp-dots button.alp-on i{width:8px;height:8px;background:rgba(255,255,255,.85);}"
  + "#alp-dots button:hover i{background:rgba(255,255,255,.7);transform:scale(1.3);}"
  + "#alp-dots button span{position:absolute;right:18px;padding:2px 8px;border-radius:5px;font-size:9px;color:rgba(255,255,255,.65);background:rgba(0,0,0,.7);opacity:0;transition:opacity .2s;white-space:nowrap;pointer-events:none;}"
  + "#alp-dots button:hover span{opacity:1;}"
  /* type */
  + ".alp-eyebrow{display:inline-flex;align-items:center;gap:7px;padding:4px 11px;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:rgba(5,5,5,.85);font-size:9px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:22px;}"
  + ".alp-eyebrow::before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.8);animation:alp-pdot 2.4s ease-in-out infinite;flex-shrink:0;}"
  + ".alp-h1{font-weight:800;line-height:1.08;letter-spacing:-.03em;font-size:clamp(1.5rem,3.2vw,2.4rem);}"
  + ".alp-h2{font-weight:800;line-height:1.05;letter-spacing:-.025em;font-size:clamp(1.9rem,4.5vw,3rem);}"
  + ".alp-giant{font-family:'Space Grotesk',Inter,sans-serif;font-weight:500;line-height:1.04;letter-spacing:.005em;text-transform:uppercase;font-size:clamp(2.6rem,6.2vw,5.6rem);}"
  + ".alp-heroh{font-family:'Space Grotesk',Inter,sans-serif;font-weight:500;line-height:1.04;letter-spacing:.005em;text-transform:uppercase;font-size:38px;}"
  + ".alp-herodim{color:rgba(255,255,255,.6);margin-top:26px;font-size:40px;}"
  + ".alp-hbrk{position:relative;display:inline-block;padding:14px 16px 12px;margin:18px 0 0 -16px;}"
  + ".alp-hbrk i{position:absolute;width:15px;height:15px;border-style:solid;border-color:rgba(255,255,255,.85);border-width:0;}"
  + ".alp-hbrk i.tl{top:0;left:0;border-top-width:2px;border-left-width:2px;}"
  + ".alp-hbrk i.tr{top:0;right:0;border-top-width:2px;border-right-width:2px;}"
  + ".alp-hbrk i.bl{bottom:0;left:0;border-bottom-width:2px;border-left-width:2px;}"
  + ".alp-hbrk i.br{bottom:5px;right:0;border-bottom-width:2px;border-right-width:2px;}"
  + ".alp-section.alp-hero-low{align-items:flex-end;}"
  + ".alp-section.alp-hero-low .alp-inner{box-sizing:border-box;width:clamp(480px,48%,620px);max-width:none;padding:0 0 14vh 56px;position:relative;left:100px;top:0;}"
  + ".alp-hwrap{transform:scale(1.13);transform-origin:left bottom;}"
  + ".alp-hwrap .alp-eyebrow{position:relative;top:22px;left:-16px;font-size:8px;}"
  + ".alp-section[data-sec='about'] .alp-heroh{font-size:clamp(2.2rem,4.6vw,4rem);}"
  + ".alp-section[data-sec='overhauls'] .alp-heroh .alp-ln{white-space:nowrap;}"
  + ".alp-section[data-sec='hours'] .alp-heroh .alp-ln:last-of-type{position:relative;left:3px;}"
  + ".alp-section[data-sec='about'] .alp-lead{color:#fff;}"
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
  /* per-section contextual CTAs: hidden everywhere except phones (shown in the
     mobile block), where the nav drops its Book button */
  + ".alp-mcta{display:none;}"
  /* floating service cards — Noomo frosted glass fleet.
     The heading/copy live on their own fixed layer BELOW the sections so the
     cards' backdrop-filter can sample them (Chromium can't blur siblings
     inside the same stacking context). */
  + "#alp-svc-layer{position:fixed;inset:0;z-index:8;pointer-events:none;opacity:0;visibility:hidden;will-change:transform;}"
  + "#alp-svc-head{position:absolute;left:6vw;top:calc(11vh + 50px);max-width:66vw;}"
  + ".alp-svc-sub{color:rgba(255,255,255,.46);}"
  + "#alp-svc-side{position:absolute;right:6vw;top:17vh;width:min(21vw,300px);font-size:12.5px;line-height:1.7;color:rgba(255,255,255,.55);text-align:left;}"
  + "#alp-svc-meta{position:absolute;left:6vw;bottom:7vh;}"
  /* Monument layout on 1140×1260 panes: centered title top, split rule,
     copy middle, caps footer at the base; thick double-glazed glass skin */
  + ".alp-fcard{position:absolute;left:0;top:0;width:clamp(270px,21vw,370px);aspect-ratio:1140/1260;container-type:inline-size;cursor:default;will-change:transform;pointer-events:auto;}"
  + ".alp-fcard .alp-fin{position:absolute;inset:0;padding:8cqw 8.4cqw 7cqw;border-radius:4px;color:#181520;overflow:hidden;display:flex;flex-direction:column;text-align:left;will-change:backdrop-filter,transform;"
  +   "background:linear-gradient(168deg,rgba(252,253,255,.16) 0%,rgba(237,239,246,.085) 42%,rgba(196,201,215,.14) 100%),rgba(237,239,246,.085);"
  +   "-webkit-backdrop-filter:blur(18px) saturate(1.15);backdrop-filter:blur(18px) saturate(1.15);"
  +   "border:1px solid rgba(255,255,255,.32);"
  +   "box-shadow:-12px 14px 0 -1px rgba(196,214,209,.5),-6px 7px 0 0 rgba(225,236,233,.55),-2px 3px 0 0 rgba(245,250,248,.5),0 44px 110px rgba(0,0,0,.5),0 10px 26px rgba(0,0,0,.28),inset 0 2px 0 rgba(255,255,255,.5),inset 2px 0 0 rgba(255,255,255,.28),inset 0 -2px 0 rgba(120,128,150,.28),inset -2px 0 0 rgba(150,156,175,.2);"
  +   "transition:transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s;}"
  /* specular sheen — a soft diagonal light streak across the glass */
  + ".alp-fcard .alp-fin::after{content:'';position:absolute;inset:-40% -60%;pointer-events:none;"
  +   "background:linear-gradient(115deg,transparent 38%,rgba(255,255,255,.10) 47%,rgba(255,255,255,.03) 52%,transparent 60%);}"
  /* card header: oversized index left, stacked brand mark right */
  + ".alp-fh2{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3.6cqw;}"
  + ".alp-fnum{font-family:'Space Grotesk',Inter,sans-serif;font-size:14.5cqw;font-weight:700;letter-spacing:-.03em;line-height:.95;color:#181520;}"
  + ".alp-fnum span{font-size:4.6cqw;font-weight:600;opacity:.5;margin-left:1.2cqw;letter-spacing:0;}"
  + ".alp-fbrand{padding-top:1.6cqw;text-align:right;font-size:3cqw;font-weight:700;letter-spacing:.26em;text-transform:uppercase;line-height:1.6;color:#181520;opacity:.45;}"
  + ".alp-fcard h3{margin:0;font-size:7cqw;font-weight:800;letter-spacing:-.015em;line-height:1.12;color:#181520;}"
  + ".alp-fdiv{display:block;height:1px;background:rgba(24,21,32,.28);margin:4.6cqw 0 0;}"
  + ".alp-fcard p{margin:5.4cqw 0 0;font-size:4.5cqw;line-height:1.62;font-weight:500;color:#181520;opacity:.72;letter-spacing:0;}"
  + ".alp-fcard.alp-flong p{font-size:4cqw;line-height:1.55;}"
  + ".alp-fcard .alp-ffoot{margin-top:auto;padding-top:4.5cqw;font-size:2.9cqw;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#181520;opacity:.68;text-align:center;}"
  + "@keyframes alp-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}"
  /* hours */
  + ".alp-hours{margin:30px auto 0;max-width:520px;width:100%;}"
  + ".alp-hrow{display:flex;justify-content:space-between;gap:24px;padding:15px 4px;font-size:16px;position:relative;transition:padding-left .3s;text-shadow:0 1px 12px rgba(0,0,0,.7);}"
  + ".alp-hrow:hover{padding-left:10px;}"
  + ".alp-center .alp-hours .alp-hr{margin:0;max-width:none;}"
  + ".alp-hrow b{color:rgba(255,255,255,.95);font-weight:600;}"
  + ".alp-hrow span{color:rgba(255,255,255,.72);}"
  + ".alp-hs{display:none;}" /* short hour labels: phones only (see mobile block) */
  + ".alp-addr{display:inline-flex;align-items:center;color:inherit;text-decoration:none;cursor:pointer;transition:color .3s ease;}"
  + ".alp-addr svg{transition:transform .4s cubic-bezier(.2,.8,.2,1);}"
  + ".alp-addr .alp-addr-t{background:linear-gradient(currentColor,currentColor) no-repeat 0 100%/0 1px;padding-bottom:2px;transition:background-size .38s cubic-bezier(.2,.8,.2,1);}"
  + ".alp-addr:hover{color:rgba(255,255,255,.95);}"
  + ".alp-addr:hover svg{transform:translateY(-3px) scale(1.12);}"
  + ".alp-addr:hover .alp-addr-t{background-size:100% 1px;}"
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
  + "#alp-flowfade{height:0;}"
  /* transparent so the film shows behind the video backdrop's soft top edge —
     the film dissolves straight into the video instead of into a black band */
  + "#alp-flowbody{background:transparent;}"
  /* booking content sits above the sticky video backdrop */
  + ".alp-fsec{max-width:1040px;margin:0 auto;padding:46px 24px;position:relative;z-index:1;}"
  + ".alp-fhead{text-align:center;margin-bottom:40px;}"
  + ".alp-fhead .alp-lead{margin-left:auto;margin-right:auto;}"
  /* booking shell: dark frame + skeleton until the widget iframe loads, so
     the third-party calendar never flashes raw white into the film world */
  /* no dark padding frame: the iframe fills the card edge-to-edge (overflow
     clips the rounded corners) and the card itself is transparent, so there's
     no dark border. opacity makes the widget see-through over the video.
     Smaller: capped width + shorter min-height. */
  + "#alp-calcard{position:relative;max-width:760px;margin:0 auto;background:transparent;border:none;border-radius:14px;overflow:hidden;box-shadow:0 22px 64px rgba(0,0,0,.45);min-height:560px;opacity:.84;}"
  + "#alp-calcard iframe{width:100%;min-height:560px;border:none;display:block;background:#fff;opacity:0;transition:opacity .6s ease;}"
  + "#alp-calcard.alp-ld iframe{opacity:1;}"
  + "#alp-calskel{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:rgba(255,255,255,.45);font-size:11px;letter-spacing:.2em;text-transform:uppercase;}"
  + "#alp-calskel i{width:26px;height:26px;border:2px solid rgba(255,255,255,.15);border-top-color:rgba(255,255,255,.7);border-radius:50%;animation:alp-rot 1s linear infinite;}"
  + "#alp-calcard.alp-ld #alp-calskel{display:none;}"
  /* transparent layer over the calendar iframe so the mouse wheel scrolls the
     PAGE instead of being swallowed by the cross-origin iframe; a click drops it
     for a moment so the calendar still gets the interaction (desktop only) */
  + "#alp-calscroll{position:absolute;inset:0;z-index:3;pointer-events:none;}"
  /* testimonials: Oryzo-style square-card marquee over the workshop video */
  + "#alp-booking{position:relative;max-width:none;padding:0;overflow:hidden;}"
  /* video backdrop: a full-viewport FIXED layer that crossfades in over the
     film as you enter booking (the whole scene dissolves film → video, so there
     is no rectangle edge / seam anywhere), then content scrolls over it. Opacity
     is driven by flow/bridge state in JS; the transition smooths the crossfade. */
  + "#alp-bookbg{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0;transition:opacity .18s linear;background:radial-gradient(ellipse 90% 70% at 50% 30%,#16161a 0%,#0a0a0c 55%,#050505 100%);}"
  + "#alp-bgvid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .9s ease;}"
  + "#alp-bgvid.alp-on{opacity:1;}"
  + "#alp-bookshade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(5,5,5,.9) 0%,rgba(5,5,5,.82) 26%,rgba(5,5,5,.84) 72%,rgba(5,5,5,.93) 100%);}"
  + "#alp-reviews{position:relative;z-index:1;padding:24px 0 0;}"
  + "#alp-rstats{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 48px;list-style:none;margin:0 auto 28px;padding:0 24px;text-align:center;}"
  + "#alp-rstats b{display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Space Grotesk',Inter,sans-serif;font-size:clamp(1.9rem,3.6vw,2.7rem);font-weight:700;color:#fff;font-variant-numeric:tabular-nums;text-shadow:0 1px 16px rgba(0,0,0,.6);}"
  + "#alp-rstats svg{width:22px;height:22px;color:#ffb84d;}"
  + "#alp-rstats span{display:block;margin-top:6px;font-size:11.5px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.7);text-shadow:0 1px 12px rgba(0,0,0,.6);}"
  + "#alp-rwrap{overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:none;"
  +   "mask:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);-webkit-mask:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);}"
  + "#alp-rwrap::-webkit-scrollbar{display:none;}"
  + "#alp-rtrack{display:flex;gap:16px;padding:6px 24px;margin:0;list-style:none;}"
  + ".alp-rcard{flex:0 0 auto;width:clamp(230px,24vw,290px);aspect-ratio:1/1;display:flex;flex-direction:column;box-sizing:border-box;padding:22px;border-radius:16px;"
  +   "border:1px solid rgba(255,255,255,.1);background:linear-gradient(165deg,rgba(28,28,32,.92),rgba(16,16,18,.88));box-shadow:0 18px 50px rgba(0,0,0,.35);scroll-snap-align:center;"
  +   "transition:transform .38s cubic-bezier(.2,.8,.2,1),box-shadow .38s,border-color .3s;}"
  /* hover/focus: the card under the pointer pulls toward the viewer */
  + "#alp-reviews.alp-mq .alp-rcard:hover,.alp-rcard:focus-visible{transform:scale(1.07) translateY(-7px);z-index:2;"
  +   "border-color:rgba(255,255,255,.26);box-shadow:0 30px 75px rgba(0,0,0,.6);}"
  + ".alp-rstars{display:flex;gap:3px;color:#ffb84d;}"
  + ".alp-rstars svg{width:14px;height:14px;}"
  + ".alp-rquote{margin:14px 0 0;font-size:13.5px;line-height:1.55;color:rgba(255,255,255,.85);}"
  + ".alp-rwho{margin-top:auto;display:flex;align-items:center;gap:10px;}"
  + ".alp-ravatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:rgba(255,255,255,.85);"
  +   "background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);overflow:hidden;flex-shrink:0;}"
  + ".alp-ravatar img{width:100%;height:100%;object-fit:cover;}"
  + ".alp-rname{font-size:12px;font-weight:600;color:#fff;}"
  + ".alp-rname i{display:block;font-style:normal;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.4);margin-top:2px;}"
  + ".alp-rfoot{text-align:center;margin-top:26px;}"
  + ".alp-rgoog{display:inline-block;color:rgba(255,255,255,.7);font-size:12px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;padding-bottom:3px;border-bottom:1px solid rgba(255,255,255,.25);transition:color .25s,border-color .25s;}"
  + ".alp-rgoog:hover{color:#fff;border-color:rgba(255,255,255,.7);}"
  + ".alp-bcal{position:relative;z-index:1;max-width:1040px;margin:0 auto;padding:70px 24px;}"
  /* marquee mode (fine pointer): clipped track, transform-driven, grab to drag.
     Reduced motion gets the default native horizontal scroll, no marquee. */
  + "#alp-reviews.alp-mq #alp-rwrap{overflow:hidden;cursor:grab;}"
  + "#alp-reviews.alp-mq #alp-rwrap.alp-grabbing{cursor:grabbing;}"
  + "#alp-reviews.alp-mq #alp-rwrap.alp-grabbing *{user-select:none;-webkit-user-select:none;}"
  + "#alp-reviews.alp-mq #alp-rtrack{width:max-content;will-change:transform;padding:24px 24px 16px;}" /* headroom for the hover lift inside the clipped wrap */
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
  /* contact — two-column: stacked icon detail rows + live hours panel */
  /* contact: bracketed "diagnostic plate" tiles — phone + email side-by-side,
     workshop bar beneath, all 540px and centered (V5 redesign) */
  + ".alp-cwrap{max-width:540px;margin:0 auto;}"
  + ".alp-crow{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}"
  + ".alp-cplate{position:relative;display:block;box-sizing:border-box;padding:13px 22px;text-decoration:none;background:rgba(255,255,255,.015);transition:background .3s cubic-bezier(.2,.8,.2,1);}"
  + ".alp-cplate:hover{background:rgba(255,255,255,.045);}"
  + ".alp-cwide{display:block;width:100%;}"
  + ".alp-ctop{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;}"
  + ".alp-clab{display:inline-flex;align-items:center;gap:9px;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.45);}"
  + ".alp-clab svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}"
  + ".alp-cidx{font-family:'IBM Plex Mono',monospace;font-size:11px;color:rgba(255,255,255,.3);}"
  + ".alp-cval{font-family:'Space Grotesk',Inter,sans-serif;font-size:18px;font-weight:500;text-transform:uppercase;color:#fff;letter-spacing:.01em;line-height:1.2;}"
  + ".alp-cval-wide{font-size:19px;white-space:nowrap;letter-spacing:.015em;}"
  + ".alp-ccap{margin-top:7px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.04em;color:rgba(255,255,255,.32);}"
  + ".alp-brk>i{position:absolute;width:13px;height:13px;border-style:solid;border-color:rgba(255,255,255,.8);border-width:0;transition:border-color .3s,transform .4s cubic-bezier(.2,.8,.2,1);}"
  + ".alp-brk>i.tl{top:0;left:0;border-top-width:2px;border-left-width:2px;}"
  + ".alp-brk>i.tr{top:0;right:0;border-top-width:2px;border-right-width:2px;}"
  + ".alp-brk>i.bl{bottom:0;left:0;border-bottom-width:2px;border-left-width:2px;}"
  + ".alp-brk>i.br{bottom:0;right:0;border-bottom-width:2px;border-right-width:2px;}"
  + ".alp-brk:hover>i{border-color:#fff;}"
  /* hover: the corner reticle expands outward (locks on), the value glows, the
     index lights up, and a thin line sweeps across the plate */
  + ".alp-cplate:hover>i.tl{transform:translate(-3px,-3px);}"
  + ".alp-cplate:hover>i.tr{transform:translate(3px,-3px);}"
  + ".alp-cplate:hover>i.bl{transform:translate(-3px,3px);}"
  + ".alp-cplate:hover>i.br{transform:translate(3px,3px);}"
  + ".alp-cval{transition:text-shadow .35s;}"
  + ".alp-cplate:hover .alp-cval{text-shadow:0 0 22px rgba(180,205,255,.5);}"
  + ".alp-cidx{transition:color .3s;}"
  + ".alp-cplate:hover .alp-cidx{color:rgba(150,190,255,.95);}"
  + ".alp-cplate{overflow:hidden;}"
  + ".alp-cplate::after{content:'';position:absolute;top:0;left:-60%;width:45%;height:100%;background:linear-gradient(105deg,transparent,rgba(190,212,255,.14),transparent);transform:skewX(-18deg);opacity:0;pointer-events:none;}"
  + ".alp-cplate:hover::after{animation:alp-cscan .7s ease;}"
  + "@keyframes alp-cscan{0%{left:-60%;opacity:1;}100%{left:130%;opacity:1;}}"
  + ".alp-footer{position:relative;z-index:1;padding:30px 24px 40px;text-align:center;color:rgba(255,255,255,.25);font-size:12px;border-top:1px solid rgba(255,255,255,.06);margin-top:14px;}"
  + ".alp-fnav,.alp-fsoc{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 26px;margin-bottom:18px;}"
  + ".alp-fnav a{color:rgba(255,255,255,.6);text-decoration:none;font-size:12px;letter-spacing:.1em;text-transform:uppercase;transition:color .25s;}"
  + ".alp-fsoc a{color:rgba(255,255,255,.4);text-decoration:none;font-size:12px;transition:color .25s;}"
  + ".alp-fnav a:hover,.alp-fsoc a:hover{color:#fff;}"
  + ".alp-fcopy{margin-top:6px;}"
  /* hover underline-draw: brand + in-copy links */
  + "#alp-nav .alp-brand{position:relative;}"
  + "#alp-nav .alp-brand:after{content:'';position:absolute;left:0;bottom:-4px;height:1px;width:100%;background:rgba(255,255,255,.8);transform:scaleX(0);transform-origin:right;transition:transform .35s cubic-bezier(.2,.8,.2,1);}"
  + "#alp-nav .alp-brand:hover:after{transform:scaleX(1);transform-origin:left;}"
  + "#alp-flowbody .alp-lead a{text-decoration:none;background:linear-gradient(currentColor,currentColor) no-repeat 100% 100%/0 1px;transition:background-size .35s cubic-bezier(.2,.8,.2,1);}"
  + "#alp-flowbody .alp-lead a:hover{background-size:100% 1px;background-position:0 100%;}"
  /* nav CTAs: hidden on the hero and the booking page, staggered in from
     section 2 onward; a scrim keeps them readable over bright footage */
  + "#alp-nav:before{content:'';position:absolute;inset:-1px 0 -28px;background:linear-gradient(to bottom,rgba(0,0,0,.55),rgba(0,0,0,0));opacity:0;transition:opacity .5s;pointer-events:none;}"
  + "#alp-nav.alp-ctas:before{opacity:1;}"
  + "#alp-nav>*{position:relative;}"
  + ".alp-nbtn{padding:9px 18px;border-radius:99px;font-family:'Space Grotesk',Inter,sans-serif;font-weight:600;text-transform:uppercase;font-size:12px;letter-spacing:.14em;text-decoration:none;cursor:pointer;white-space:nowrap;"
  +   "opacity:0;transform:translateY(-10px);pointer-events:none;transition:opacity .35s,transform .35s cubic-bezier(.2,.8,.2,1),background .25s,color .25s;}"
  + ".alp-nbook{background:rgba(10,10,10,.45);border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.8);}"
  + ".alp-nbook:hover{color:#fff;border-color:rgba(255,255,255,.4);}"
  + ".alp-nest{background:rgba(10,10,10,.45);border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.8);}"
  + ".alp-nest:hover{color:#fff;border-color:rgba(255,255,255,.4);}"
  + "#alp-nav.alp-ctas .alp-nbtn{opacity:1;transform:none;pointer-events:auto;}"
  + "#alp-nav.alp-ctas .alp-nest{transition-delay:.06s,0s,0s,0s;}"
  /* estimate modal: the GHL quote form in a dark shell */
  + "#alp-est{position:fixed;inset:0;z-index:998000;display:flex;align-items:center;justify-content:center;padding:20px;}"
  + "#alp-est[hidden]{display:none;}"
  + "#alp-est-bg{position:absolute;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);}"
  + "#alp-est-card{position:relative;width:min(560px,94vw);max-height:88vh;overflow-y:auto;display:flex;flex-direction:column;background:linear-gradient(165deg,#17171a,#0d0d0f);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:26px 22px 14px;box-shadow:0 40px 110px rgba(0,0,0,.6);animation:alp-estin .45s cubic-bezier(.2,.8,.2,1);}"
  + "@keyframes alp-estin{0%{opacity:0;transform:translateY(22px) scale(.97)}100%{opacity:1;transform:none}}"
  + "#alp-est-x{position:absolute;top:12px;right:14px;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);color:rgba(255,255,255,.7);font-size:19px;line-height:1;cursor:pointer;transition:color .2s,border-color .2s;}"
  + "#alp-est-x:hover{color:#fff;border-color:rgba(255,255,255,.45);}"
  + ".alp-est-head{text-align:center;margin-bottom:18px;}"
  + ".alp-est-head h3{margin:8px 0 0;font-family:'Space Grotesk',Inter,sans-serif;font-size:clamp(1.2rem,2.4vw,1.55rem);color:#fff;}"
  + ".alp-est-sub{margin:8px auto 0;max-width:34em;font-size:13px;line-height:1.55;color:rgba(255,255,255,.5);}"
  + "#alp-est-form{display:flex;flex-direction:column;gap:14px;}"
  + ".alp-ef{display:flex;flex-direction:column;gap:6px;}"
  + ".alp-ef2{display:flex;gap:14px;}"
  + ".alp-ef2 .alp-ef{flex:1;min-width:0;}"
  + ".alp-ef label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.55);font-weight:600;}"
  + ".alp-ef input,.alp-ef textarea{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:12px 14px;color:#fff;font-family:inherit;font-size:14px;transition:border-color .2s,background .2s;}"
  + ".alp-ef input::placeholder,.alp-ef textarea::placeholder{color:rgba(255,255,255,.3);}"
  + ".alp-ef input:focus,.alp-ef textarea:focus{outline:none;border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.08);}"
  + ".alp-ef textarea{resize:vertical;min-height:92px;line-height:1.5;}"
  + ".alp-hp{position:absolute!important;left:-9999px;width:1px;height:1px;opacity:0;}"
  + ".alp-est-submit{margin-top:4px;background:#fff;color:#0a0a0a;border:none;border-radius:10px;padding:14px;font-family:inherit;font-weight:700;font-size:13px;letter-spacing:.04em;cursor:pointer;transition:transform .2s,opacity .2s;}"
  + ".alp-est-submit:hover{transform:translateY(-2px);}"
  + ".alp-est-submit:disabled{opacity:.55;cursor:default;transform:none;}"
  + ".alp-est-note{text-align:center;font-size:11px;color:rgba(255,255,255,.32);margin:2px 0 4px;}"
  + ".alp-est-err{margin:0;text-align:center;font-size:12.5px;line-height:1.5;color:#ffb1a3;}"
  + "#alp-sent{position:fixed;inset:0;z-index:998500;display:flex;align-items:center;justify-content:center;padding:20px;}"
  + "#alp-sent[hidden]{display:none;}"
  + "#alp-sent-bg{position:absolute;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);}"
  + "#alp-sent-card{position:relative;width:min(420px,94vw);text-align:center;background:linear-gradient(165deg,#17171a,#0d0d0f);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:42px 30px 34px;box-shadow:0 40px 110px rgba(0,0,0,.6);animation:alp-estin .45s cubic-bezier(.2,.8,.2,1);}"
  + "#alp-sent-x{position:absolute;top:12px;right:14px;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);color:rgba(255,255,255,.7);font-size:19px;line-height:1;cursor:pointer;transition:color .2s,border-color .2s;}"
  + "#alp-sent-x:hover{color:#fff;border-color:rgba(255,255,255,.45);}"
  + "#alp-sent-card .alp-est-done-ic{width:54px;height:54px;margin:0 auto 14px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(120,220,150,.14);border:1px solid rgba(120,220,150,.4);color:#8fe6a8;font-size:26px;}"
  + "#alp-sent-card h3{margin:0 0 6px;font-family:'Space Grotesk',Inter,sans-serif;font-size:1.4rem;color:#fff;}"
  + "#alp-sent-card p{margin:0 auto;max-width:30em;font-size:13.5px;line-height:1.6;color:rgba(255,255,255,.55);}"
  + "#alp-root.alp-modal-open{overflow:hidden!important;}"
  /* polish: brand selection, slim scrollbar, counter odometer, hint nudge */
  + "::selection{background:rgba(232,96,44,.85);color:#fff;}"
  + "#alp-root{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.22) #050505;}"
  + "#alp-root::-webkit-scrollbar{width:9px;}"
  + "#alp-root::-webkit-scrollbar-track{background:#050505;}"
  + "#alp-root::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:9px;}"
  + "#alp-root::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.32);}"
  + "#alp-cnum .alp-cw{display:inline-block;height:1.25em;line-height:1.25em;overflow:hidden;vertical-align:bottom;}"
  + "#alp-cnum .alp-cw span{display:block;transition:transform .65s cubic-bezier(.22,.85,.3,1);}"
  + "#alp-cnum .alp-cw b{display:block;height:1.25em;font-weight:inherit;}"
  + "@keyframes alp-nudge{0%,100%{transform:translateX(-50%) translateY(0)}30%{transform:translateX(-50%) translateY(5px)}60%{transform:translateX(-50%) translateY(0)}80%{transform:translateX(-50%) translateY(3px)}}"
  + "#alp-hint.alp-nudge{animation:alp-nudge 1.1s ease;color:rgba(255,255,255,.85);}"
  + "#alp-lwit{position:absolute;bottom:54px;left:0;right:0;text-align:center;font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.35);transition:opacity .4s;}"
  + "#alp-nav .alp-navr{display:flex;align-items:center;gap:12px;}"
  /* a11y: skip link surfaces on focus; consistent focus rings everywhere */
  + "#alp-skip{position:fixed;top:14px;left:14px;z-index:1000000;padding:10px 18px;border-radius:8px;background:#fff;color:#000;font-size:12px;font-weight:600;text-decoration:none;transform:translateY(-300%);transition:transform .2s;}"
  + "#alp-skip:focus{transform:none;}"
  + ".alp-btn:focus-visible,.alp-call:focus-visible,#alp-dots button:focus-visible,.alp-qa button:focus-visible,.alp-rcard:focus-visible,"
  + ".alp-rgoog:focus-visible,.alp-brand:focus-visible,.alp-cbox a:focus-visible,.alp-fchip:focus-visible"
  + "{outline:2px solid rgba(255,255,255,.85);outline-offset:3px;}"
  /* layout */
  + ".alp-left{padding-left:7vw;padding-right:5vw;max-width:820px;}"
  + ".alp-center{margin:0 auto;text-align:center;padding:0 6vw;max-width:820px;}"
  + ".alp-center .alp-lead{margin-left:auto;margin-right:auto;}"
  + ".alp-center .alp-hr{margin-left:auto;margin-right:auto;max-width:420px;}"
  /* mobile */
  + "@media (max-width:760px){"
  +   ".alp-heroh{font-size:26px;}"
  +   ".alp-herodim{font-size:27px;}"
  +   ".alp-hbrk .alp-heroh{font-size:32px;}" /* bigger hero headline in the brackets on phones */
  +   ".alp-section.alp-hero-low .alp-inner{width:100%;padding:0 22px 12vh 34px;left:0;top:0;}"
  +   ".alp-hwrap{transform:none;}"
  +   "#alp-nav{padding:14px 16px;}"
  +   "#alp-nav .alp-brand{font-size:13px;}"
  +   ".alp-nest,.alp-nbook{display:none;}" /* mobile nav: Book/Estimate live as buttons on their sections; right = contact icons */
  +   ".alp-nbtn{padding:8px 13px;font-size:10.5px;letter-spacing:.1em;}"
  +   "#alp-nav .alp-navr{gap:8px;}"
  +   ".alp-contact{gap:8px;}"
  +   ".alp-call-txt{display:none;}"
  +   "#alp-nav .alp-call{width:42px;height:42px;padding:0;display:inline-flex;align-items:center;justify-content:center;}"
  +   ".alp-call-ic{display:inline-flex;align-items:center;justify-content:center;}"
  +   ".alp-call-ic svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;}"
  +   ".alp-citext,.alp-ciwa{display:inline-flex;}"
  +   ".alp-cibtn{width:42px;height:42px;}"
  +   "@media (max-width:360px){.alp-brand span{display:none;}#alp-nav .alp-call,.alp-cibtn{width:38px;height:38px;}.alp-contact{gap:6px;}}"
  +   "#alp-dots{display:none;}"
  +   "#alp-count{left:16px;}"
  +   "#alp-mute{display:none;}" /* no sound on phones — hide the toggle entirely */
  +   ".alp-left,.alp-center{padding-left:22px;padding-right:22px;text-align:left;max-width:100%;}"
  +   ".alp-center .alp-lead{margin-left:0;}"
  +   ".alp-section[data-sec='reviews'] .alp-center{text-align:center;}" /* reviews stays centred on phones */
  +   ".alp-section[data-sec='reviews'] .alp-center .alp-lead{margin-left:auto;margin-right:auto;}"
  +   ".alp-center .alp-hr{margin-left:0;}"
  +   ".alp-hours{margin-left:0;}"
  /* workshop hours: abbreviated labels, each row forced onto a single line,
     padding trimmed so the day + time sit near the box edges */
  +   ".alp-hf{display:none;}"
  +   ".alp-hs{display:inline;}"
  +   ".alp-hrow{gap:12px;padding-left:2px;padding-right:2px;font-size:15px;}"
  +   ".alp-hrow b,.alp-hrow>span{white-space:nowrap;}"
  +   "#alp-svc-head{left:22px;top:12vh;max-width:88vw;}"
  +   "#alp-svc-side{display:none;}"
  +   "#alp-svc-meta{left:22px;bottom:4vh;right:22px;}"
  +   ".alp-fcard{width:74vw;filter:none!important;}"
  +   ".alp-crow{grid-template-columns:1fr;}"
  +   ".alp-cval-wide{font-size:15px;white-space:normal;}"
  +   ".alp-fsec{padding:32px 16px;}"
  +   "#alp-booking{padding:0;}"
  +   "#alp-reviews{padding:12px 0 0;}"
  +   "#alp-rstats{gap:16px 26px;margin-bottom:20px;}"
  +   ".alp-rcard{width:min(72vw,260px);}"
  +   ".alp-rfoot{margin-top:21px;}" /* nudge "Read all reviews on Google" up 5px on phones */
  +   ".alp-bcal{padding:48px 16px;}"
  +   ".alp-box{padding:22px 18px;}"
  +   ".alp-box.alp-glass{padding:24px 16px;}" /* hours box: tighter sides so rows reach nearer the edges */
  +   ".alp-box .alp-btab{left:12px;}"
  /* contextual CTAs surface on phones; pre-purchase + overhauls become
     top-to-bottom columns — copy rides up under the nav, the button pins to
     the base of the screen (space-between) clear of the HUD. */
  +   ".alp-mcta{display:flex;margin-top:24px;}"
  +   ".alp-section[data-sec='inspections'],.alp-section[data-sec='overhauls']{align-items:stretch;}"
  +   ".alp-section[data-sec='inspections'] .alp-inner,.alp-section[data-sec='overhauls'] .alp-inner{display:flex;flex-direction:column;justify-content:space-between;padding-top:11vh;padding-bottom:13vh;}"
  + "}"
  /* inspections + overhauls bake desktop px sizes and pixel translates inline
     (51/56px, translate 85/155px, nowrap lines) that overflow the right edge
     on anything narrower than a true desktop — phones AND tablets/iPads. Flow
     them responsively up to 1024px: the heading scales with the viewport, the
     pixel translates drop out, and the lines wrap instead of running off.
     Desktop (>=1025px) keeps its dialed-in composition untouched. */
  + "@media (max-width:1024px){"
  +   ".alp-section[data-sec='inspections'] .alp-heroh{font-size:clamp(1.9rem,5.4vw,51px)!important;}"
  +   ".alp-section[data-sec='overhauls'] .alp-heroh{font-size:clamp(1.9rem,5.6vw,56px)!important;}"
  +   ".alp-section[data-sec='inspections'] .alp-secwrap,"
  +   ".alp-section[data-sec='overhauls'] .alp-secwrap{transform:none!important;}"
  +   ".alp-section[data-sec='overhauls'] .alp-heroh .alp-ln{white-space:normal;}"
  +   ".alp-section[data-sec='overhauls'] .alp-inner{max-width:100%!important;}"
  + "}"
  /* tablet band: the cover-crop pulls the craned engine in from the right, so
     hold the overhauls copy to a narrow left column clear of it (phones use the
     stacked column layout above; desktop keeps its dialed-in composition) */
  + "@media (min-width:761px) and (max-width:1024px){"
  +   ".alp-section[data-sec='overhauls'] .alp-lead{max-width:23em;}"
  +   ".alp-section[data-sec='overhauls'] .alp-hr{max-width:23em;}"
  + "}";

  // ── Content ────────────────────────────────────────────────────────────────
  var check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  var SERVICES = [
    ["Service & Routine Maintenance", "Fresh oil, new filters and a careful once over of everything that wears. The quiet routine that keeps your car reliable between visits.", "Regular care · No surprises"],
    ["Brake Services", "Pads, rotors and fluid inspected, machined or replaced. Feel the pedal firm up and trust every stop from the school run to the Crown Range.", "Stop as confidently as you go"],
    ["Engine Diagnostics & Repair", "Check light on? We read what your engine is trying to say, trace the fault to its source and fix it before it grows into a bill.", "Find it early · Fix it once"],
    ["Transmission Services", "Smooth shifts are no accident. We service, repair and rebuild manual and automatic gearboxes so every shift lands clean for years.", "Deep work · Done in house"],
    ["Suspension & Steering", "Shocks, struts, bushes and springs tuned for our roads. Your car hugs the bends on the Crown Range and floats over the gravel.", "Comfort · Control"],
    ["Exhaust System Repairs", "From a quiet hum to a clean burn. We repair and replace mufflers, converters and pipes, and we also do full custom exhausts.", "Quiet · Clean · Custom"],
    ["Auto Electrical", "Flat battery, ghost faults, dead sensors. We chase the gremlins through every wire and put things right the first time.", "Starters · Alternators · Wiring"],
    ["WOF Repairs", "Failed your WOF? Bring us the sheet. We fix every fail, big or small, and get you back on the road fully legal.", "We fix the fails"],
    ["Performance Tuning & Emissions Solutions", "Aftermarket ECU tuning, standard ECU remapping, emissions and DTC solutions. We wake up what the factory left asleep. Mainly for off-road use depending on what’s required. Give us a call to chat about it.", "ECU remaps · Off-road builds"]
  ];
  /* fleet: evenly spaced cards riding one arc track like Noomo's — enter
     bottom-right, crest mid-screen, descend out left. Per-card: only jitter,
     tilt, depth and bob vary: [yJitter vh, rotZ, rotY, depth, bobDur] */
  /* [yJitter vh, rotZ, rotY, depth, bobDur, rotX] — irregular tilts, no pattern */
  var FLEET = [
    [1, -2.6, 9, 0.9, 7.2, 1.2], [-3, 1.2, -5, 0.62, 8.4, 2.1], [2, 2.8, 12, 0.5, 9.1, 0.8], [-1, -1.1, 7, 0.85, 8.8, 1.8],
    [3, 1.9, -11, 0.55, 7.6, 2.4], [-2, -3.2, 6, 0.95, 8.1, 1.0], [0, 0.8, -8, 0.5, 9.4, 1.6], [-1, -1.7, 10, 0.72, 8.6, 2.0],
    [2, 1.4, -7, 0.68, 8.9, 1.4]
  ];
  /* fleet spacing/arc/exit are derived from the live card width in computeFleet()
     so they're correct on phones and desktop; only the wheel span lives here as
     a fallback until the first computeFleet() runs. */
  var FLEET_WHEEL_SPAN = 3150; // wheel px to cross the whole fleet (recomputed per platform)
  var svcCards = SERVICES.map(function (s, i) {
    var c = FLEET[i];
    var n = (i < 9 ? "0" : "") + (i + 1), total = (SERVICES.length < 10 ? "0" : "") + SERVICES.length;
    return '<div class="alp-fcard' + (s[1].length > 170 ? " alp-flong" : "") + '" data-i="' + i + '" data-depth="' + c[3] + '" style="z-index:6;">'
      + '<div class="alp-fin" style="transform:perspective(900px) rotateY(' + c[2] + 'deg) rotateX(' + c[5] + 'deg) rotateZ(' + c[1] + 'deg);">'
      + '<div class="alp-fh2"><div class="alp-fnum">' + n + "<span>/ " + total + '</span></div>'
      + '<div class="alp-fbrand">Addept<br>Automotive</div></div>'
      + "<h3>" + s[0] + "</h3>"
      + '<i class="alp-fdiv"></i>'
      + "<p>" + s[1] + "</p>"
      + '<div class="alp-ffoot">European &amp; Japanese Specialists</div>'
      + "</div></div>";
  }).join("");

  var FAQS = [
    ["How often should I get my car serviced?", "Every 12 months or 10,000 km, whichever comes first. Cars are patient, but they keep score."],
    ["What is included in a service?", "Fresh engine oil and a new oil filter, then a proper once-over: fluids, filters, suspension, bushes, brakes and tyres. If something’s on its way out, you’ll hear it from us first."],
    ["How do I know if my brakes need replacing?", "Squealing, grinding, longer stops, or a pedal that just feels different. If you’re asking, it’s worth a look. Brakes never fix themselves."],
    ["What should I do if my check engine light comes on?", "That’s your car asking for help. We speak fluent check-engine light, so book a diagnostic before it turns into a bill with a comma."],
    ["Can you do pre-purchase inspections?", "Yes, happily. We’ll list what it needs now, what it’ll need soon, and what the seller forgot to mention."]
  ];
  var faqHtml = FAQS.map(function (qa, i) {
    return '<div class="alp-qa"><button type="button" aria-expanded="false"><span class="alp-qn">0' + (i + 1) + "</span>" + qa[0]
      + '<span class="alp-qarrow" aria-hidden="true">+</span></button><div class="alp-a"><p>' + qa[1] + "</p></div></div>";
  }).join("");

  /* real Google reviews, trimmed to card length; optional third entry = photo path */
  var IC_STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
  var REVIEWS = [
    ["J. T.", "Hands down the best mechanic experience I’ve had in New Zealand, and I’ve had a fair few across the country."],
    ["S. M.", "Above and beyond service! Our car started having issues just as we arrived in Queenstown. Sorted, no fuss."],
    ["E. O.", "Extremely professional from start to finish. Booked online and had confirmation in minutes."],
    ["J. D.", "Been to a few mechanics in Queenstown over the years, and Ryan and his team are by far my favourite."],
    ["F. C.", "Our brake pads wore out on the way through from Milford Sound. They squeezed us in and got us back on the road."],
    ["P. W.", "Fantastic service from these guys. Hayden and Ryan are first class mechanics. Highly recommended."],
    ["L. M.", "Came out to our home, diagnosed the Subaru on the spot and quickly sorted what was wrong."],
    ["M. K.", "Called on a Sunday afternoon and he stayed late to finish the job. Amazing."],
    ["N. K.", "Fast service, honest and reliable. Nothing is cheap in Queenstown, but the pricing here is actually reasonable."],
    ["H. T.", "Heaps of work done on my vehicle over the years. Excellent at his job and very pleasant to deal with."]
  ];
  function initialsOf(name) {
    return name.split(/[\s.]+/).filter(Boolean).map(function (p) { return p[0]; }).join("").slice(0, 2).toUpperCase();
  }
  function rcard(r, clone) {
    var stars = IC_STAR + IC_STAR + IC_STAR + IC_STAR + IC_STAR;
    return '<li class="alp-rcard"' + (clone ? ' aria-hidden="true"'
        : ' tabindex="0" aria-label="5 out of 5 stars. ' + r[1] + ' By ' + r[0] + '"') + ">"
      + '<div class="alp-rstars" aria-hidden="true">' + stars + "</div>"
      + '<p class="alp-rquote">' + r[1] + "</p>"
      + '<div class="alp-rwho">'
      + '<span class="alp-ravatar">' + (r[2] ? '<img src="' + r[2] + '" alt="">' : initialsOf(r[0])) + "</span>"
      + '<span class="alp-rname">' + r[0] + "<i>Google review</i></span>"
      + "</div></li>";
  }
  var reviewsHtml = REVIEWS.map(function (r) { return rcard(r, false); }).join("");

  /* deco builders: floating frosted chips, drifting "+" ornaments, draw-in
     boxes. Floats nest three wrappers so the layers never fight over one
     transform: outer = scrub choreography, middle = CSS bob, inner = mouse
     parallax (damped by a CSS transition). */
  var IC_PHONE = '<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>';
  var IC_MAIL = '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>';
  var IC_PIN = '<svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  var IC_ARR = '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>';
  var IC_TEXT = '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 20l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var IC_WA = '<svg viewBox="0 0 24 24" class="alp-waglyph"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38c1.45.79 3.08 1.2 4.78 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13c-1.52 0-3.01-.41-4.31-1.18l-.31-.18-3.2.84.85-3.12-.2-.32a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.84-.2-.48-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01-.17 0-.43.06-.66.31-.23.25-.86.84-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z"/></svg>';
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
    return s + "<b>0</b>"; // trailing 0 so 9→100 rolls forward (carry) instead of spinning back
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
      + '<h2 class="alp-heroh alp-herodim alp-split">Wild concept,\nwe know.</h2>'
      + '<i class="alp-hr" data-o="l" style="max-width:360px;"></i>'
      + '<div class="alp-btnrow alp-rise"><a class="alp-btn alp-btn-light" href="#alp-booking">Make a booking</a>'
      + '<button class="alp-btn alp-btn-ghost alp-openest" type="button">Request estimate</button></div>'
      + '<div class="alp-ticks alp-rise"><span>' + check + "Euro &amp; Japanese specialists</span><span>" + check + "Tuning &amp; emissions solutions</span></div>"
      + "</div>"
      + "</div>" },
    { id: "about", stop: 17.7215, enter: [22, 0], exit: [-18, 0],
      deco: orn(14, 70, 2, 4) + orn(83, 22, 3, 9),
      html:
      '<div class="alp-inner alp-center">'
      + boxO("", "What We Do")
      + '<i class="alp-hr" data-o="r"></i>'
      + '<h2 class="alp-heroh alp-split">First-rate repairs.</h2>'
      + '<h2 class="alp-heroh alp-herodim alp-split">Top-tier\ncare.</h2>'
      + '<i class="alp-hr" data-o="l"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;">There isn’t much we don’t do.<br>From a simple service to advanced electrical diagnostics.<br>Got the fault three garages gave up on?<br>We collect those...</p>'
      + "</div>"
      + "</div>" },
    { id: "services", stop: 27.0042, enter: [0, -12], exit: [0, -12], svc: true, html:
      '<div class="alp-inner" style="position:absolute;inset:0;">'
      + '<div id="alp-svc-cards">' + svcCards + "</div>"
      + "</div>" },
    { id: "inspections", stop: 42.1941, enter: [-22, 0], exit: [16, 0],
      deco: orn(88, 52, 2, 3),
      html:
      '<div class="alp-inner alp-left">'
      + '<div class="alp-secwrap" style="transform:translateY(-80px);">'
      + '<h2 class="alp-heroh alp-split" style="font-size:51px;">Buying? Selling?\nKnow first.</h2>'
      + '<i class="alp-hr" data-o="l" style="max-width:420px;margin:12px 0;"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;">Everyone knows how cars get treated here... flogged for a season and handed to the next person. We’ll tell you what it needs now, what it’ll need soon, and what the seller was hoping you wouldn’t ask about. No surprises after the handshake.</p>'
      + "</div>"
      + '<div class="alp-btnrow alp-rise alp-mcta"><a class="alp-btn alp-btn-light" href="#alp-booking">Make a booking</a></div>'
      + "</div>" },
    { id: "overhauls", stop: 60.3376, enter: [0, 14], exit: [0, -12], top: true,
      deco: orn(8, 80, 3, 6),
      html:
      '<div class="alp-inner alp-left" style="max-width:600px;">'
      + '<div class="alp-secwrap" style="transform:translate(5px,125px);">'
      + '<h2 class="alp-heroh alp-split" style="font-size:56px;">Overhauls are\nwhat we do best.</h2>'
      + '<i class="alp-hr" data-o="l" style="max-width:420px;margin:12px 0;"></i>'
      + '<p class="alp-lead alp-rise" style="margin-top:0;font-size:clamp(.92rem,1.5vw,1.05rem);">Engines out. Gearbox open. Wiring loom faults traced and fixed. Heads skimmed. Timing chains on the jobs nobody volunteers for. The repairs that make other workshops remember they’re fully booked. Ours stay on the bench until they’re right.</p>'
      + "</div>"
      + '<div class="alp-btnrow alp-rise alp-mcta"><button class="alp-btn alp-btn-light alp-openest" type="button">Request an estimate</button></div>'
      + "</div>" },
    { id: "hours", stop: 79.3249, enter: [20, 0], exit: [-16, 0],
      deco: orn(85, 74, 2, 5),
      html:
      '<div class="alp-inner alp-center">'
      + '<h2 class="alp-heroh alp-split" style="font-size:clamp(2.1rem,4.8vw,4.4rem);">Drop in.\nWe’ll sort it.</h2>'
      + boxO("alp-glass alp-hoursbox", "Workshop Hours", "width:min(540px,100%);margin-top:26px;")
      + '<div class="alp-hours" style="margin-top:0;transform:translateY(-5px);">'
      + '<i class="alp-hr" data-o="l" style="margin:18px 0 0;"></i>'
      + '<div class="alp-hrow alp-rise"><b><span class="alp-hf">Monday to Thursday</span><span class="alp-hs">Mon to Thu</span></b><span><span class="alp-hf">7:00am to 5:00pm</span><span class="alp-hs">7AM to 5PM</span></span></div>'
      + '<i class="alp-hr" data-o="r" style="margin:0;"></i>'
      + '<div class="alp-hrow alp-rise"><b><span class="alp-hf">Friday</span><span class="alp-hs">Fri</span></b><span>By appointment only</span></div>'
      + '<i class="alp-hr" data-o="l" style="margin:0;"></i>'
      + '<div class="alp-hrow alp-rise"><b><span class="alp-hf">Saturday and Sunday</span><span class="alp-hs">Sat and Sun</span></b><span>Closed</span></div>'
      + '<i class="alp-hr" data-o="r" style="margin:0;"></i>'
      + "</div>"
      + "</div>"
      + '<p class="alp-lead alp-rise" style="font-size:13px;margin-top:22px;color:rgba(255,255,255,.62);text-shadow:0 1px 12px rgba(0,0,0,.7);"><a href="' + MAPS + '" target="_blank" rel="noopener" class="alp-addr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;margin-right:6px;flex-shrink:0;"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span class="alp-addr-t">35B Brookes Road, Frankton, Queenstown 9300</span></a></p>'
      + "</div>" },
    { id: "reviews", stop: 95.3586, enter: [0, 13], exit: [0, -10],
      deco: orn(82, 72, 3, 8) + orn(7, 16, 2, 2),
      html:
      '<div class="alp-inner alp-center" style="max-width:none;">'
      + '<div style="transform:translateY(25px);">' /* whole block down 25px */
      + '<h2 class="alp-heroh alp-split" style="font-size:clamp(1.9rem,4vw,3rem);">2,000+ customers.\n5,000+ vehicles fixed.</h2>'
      + '<p class="alp-lead alp-rise" style="margin:6px auto 0;">Queenstown keeps the receipts. Here’s what a few of them say. One more scroll and you’re in the diary.</p>'
      + '<div id="alp-reviews">'
      +   '<ul id="alp-rstats" role="list" class="alp-rise">'
      +     '<li><b><span class="alp-rnum" data-n="4.9" data-dec="1">4.9</span>' + IC_STAR + "</b><span>Google rating</span></li>"
      +     '<li><b><span class="alp-rnum" data-n="100" data-suf="+">100+</span></b><span>Google reviews</span></li>'
      +   "</ul>"
      +   '<div style="transform:translateY(-10px);">' /* cards net down 15px */
      +   '<div id="alp-rwrap" class="alp-rise"><ul id="alp-rtrack" role="list">' + reviewsHtml + "</ul></div>"
      +   '<div id="alp-rfoot-wrap">' /* JS centers this between the card bottom and the scroll indicator */
      +   '<div class="alp-rfoot alp-rise"><a class="alp-rgoog" href="' + REVIEWS_URL + '" target="_blank" rel="noopener">Read all reviews on Google</a></div>'
      +   "</div>"
      +   "</div>"
      + "</div>"
      + "</div>"
      + "</div>" }
  ];

  var GHOSTS = [
    ["SERVICING", 5, 13], ["DIAGNOSTICS", 18, 26], ["INSPECTIONS", 33, 40.5],
    ["OVERHAULS", 46.5, 56], ["QUEENSTOWN", 65, 77], ["WORD OF MOUTH", 84, 91.5]
  ];

  /* Annotations — per-frame machine-tracked */
  var ANNOS = [
    { label: "Thorough pre-purchase inspections", side: "top", in: 39.24, out: 43.2, padR: 41,
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
  fontLink.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap";
  document.head.appendChild(fontLink);

  var root = document.createElement("div");
  root.id = "alp-root";
  root.innerHTML =
      '<a id="alp-skip" href="#alp-booking">Skip to booking</a>'
    + '<canvas id="alp-canvas" aria-hidden="true"></canvas>'
    + '<div class="alp-vignette" aria-hidden="true"></div>'
    + '<div id="alp-dim" aria-hidden="true"></div>'
    + '<div id="alp-glow" aria-hidden="true"></div>'
    + GHOSTS.map(function (g) { return '<div class="alp-ghost" aria-hidden="true">' + g[0] + "</div>"; }).join("")
    + ANNOS.map(function (a) {
        return '<div class="alp-anno" aria-hidden="true"><div class="alp-abox"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div>'
          + '<div class="alp-aline ' + a.side + '"></div>'
          + '<div class="alp-alabel ' + a.side + '"><b></b>' + a.label + "</div></div>";
      }).join("")
    + '<div id="alp-svc-layer">'
    +   '<div id="alp-svc-head"><div class="alp-eyebrow alp-rise" style="margin-bottom:20px;">Services</div>'
    +   '<h2 class="alp-giant alp-split alp-svc-h" style="font-size:clamp(2.475rem,5.55vw,5.375rem);line-height:1.04;">Everything under\nthe hood\u2026\nand around it.</h2>'
    +   '<i class="alp-hr" data-o="l" style="margin:20px 0;"></i>'
    +   '<h2 class="alp-giant alp-split alp-svc-h alp-svc-sub" style="font-size:clamp(2.475rem,5.55vw,5.375rem);line-height:1.04;">No job too big,\nno detail too small.</h2></div>'
    +   '<div id="alp-svc-side" class="alp-rise">Every specialty in-house, from routine servicing to the jobs other shops send away. When someone says “you’ll need a specialist for that”, this is where they mean.</div>'
    +   orn(68, 12, 2, 3) + orn(44, 76, 3, 8)
    + "</div>"
    + SEC.map(function (s) {
        return '<div class="alp-section' + (s.top ? " alp-top" : "") + (s.id === "hero" ? " alp-hero-low" : "") + '" data-sec="' + s.id + '">' + s.html + (s.deco || "") + "</div>";
      }).join("")
    + '<div id="alp-nav" role="navigation" aria-label="Main">'
    +   '<a class="alp-brand" href="#top"><b>Addept</b> <span>Automotive</span></a>'
    +   '<div class="alp-navr">'
    +     '<a class="alp-nbtn alp-nbook" href="#alp-booking" tabindex="-1">Make a booking</a>'
    +     '<button class="alp-nbtn alp-nest alp-openest" type="button" tabindex="-1">Request estimate</button>'
    +     '<div class="alp-contact">'
    +       '<div class="alp-callwrap">'
    +         '<button class="alp-call alp-ccall" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Call Addept">'
    +           '<span class="alp-call-txt">Call now</span><span class="alp-call-ic" aria-hidden="true">' + IC_PHONE + '</span>'
    +         '</button>'
    +         '<div class="alp-callpop" role="dialog" aria-label="Contact" hidden>'
    +           '<div class="alp-callpop-n">' + PHONE_DISPLAY + '</div>'
    +           '<div class="alp-callpop-r"><button class="alp-callpop-copy" type="button">Copy</button>'
    +             '<a class="alp-callpop-dial" href="' + PHONE_TEL + '">Call from computer</a></div>'
    +           '<a class="alp-callpop-wa" href="' + WA_URL + '" target="_blank" rel="noopener">' + IC_WA + 'Message on WhatsApp</a>'
    +         '</div>'
    +       '</div>'
    +       '<a class="alp-cibtn alp-citext" href="' + SMS_TEL + '" aria-label="Text Addept">' + IC_TEXT + '</a>'
    +       '<a class="alp-cibtn alp-ciwa" href="' + WA_URL + '" target="_blank" rel="noopener" aria-label="Message Addept on WhatsApp">' + IC_WA + '</a>'
    +     '</div>'
    +   "</div>"
    + "</div>"
    + '<div id="alp-dots" role="navigation" aria-label="Sections">' + SEC.map(function (s, i) {
        var labels = { hero: "Home", about: "About", services: "Services", inspections: "Inspections", overhauls: "Overhauls", hours: "Hours", reviews: "Reviews" };
        return '<button type="button" data-idx="' + i + '" aria-label="' + labels[s.id] + '"><i></i></button>';
      }).join("") + "</div>"
    + '<div id="alp-count"><span id="alp-cnum">0<span class="alp-cw"><span>'
    +   SEC.map(function (s, i) { return "<b>" + (i + 1) + "</b>"; }).join("")
    + "</span></span></span><span class=\"alp-cline\"><i></i></span><span>0" + SEC.length + "</span></div>"
    + '<div id="alp-hint">' + chevron + "<span>Scroll</span></div>"
    + '<div id="alp-spacer"></div>'
    + '<div id="alp-flow"><div id="alp-flowfade"></div><div id="alp-flowbody"><div id="alp-bookbg" aria-hidden="true"><div id="alp-bookshade"></div></div>'
    +   '<div class="alp-fsec" id="alp-booking">'
    +     '<div class="alp-bcal"><div class="alp-fhead" style="margin-bottom:26px;">'
    +     '<h2 class="alp-heroh" style="font-size:clamp(2rem,4.2vw,3.2rem);">Make a booking</h2>'
    +     '<p class="alp-lead">Choose a date and time that suits you, and we’ll see you then. Prefer to talk it through? Call <a href="' + PHONE_TEL + '" style="color:#fff;">' + PHONE_DISPLAY + "</a>.</p></div>"
    +     '<div id="alp-calcard"><div id="alp-calskel" aria-hidden="true"><i></i><span>Loading bookings</span></div>'
    +     '<iframe data-src="' + CAL_URL + '" scrolling="no" id="jk0S1digTnc8PT4F1AmO_alp" title="Addept Automotive Bookings"></iframe><div id="alp-calscroll" aria-hidden="true"></div></div></div>'
    +   "</div>"
    +   '<div class="alp-fsec" id="alp-faqs">'
    +     '<div class="alp-fhead"><div class="alp-eyebrow">FAQs</div><h2 class="alp-heroh" style="font-size:clamp(2rem,4.2vw,3.2rem);">Common questions</h2></div>'
    +     '<div class="alp-faq">' + faqHtml + "</div>"
    +   "</div>"
    +   '<div class="alp-fsec" id="alp-contact">'
    +     '<div class="alp-fhead"><div class="alp-eyebrow">Contact</div><h2 class="alp-heroh" style="font-size:clamp(2rem,4.2vw,3.2rem);">Get in touch</h2>'
    +       '<p class="alp-lead">Booked up, broken down, or just not sure where to start — get hold of us and we’ll tell you what’s actually going on.</p></div>'
    +     '<div class="alp-cwrap">'
    +       '<div class="alp-crow">'
    +         '<a class="alp-cplate alp-brk" href="' + PHONE_TEL + '"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>'
    +           '<div class="alp-ctop"><span class="alp-clab">' + IC_PHONE + 'Phone</span><span class="alp-cidx">01</span></div>'
    +           '<div class="alp-cval">' + PHONE_DISPLAY + '</div><div class="alp-ccap">Mon–Thu · 7am–5pm</div></a>'
    +         '<a class="alp-cplate alp-brk" href="mailto:' + EMAIL + '"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>'
    +           '<div class="alp-ctop"><span class="alp-clab">' + IC_MAIL + 'Email</span><span class="alp-cidx">02</span></div>'
    +           '<div class="alp-cval" style="font-size:15px;">' + EMAIL + '</div><div class="alp-ccap">Replies within a day</div></a>'
    +       "</div>"
    +       '<a class="alp-cplate alp-cwide alp-brk" href="' + MAPS + '" target="_blank" rel="noopener"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>'
    +         '<div class="alp-ctop"><span class="alp-clab">' + IC_PIN + 'Workshop</span><span class="alp-cidx">03</span></div>'
    +         '<div class="alp-cval alp-cval-wide">35B Brookes Road, Frankton, Queenstown 9300</div><div class="alp-ccap">Open in Google Maps →</div></a>'
    +     "</div>"
    +   "</div>"
    +   '<div class="alp-footer">'
    +     '<div class="alp-fnav"><a href="#alp-booking">Bookings</a><a href="#alp-faqs">FAQs</a><a href="#alp-contact">Contact</a><a href="#top">Back to top</a></div>'
    +     '<div class="alp-fsoc"><a href="https://www.facebook.com/addeptauto" target="_blank" rel="noopener">Facebook</a>'
    +       '<a href="' + REVIEWS_URL + '" target="_blank" rel="noopener">Google reviews</a>'
    +       '<a href="' + MAPS + '" target="_blank" rel="noopener">Find the workshop</a></div>'
    +     '<div class="alp-fcopy">Copyright © Addept Automotive 2026. Full Rights Reserved.</div>'
    +   "</div>"
    + "</div></div>"
    + '<div id="alp-est" role="dialog" aria-modal="true" aria-label="Request an estimate" hidden>'
    +   '<div id="alp-est-bg"></div>'
    +   '<div id="alp-est-card">'
    +     '<button id="alp-est-x" type="button" aria-label="Close">&times;</button>'
    +     '<div class="alp-est-head"><div class="alp-eyebrow">Request an estimate</div><p class="alp-est-sub">Let us know what you need an estimate for and we’ll get back to you as soon as possible.</p></div>'
    +     '<form id="alp-est-form">'
    +       '<div class="alp-ef"><label for="alp-ef-name">Full name</label><input id="alp-ef-name" name="name" type="text" autocomplete="name" placeholder="Your name" required></div>'
    +       '<div class="alp-ef2">'
    +         '<div class="alp-ef"><label for="alp-ef-phone">Phone</label><input id="alp-ef-phone" name="phone" type="tel" autocomplete="tel" placeholder="Best contact number" required></div>'
    +         '<div class="alp-ef"><label for="alp-ef-email">Email</label><input id="alp-ef-email" name="email" type="email" autocomplete="email" placeholder="you@email.com" required></div>'
    +       "</div>"
    +       '<div class="alp-ef"><label for="alp-ef-rego">Rego (number plate)</label><input id="alp-ef-rego" name="rego" type="text" autocapitalize="characters" placeholder="e.g. ABC123" required></div>'
    +       '<div class="alp-ef"><label for="alp-ef-msg">What needs an estimate?</label><textarea id="alp-ef-msg" name="message" placeholder="e.g. Failed the WOF on front brakes — after a price to fix. Or: grinding noise when I brake…" required></textarea></div>'
    +       '<input type="checkbox" name="botcheck" class="alp-hp" tabindex="-1" autocomplete="off" aria-hidden="true">'
    +       '<p class="alp-est-err" id="alp-est-err" hidden></p>'
    +       '<button type="submit" class="alp-est-submit">Send my request</button>'
    +       '<p class="alp-est-note">No spam — this goes straight to the workshop.</p>'
    +     "</form>"
    +   "</div>"
    + "</div>"
    + '<div id="alp-sent" role="dialog" aria-modal="true" aria-label="Request sent" hidden>'
    +   '<div id="alp-sent-bg"></div>'
    +   '<div id="alp-sent-card">'
    +     '<button id="alp-sent-x" type="button" aria-label="Close">&times;</button>'
    +     '<div class="alp-est-done-ic">&#10003;</div>'
    +     '<h3>Request sent.</h3>'
    +     '<p>We’ve got it — we’ll be in touch shortly with your estimate.</p>'
    +   "</div>"
    + "</div>"
    + '<div id="alp-loader">'
    +   '<div id="alp-lembers"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>'
    +   '<div id="alp-lcore"><div id="alp-lbadge"></div><div id="alp-lsheen"></div></div>'
    +   '<div id="alp-ldot"></div>'
    +   '<div id="alp-lpct"><span class="alp-odm"><span class="alp-odbox"><span class="alp-odc"><span class="alp-odw"><b>0</b></span></span><span class="alp-odc"><span class="alp-odw"><b id="alp-odk">0</b></span></span><span class="alp-odc"><span class="alp-odw" id="alp-od3">' + ODIGITS + '</span></span><span class="alp-odc"><span class="alp-odw" id="alp-odt">' + ODIGITS + '</span></span><span class="alp-odc"><span class="alp-odw" id="alp-odo">' + ODIGITS + "</span></span></span></span></div>"
    +   '<div id="alp-lstat"><span class="alp-lstat-in">' + TAG_HTML + '<span class="alp-lstat-dots"><i>.</i><i>.</i><i>.</i></span></span></div>'
    +   '<div id="alp-lveil"></div>'
    + "</div>";
  document.body.appendChild(root);

  Array.prototype.forEach.call(root.querySelectorAll(".alp-split"), function (el) {
    var lines = el.textContent.split("\n");
    el.innerHTML = lines.map(function (line) {
      return '<span class="alp-ln">' + line.split(" ").map(function (w) {
        return '<span class="alp-wm"><span class="alp-w">' + w + "</span></span>";
      }).join(" ") + "</span>";
    }).join("<br>");
  });
  /* every section's heading words split further into letters so any section
     can run a letter-driven entrance style (TEMP: style picked via tuner) */
  Array.prototype.forEach.call(root.querySelectorAll(".alp-section .alp-w, #alp-svc-layer .alp-w"), function (w) {
    w.innerHTML = w.textContent.split("").map(function (c) {
      return '<span class="alp-ch">' + c + "</span>";
    }).join("");
  });

  /* the services divider tracks the width of the heading's LAST line
     ("and around it.") instead of the full block, so it reads as an underline of
     just that line. Re-measured on resize and once the display font has loaded. */
  function sizeSvcRule() {
    var head = document.getElementById("alp-svc-head");
    if (!head) return;
    var mainH = head.querySelector(".alp-svc-h:not(.alp-svc-sub)");
    var rule = head.querySelector(".alp-hr");
    if (!mainH || !rule) return;
    var lns = mainH.querySelectorAll(".alp-ln");
    var last = lns[lns.length - 1];
    if (last) rule.style.width = Math.round(last.getBoundingClientRect().width) + "px";
  }
  sizeSvcRule();
  window.addEventListener("resize", sizeSvcRule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeSvcRule);

  /* live workshop clock + open/closed status, real Queenstown time. The hands
     get their position from an SVG attribute rotation; CSS keyframes on the
     inner group keep them sweeping from there (compositor only, no JS ticks). */
  (function () {
    var st = document.getElementById("alp-open");
    var st2 = document.getElementById("alp-open2");
    /* (no early return — the Workshop Hours badge + clock below must still run
       even though the old contact status pills #alp-open/#alp-open2 are gone) */
    try {
      var parts = new Intl.DateTimeFormat("en-US", { timeZone: "Pacific/Auckland", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
      var wd = "", hr = 0, mi = 0;
      parts.forEach(function (p) {
        if (p.type === "weekday") wd = p.value;
        else if (p.type === "hour") hr = +p.value % 24;
        else if (p.type === "minute") mi = +p.value;
      });
      var open = ["Mon", "Tue", "Wed", "Thu"].indexOf(wd) !== -1 && hr >= 7 && hr < 17;
      var statusHtml = '<b class="alp-dot' + (open ? "" : " alp-off") + '"></b>' + (open ? "Open now" : "Currently closed");
      if (st) st.innerHTML = statusHtml;
      if (st2) st2.innerHTML = statusHtml;
      /* the "Workshop Hours" box tab doubles as a live open/closed badge:
         green blinking dot + "WE ARE OPEN", or red + "WE ARE CLOSED" */
      var hb = document.querySelector(".alp-hoursbox .alp-btab");
      if (hb) hb.innerHTML = '<b style="display:inline-block;width:5px;height:5px;border-radius:50%;background:'
        + (open ? "#6fe09a" : "#f0685e") + ";box-shadow:0 0 9px " + (open ? "rgba(111,224,154,.9)" : "rgba(240,104,94,.9)")
        + ';animation:alp-pdot 2.4s ease-in-out infinite;"></b>' + (open ? "We are open" : "We are closed");
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
    ifr.addEventListener("load", function () {
      document.getElementById("alp-calcard").classList.add("alp-ld");
    });
    ifr.src = ifr.getAttribute("data-src");
    track("booking_calendar_open"); /* the booking calendar actually loaded */
    loadFormEmbedJs();
    /* desktop: catch the wheel over the calendar so the page always scrolls;
       a pointerdown drops the catcher for a beat so clicks reach the calendar */
    var ov = document.getElementById("alp-calscroll");
    if (ov && FINE) {
      ov.style.pointerEvents = "auto";
      ov.addEventListener("wheel", function (e) { e.preventDefault(); root.scrollTop += e.deltaY; }, { passive: false });
      var calRearm;
      ov.addEventListener("pointerdown", function () {
        ov.style.pointerEvents = "none";
        clearTimeout(calRearm);
        calRearm = setTimeout(function () { ov.style.pointerEvents = "auto"; }, 350);
      });
    }
    /* the calendar is a cross-origin GHL iframe, so a completed booking can only
       be detected from the postMessages it emits to us — fire the Google Ads
       conversion when one signals a confirmed booking (once per session) */
    window.addEventListener("message", function (e) {
      if (!e.origin || !/leadconnector|msgsndr/i.test(e.origin)) return;
      var d = e.data, s = typeof d === "string" ? d : (function () { try { return JSON.stringify(d); } catch (x) { return ""; } })();
      if (/appointment|booked|booking[ _-]?(success|confirmed|complete)|slot[ _-]?booked/i.test(s)) trackBookingConversion();
    }, false);
  }
  var feLoaded = false;
  function loadFormEmbedJs() {
    if (feLoaded) return;
    feLoaded = true;
    var fe = document.createElement("script");
    fe.src = "https://link.msgsndr.com/js/form_embed.js";
    fe.async = true;
    document.body.appendChild(fe);
  }

  /* warm the GHL calendar AND the video backdrop in the background once idle,
     so both are ready (no lag, and the video is already there as the section
     scrolls in) by the time the visitor reaches booking. Deferred off the
     critical path so it never competes with the first frames. */
  (function preloadFlow() {
    var go = function () { try { loadCalendar(); } catch (e) {} try { loadFlowMedia(); } catch (e) {} };
    if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 6000 });
    else setTimeout(go, 4000);
  })();

  /* workshop video backdrop: probed lazily on flow entry; absent file or
     reduced motion leaves the gradient poster — the section reads finished
     either way. bookVis (IntersectionObserver, wired with the reviews block)
     gates playback so the video never decodes offscreen. */
  var mediaLoaded = false, bgVid = null, bookVis = false;
  function loadFlowMedia() {
    if (mediaLoaded) return;
    mediaLoaded = true;
    if (REDUCE) return;
    /* phones loop the trimmed middle (logo intro + outro text crop off a tall
       screen); desktop plays the full clip */
    var vsrc = IS_MOBILE ? WORKSHOP_VID_MOBILE : WORKSHOP_VID;
    fetch(vsrc, { method: "HEAD" }).then(function (r) {
      if (!r.ok) { if (vsrc === WORKSHOP_VID) return; vsrc = WORKSHOP_VID; return fetch(vsrc, { method: "HEAD" }).then(function (r2) { if (!r2.ok) throw 0; }); }
    }).then(function () {
      var v = document.createElement("video");
      v.id = "alp-bgvid";
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      v.preload = "auto"; v.src = vsrc;
      v.addEventListener("canplay", function () { v.classList.add("alp-on"); });
      var bg = document.getElementById("alp-bookbg");
      bg.insertBefore(v, bg.firstChild);
      bgVid = v;
      if (bookVis) v.play().catch(function () {});
    }).catch(function () {});
  }

  // ── Frame engine (v4, unchanged) ───────────────────────────────────────────
  var canvas = document.getElementById("alp-canvas");
  var ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  var frames = new Array(TOTAL_FRAMES).fill(null);
  var loadedCount = 0, firstReady = false;
  var drawnFrame = -1;
  var loader = document.getElementById("alp-loader");
  var lCore = document.getElementById("alp-lcore");
  var lBadge = document.getElementById("alp-lbadge");
  var lSheen = document.getElementById("alp-lsheen");
  var lPct = document.getElementById("alp-lpct");
  var lOdT = document.getElementById("alp-odt");   // percent ones wheel
  var lOdO = document.getElementById("alp-odo");   // tenths-of-a-percent wheel (the white tenths)
  var lOd3 = document.getElementById("alp-od3");   // percent tens wheel
  var lOdK = document.getElementById("alp-odk");   // thousands column — lights to 1 only at 100 (reads 01000)
  var lStat = document.getElementById("alp-lstat");
  var lDot = document.getElementById("alp-ldot");
  var lVeil = document.getElementById("alp-lveil");
  var batchLoaded = 0, badgeSvg = null, badgeReady = false;
  var loaderT0 = performance.now(), LOADER_MIN_MS = 2600, shownPct = 0, bursting = false, loaderHeld = false;
  /* audio handoff state: the loader runs before any gesture, so the intro/odometer
     voices stay silent until the visitor clicks the sound pill mid-count */
  var loaderPhase = true, introAudioOn = false, emberTimer = null;
  var lastOdoVal = -1, lastOdoTickT = 0, odoLanded = false;
  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* badge svg is inlined for crisp scaling; cross-origin embeds fall back to
     an <img> — the collapse animates the wrapper either way */
  fetch(BADGE).then(function (r) { return r.text(); }).then(function (txt) {
    lBadge.innerHTML = txt;
    badgeSvg = lBadge.querySelector("svg");
    if (badgeSvg) { badgeSvg.removeAttribute("width"); badgeSvg.removeAttribute("height"); }
    badgeReady = true; lBadge.classList.add("alp-lin"); lSheen.classList.add("alp-on");
  }).catch(function () {
    lBadge.innerHTML = '<img src="' + BADGE + '" alt="Addept Automotive">';
    badgeReady = true; lBadge.classList.add("alp-lin"); lSheen.classList.add("alp-on");
  });

  /* the handoff, in three beats: the emblem and its orbit stroke collapse
     into a single glowing point; the point holds for a blink; then it streaks
     out horizontally like a light trail while the black shell dissolves and
     the hero choreography populates beneath (startIntro gets a head start
     past the transition's empty lead-in). The counter hands its spot to the
     workshop line for the ride out. */
  function burst() {
    bursting = true;
    loaderPhase = false;               // count's over — a later pill click won't restart the intro bed
    sndBurst();                        // riser release → sub-boom + light-streak zap, timed to the beats below
    loader.style.pointerEvents = "none";
    lPct.style.opacity = 0;
    var lw = document.getElementById("alp-lwit");
    if (lw) lw.style.opacity = 0;
    lStat.style.opacity = 1;
    lStat.classList.add("alp-on"); // dots tick up in the beat before the streak
    if (REDUCE) {
      loader.style.transition = "opacity .5s ease";
      loader.style.opacity = 0;
      setTimeout(function () { loader.style.display = "none"; introActive = false; startIntro(); }, 520);
      return;
    }
    /* wind-up: the emblem swells with anticipation before the drop */
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
    }, 1100);
    setTimeout(function () { introActive = false; startIntro(); tT = tDur * 0.46; }, 1200);
    setTimeout(function () { lStat.style.opacity = 0; }, 1650);
    setTimeout(function () { loader.style.display = "none"; }, 2300);
  }

  /* smart preload threshold: the loader holds until the frames the opening run
     actually needs are decodable — a contiguous head from frame 0 through the
     pre-purchase/inspections stop (the reported jank stretch), plus every
     section's landing frame ±2 (so any section, even via dot-nav, lands on an
     exact frame). Everything else streams in once the loader lifts. */
  var READY = (function () {
    var seen = {}, n = TOTAL_FRAMES - 1, i, d;
    var head = Math.min(n, Math.round(SEC[Math.min(3, SEC.length - 1)].stop / 100 * n) + 4);
    for (i = 0; i <= head; i++) seen[i] = 1;
    for (i = 0; i < SEC.length; i++) {
      var f = Math.round(SEC[i].stop / 100 * n);
      for (d = -2; d <= 2; d++) if (f + d >= 0 && f + d <= n) seen[f + d] = 1;
    }
    return Object.keys(seen).map(Number);
  })();
  var READY_TARGET = READY.length;
  function readyLoaded() { var c = 0; for (var i = 0; i < READY.length; i++) if (frames[READY[i]]) c++; return c; }

  /* loader heartbeat: a five-column odometer tracking min(ready-set load
     progress, a minimum dwell). At 100 it sits a beat on a crisp 01000 before
     the badge-burst. Stops itself at the burst. */
  (function loaderTick() {
    if (bursting) return;
    requestAnimationFrame(loaderTick);
    var tq = Math.min((performance.now() - loaderT0) / LOADER_MIN_MS, 1);
    var dq = Math.min(readyLoaded() / READY_TARGET, 1);
    var target = Math.min(tq, dq) * 100;
    shownPct += (target - shownPct) * 0.14;
    if (target >= 100 && shownPct > 99.1) shownPct = 100;
    var val = Math.min(Math.floor(shownPct * 10), 1000), od100 = val >= 1000; // tenths of a percent, 0..1000 (reads 01000 at 100%)
    if (lOdK) lOdK.textContent = od100 ? "1" : "0";                            // thousands column → 1 at 100%
    /* three rolling wheels — percent-tens, percent-ones, tenths-of-a-percent. At
       100 they point at the trailing wrap-0 (pos 10) so they carry forward off
       the 9 like a real odometer, while the thousands column flips to 1. */
    if (lOd3) lOd3.style.transform = "translateY(-" + (od100 ? 10 : Math.floor(val / 100) % 10) * 0.92 + "em)";
    lOdT.style.transform = "translateY(-" + (od100 ? 10 : Math.floor(val / 10) % 10) * 0.92 + "em)";
    /* white tenths wheel: spin-blurred while counting (too fast to read), then
       settle on 0 once it lands */
    if (od100) {
      if (lOdO.classList.contains("alp-odspin")) lOdO.classList.remove("alp-odspin");
      lOdO.style.transform = "translateY(-9.2em)";
    } else if (!lOdO.classList.contains("alp-odspin")) {
      lOdO.classList.add("alp-odspin");
      lOdO.style.transform = "";
    }
    var p = shownPct / 100;
    /* odometer audio: a ratchet tick per integer step (throttled so the fast
       early spin reads as a quickening, thinning as it eases to 100), an accent
       on each tens rollover, and a mechanical latch when it lands; the riser
       tracks the climb. All no-ops until the sound invite unlocks the context. */
    if (val !== lastOdoVal) {
      if (od100) { if (!odoLanded) { odoLanded = true; sndOdoLand(); } }
      else if (performance.now() - lastOdoTickT > 46) { sndOdoTick(p, val % 10 === 0); lastOdoTickT = performance.now(); }
      lastOdoVal = val;
    }
    sndRiseTo(p);
    if (!REDUCE) lCore.style.transform = "scale(" + (1 + p * 0.18).toFixed(4) + ")";
    /* let the full 01000 land and hold for ~half a second before handing off */
    if (shownPct >= 100 && firstReady && badgeReady && !loaderHeld) {
      loaderHeld = true;
      setTimeout(burst, 480);
    }
  })();
  var crop = { sx: 0, sy: 0, scale: 1, imgW: 1600, imgH: 900 };
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var HAS_BITMAP = typeof createImageBitmap === "function";
  var BMP_AHEAD = 26, BMP_BEHIND = 10, BMP_MAX = 44, BMP_INFLIGHT_MAX = 6;
  var bitmaps = new Map();
  var bmpInflight = 0, bmpResizeOk = true;
  /* decode bitmaps at full source width on capable devices: a single GPU
     upscale in drawImageCover beats a worker downscale + later upscale (two
     resamples = visible softening, the worst of it on portrait phones whose
     cover-crop blows the height up). LITE phones keep a lighter resize so the
     bitmap cache stays within mobile memory. */
  var bmpW = LITE ? Math.min(1600, Math.ceil(window.innerWidth * DPR)) : 1600;
  var scrollDir = 1;

  /* decode from a Blob, never the <img>: createImageBitmap(HTMLImageElement)
     re-rasterises ON the main thread (~15ms a call — the source of every
     transition stutter), while the Blob path decodes and resizes entirely on
     worker threads. The frame bytes are already in the HTTP cache from the
     preloader, so the fetch is free. */
  function makeBitmap(idx) {
    bitmaps.set(idx, null); bmpInflight++;
    var img = frames[idx];
    function settle(bm) {
      if (bitmaps.get(idx) === null) bitmaps.set(idx, bm); else bm.close();
      bmpInflight--;
    }
    function fail() { bmpInflight--; bitmaps.delete(idx); }
    fetch(frameSrc(idx)).then(function (r) {
      if (!r.ok) throw 0;
      return r.blob();
    }).then(function (b) {
      var wantResize = bmpResizeOk && bmpW < img.naturalWidth;
      var p = wantResize
        ? createImageBitmap(b, { resizeWidth: bmpW, resizeQuality: "high" })
        : createImageBitmap(b);
      return wantResize ? p.catch(function () { bmpResizeOk = false; return createImageBitmap(b); }) : p;
    }).then(settle).catch(function () {
      /* network/decode failure — last resort: the already-decoded image
         element (main-thread cost, but only ever on the rare miss) */
      try {
        createImageBitmap(img).then(settle).catch(fail);
      } catch (e) { fail(); }
    });
  }

  /* long jumps (dot nav across the whole film) sweep frames faster than the
     renderer can decode them — error code 11 on weaker machines. During fast
     scrubs the engine strides: only every Nth frame is decoded, drawn and
     bitmapped, capping the paint rate near film rate. The eye can't tell;
     the GPU can. */
  var scrubStrideNow = 1;
  function scrubStride() {
    if (!transitioning) return 1;
    var fv = Math.abs(tTo - tFrom) * (TOTAL_FRAMES - 1) / (100 * Math.max(tDur, 0.001));
    return fv > 45 ? Math.min(4, Math.ceil(fv / 40)) : 1;
  }

  function tendBitmaps(center) {
    if (!HAS_BITMAP) return;
    var st = scrubStrideNow;
    for (var d = 0; d <= BMP_AHEAD && bmpInflight < BMP_INFLIGHT_MAX; d++) {
      var i = center + d * st * scrollDir;
      if (i >= 0 && i < TOTAL_FRAMES && frames[i] && !bitmaps.has(i)) makeBitmap(i);
      if (d > 0 && d <= BMP_BEHIND) {
        var j = center - d * st * scrollDir;
        if (j >= 0 && j < TOTAL_FRAMES && frames[j] && !bitmaps.has(j) && bmpInflight < BMP_INFLIGHT_MAX) makeBitmap(j);
      }
    }
    if (bitmaps.size > BMP_MAX) {
      var ks = [];
      bitmaps.forEach(function (v, k) { if (v) ks.push(k); });
      ks.sort(function (a, b) { return Math.abs(b - center) - Math.abs(a - center); });
      for (var e = 0; e < ks.length && bitmaps.size > BMP_MAX; e++) {
        if (Math.abs(ks[e] - center) <= BMP_AHEAD * st) break;
        bitmaps.get(ks[e]).close(); bitmaps.delete(ks[e]);
      }
    }
  }

  /* on a section jump, front-load the frames the scrub is about to sweep: the
     destination stop and its ±2 neighbours first (so the landing is always an
     exact bitmap, never an approximated near-miss), then backfill toward the
     start. Bounded by the inflight cap — the per-frame tendBitmaps fills the
     rest as the playhead advances. */
  function prefetchSweep(fromPct, toPct) {
    if (!HAS_BITMAP) return;
    var fFrom = Math.round(fromPct / 100 * (TOTAL_FRAMES - 1));
    var fTo = Math.round(toPct / 100 * (TOTAL_FRAMES - 1));
    var dir = fTo >= fFrom ? 1 : -1, order = [], k, f;
    /* warm the move's OPENING frames (just ahead of the source) as well as the
       landing, so a sweep never stutters on its first paints nor lands on a
       near-miss; then backfill the span. Still bounded by BMP_INFLIGHT_MAX —
       no decode burst, so the crash-tuned inflight cap is untouched. */
    for (k = 1; k <= 3; k++) order.push(fFrom + k * dir);
    for (k = 0; k <= 2; k++) { order.push(fTo + k); if (k) order.push(fTo - k); }
    for (f = fFrom; f !== fTo; f += dir) order.push(f);
    for (var oi = 0; oi < order.length && bmpInflight < BMP_INFLIGHT_MAX; oi++) {
      var i = order[oi];
      if (i >= 0 && i < TOTAL_FRAMES && frames[i] && !bitmaps.has(i)) makeBitmap(i);
    }
  }

  /* TEMP: debug stats for memory hunting — remove with the tuning panel */
  window.__alpDbg = function () {
    return { bmp: bitmaps.size, inflight: bmpInflight, loaded: loadedCount,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1 };
  };

  function getDrawable(i) {
    if (!HAS_BITMAP) return { img: frames[i], exact: true };
    var bm = bitmaps.get(i);
    if (bm) return { img: bm, exact: true };
    /* under stride the nearest bitmap can sit a full stride away */
    var reach = 2 * scrubStrideNow;
    for (var d = 1; d <= reach; d++) {
      bm = bitmaps.get(i - d * scrollDir);
      if (bm) return { img: bm, exact: false };
      bm = bitmaps.get(i + d * scrollDir);
      if (bm) return { img: bm, exact: false };
    }
    /* mid-sweep, never fall back to a raw decode of a transient frame — a
       near-miss bitmap above is cheap, a fresh AVIF decode at 90/s is the
       crash. Raw image only when parked (stride 1). */
    if (scrubStrideNow > 1) return { img: null, exact: false };
    return { img: frames[i], exact: true };
  }

  function drawImageCover(img) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    if (canvas.width !== Math.round(vw * DPR) || canvas.height !== Math.round(vh * DPR)) {
      canvas.width = Math.round(vw * DPR); canvas.height = Math.round(vh * DPR);
      /* resizing the canvas resets 2D context state — re-assert HQ smoothing */
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
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
    /* load order: the READY set first (so the loader lifts the moment the
       opening run is decodable), then every remaining frame — no skipping, a
       missing frame mid-scrub is exactly what made the section jumps jank.
       Bounded concurrency keeps the pipe full without starving the badge fetch
       or the first decode. JPEG originals only — the sharp master, fast to
       decode (the AVIF set was over-compressed and heavier to decode). */
    var queue = READY.slice(), inReady = {}, f;
    for (f = 0; f < READY.length; f++) inReady[READY[f]] = 1;
    for (f = 0; f < TOTAL_FRAMES; f++) if (!inReady[f]) queue.push(f);
    var CONCURRENCY = LITE ? 3 : 6, qpos = 0, active = 0;
    (function pump() {
      while (active < CONCURRENCY && qpos < queue.length) {
        active++;
        loadFrame(queue[qpos++], function () { active--; pump(); });
      }
    })();
  })();

  // ── State machine ──────────────────────────────────────────────────────────
  var MODE = "story";
  var cur = 0, fromIdx = -1, toIdx = 0;
  var transitioning = false, tT = 0, tDur = 1, tFrom = SEC[0].stop, tTo = SEC[0].stop;
  /* hero/about text choreography runs on its own clock, decoupled from the
     video transition — the footage glides at full speed while the words and
     letters take their time populating */
  var entT0 = 0, entFor = -1, ENT_MS = 3600, ENT_DELAY = 350;
  /* transition timing, one set PER DESTINATION SECTION — the move into
     section i uses TUNES[i]. Values were dialed in live and baked. */
  var TUNE_DEF = {
    vid: 1,           // video move time × (multiplies tDur; bigger = slower)
    wordMs: ENT_MS,   // words: animation length, ms (hero + about)
    wordDelay: ENT_DELAY, // words: start delay, ms (hero + about)
    txtStart: 0.4,    // words: start point, fraction of the video move (later sections)
    txtExit: 0.52,    // old words: exit time, fraction of the video move
    fx: "mask"        // words: entrance style (see FX_NAMES)
  };
  /* entrance styles; the set bit = letters fly outside the word masks */
  var FX_OPEN = { scatter: 1, focus: 1, wave: 1, spread: 1, rain: 1 };
  var FX_NAMES = [
    ["mask", "Mask rise (original)"],
    ["scatter", "Letter scatter (like sec 2)"],
    ["cascade", "Cascade rise"],
    ["flip", "Flip up"],
    ["focus", "Focus pull"],
    ["wave", "Wave"],
    ["spread", "Tracking spread"],
    ["rain", "Letter rain"]
  ];
  var TUNES = SEC.map(function () { return JSON.parse(JSON.stringify(TUNE_DEF)); });
  /* user-locked transition settings (from the timing tuner): */
  TUNES[0] = { vid: 1,    wordMs: 2400, wordDelay: 120, txtStart: 0.4,  txtExit: 0.52, fx: "mask" };    // intro → 1 (hero)
  TUNES[1] = { vid: 0.8,  wordMs: 2400, wordDelay: 120, txtStart: 0.25, txtExit: 0.36, fx: "scatter" }; // 1 → 2 (about)
  TUNES[2] = { vid: 1.0,  wordMs: 2400, wordDelay: 120, txtStart: 0,    txtExit: 0.22, fx: "rain" };    // 2 → 3 (services)
  /* every transition drives its word entrance on the independent word clock
     (wordMs/wordDelay), so "video move time" (vid) and "animation length"
     (wordMs) are separate knobs. Services decouples too now (see showSvcLayer):
     its heading populates on this slower clock so it reads clearly, while the
     card-fleet video move and layer fade stay fast & smooth. */
  /* all sections share one text-populate length (wordMs 2400) so the headline
     reads at the same deliberate pace everywhere, but each gets its OWN letter
     effect for variety (hero=mask, about=scatter, services=rain, inspections=
     focus, overhauls=cascade, hours=flip, reviews=spread). vid + exit stay
     per-section (the scroll video keeps its fast, smooth timing). */
  TUNES[3] = { vid: 0.8,  wordMs: 2400, wordDelay: 0,   txtStart: 0.25, txtExit: 0.36, fx: "focus" };   // 3 → 4 (inspections) — starts a touch sooner
  TUNES[4] = { vid: 0.8,  wordMs: 2400, wordDelay: 120, txtStart: 0.25, txtExit: 0.36, fx: "cascade" }; // 4 → 5 (overhauls)
  TUNES[5] = { vid: 0.8,  wordMs: 2400, wordDelay: 120, txtStart: 0.25, txtExit: 0.36, fx: "flip" };    // 5 → 6 (hours)
  TUNES[6] = { vid: 0.8,  wordMs: 2400, wordDelay: 120, txtStart: 0.25, txtExit: 0.36, fx: "spread" };  // 6 → 7 (reviews)
  function tuneFor(i) { return TUNES[i >= 0 && i < TUNES.length ? i : 0]; }
  function entQFor(i) {
    if (REDUCE) return 1; // reduced motion: words arrive settled
    /* services is move-driven (render path); its parked state must render
       settled, never re-enter the word clock */
    if (i === svcIdx || i !== entFor) return 1;
    var tn = tuneFor(entFor);
    return ease(clamp01((performance.now() - entT0 - tn.wordDelay) / tn.wordMs));
  }
  var pNow = SEC[0].stop;
  var wheelAcc = 0, lastWheelT = 0, cooldownUntil = 0;
  var fleetT = 0, fleetGoal = 0, fleetAcc = 0; // services card-fleet travel (0..1)
  /* reviews → booking bridge: scroll-driven, no snap. 0 = parked at reviews,
     1 = booking page fully over the film; maps 1:1 onto root.scrollTop */
  var bridgeT = 0, bridgeGoal = 0, bridgeAcc = 0;
  var flowReady = false; // true once we're settled in booking — gates the scroll-up handback to the reviews bridge

  var dim = document.getElementById("alp-dim");
  var glow = document.getElementById("alp-glow");
  var bookbgEl = document.getElementById("alp-bookbg"); // booking video backdrop — crossfades in/out
  var jumpMode = false; // true during a far dot-jump: cross-dissolve straight to the target instead of scrubbing through
  var nav = document.getElementById("alp-nav");
  var hint = document.getElementById("alp-hint");
  /* mobile: hold the scroll hint back for 5s on each new section so it doesn't
     nag the moment a page lands */
  var IS_MOBILE = !!(window.matchMedia && window.matchMedia("(max-width:760px)").matches);
  var hintHoldUntil = 0, hintPrevCur = -1, rfootPrevCur = -1;
  var dots = document.getElementById("alp-dots");
  var count = document.getElementById("alp-count");
  var cnum = document.getElementById("alp-cnum");
  var cline = count.querySelector(".alp-cline i");
  var secEls = Array.prototype.slice.call(root.querySelectorAll(".alp-section"));
  var ghostEls = Array.prototype.slice.call(root.querySelectorAll(".alp-ghost"));
  var annoEls = Array.prototype.slice.call(root.querySelectorAll(".alp-anno"));
  var dotEls = Array.prototype.slice.call(root.querySelectorAll("#alp-dots button"));
  var spacer = document.getElementById("alp-spacer");
  /* spacer is a constant 100vh scroll shim (one CSS rule, no JS/flow-mode
     override), but the bridge ride reads its height every frame and
     offsetHeight forces a synchronous layout — so memoize it and refresh only
     when the viewport actually changes (resize). */
  var spacerH = spacer.offsetHeight || window.innerHeight;
  function measureSpacerH() { spacerH = spacer.offsetHeight || window.innerHeight; }

  var secHeadsW = secEls.map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".alp-w"));
  });
  var secHeadsCh = secEls.map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".alp-ch"));
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
  var svcHeadsW = Array.prototype.slice.call(svcLayer.querySelectorAll(".alp-w"));
  var svcHeadsCh = Array.prototype.slice.call(svcLayer.querySelectorAll(".alp-ch"));
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
  /* hero entrance caches: line wrappers + their words, for per-line vectors */
  var heroLns = Array.prototype.slice.call(secEls[0].querySelectorAll(".alp-ln"));
  var heroLnWords = heroLns.map(function (ln) {
    return Array.prototype.slice.call(ln.querySelectorAll(".alp-w"));
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
  /* quantise blur radius to 0.5px steps. A continuously-changing filter forces
     the compositor to re-rasterise that element every frame — across dozens of
     letters per transition that's the residual micro-jank. Stepped values stay
     byte-identical for several frames so most re-rasters are skipped; 0.5px is
     visually indistinguishable on a soft blur. */
  function blurPx(px) { var q = Math.round(px * 2) / 2; return q > 0 ? "blur(" + q + "px)" : ""; }

  function styleTextFx(heads, copy, lines, boxes, floats, enterQ, exitQ, dirX, fx) {
    var n = heads.length, k, st;
    var isCh = fx && fx !== "mask" && n > 0;
    if (isCh) {
      /* letter-driven entrances: one shared fling-out exit, fx-switched enters */
      var chStag = Math.min(0.02, 0.45 / Math.max(n - 1, 1));
      for (k = 0; k < n; k++) {
        st = heads[k].style;
        var av = k * 2.39996; // golden angle: evenly scattered directions
        var vx = Math.cos(av), vy = Math.sin(av);
        if (exitQ > 0) {
          var oc2 = scrollDir > 0 ? k : n - 1 - k;
          var ev = expoIn(clamp01((exitQ - oc2 * chStag) / 0.5));
          st.opacity = (1 - ev).toFixed(3);
          st.transform = "translate(" + (vx * ev * 1.1).toFixed(3) + "em," + (vy * ev * 0.9 - scrollDir * ev * 0.6).toFixed(3) + "em) rotate(" + (vx * ev * 30).toFixed(1) + "deg) scale(" + (1 - ev * 0.3).toFixed(3) + ")";
          st.filter = blurPx(ev * 6);
        } else if (fx === "scatter") {
          /* each glyph rides its own golden-angle vector with spin, scale
             and blur, settling crisp (the original about-section effect) */
          var rv = expoOut(clamp01((enterQ - k * chStag) / 0.55));
          var dv = 1 - rv;
          st.opacity = Math.min(1, rv * 2.2).toFixed(3);
          st.transform = "translate(" + (vx * dv * 1.5).toFixed(3) + "em," + (vy * dv * 1.1).toFixed(3) + "em) rotate(" + (vx * dv * 40).toFixed(1) + "deg) scale(" + (0.5 + rv * 0.5).toFixed(3) + ")";
          st.filter = blurPx(dv * 7);
        } else if (fx === "cascade") {
          /* glyphs rise out of the word masks one after another, a touch of
             rotation straightening as they land */
          var rc2 = expoOut(clamp01((enterQ - k * chStag) / 0.5)), dc2 = 1 - rc2;
          st.opacity = Math.min(1, rc2 * 2.2).toFixed(3);
          st.transform = "translateY(" + (dc2 * 115).toFixed(1) + "%) rotate(" + (dc2 * 8).toFixed(2) + "deg)";
          st.filter = blurPx(dc2 * 3);
        } else if (fx === "flip") {
          /* departure-board: glyphs hinge up from flat, clipped by the masks */
          var rf2 = expoOut(clamp01((enterQ - k * chStag) / 0.55)), df2 = 1 - rf2;
          st.opacity = Math.min(1, rf2 * 2.5).toFixed(3);
          st.transformOrigin = "50% 100%";
          st.transform = "perspective(520px) rotateX(" + (df2 * 88).toFixed(1) + "deg)";
          st.filter = "";
        } else if (fx === "focus") {
          /* cinematic focus pull: oversized soft blur resolving to crisp, with a
             light per-letter stagger kept. Tight stagger spread + quick resolve
             window so the line starts early and snaps into focus, no laggy roll. */
          var sf = Math.min(0.006, 0.14 / Math.max(n - 1, 1));
          var rfo = ease(clamp01((enterQ - k * sf) / 0.45)), dfo = 1 - rfo;
          st.opacity = Math.min(1, rfo * 1.5).toFixed(3);
          st.transform = "scale(" + (1 + dfo * 0.7).toFixed(3) + ")";
          st.filter = blurPx(dfo * 12);
        } else if (fx === "wave") {
          /* a crest runs along the line, glyphs popping up with overshoot */
          var rw = backOut(clamp01((enterQ * 1.4 - k * chStag * 1.2) / 0.55)), dw = 1 - rw;
          st.opacity = Math.min(1, Math.max(0, rw) * 2).toFixed(3);
          st.transform = "translateY(" + (dw * 1.1).toFixed(3) + "em)";
          st.filter = blurPx(Math.abs(dw) * 2.5);
        } else if (fx === "spread") {
          /* editorial tracking-in: the line condenses from letterspaced haze */
          var c0 = (n - 1) / 2;
          var rs2 = expoOut(clamp01((enterQ - 0.05) / 0.75)), ds2 = 1 - rs2;
          st.opacity = Math.min(1, rs2 * 1.8).toFixed(3);
          st.transform = "translateX(" + ((k - c0) * ds2 * 0.38).toFixed(3) + "em)";
          st.filter = blurPx(ds2 * 5);
        } else { /* rain: glyphs drift down out of a soft fog, loosely shuffled */
          var h2 = (k * 2654435761 % 1000) / 1000;
          var rr = expoOut(clamp01((enterQ - h2 * 0.35) / 0.5)), dr = 1 - rr;
          st.opacity = Math.min(1, rr * 2.2).toFixed(3);
          st.transform = "translate(" + ((h2 - 0.5) * dr * 0.5).toFixed(3) + "em," + (-dr * (0.8 + h2 * 0.8)).toFixed(3) + "em)";
          st.filter = blurPx(dr * 6);
        }
      }
    } else if (exitQ > 0) {
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
        st.filter = blurPx(ec * 6);
      }
    } else {
      var stagC = 0.55 / Math.max(m, 1);
      for (k = 0; k < m; k++) {
        var rc = expoOut(clamp01((enterQ - k * stagC) / 0.45));
        st = copy[k].style;
        st.opacity = rc.toFixed(3);
        st.transform = "translate(" + (dirX * (1 - rc) * 1.6).toFixed(2) + "vw," + ((1 - rc) * 0.6).toFixed(3) + "em)";
        st.filter = blurPx((1 - rc) * 6);
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
          st.filter = blurPx(eF * 8);
        } else {
          var rF = expoOut(clamp01((enterQ - 0.5 - k * stagF) / winF));
          st.opacity = rF.toFixed(3);
          st.transform = "translateY(" + ((1 - rF) * 2.4).toFixed(2) + "em) scale(" + (0.92 + rF * 0.08).toFixed(3) + ")";
          st.filter = blurPx((1 - rF) * 10);
        }
      }
    }
  }

  var svcTextSettled = false;
  function showSvcLayer(enterQ, exitQ, vis, dx, dy) {
    svcLayer.style.visibility = "visible";
    svcLayer.style.opacity = vis.toFixed(3);
    svcLayer.style.transform = "translate(" + dx.toFixed(2) + "vw," + dy.toFixed(2) + "vh)";
    /* the heading/copy populate on their OWN slower clock (TUNES[svcIdx].wordMs)
       so they can be read clearly, decoupled from the video move which stays
       fast. The layer fade (vis) and the card fleet keep the video timing —
       only the letters are slowed, on both forward and backward entry. */
    var tn = tuneFor(svcIdx);
    var textQ = exitQ > 0 ? 1 : ease(clamp01((performance.now() - entT0 - tn.wordDelay) / tn.wordMs));
    /* parked at services the RAF loop runs every frame for the card fleet —
       skip the text loops once the populate has settled */
    var settled = textQ >= 1 && exitQ <= 0;
    if (!settled || !svcTextSettled) {
      var fxS = tn.fx;
      svcLayer.classList.toggle("alp-ltsec", fxS !== "mask");
      svcLayer.classList.toggle("alp-ltopen", !!FX_OPEN[fxS]);
      styleTextFx(fxS === "mask" ? svcHeadsW : svcHeadsCh, svcCopy, svcLayerLines, [], svcOrns, textQ, exitQ, 0, fxS);
      svcTextSettled = settled;
    }
  }

  /* deep links: every section has a shareable hash; #booking is the flow page */
  var HASHES = { hero: "home", about: "about", services: "services", inspections: "inspections", overhauls: "overhauls", hours: "hours", reviews: "reviews" };
  function setHash(h) {
    if ("#" + h === location.hash) return;
    try { history.replaceState(null, "", "#" + h); } catch (e) {}
  }
  function idxForHash(hash) {
    var h = (hash || "").replace("#", "");
    if (h === "book") h = "reviews"; // legacy hash from when section 7 was the booking CTA
    for (var i = 0; i < SEC.length; i++) if (HASHES[SEC[i].id] === h) return i;
    return -1;
  }

  function startIntro() {
    var dh = location.hash.replace("#", "");
    if (dh === "booking" || dh === "alp-booking") {
      cur = SEC.length - 1; pNow = SEC[cur].stop; setCounter(cur);
      render(pNow, true); enterFlow(); return;
    }
    var di = idxForHash(location.hash);
    if (di > 0) {
      /* land parked at the linked section; pull its frame ahead of the chain */
      cur = di; pNow = SEC[di].stop; setCounter(di);
      loadFrame(Math.round(pNow / 100 * (TOTAL_FRAMES - 1)));
      transitioning = true; fromIdx = -1; toIdx = di; tFrom = pNow; tTo = pNow; tT = 0; tDur = 1.0;
      entFor = di; entT0 = performance.now();
      return;
    }
    transitioning = true; fromIdx = -1; toIdx = 0; tFrom = SEC[0].stop; tTo = SEC[0].stop; tT = 0; tDur = 1.15;
    entFor = 0; entT0 = performance.now();
  }

  window.addEventListener("popstate", function () {
    if (introActive) return;
    var h = location.hash.replace("#", "");
    if (h === "booking") { if (MODE !== "flow" && !transitioning) enterFlow(); return; }
    var idx = idxForHash(location.hash);
    if (idx < 0) return;
    if (MODE === "flow") { if (!transitioning) exitFlow(); return; }
    goTo(idx);
  });

  function goTo(idx, jump) {
    if (transitioning || MODE !== "story") return;
    if (idx >= SEC.length) { enterFlow(); return; }
    if (idx < 0 || idx === cur) return;
    if (cur === svcIdx || idx === svcIdx) resetPop();   // drop any held card on the way in/out
    if (idx === svcIdx) { var fwd = idx > cur; fleetT = fleetGoal = fwd ? 0 : 1; fleetAcc = 0; computeFleet(); }
    if (cur === revIdx) { bridgeT = bridgeGoal = bridgeAcc = 0; if (root.scrollTop) root.scrollTop = 0; }
    /* far dot jumps cross-dissolve straight to the target instead of fast-
       forwarding the film through every section in between */
    jumpMode = !!jump && Math.abs(idx - cur) >= 2 && !REDUCE;
    transitioning = true; fromIdx = cur; toIdx = idx;
    setCounter(idx); // flip the gauge the instant the switch begins, not when it lands
    tFrom = pNow; tTo = SEC[idx].stop; tT = 0;
    tDur = REDUCE ? 0.35 : Math.min(2.3, 0.75 + Math.abs(tTo - tFrom) * 0.05) * tuneFor(idx).vid;
    entFor = idx; entT0 = performance.now();
    if (jumpMode) { tDur = 0.8; } // entFor/entT0 keep the entrance clock so the destination text still populates during/after the dissolve
    scrollDir = tTo > tFrom ? 1 : -1;
    wheelAcc = 0;
    prefetchSweep(tFrom, tTo);   // land the destination frame decoded, no mid-sweep miss
    lastNavT = performance.now();
    sndWhoosh(tDur * 0.7);
  }
  function goNext() { goTo(cur + 1); }
  function goPrev() { goTo(cur - 1); }

  function enterFlow() {
    if (transitioning) return;
    flowReady = false;
    /* cross-dissolve straight to the booking backdrop instead of scrubbing the
       film through every section — same smooth jump as a far dot-nav click */
    jumpMode = !REDUCE;
    transitioning = true; fromIdx = cur; toIdx = -2;
    tFrom = pNow; tTo = 100; tT = 0; tDur = jumpMode ? 0.8 : 1.15; scrollDir = 1;
    nav.classList.remove("alp-ctas"); // booking page surfaces its own CTAs
    sndWhoosh(0.9);
  }
  var flowAnimToken = 0; // bumping it aborts a running entry scroll animation
  function finishEnterFlow() {
    MODE = "flow";
    root.classList.add("alp-flowmode");
    setHash("booking");
    track("enter_flow");
    loadCalendar();
    loadFlowMedia();
    var t0 = null, startTop = root.scrollTop, target = spacer.offsetHeight;
    var token = ++flowAnimToken;
    function step(ts) {
      if (token !== flowAnimToken || MODE !== "flow") return; // user backed out mid-reveal
      if (!t0) t0 = ts;
      var q = easeIO(Math.min((ts - t0) / 750, 1));
      root.scrollTop = startTop + (target - startTop) * q;
      if (q < 1) requestAnimationFrame(step);
      else flowReady = true; // entry settled — scroll-up may now hand back to the bridge
    }
    requestAnimationFrame(step);
  }
  function exitFlow() {
    if (transitioning) return;
    flowAnimToken++;
    flowReady = false;
    bridgeT = bridgeGoal = bridgeAcc = 0; // a stale ridden-in goal must not re-ride
    MODE = "story";
    root.classList.remove("alp-flowmode");
    root.scrollTop = 0;
    transitioning = true; fromIdx = -1; toIdx = SEC.length - 1;
    tFrom = 100; tTo = SEC[SEC.length - 1].stop; tT = 0; tDur = 1.0; scrollDir = -1;
    cooldownUntil = performance.now() + 500;
    sndWhoosh(0.9);
  }

  /* bridge endpoints: the scroll ride hands over to real flow mode at the top,
     and flow hands back to the ride when the visitor scrolls up into the
     spacer — continuous in both directions, no snap */
  function finishBridge() {
    bridgeT = bridgeGoal = 1;
    flowReady = true;
    MODE = "flow";
    root.classList.add("alp-flowmode");
    root.scrollTop = spacer.offsetHeight;
    setHash("booking");
    track("enter_flow");
    loadCalendar();
    loadFlowMedia();
    updateNavCtas();
    parkedDirty = true;
  }
  function startBridgeBack() {
    flowAnimToken++;
    flowReady = false;
    MODE = "story";
    root.classList.remove("alp-flowmode");
    cur = revIdx; setCounter(cur);
    transitioning = false;
    bridgeT = bridgeGoal = clamp01(root.scrollTop / Math.max(spacer.offsetHeight, 1));
    bridgeAcc = 0;
    pNow = lerp(SEC[revIdx].stop, 100, bridgeT); // land the film on the right frame, not the booking-end frame
    setHash("reviews");
    updateNavCtas();
    REVCTL.wake();
    parkedDirty = true;
  }

  // ── Sound: WebAudio synth, muted by default, toggle in the nav ─────────────
  var SND = { on: false, ctx: null, master: null, noise: null };
  var weldSnd = null;  // weld synth handle, exposed so the master pill can gate it
  try { SND.on = localStorage.getItem("alp-sound") === "1"; } catch (e) {}
  function sndInit() {
    if (SND.ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    SND.ctx = new AC();
    SND.master = SND.ctx.createGain();
    SND.master.gain.value = 0.5;
    SND.master.connect(SND.ctx.destination);
    var len = SND.ctx.sampleRate;
    var buf = SND.ctx.createBuffer(1, len, SND.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    SND.noise = buf;
    return true;
  }
  function sndReady() {
    if (!SND.on || !sndInit()) return false;
    if (SND.ctx.state === "suspended") SND.ctx.resume();
    return true;
  }
  /* transition whoosh: a bandpass noise sweep falling with the move */
  function sndWhoosh(dur) {
    if (!sndReady()) return;
    var c = SND.ctx, t = c.currentTime;
    var d = Math.min(Math.max(dur || 0.8, 0.4), 1.1);
    var src = c.createBufferSource(); src.buffer = SND.noise; src.loop = true;
    var bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(140, t + d);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + d * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(bp); bp.connect(g); g.connect(SND.master);
    src.start(t); src.stop(t + d + 0.05);
  }
  /* feather-quiet hover tick */
  function sndTick() {
    if (!sndReady()) return;
    var c = SND.ctx, t = c.currentTime;
    var o = c.createOscillator(); o.type = "sine"; o.frequency.value = 2300;
    var g = c.createGain();
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(SND.master);
    o.start(t); o.stop(t + 0.06);
  }
  /* press: a soft mechanical thump */
  function sndPress() {
    if (!sndReady()) return;
    var c = SND.ctx, t = c.currentTime;
    var o = c.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
    var g = c.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(SND.master);
    o.start(t); o.stop(t + 0.13);
  }
  /* the Easter-egg rev: saw through a lowpass, throttle blip */
  function sndRev() {
    if (!sndReady()) return;
    var c = SND.ctx, t = c.currentTime;
    var o = c.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(210, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.9);
    var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 650;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(lp); lp.connect(g); g.connect(SND.master);
    o.start(t); o.stop(t + 1);
  }

  /* ── intro/odometer voices: cinematic-trailer palette, synth-only ──────────
     a digital ratchet on the counter, a low riser + ember bed that build with
     the load, then a sub-boom + light-streak zap as the badge bursts into the
     hero. Every voice is gated by sndReady(), so they're silent until the
     sound invite unlocks the context (SND is hoisted-undefined on the loader's
     first synchronous frame — the !SND guard covers that). */
  /* old mechanical odometer: a dry detent CLICK (the wheel catching its next
     notch) over a tiny woody THOCK (the drum's mass). No rising pitch — real
     odometers click at the same pitch and just speed up; the carry (every 10)
     gets a heavier double-catch clunk. Slight per-tick jitter for realism. */
  function sndOdoTick(rate, accent) {
    if (!SND || !sndReady()) return;
    var c = SND.ctx, t = c.currentTime;
    var j = 0.9 + Math.random() * 0.2;
    /* detent click: brief band-limited noise transient, fast decay */
    var src = c.createBufferSource(); src.buffer = SND.noise;
    var bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.7;
    bp.frequency.value = (accent ? 1150 : 1950) * j;
    var ng = c.createGain();
    ng.gain.setValueAtTime(accent ? 0.08 : 0.05, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + (accent ? 0.03 : 0.016));
    src.connect(bp); bp.connect(ng); ng.connect(SND.master);
    src.start(t); src.stop(t + 0.05);
    /* woody wheel thock under it */
    var o = c.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime((accent ? 150 : 235) * j, t);
    o.frequency.exponentialRampToValueAtTime((accent ? 88 : 150) * j, t + 0.04);
    var og = c.createGain();
    og.gain.setValueAtTime(accent ? 0.06 : 0.03, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + (accent ? 0.06 : 0.032));
    o.connect(og); og.connect(SND.master);
    o.start(t); o.stop(t + 0.08);
    /* carry: a second catch-click ~22ms later as the next wheel turns over */
    if (accent) {
      var s2 = c.createBufferSource(); s2.buffer = SND.noise;
      var b2 = c.createBiquadFilter(); b2.type = "bandpass"; b2.Q.value = 1.5; b2.frequency.value = 1500 * j;
      var n2 = c.createGain();
      n2.gain.setValueAtTime(0.0001, t + 0.022);
      n2.gain.linearRampToValueAtTime(0.045, t + 0.026);
      n2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s2.connect(b2); b2.connect(n2); n2.connect(SND.master);
      s2.start(t + 0.022); s2.stop(t + 0.07);
    }
  }
  function sndOdoLand() {
    if (!SND || !sndReady()) return;
    var c = SND.ctx, t = c.currentTime;
    /* the wheels settle home: a low woody clunk + the final latch click */
    var o = c.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(168, t); o.frequency.exponentialRampToValueAtTime(62, t + 0.14);
    var g = c.createGain();
    g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(SND.master); o.start(t); o.stop(t + 0.22);
    sndOdoTick(0, true);   // latch click on top of the clunk
  }
  /* the rising bed while the count climbs: sub drone + ember crackle + a
     band-passed noise riser whose brightness/level sndRiseTo() tracks to p */
  function startIntroAudio() {
    if (!SND || !sndReady() || introAudioOn) return;
    introAudioOn = true;
    var c = SND.ctx, t = c.currentTime;
    var bus = c.createGain(); bus.gain.value = 1; bus.connect(SND.master);
    var d1 = c.createOscillator(); d1.type = "sine"; d1.frequency.value = 42;
    var d2 = c.createOscillator(); d2.type = "sine"; d2.frequency.value = 63;
    var dlp = c.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 200;
    var dg = c.createGain(); dg.gain.setValueAtTime(0.0001, t); dg.gain.exponentialRampToValueAtTime(0.05, t + 0.7);
    d1.connect(dlp); d2.connect(dlp); dlp.connect(dg); dg.connect(bus); d1.start(t); d2.start(t);
    var rs = c.createBufferSource(); rs.buffer = SND.noise; rs.loop = true;
    var rbp = c.createBiquadFilter(); rbp.type = "bandpass"; rbp.Q.value = 1.2; rbp.frequency.value = 250;
    var rg = c.createGain(); rg.gain.value = 0.0001;
    rs.connect(rbp); rbp.connect(rg); rg.connect(bus); rs.start(t);
    SND.intro = { bus: bus, d1: d1, d2: d2, dg: dg, rs: rs, rbp: rbp, rg: rg };
    scheduleEmber();
  }
  function sndRiseTo(p) {
    if (!SND || !SND.intro) return;
    var c = SND.ctx, r = SND.intro;
    r.rbp.frequency.setTargetAtTime(250 + p * p * 1900, c.currentTime, 0.08);   // opens 250Hz → ~2.1kHz
    r.rg.gain.setTargetAtTime(0.015 + p * 0.06, c.currentTime, 0.1);
  }
  function scheduleEmber() {
    if (!SND || !SND.intro) return;
    sndEmber();
    emberTimer = setTimeout(scheduleEmber, 240 + Math.random() * 620);
  }
  function sndEmber() {
    if (!SND || !sndReady() || !SND.intro) return;
    var c = SND.ctx, t = c.currentTime;
    var src = c.createBufferSource(); src.buffer = SND.noise;
    var bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1600 + Math.random() * 2200; bp.Q.value = 3;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.018 + Math.random() * 0.02, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04 + Math.random() * 0.05);
    src.connect(bp); bp.connect(g); g.connect(SND.intro.bus);
    src.start(t); src.stop(t + 0.12);
  }
  function stopIntroAudio() {
    if (emberTimer) { clearTimeout(emberTimer); emberTimer = null; }
    introAudioOn = false;
    if (!SND || !SND.intro || !SND.ctx) { if (SND) SND.intro = null; return; }
    var c = SND.ctx, t = c.currentTime, r = SND.intro;
    try {
      r.dg.gain.cancelScheduledValues(t); r.dg.gain.setTargetAtTime(0.0001, t, 0.1);
      r.rg.gain.cancelScheduledValues(t); r.rg.gain.setTargetAtTime(0.0001, t, 0.1);
      r.bus.gain.setTargetAtTime(0.0001, t, 0.12);
      r.d1.stop(t + 0.6); r.d2.stop(t + 0.6); r.rs.stop(t + 0.6);
    } catch (e) {}
    SND.intro = null;
  }
  /* the badge-burst into the hero, timed to the visual beats (collapse ~0.4s,
     beam streak ~1.1s): swell the riser, suck down into the point, then a
     sub-boom + body + bright light-streak zap + an air whoosh on the dolly. */
  function sndBurst() {
    if (!SND || !sndReady()) { stopIntroAudio(); return; }
    var c = SND.ctx, t = c.currentTime, b = 1.1;
    if (SND.intro) {
      try {
        SND.intro.rg.gain.cancelScheduledValues(t);
        SND.intro.rg.gain.setValueAtTime(Math.max(SND.intro.rg.gain.value, 0.04), t);
        SND.intro.rg.gain.exponentialRampToValueAtTime(0.13, t + b);
        SND.intro.rbp.frequency.cancelScheduledValues(t);
        SND.intro.rbp.frequency.setValueAtTime(Math.max(SND.intro.rbp.frequency.value, 200), t);
        SND.intro.rbp.frequency.exponentialRampToValueAtTime(5200, t + b);
      } catch (e) {}
    }
    if (emberTimer) { clearTimeout(emberTimer); emberTimer = null; }
    /* collapse "suck" pulling into the point */
    var suck = c.createOscillator(); suck.type = "sine";
    suck.frequency.setValueAtTime(220, t + 0.4); suck.frequency.exponentialRampToValueAtTime(60, t + b);
    var sg = c.createGain();
    sg.gain.setValueAtTime(0.0001, t + 0.4); sg.gain.exponentialRampToValueAtTime(0.07, t + 0.9); sg.gain.exponentialRampToValueAtTime(0.0001, t + b + 0.02);
    suck.connect(sg); sg.connect(SND.master); suck.start(t + 0.4); suck.stop(t + b + 0.05);
    /* THE HIT: sub-boom */
    var sub = c.createOscillator(); sub.type = "sine";
    sub.frequency.setValueAtTime(92, t + b); sub.frequency.exponentialRampToValueAtTime(38, t + b + 0.5);
    var subg = c.createGain();
    subg.gain.setValueAtTime(0.0001, t + b); subg.gain.exponentialRampToValueAtTime(0.6, t + b + 0.02); subg.gain.exponentialRampToValueAtTime(0.0001, t + b + 0.6);
    sub.connect(subg); subg.connect(SND.master); sub.start(t + b); sub.stop(t + b + 0.65);
    /* body (so it carries on laptop speakers) */
    var body = c.createOscillator(); body.type = "triangle";
    body.frequency.setValueAtTime(150, t + b); body.frequency.exponentialRampToValueAtTime(70, t + b + 0.25);
    var bg = c.createGain();
    bg.gain.setValueAtTime(0.0001, t + b); bg.gain.exponentialRampToValueAtTime(0.22, t + b + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, t + b + 0.3);
    body.connect(bg); bg.connect(SND.master); body.start(t + b); body.stop(t + b + 0.35);
    /* bright zap: high-passed noise streaking down with the light beam */
    var z = c.createBufferSource(); z.buffer = SND.noise; z.loop = true;
    var zhp = c.createBiquadFilter(); zhp.type = "highpass";
    zhp.frequency.setValueAtTime(5000, t + b); zhp.frequency.exponentialRampToValueAtTime(900, t + b + 0.45);
    var zg = c.createGain();
    zg.gain.setValueAtTime(0.0001, t + b); zg.gain.exponentialRampToValueAtTime(0.16, t + b + 0.03); zg.gain.exponentialRampToValueAtTime(0.0001, t + b + 0.5);
    z.connect(zhp); zhp.connect(zg); zg.connect(SND.master); z.start(t + b); z.stop(t + b + 0.55);
    /* air whoosh riding the camera dolly into the hero */
    var w = c.createBufferSource(); w.buffer = SND.noise; w.loop = true;
    var wbp = c.createBiquadFilter(); wbp.type = "bandpass"; wbp.Q.value = 0.8;
    wbp.frequency.setValueAtTime(820, t + b); wbp.frequency.exponentialRampToValueAtTime(150, t + b + 0.8);
    var wg = c.createGain();
    wg.gain.setValueAtTime(0.0001, t + b); wg.gain.exponentialRampToValueAtTime(0.12, t + b + 0.2); wg.gain.exponentialRampToValueAtTime(0.0001, t + b + 0.85);
    w.connect(wbp); wbp.connect(wg); wg.connect(SND.master); w.start(t + b); w.stop(t + b + 0.9);
    setTimeout(stopIntroAudio, 1250);   // tear the bed down just after the hit
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  root.addEventListener("wheel", function (e) {
    if (introActive) { e.preventDefault(); return; }
    if (MODE === "flow") {
      /* scrolling up past the booking content hands back to the bridge ride —
         the film returns continuously, no snap */
      if (e.deltaY < 0 && !transitioning && root.scrollTop < spacer.offsetHeight - 8) {
        e.preventDefault();
        startBridgeBack();
        bridgeGoal = clamp01(bridgeT + e.deltaY / Math.max(spacer.offsetHeight, 1));
      }
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
    if (cur === revIdx) {
      // reviews stop: scroll rides the booking page in/out, 1:1 with the wheel
      var bb = bridgeGoal;
      bridgeGoal = clamp01(bridgeGoal + e.deltaY / Math.max(spacer.offsetHeight, 1));
      if (bb <= 0 && e.deltaY < 0) {
        bridgeAcc += e.deltaY;
        if (bridgeAcc < -110) { bridgeAcc = 0; goPrev(); }
      } else bridgeAcc = 0;
      return;
    }
    if (now - lastWheelT > 320) wheelAcc = 0;
    lastWheelT = now;
    wheelAcc += e.deltaY;
    /* snappier trigger: a decisive flick (one firm wheel notch / fast trackpad
       swipe) fires the move at once instead of waiting for the accumulator to
       cross ±110 — that wait is what read as lag. Gentle scrolls still
       accumulate. The post-move cooldown (cooldownUntil +420ms) and the
       transitioning guard above swallow the momentum tail, so a single gesture
       can't double-advance. Transition speed/easing are unchanged. */
    if (e.deltaY >= 50 || wheelAcc > 110) goNext();
    else if (e.deltaY <= -50 || wheelAcc < -110) goPrev();
  }, { passive: false });

  var touchY = null, touchX = null, touchUsed = false, touchRw = false;
  root.addEventListener("touchstart", function (e) {
    touchY = e.touches[0].clientY; touchX = e.touches[0].clientX; touchUsed = false;
    touchRw = !!(e.target.closest && e.target.closest("#alp-rwrap"));
    /* note where a tap began on the services deck; a quick stationary tap
       (resolved on touchend) views a card, a drag scrolls */
    if (!FINE && cur === svcIdx && !transitioning) {
      tapCand = (e.target.closest && e.target.closest(".alp-fcard")) || null;
      tapSX = touchX; tapSY = touchY; tapMoved = false; tapT0 = performance.now();
    }
  }, { passive: true });
  root.addEventListener("touchmove", function (e) {
    if (introActive) { e.preventDefault(); return; }
    if (MODE === "flow") {
      /* a clearly vertical pull above the booking content hands back to the
         bridge ride — horizontal swipes must not bounce the visitor out */
      if (root.scrollTop < spacer.offsetHeight - 8 && touchY !== null && e.touches[0].clientY - touchY > 24
          && Math.abs(e.touches[0].clientX - touchX) < e.touches[0].clientY - touchY
          && !transitioning && !touchUsed) {
        startBridgeBack();
        touchY = e.touches[0].clientY; // re-baseline: bridge deltas start fresh
      }
      return;
    }
    /* touches that start on the review cards scroll the cards natively —
       never preventDefault them, never treat them as section navigation */
    if (touchRw) return;
    e.preventDefault();
    if (transitioning || touchY === null) return;
    if (cur === revIdx) {
      // reviews stop: the finger rides the booking page in/out directly
      var stepB = touchY - e.touches[0].clientY;
      touchY = e.touches[0].clientY;
      var wasB = bridgeGoal;
      bridgeGoal = clamp01(bridgeGoal + (stepB * 1.2) / Math.max(spacer.offsetHeight, 1));
      if (!touchUsed && wasB <= 0 && stepB < 0) {
        bridgeAcc += stepB;
        if (bridgeAcc < -90) { touchUsed = true; bridgeAcc = 0; goPrev(); }
      } else bridgeAcc = 0;
      return;
    }
    if (cur === svcIdx) {
      var mdx = e.touches[0].clientX - tapSX, mdy = e.touches[0].clientY - tapSY;
      if (mdx * mdx + mdy * mdy > 100) tapMoved = true;          // it's a drag, not a tap
      if (poppedCard) {                                          // a card is up: a deliberate drag dismisses it...
        if (tapMoved) closePop();                                // ...then the rest of the same drag scrolls the deck
        touchY = e.touches[0].clientY;
        return;
      }
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
    /* snappier trigger: a deliberate ~48px swipe fires the move, replacing the
       old 70px dead-zone that read as lag on phones. touchUsed caps it at one
       move per gesture; tap jitter (<24px) stays well under the bar. */
    if (dy > 48) { touchUsed = true; goNext(); }
    else if (dy < -48) { touchUsed = true; goPrev(); }
  }, { passive: false });
  root.addEventListener("touchend", function () {
    /* a quick stationary tap on the deck toggles the card view; a long press or
       any drag is left for scrolling (so holding never gets in the way) */
    if (!FINE && cur === svcIdx && !tapMoved && performance.now() - tapT0 < 320) {
      if (poppedCard) closePop();             // tap again / outside → back into the deck
      else if (tapCand) openPop(tapCand);     // tap a card → pop it up to read
    }
    tapCand = null;
  }, { passive: true });
  root.addEventListener("touchcancel", function () { tapCand = null; tapMoved = false; }, { passive: true });

  window.addEventListener("keydown", function (e) {
    if (introActive) return;
    if (e.key === "Escape" && sentOpen) { closeSent(); return; }
    if (e.key === "Escape" && estOpen) { closeEst(); return; }
    if (e.key === "Escape" && MODE === "flow" && !transitioning) { exitFlow(); return; }
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
    if (cur === revIdx) {
      if (down) bridgeGoal = 1; // ride smoothly into the booking page
      else { if (bridgeGoal <= 0) goPrev(); else bridgeGoal = 0; }
      return;
    }
    if (down) goNext(); else goPrev();
  });

  dotEls.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (MODE === "flow") return;
      goTo(parseInt(btn.getAttribute("data-idx"), 10), true); // dot jumps may dip-to-black skip

    });
  });

  root.addEventListener("click", function (e) {
    var contact = e.target.closest ? e.target.closest("a[href^='tel:'], a[href^='mailto:'], a[href^='sms:'], a[href*='wa.me']") : null;
    if (contact) { var ch = contact.getAttribute("href"); track(ch.indexOf("tel:") === 0 ? "call_click" : ch.indexOf("sms:") === 0 ? "text_click" : ch.indexOf("wa.me") > -1 ? "whatsapp_click" : "email_click"); }
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
      if (MODE === "flow") {
        if (transitioning) return;
        /* "Back to top" / brand logo from booking → the VERY top (hero), not
           just the reviews section the booking sits above. Dissolve straight up. */
        flowAnimToken++;
        flowReady = false;
        bridgeT = bridgeGoal = bridgeAcc = 0;
        MODE = "story";
        root.classList.remove("alp-flowmode");
        root.scrollTop = 0;
        if (bookbgEl) bookbgEl.style.opacity = "0"; // drop the booking video so the hero shows
        jumpMode = !REDUCE;            // cross-dissolve to hero, no scrub-through
        transitioning = true; fromIdx = -1; toIdx = 0;
        tFrom = 100; tTo = SEC[0].stop; tT = 0; tDur = jumpMode ? 0.8 : 1.0; scrollDir = -1;
        entFor = 0; entT0 = performance.now();
        setCounter(0);
        cooldownUntil = performance.now() + 500;
        sndWhoosh(0.9);
      } else {
        goTo(0);
      }
    }
  });

  /* nav Call control: fine pointers reveal a number popover (+ copy); a coarse
     pointer (phone) dials straight through. Click-outside / Esc close it. */
  (function () {
    var cb = root.querySelector(".alp-ccall"); if (!cb) return;
    var pop = root.querySelector(".alp-callpop");
    var cp = root.querySelector(".alp-callpop-copy");
    function close() { cb.setAttribute("aria-expanded", "false"); if (pop) pop.hidden = true; }
    cb.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!FINE) { track("call_click"); location.href = PHONE_TEL; return; }
      if (cb.getAttribute("aria-expanded") === "true") close();
      else { cb.setAttribute("aria-expanded", "true"); if (pop) pop.hidden = false; }
    });
    if (cp) cp.addEventListener("click", function (e) {
      e.stopPropagation();
      try { navigator.clipboard.writeText(PHONE_DISPLAY); cp.textContent = "Copied"; setTimeout(function () { cp.textContent = "Copy"; }, 1400); } catch (er) {}
      track("call_click");
    });
    document.addEventListener("click", function (e) {
      if (cb.getAttribute("aria-expanded") !== "true") return;
      if (cb.contains(e.target) || (pop && pop.contains(e.target))) return;
      close();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  })();

  // ── Molten cursor companion (desktop): the droplet IS the pointer — pinned
  // dead-on it, stretching along velocity like hot metal — shedding sparks
  // modelled on high-speed studies of real grinder sparks: they inherit the
  // emitter's velocity (fly FORWARD along the stroke), shed ~10%/frame to
  // air drag, fall under gravity, cool along the blackbody ramp (red channel
  // pinned at 255 all the way down), sputter, and — if carbon-rich — pop
  // mid-flight into a ring of gold crackle.
  // Trails are real: a persistent canvas, alpha-faded ~18%/frame, records
  // each spark's true flight path as a luminous decaying streak; a second
  // canvas, cleared every frame, carries the droplet + white-hot leading
  // cores. The rAF loop sleeps once the pointer rests and trails have faded.
  var FINE = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  /* touch devices get the arc too: it strikes under the thumb on press,
     sheds movement sparks while dragging, and fades on release. Drawn
     larger than the desktop cursor so it reads AROUND the thumb. Welding
     (bead/shower/sound) stays mouse-only. */
  var TOUCHFX = !FINE && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  var ARCS = TOUCHFX ? 2.1 : 1;                        /* core/glow scale-up for thumbs */
  if ((FINE || TOUCHFX) && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) (function () {
    var ct = document.createElement("canvas");
    ct.id = "alp-fxt";                                 /* persistent trail layer */
    root.appendChild(ct);
    var c = document.createElement("canvas");
    c.id = "alp-fx";                                   /* cleared layer: droplet + cores */
    root.appendChild(c);
    if (FINE) root.classList.add("alp-nocursor");
    var tctx = ct.getContext("2d", { desynchronized: true });
    var fctx = c.getContext("2d", { desynchronized: true });
    var W = 0, H = 0, FDPR = 1;
    /* canvases are replaced elements: inset:0 does NOT stretch them, so the
       CSS size must be set explicitly or the bitmap displays at intrinsic
       size (2x on retina -> sparks drift away from the pointer). DPR re-read
       on every resize so browser zoom / monitor moves stay calibrated.
       Resizing wipes the trail bitmap — fine, trails live under a second. */
    function fxSize() {
      FDPR = Math.min(window.devicePixelRatio || 1, 1.25); /* fx layer stays cheap */
      W = window.innerWidth; H = window.innerHeight;
      ct.width = W * FDPR; ct.height = H * FDPR;
      ct.style.width = W + "px"; ct.style.height = H + "px";
      c.width = W * FDPR; c.height = H * FDPR;
      c.style.width = W + "px"; c.style.height = H + "px";
    }
    fxSize(); window.addEventListener("resize", fxSize);
    var tx = -100, ty = -100, ox = -100, oy = -100, lvx = 0, lvy = 0;
    var sparks = [], fxRun = false, lastMove = 0;
    var prevT = 0, emitAcc = 0, fadeFrames = 0;
    var weldOn = false, weldT0 = 0, strike = 0;   /* hold-to-weld state + ignition flash */
    var fxN = 0;                                  /* frame stamp for anchor-rect caching */
    var hitstop = 0, poolQ = 0;                   /* strike micro-freeze; molten-pool glow */
    /* weld bead: the seam laid while welding — points cool through the
       blackbody ramp and fade out as the metal solidifies (~5.2s) */
    var bead = [];
    function endBead() {
      if (!bead.length) return;
      var iE = bead.length - 1;
      bead[iE].b = true;
      /* taper the last ~3 dabs: a welder rides the amps down while still
         dabbing, so a good bead end fills and tapers — never a sunken crater */
      var TP = [0.55, 0.72, 0.88];
      for (var tI = 0; tI < 3 && iE - tI >= 0; tI++) {
        var pT = bead[iE - tI];
        if (tI > 0 && pT.b) break;             /* previous stroke's end */
        if ((pT.w || 1) > TP[tI]) pT.w = TP[tI];
      }
    }
    /* ── weld sound: sample-free Web Audio built to the measured acoustics of
       short-circuit MIG — the crackle is an ASYMMETRIC IMPULSE TRAIN locked
       to the arc's extinguish/reignite cycle (big pop = reignition, small =
       extinction), pops are bandpass-filtered noise centred near 2kHz with a
       +6dB 300Hz body EQ, riding a gusty >1.5kHz ionisation-hiss bed.
       Globular: sparse irregular sputter (~28Hz). Spray: dense regular
       "frying bacon" (~55Hz — a steady crackle is the sound of a GOOD weld).
       Lazily created inside the mousedown gesture (autoplay policy). */
    var snd = null;
    function sndInit() {
      if (snd !== null) return;
      var ACtor = window.AudioContext || window.webkitAudioContext;
      if (!ACtor) { snd = false; return; }
      try {
        var ac = new ACtor();
        var noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        var nd = noise.getChannelData(0);
        for (var n0 = 0; n0 < nd.length; n0++) nd[n0] = Math.random() * 2 - 1;
        var master = ac.createGain(); master.gain.value = SND.on ? 0.14 : 0;
        master.connect(ac.destination);
        var bus = ac.createGain(); bus.gain.value = 0;
        var body = ac.createBiquadFilter();
        body.type = "peaking"; body.frequency.value = 300; body.Q.value = 0.8; body.gain.value = 6;
        bus.connect(body); body.connect(master);
        var hp = ac.createBiquadFilter();
        hp.type = "highpass"; hp.frequency.value = 1500;
        var hg = ac.createGain(); hg.gain.value = 0;
        var hsrc = ac.createBufferSource();
        hsrc.buffer = noise; hsrc.loop = true;
        hsrc.connect(hp); hp.connect(hg); hg.connect(bus);
        hsrc.start();
        snd = { ac: ac, noise: noise, master: master, bus: bus, hiss: hg, next: 0, big: true, gust: 0.5 };
        weldSnd = snd;
      } catch (e1) { snd = false; }
    }
    function sndPop(t, amp, fc, dur) {
      var s = snd.ac.createBufferSource();
      s.buffer = snd.noise;
      var f = snd.ac.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = fc; f.Q.value = 1.1;
      var g = snd.ac.createGain();
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(snd.bus);
      s.start(t, Math.random() * 1.5, dur + 0.02);
      s.stop(t + dur + 0.03);
    }
    function sndRelease() {
      if (snd) snd.bus.gain.setTargetAtTime(0, snd.ac.currentTime, 0.07);
    }
    /* contextual cursor: the arc reacts to what it's over — swells with a
       ring on interactive elements, grows a DRAG hint over the draggables */
    var hovQ = 0, hovMode = 0; // 0 plain / 1 link / 2 drag surface
    var pres = 1, presT = 1;   // droplet presence: fades over iframes / off-window
    if (FINE) document.addEventListener("pointerover", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest("#alp-rwrap, .alp-fcard")) hovMode = 2;
      else if (t.closest("a, button, [role='button'], select, input, .alp-qa")) hovMode = 1;
      else hovMode = 0;
      presT = t.closest("#alp-calcard") ? 0 : 1;
      /* always wake: the ring must animate out when leaving a link too */
      lastMove = performance.now(); wake();
    }, { passive: true });
    if (FINE) document.documentElement.addEventListener("mouseleave", function () { presT = 0; wake(); });
    if (FINE) document.documentElement.addEventListener("mouseenter", function () { presT = 1; });
    var CAP = 220, GRAV = 0.10;   /* headroom for the hold-to-weld shower */
    var WIND = (Math.random() - 0.5) * 0.05;           /* session-constant breeze */
    /* droplet gradient is defined in local coords: frame-invariant, build once.
       Welding-arc palette: the pointer is the arc itself — a white-hot plasma
       core rimmed by the blue glow of ionised metal vapour. The sparks it
       sheds are molten spatter, so THEY stay on the warm blackbody ramp. */
    var dropGrad = fctx.createRadialGradient(0, 0, 0, 0, 0, 17);
    dropGrad.addColorStop(0, "rgba(255,255,255,.95)");
    dropGrad.addColorStop(0.3, "rgba(170,205,255,.5)");
    dropGrad.addColorStop(0.65, "rgba(96,152,255,.18)");
    dropGrad.addColorStop(1, "rgba(64,112,255,0)");
    /* environmental spill: an arc lights the room around it */
    var glowGrad = fctx.createRadialGradient(0, 0, 0, 0, 0, 110);
    glowGrad.addColorStop(0, "rgba(150,190,255,.13)");
    glowGrad.addColorStop(0.5, "rgba(120,165,255,.05)");
    glowGrad.addColorStop(1, "rgba(100,150,255,0)");
    /* touch halo: on a phone the thumb sits ON the arc and hides the white
       core, so a distinct blue RING is drawn peaking out past the thumb's
       edge (~26px) — that's the part the user actually sees around the
       fingertip. Brightest in the mid-band, dark at centre (under the thumb)
       and faded by the rim. */
    var haloGrad = fctx.createRadialGradient(0, 0, 0, 0, 0, 78);
    haloGrad.addColorStop(0, "rgba(120,170,255,.10)");
    haloGrad.addColorStop(0.34, "rgba(140,186,255,.46)");
    haloGrad.addColorStop(0.58, "rgba(110,162,255,.24)");
    haloGrad.addColorStop(1, "rgba(90,140,255,0)");
    /* anamorphic flare: the filmic horizontal streak of a blinding source */
    var flareGrad = fctx.createRadialGradient(0, 0, 0, 0, 0, 70);
    flareGrad.addColorStop(0, "rgba(210,230,255,.5)");
    flareGrad.addColorStop(0.25, "rgba(160,200,255,.16)");
    flareGrad.addColorStop(1, "rgba(120,170,255,0)");
    /* molten weld pool: the liquid metal — not the plasma — dominates the
       glow and burns STEADY through the arc's violent flicker. On aluminum
       the pool is liquid MERCURY-SILVER, not orange: bare aluminum's
       emissivity is 0.02-0.06 and it melts at 660C, below visible red heat */
    var poolGrad = fctx.createRadialGradient(0, 0, 0, 0, 0, 26);
    poolGrad.addColorStop(0, "rgba(255,255,255,.78)");
    poolGrad.addColorStop(0.45, "rgba(216,228,244,.3)");
    poolGrad.addColorStop(1, "rgba(180,202,232,0)");
    /* the bead rope is painted with concentric offset strokes (contact
       shadow -> base metal -> crown light -> specular streak): the classic
       2D recipe for a shaded metal cylinder. Per-pass: color, width,
       alpha, x/y offset of the pass toward the light. */
    /* shingle face, in dime-local space (+x = travel direction): the
       exposed crescent of each dab is brightest at its raised crest (back
       edge) and slides darker as it tucks under the following dab — the
       broad smooth per-shingle gradient the reference macro photos show */
    /* the next dab buries everything forward of ~x=-1, so the full
       bright->dark sweep must live inside the exposed back crescent */
    var dimeFace = fctx.createLinearGradient(-6, -1.2, 6, 1.2);
    dimeFace.addColorStop(0, "rgb(216,224,236)");
    dimeFace.addColorStop(0.18, "rgb(156,164,176)");
    dimeFace.addColorStop(0.42, "rgb(84,92,106)");
    dimeFace.addColorStop(1, "rgb(78,86,100)");
    function addSpark(x, y, vx, vy, heavy) {
      if (sparks.length >= CAP) return null;
      var cb = Math.random();
      var s = { x: x, y: y, px: x, py: y, vx: vx, vy: vy, life: 1,
        dk: 1 / (75 + Math.random() * 50),             /* 75–125 frame lifetimes */
        dg: heavy ? 0.975 + Math.random() * 0.015      /* heavy: keeps momentum, arcs */
                  : 0.90 + Math.random() * 0.03,       /* light: sheds ~10%/frame, drifts */
        r: heavy ? 1.8 + Math.random() * 1.6 : 0.9 + Math.random() * 1.4,
        cr: cb < 0.55 ? 0 : cb < 0.85 ? 1 : 2,         /* carbon: how many times it pops */
        ct: 0.2 + Math.random() * 0.5,                 /* life threshold of next pop */
        g: false, fk: true };
      sparks.push(s);
      return s;
    }
    function wake() { if (!fxRun) { fxRun = true; prevT = 0; requestAnimationFrame(fxStep); } }
    if (FINE) window.addEventListener("mousemove", function (e) {
      tx = e.clientX; ty = e.clientY; lastMove = performance.now();
      if (ox < -50) { ox = tx; oy = ty; }
      wake();
    }, { passive: true });
    /* touch: press strikes the arc under the thumb (no weld — just light),
       dragging sheds the same movement sparks the desktop stroke does,
       lifting the thumb lets the arc die out */
    if (TOUCHFX) (function () {
      root.addEventListener("touchstart", function (e) {
        var t = e.touches[0];
        tx = ox = t.clientX; ty = oy = t.clientY;   /* no swoosh from the last press */
        lvx = lvy = 0; emitAcc = 0;
        presT = 1; pres = Math.max(pres, 0.55);     /* the arc snaps on, no slow fade-in */
        strike = 0.9 + Math.random() * 1.1;         /* ignition flash */
        for (var i = 0; i < 6; i++) {               /* a small shower marks the strike */
          var a = Math.random() * 6.283, sp2 = 1 + Math.pow(Math.random(), 0.45) * 3;
          addSpark(tx, ty, Math.cos(a) * sp2, Math.sin(a) * sp2 - 0.3, Math.random() < 0.15);
        }
        lastMove = performance.now(); wake();
      }, { passive: true });
      root.addEventListener("touchmove", function (e) {
        var t = e.touches[0];
        tx = t.clientX; ty = t.clientY;
        lastMove = performance.now(); wake();
      }, { passive: true });
      function lift() { presT = 0; wake(); }
      root.addEventListener("touchend", lift, { passive: true });
      root.addEventListener("touchcancel", lift, { passive: true });
    })();
    /* hold-to-weld: mousedown strikes the arc — an ignition pop, then a
       continuous spatter shower (in fxStep) for as long as the button is
       held; mouseup (or leaving the window) breaks the arc */
    if (FINE) window.addEventListener("mousedown", function (e) {
      /* smart: clicking UI is clicking, not welding — no arc on links,
         buttons, inputs, the nav, the mute pill or the drag-to-scroll
         reviews row. The floating service cards stay weldable: their burns
         anchor to the card and ride its drift. */
      var tEl = e.target;
      if (tEl && tEl.closest && tEl.closest(
        "a, button, [role='button'], input, select, textarea, label, .alp-qa, #alp-rwrap, #alp-nav, #alp-mute")) return;
      weldOn = true; weldT0 = performance.now();
      strike = 0.9 + Math.random() * 1.1;   /* ignition spike varies per strike */
      hitstop = 1;                          /* ~1-frame impact freeze (Vlambeer) */
      sndInit();                            /* user gesture: audio may start here */
      if (snd && SND.on) {
        if (snd.ac.state === "suspended") snd.ac.resume();
        var st0 = snd.ac.currentTime;
        snd.bus.gain.cancelScheduledValues(st0);
        snd.bus.gain.setTargetAtTime(1, st0, 0.04);
        sndPop(st0, 0.9, 700 + Math.random() * 400, 0.09);   /* ignition pop */
        snd.next = st0 + 0.03;
      }
      for (var i = 0; i < 8; i++) {
        var a = Math.random() * 6.283, sp2 = 1 + Math.pow(Math.random(), 0.45) * 4;
        var sN = addSpark(e.clientX, e.clientY, Math.cos(a) * sp2, Math.sin(a) * sp2 - 0.3, Math.random() < 0.15);
        if (sN) {                                      /* strikes run hot: crackle hard */
          var cb2 = Math.random();
          sN.cr = cb2 < 0.4 ? 0 : cb2 < 0.75 ? 1 : 2 + (Math.random() < 0.5 ? 1 : 0);
        }
      }
      lastMove = performance.now();
      wake();
    }, { passive: true });
    if (FINE) window.addEventListener("mouseup", function () { weldOn = false; endBead(); sndRelease(); }, { passive: true });
    if (FINE) window.addEventListener("blur", function () { weldOn = false; endBead(); sndRelease(); });
    if (FINE) document.documentElement.addEventListener("mouseleave", function () { weldOn = false; endBead(); sndRelease(); });
    /* Easter-egg burst: a firework of heavy, carbon-rich sparks */
    window.addEventListener("alp-burst", function (e) {
      var bx = e.detail.x, by = e.detail.y;
      for (var i = 0; i < 44; i++) {
        var a = Math.random() * 6.283, sp2 = 1.5 + Math.pow(Math.random(), 0.4) * 7;
        var sN = addSpark(bx, by, Math.cos(a) * sp2, Math.sin(a) * sp2 - 1.2, Math.random() < 0.3);
        if (sN) sN.cr = Math.random() < 0.6 ? 1 : 2;
      }
      lastMove = performance.now();
      wake();
    });
    function fxStep() {
      var nowT = performance.now();
      var dt = prevT ? nowT - prevT : 16.7;
      prevT = nowT;
      var resumed = dt > 100 || dt <= 0;     /* tab restore / wake from sleep */
      var dtF = resumed ? 1 : Math.min(Math.max(dt / 16.667, 0.5), 2.2);
      var frozen = hitstop > 0;              /* ~20ms hitstop: the strike lands */
      if (frozen) hitstop--;
      strike *= Math.pow(0.5, dtF);          /* ignition flash: a 1-2 frame spike */
      var pox = ox, poy = oy;
      ox = tx; oy = ty; /* pinned dead-on the pointer */
      var mvx = ox - pox, mvy = oy - poy;
      var jump = resumed || Math.abs(mvx) + Math.abs(mvy) > 140;
      if (jump) { pox = ox; poy = oy; mvx = 0; mvy = 0; lvx = 0; lvy = 0; }
      lvx = lvx * 0.7 + mvx * 0.3; lvy = lvy * 0.7 + mvy * 0.3;
      var speed = Math.sqrt(lvx * lvx + lvy * lvy);
      /* emission: one spark per 9px travelled — uniform density along the
         stroke. Each inherits 55–80% of the cursor's velocity inside a
         ±0.3rad cone (high-speed footage shows real sparks launch at the
         emitter's speed — they fly FORWARD, then drag reins them in), plus
         power-curve scatter that clusters energy toward the outside. */
      if (!frozen && !jump && pox > -50) {
        emitAcc += Math.sqrt(mvx * mvx + mvy * mvy);
        var nE = 0;
        while (emitAcc >= 9 && nE < 6) { emitAcc -= 9; nE++; }
        if (emitAcc > 9) emitAcc = 9;        /* never bank a flick's worth of debt */
        var cvx = lvx / dtF, cvy = lvy / dtF;
        for (var k = 0; k < nE; k++) {
          var tt = (k + Math.random()) / nE;
          var inh = 0.55 + Math.random() * 0.25;
          var ja = (Math.random() - 0.5) * 0.6, ca = Math.cos(ja), sa = Math.sin(ja);
          var sc = Math.pow(Math.random(), 0.45) * 1.6, st2 = Math.random() * 6.283;
          addSpark(pox + mvx * tt, poy + mvy * tt,
            (cvx * ca - cvy * sa) * inh + Math.cos(st2) * sc,
            (cvx * sa + cvy * ca) * inh + Math.sin(st2) * sc,
            Math.random() < 0.15);
        }
      }
      /* a resting arc still spits: slow tack-sputter from the weld pool for
         a couple of seconds after the pointer stops, then the loop sleeps */
      if (!frozen && !jump && ox > -50 && presT > 0 && nowT - lastMove > 90 && Math.random() < 0.03 * dtF) {
        var sa2 = Math.random() * 6.283, sv2 = 0.4 + Math.pow(Math.random(), 2) * 1.6;
        addSpark(ox + (Math.random() - 0.5) * 6, oy + (Math.random() - 0.5) * 6,
          Math.cos(sa2) * sv2, Math.sin(sa2) * sv2 - 0.3, false);
      }
      /* active weld: while the button is held the arc is cutting metal.
         Real metal transfer makes a DISCONTINUOUS mode jump (globular ->
         spray, measured 16 -> 414 droplets/s over a 1.4x current rise), so
         the hold ramps ~700ms of sparse fat slow blobs, then snaps into a
         dense shower of small fast sparks. Speed follows the measured
         inverse size law (u ~ 1.3/d): small = fast streak, big = slow blob.
         The fan is an upward umbrella (±~75° around vertical) off the pool. */
      if (weldOn) lastMove = nowT;             /* welding counts as activity */
      if (!frozen && weldOn && ox > -50) {
        var hold = nowT - weldT0;
        var spray = hold > 700;
        var wN = (spray ? 3.4 : 0.5 + hold / 700) * dtF;
        var wI = wN | 0; if (Math.random() < wN - wI) wI++;
        for (var w2 = 0; w2 < wI; w2++) {
          var wa = -1.5708 + (Math.random() - 0.5) * 2.6;
          var big = Math.random() < (spray ? 0.12 : 0.45);
          var ws = big ? 0.8 + Math.random() * 1.4
                       : (spray ? 2.2 : 1.4) + Math.pow(Math.random(), 0.45) * 3.8;
          var wS = addSpark(ox + (Math.random() - 0.5) * 8, oy + (Math.random() - 0.5) * 8,
            Math.cos(wa) * ws, Math.sin(wa) * ws, big);
          if (wS) wS.dk = 1 / (45 + Math.random() * 45);  /* fast pool turnover */
        }
        /* crackle scheduler: ~120ms lookahead impulse train; alternating
           big/small pops (reignition/extinction); gusty hiss bed on top */
        if (snd && SND.on && snd.ac.state === "running") {
          var at = snd.ac.currentTime;
          if (snd.next < at) snd.next = at;
          var iv = spray ? 1 / 55 : 1 / 28, jit = spray ? 0.3 : 1.1;
          while (snd.next < at + 0.12) {
            var pAmp = (snd.big ? 0.5 : 0.18) * (0.7 + Math.random() * 0.6);
            sndPop(snd.next, pAmp, 1300 + Math.random() * Math.random() * 4500,
              0.005 + Math.random() * 0.025);
            snd.big = !snd.big;
            snd.next += iv * (1 + (Math.random() - 0.5) * jit);
          }
          snd.gust += (Math.random() - snd.gust) * 0.18;
          snd.hiss.gain.setTargetAtTime(
            Math.pow(snd.gust, 4) * (spray ? 0.5 : 0.22) + (spray ? 0.05 : 0.02), at, 0.05);
        }
        /* lay the bead: a ripple every 5px of travel; each remembers the
           travel direction so its freeze-line crescent faces back */
        var bn = bead.length ? bead[bead.length - 1] : null;
        if (!bn || bn.b || (ox - bn.x) * (ox - bn.x) + (oy - bn.y) * (oy - bn.y) > 22) {
          var na = (bn && !bn.b) ? Math.atan2(oy - bn.y, ox - bn.x) : Math.atan2(lvy, lvx);
          /* burned INTO the page: each dab anchors to the element under the
             pointer, storing its offset inside that element — scroll the
             page or drag the service cards and the seam rides along */
          var ae = document.elementFromPoint(ox, oy), aex = 0, aey = 0;
          if (ae) { var ar = ae.getBoundingClientRect(); aex = ox - ar.left; aey = oy - ar.top; }
          bead.push({ x: ox, y: oy, sx: ox, sy: oy, el: ae, ex: aex, ey: aey,
            t: nowT, a: na, b: false, w: 1, h: false });
          if (bead.length > 500) bead.shift();
        }
      }
      /* physics pass: strong multiplicative drag (light sparks shed ~10% of
         velocity per frame, heavy ones glide at 0.975–0.99), constant gravity
         and a faint session-constant wind; slow embers flutter in turbulence;
         carbon-rich sparks POP mid-flight — a kick off-course and a ring of
         short-lived gold micro-sparks; high-carbon ones pop more than once */
      if (!frozen) for (var i = sparks.length - 1; i >= 0; i--) {
        var s = sparks[i];
        s.px = s.x; s.py = s.y;
        var dr = 1 - (1 - s.dg) * dtF;       /* frame-rate-corrected drag */
        s.vx = s.vx * dr + WIND * dtF;
        s.vy = s.vy * dr + GRAV * dtF;
        if (s.vx * s.vx + s.vy * s.vy < 1.44) {
          s.vx += (Math.random() - 0.5) * 0.04 * dtF;
          s.vy += (Math.random() - 0.5) * 0.03 * dtF;
        }
        s.x += s.vx * dtF; s.y += s.vy * dtF;
        s.life -= s.dk * dtF;
        s.fk = Math.random() < 0.55 + s.life * 0.3;  /* sputter: solid hot, dashed dying */
        if (s.life <= 0 || s.y > H + 50 || s.x < -60 || s.x > W + 60) { sparks.splice(i, 1); continue; }
        if (s.cr > 0 && s.life < s.ct) {
          s.cr--;
          s.ct = s.life * (0.35 + Math.random() * 0.4);  /* next pop queued lower */
          s.vx += (Math.random() - 0.5) * 2.4;            /* knocked off course */
          s.vy += (Math.random() - 0.5) * 2.4;
          if (s.cr === 0) s.dk = 0.04 + Math.random() * 0.02;  /* spent: dims fast */
          var nb = 6 + (Math.random() * 5 | 0);
          for (var b5 = 0; b5 < nb && sparks.length < CAP; b5++) {
            var ba = Math.random() * 6.283, bs = Math.pow(Math.random(), 0.45) * 2.4;
            sparks.push({ x: s.x, y: s.y, px: s.x, py: s.y,
              vx: Math.cos(ba) * bs + s.vx * 0.25, vy: Math.sin(ba) * bs + s.vy * 0.25,
              life: 1, dk: 1 / (18 + Math.random() * 12),  /* 300–500ms crackle */
              dg: 0.92, r: 0.6 + Math.random() * 0.5, cr: 0, ct: 0, g: true, fk: true });
          }
        }
      }
      /* trail layer: never cleared — faded. destination-out eats alpha
         without painting over the page; the full clear at countdown end
         purges the 1–2/255 ghosts that 8-bit alpha rounding leaves behind */
      tctx.setTransform(FDPR, 0, 0, FDPR, 0, 0);
      if (sparks.length > 0) fadeFrames = 24;
      if (fadeFrames > 0) {
        tctx.globalCompositeOperation = "destination-out";
        tctx.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.82, dtF)).toFixed(3) + ")";
        tctx.fillRect(0, 0, W, H);
        if (sparks.length === 0 && --fadeFrames === 0) tctx.clearRect(0, 0, W, H);
      }
      tctx.globalCompositeOperation = "lighter";
      tctx.lineCap = "round";
      /* draw pass, batched: sparks grouped by tone/alpha/width so the whole
         field renders in a few dozen path ops instead of one per spark —
         keeps the main thread free for the rest of the page. Each segment is
         the spark's TRUE flight path this frame; persistence turns the
         accumulated segments into the streak. Skipped frames (fk) leave the
         dashed sputter real sparks have. Tones ride the measured blackbody
         ramp — red pinned at 255 — and brightness decays separately via life. */
      var buckets = {}, bkey, blist;
      for (i = 0; i < sparks.length; i++) {
        var s4 = sparks[i];
        if (!s4.fk) continue;
        var dxs = s4.x - s4.px, dys = s4.y - s4.py;
        var seg = Math.sqrt(dxs * dxs + dys * dys);
        var al = Math.min(1, s4.life * 1.25) * (0.8 + Math.random() * 0.2);
        al *= Math.min(1, 0.3 + seg * 0.25);   /* slow embers deposit less per frame */
        var aq = (al * 6) | 0;
        if (aq <= 0) continue;
        if (aq > 5) aq = 5;
        var tq = s4.g ? 5 : s4.life > 0.82 ? 0 : s4.life > 0.6 ? 1 : s4.life > 0.38 ? 2 : s4.life > 0.18 ? 3 : 4;
        var wq;
        if (seg > 0.2) {
          var wpx = s4.r * (0.6 + s4.life * 0.6);
          wq = wpx < 1.3 ? 0 : wpx < 2 ? 1 : 2;
        } else wq = 9;
        bkey = tq * 100 + aq * 10 + wq;
        (buckets[bkey] || (buckets[bkey] = [])).push(s4);
      }
      /* vendian.org blackbody: ~6500K, 4000K, 3000K, 2000K, 1000K, + crackle gold */
      var TONES = ["255,248,251", "255,209,163", "255,180,107", "255,137,18", "255,56,0", "255,191,54"];
      var WIDTHS3 = [1, 1.6, 2.4];
      for (bkey in buckets) {
        blist = buckets[bkey];
        var kn = +bkey, tone6 = TONES[(kn / 100) | 0], aq4 = ((kn / 10) | 0) % 10, wq4 = kn % 10;
        var alpha4 = ((aq4 + 0.5) / 6).toFixed(3);
        if (wq4 === 9) {
          tctx.fillStyle = "rgba(" + tone6 + "," + alpha4 + ")";
          tctx.beginPath();
          for (var d4 = 0; d4 < blist.length; d4++) {
            var sd = blist[d4], rr = sd.r * (0.4 + sd.life * 0.6);
            tctx.rect(sd.x - rr, sd.y - rr, rr * 2, rr * 2);
          }
          tctx.fill();
        } else {
          tctx.strokeStyle = "rgba(" + tone6 + "," + alpha4 + ")";
          tctx.lineWidth = WIDTHS3[wq4];
          tctx.beginPath();
          for (var d5 = 0; d5 < blist.length; d5++) {
            var sl = blist[d5];
            tctx.moveTo(sl.px, sl.py);
            tctx.lineTo(sl.x, sl.y);
          }
          tctx.stroke();
          if ((kn / 100 | 0) === 0) {
            /* white-hot trails re-stroke wider at low alpha: the persistent
               layer accumulates it into genuine bloom */
            tctx.strokeStyle = "rgba(255,214,150," + (alpha4 * 0.18).toFixed(3) + ")";
            tctx.lineWidth = WIDTHS3[wq4] + 2;
            tctx.stroke();
          }
        }
      }
      /* main layer: cleared every frame — droplet + white-hot leading cores */
      fctx.setTransform(FDPR, 0, 0, FDPR, 0, 0);
      fctx.clearRect(0, 0, W, H);
      fctx.globalCompositeOperation = "lighter";
      fctx.lineCap = "round";
      /* the bead is a stack of dimes (aluminum AC-TIG). Three layers, per
         reference photos of real beads: (1) the matte frosted cathodic-etch
         HALO flanking the seam; (2) the dimes — SOLID OPAQUE domes of metal
         painted in source-over, oldest first, so every new dab physically
         overlaps the previous one (the scale relief comes from occlusion,
         exactly like real metal — not from glowing outlines); (3) residual
         warmth on dimes that just left the pool. Aluminum never glows red
         (emissivity 0.02-0.06, melts at 660C below visible heat), so the
         metal is mirror silver from the moment it freezes. */
      if (bead.length) {
        while (bead.length && nowT - bead[0].t > 8000) bead.shift();
        /* re-anchor every dab to its element — one getBoundingClientRect per
           unique element per frame (cached on the element). Scrolled or
           dragged content carries its welds; hidden/removed content hides
           them (h flag) until it returns */
        fxN++;
        for (i = 0; i < bead.length; i++) {
          var rp2 = bead[i], ael = rp2.el;
          if (!ael) { rp2.sx = rp2.x; rp2.sy = rp2.y; rp2.h = false; continue; }
          if (ael.__alpF !== fxN) {
            ael.__alpF = fxN;
            ael.__alpR = ael.isConnected ? ael.getBoundingClientRect() : null;
          }
          var ar2 = ael.__alpR;
          if (ar2 && (ar2.width > 0 || ar2.height > 0)) {
            rp2.sx = ar2.left + rp2.ex; rp2.sy = ar2.top + rp2.ey; rp2.h = false;
          } else rp2.h = true;
        }
        /* one shared fade curve per point, 12 quanta — the halo, shadow and
           dimes all multiply the SAME value, so the seam dissolves as a
           single object from its old end */
        var bq = {}, qk;
        for (i = 0; i < bead.length; i++) {
          if (bead[i].h) continue;
          var bage = nowT - bead[i].t;
          var fa = bage > 6000 ? 1 - (bage - 6000) / 2000 : 1;
          if (fa <= 0.04) continue;
          qk = Math.min(11, (fa * 12) | 0);
          (bq[qk] || (bq[qk] = [])).push(i);
        }
        /* frosted etch halo (additive), fading with its bucket */
        fctx.lineWidth = 19;
        for (qk in bq) {
          var qh = +qk === 11 ? 1 : (+qk + 0.5) / 12;
          var hl = bq[qk], hAny = false;
          fctx.strokeStyle = "rgba(212,226,244," + (0.05 * qh).toFixed(4) + ")";
          fctx.beginPath();
          for (var h6 = 0; h6 < hl.length; h6++) {
            var hp = hl[h6];
            if (hp === 0 || bead[hp - 1].b || bead[hp - 1].h) continue;
            fctx.moveTo(bead[hp - 1].sx, bead[hp - 1].sy);
            fctx.lineTo(bead[hp].sx, bead[hp].sy);
            hAny = true;
          }
          if (hAny) fctx.stroke();
        }
        fctx.globalCompositeOperation = "source-over";
        fctx.lineJoin = "round";
        /* (contact/toe shadow removed — no dark band behind the bead) */
        /* the dimes themselves, painted oldest -> newest exactly as they
           froze: each dab is an OPAQUE shingle disc that overlaps the one
           before it. Per shingle, in its own travel-rotated frame:
           (1) a soft crease shadow cast backward onto the previous dab,
           (2) the gradient face (crest-bright -> tucked-under dark),
           (3) a lit rim along the raised freeze-line crest,
           then a light-relative white glint in screen space on crests that
           face the key light. Smooth per-point fade — no alpha banding. */
        for (i = 0; i < bead.length; i++) {
          var pd = bead[i];
          if (pd.h) continue;
          var bage2 = nowT - pd.t;
          var fa2 = bage2 > 6000 ? 1 - (bage2 - 6000) / 2000 : 1;
          if (fa2 <= 0.03) continue;
          var sc = pd.w * 0.92;
          fctx.save();
          fctx.translate(pd.sx, pd.sy);
          fctx.rotate(pd.a);
          fctx.scale(sc * 0.88, sc);              /* dime: wider than long */
          fctx.globalAlpha = fa2 * 0.5;           /* crease onto previous dab */
          fctx.strokeStyle = "rgb(38,43,54)";
          fctx.lineWidth = 1.8;
          fctx.beginPath();
          fctx.arc(0, 0, 6.4, 1.85, 4.43);
          fctx.stroke();
          fctx.globalAlpha = fa2;                 /* the shingle face */
          fctx.fillStyle = dimeFace;
          fctx.beginPath();
          fctx.arc(0, 0, 6, 0, 6.283);
          fctx.fill();
          fctx.globalAlpha = fa2 * 0.75;          /* crest catches the room */
          fctx.strokeStyle = "rgb(230,238,250)";
          fctx.lineWidth = 1.1;
          fctx.beginPath();
          fctx.arc(0, 0, 5.45, 2.0, 4.28);
          fctx.stroke();
          fctx.restore();
          /* key-light glint, screen space: only crests angled up-left spark */
          fctx.globalAlpha = fa2 * 0.85;
          fctx.strokeStyle = "rgb(255,255,255)";
          fctx.lineWidth = 1.2;
          fctx.beginPath();
          fctx.arc(pd.sx - Math.cos(pd.a) * 1.2, pd.sy - Math.sin(pd.a) * 1.2,
            5.1 * sc, -2.6, -1.7);
          fctx.stroke();
        }
        fctx.globalAlpha = 1;
        fctx.globalCompositeOperation = "lighter";
        /* fresh metal: an additive warm wash that drains over ~700ms —
           the only warmth aluminum shows, right behind the pool */
        fctx.strokeStyle = "rgb(255,196,130)";
        fctx.lineWidth = 9;
        for (i = bead.length - 1; i > 0; i--) {
          var wage = nowT - bead[i].t;
          if (wage > 700) break;
          if (bead[i - 1].b || bead[i].h || bead[i - 1].h) continue;
          fctx.globalAlpha = 0.28 * (1 - wage / 700);
          fctx.beginPath();
          fctx.moveTo(bead[i - 1].sx, bead[i - 1].sy);
          fctx.lineTo(bead[i].sx, bead[i].sy);
          fctx.stroke();
        }
        fctx.globalAlpha = 1;
      }
      pres += (presT - pres) * (1 - Math.pow(0.82, dtF));
      if (ox > -50 && pres > 0.015) {
        var ang = Math.atan2(lvy, lvx), st = Math.min(speed * 0.045, 1.6);
        /* arc flicker — one shared value drives core, spill and flare so the
           whole light pulses together. Idle: gentle wander. Welding: the arc
           cyclically extinguishes and restrikes (~50-65Hz short-circuit MIG,
           400% brightness swings) — DEEP flicker with near-dark frames, while
           the molten pool below glows steadily through it all */
        var weldQ = weldOn ? Math.min(1, (nowT - weldT0) / 600) : 0;
        var arcF = weldOn
          ? (Math.random() < 0.12 ? 0.15 + Math.random() * 0.2
                                  : 0.35 + Math.random() * 0.65)
          : 0.78 + Math.random() * 0.22;
        var load = 0.7 + Math.min(speed * 0.03, 0.5) + weldQ * 0.5 + Math.min(strike * 1.6, 1.4);
        poolQ += ((weldOn ? 0.6 + weldQ * 0.4 : 0) - poolQ) * (1 - Math.pow(0.88, dtF));
        if (poolQ > 0.02) {
          fctx.save();
          fctx.translate(ox, oy);
          fctx.globalAlpha = Math.min(1, poolQ * (0.8 + Math.random() * 0.2)) * pres;
          fctx.fillStyle = poolGrad;
          fctx.beginPath(); fctx.arc(0, 0, 26, 0, 6.283); fctx.fill();
          fctx.restore();
        }
        fctx.save();
        fctx.translate(ox, oy);
        /* touch halo first (under the spill), so the blue ring reads clearly
           around the thumb; pulses gently with the same arc flicker */
        if (TOUCHFX) {
          var hsc = 1 + weldQ * 0.2 + strike * 0.3;
          fctx.save();
          fctx.scale(hsc, hsc);
          fctx.globalAlpha = Math.min(1, 0.55 + arcF * 0.45) * pres;
          fctx.fillStyle = haloGrad;
          fctx.beginPath(); fctx.arc(0, 0, 78, 0, 6.283); fctx.fill();
          fctx.restore();
        }
        var gsc = (1 + weldQ * 0.35 + strike * 0.35) * (TOUCHFX ? 1.45 : 1);
        fctx.scale(gsc, gsc);
        fctx.globalAlpha = Math.min(1, arcF * load) * pres;
        fctx.fillStyle = glowGrad;
        fctx.beginPath(); fctx.arc(0, 0, 110, 0, 6.283); fctx.fill();
        fctx.scale(1 + arcF * 0.3, 0.055 / (TOUCHFX ? 1.45 : 1)); /* flare stays horizontal */
        fctx.globalAlpha = Math.min(1, (arcF + strike) * 0.9) * pres;
        fctx.fillStyle = flareGrad;
        fctx.beginPath(); fctx.arc(0, 0, 70, 0, 6.283); fctx.fill();
        fctx.restore();
        hovQ += ((hovMode ? 1 : 0) - hovQ) * (1 - Math.pow(0.85, dtF));
        fctx.save();
        fctx.globalAlpha = arcF * pres;
        var br = (1 + (Math.random() - 0.5) * 0.08) * (1 + hovQ * 0.45 + weldQ * 0.3) * ARCS;
        fctx.translate(ox, oy); fctx.rotate(ang);
        fctx.scale((1 + st) * br, Math.max(1 - st * 0.35, 0.55) * br);
        fctx.fillStyle = dropGrad;
        fctx.beginPath(); fctx.arc(0, 0, 17, 0, 6.283); fctx.fill();
        fctx.restore();
        if (hovQ > 0.02) {
          fctx.save();
          fctx.translate(ox, oy);
          fctx.globalAlpha = hovQ * 0.55 * arcF * pres;
          fctx.strokeStyle = "rgba(190,215,255,.9)";
          fctx.lineWidth = 1;
          fctx.beginPath(); fctx.arc(0, 0, 20 + hovQ * 8, 0, 6.283); fctx.stroke();
          fctx.restore();
        }
      }
      /* a 1px #fff streak over each young spark's colored trail — the
         dual-canvas trick behind convincing white-hot spark heads */
      fctx.strokeStyle = "rgba(255,255,255,0.85)";
      fctx.lineWidth = 1;
      fctx.beginPath();
      for (i = 0; i < sparks.length; i++) {
        var s6 = sparks[i];
        if (s6.life > 0.45 && s6.fk) {
          fctx.moveTo(s6.x, s6.y);
          fctx.lineTo(s6.x - s6.vx * 1.1, s6.y - s6.vy * 1.1);
        }
      }
      fctx.stroke();
      if (performance.now() - lastMove > 2600 && sparks.length === 0 && fadeFrames === 0 && bead.length === 0) {
        fxRun = false;
        if (snd && snd.ac.state === "running") snd.ac.suspend();  /* battery */
        return;
      }
      requestAnimationFrame(fxStep);
    }
  })();

  /* magnetic buttons: CTAs lean toward a near pointer; the existing CSS
     transform transition supplies the damping and the spring back */
  if (FINE) (function () {
    var magEls = Array.prototype.slice.call(document.querySelectorAll(".alp-btn, .alp-call, .alp-nbtn"));
    var magRaf = null;
    window.addEventListener("pointermove", function (e) {
      if (magRaf) return;
      magRaf = requestAnimationFrame(function () {
        magRaf = null;
        for (var i = 0; i < magEls.length; i++) {
          var b = magEls[i], r = b.getBoundingClientRect();
          if (!r.width) continue;
          var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
          var reach = Math.max(r.width, r.height) * 0.5 + 46;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < reach) {
            var pull = 1 - d / reach;
            b.style.transform = "translate(" + (dx * pull * 0.3).toFixed(1) + "px," + (dy * pull * 0.3).toFixed(1) + "px)";
            b.__alpMag = true;
          } else if (b.__alpMag) {
            b.style.transform = "";
            b.__alpMag = false;
          }
        }
      });
    }, { passive: true });
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
    card.__base = baseTilt; // renderFleet uses this to nudge the frosted glass into painting
    /* hover-tilt is a mouse-only affordance. On touch it must NOT bind: a tap
       fires a synthetic mousemove on the tapped card, which would stick
       __hover=true + a scale(1.05) tilt on it — so closing by tapping the SAME
       card leaves it enlarged/tilted (the frost-nudge that restores the flat
       deck pose is gated to !__hover). Touch uses tap-to-pop instead. */
    if (FINE) {
    card.addEventListener("mousemove", function (e) {
      card.__hover = true; // hover drives its own repaint, so the frost nudge stands down
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      inner.style.transform = "perspective(900px) rotateY(" + (px * 9).toFixed(1) + "deg) rotateX(" + (-py * 9).toFixed(1) + "deg) scale(1.05)";
      card.style.zIndex = 9;
    });
    card.addEventListener("mouseleave", function () {
      card.__hover = false;
      inner.style.transform = baseTilt;
      card.style.zIndex = 6;
    });
    }
  });

  // fleet renderer: cards ride one track — in from bottom-right, crest at the
  // screen centre, out bottom-left. Geometry is derived from the LIVE card
  // width so it's right on phones (74vw cards) and desktop (~21vw) alike:
  //  • every card is fully off the left edge before fleetT hits 1, so the
  //    section hands off to the next with a clean screen (both platforms);
  //  • the card nearest centre is painted on TOP, so its title is always fully
  //    readable as the deck scrolls by (phones overlap heavily otherwise);
  //  • on touch, press-and-hold a card to pop it forward (whole card readable),
  //    release drops it back into the deck.
  var fGap = 26, fArc = 141, fOut = 135, fTotal = 348, fCardW = 21,
      fPresX = 13, fPresY = 22, fPresSc = 1.06;
  function computeFleet() {
    if (!svcCardEls.length) return;
    var w0 = svcCardEls[0].offsetWidth || 1, vw = window.innerWidth || 1, vh = window.innerHeight || 1;
    fCardW = w0 / vw * 100;
    var mob = fCardW > 50;                 // phones run wide cards → keep the deck tight
    fGap = mob ? fCardW * 0.46 : fCardW + 1.5; // desktop: cards almost touching (~1.5vw gap)
    fOut = 110 + fCardW + 4;               // s at which a card is fully off the left
    fArc = 120 + fCardW;                   // sine crest lands when the card is centred
    fTotal = (FLEET.length - 1) * fGap + fOut + 4; // +4: trailing card clears before fleetT=1
    FLEET_WHEEL_SPAN = Math.round(fTotal * 9.05);  // keep the per-card scroll effort constant
    fPresX = (100 - fCardW) / 2;           // popped card sits horizontally centred
    var cardHvh = w0 * (1260 / 1140) / vh * 100;
    fPresY = Math.max(6, (100 - cardHvh) / 2 - 9); // lift it toward the upper centre as it pops
    fPresSc = mob ? 1.08 : 1.06;
  }
  /* tap-to-toggle card view (touch): a quick tap pops a card forward to read;
     tap again or tap outside drops it back. Dragging always scrolls the deck,
     so viewing a card never blocks scrolling (no hold gesture to fight). */
  var poppedCard = null, fleetFrozen = false;
  var tapCand = null, tapSX = 0, tapSY = 0, tapMoved = false, tapT0 = 0;
  function openPop(card) {
    if (!card) return;
    if (poppedCard && poppedCard !== card) poppedCard.__popT = 0;
    poppedCard = card; card.__popT = 1;
    fleetFrozen = true; fleetGoal = fleetT; parkedDirty = true;
  }
  function closePop() {
    /* unfreeze immediately — the card finishes easing back into the deck while
       the fleet is free to scroll again, so close-then-drag feels instant. The
       card drops to its normal deck layer (z 50+i) so it sinks back UNDER its
       newer neighbour as it eases home, rather than floating on top. */
    if (poppedCard) { poppedCard.__popT = 0; poppedCard = null; fleetFrozen = false; parkedDirty = true; }
  }
  function resetPop() {
    tapCand = null; tapMoved = false; fleetFrozen = false; poppedCard = null;
    for (var i = 0; i < svcCardEls.length; i++) { svcCardEls[i].__pop = 0; svcCardEls[i].__popT = 0; }
  }
  function renderFleet(vis) {
    if (!fTotal) computeFleet();
    var T = fleetT * fTotal, nowMs = performance.now();
    /* the lifted card = whichever is most popped (the one opening OR easing
       back). The deck dims around it while a card is OPEN. The dim is gated to
       poppedCard (not maxPop): the instant you close, it lifts so the returning
       card sinks home behind an already-opaque newer neighbour — no "shows
       through the faint card on top for a beat, then snaps under" flicker. */
    var maxPop = 0, liftEl = null;
    for (var m = 0; m < svcCardEls.length; m++) {
      var mp = svcCardEls[m].__pop || 0;
      if (mp > maxPop) { maxPop = mp; liftEl = svcCardEls[m]; }
    }
    var dimF = poppedCard ? maxPop : 0;
    for (var i = 0; i < svcCardEls.length; i++) {
      var c = FLEET[i], el = svcCardEls[i];
      var s = T - i * fGap;                 // distance this card has travelled
      var pop = el.__pop || 0;
      if ((s < -28 || s > fOut) && pop < 0.01) {
        if (el.style.opacity !== "0") { el.style.opacity = 0; el.style.pointerEvents = "none"; el.__fk = 0; }
        continue;
      }
      var x = 110 - s;                      // vw: left edge, 110 (off right) → -(cardW) (off left)
      var u = clamp01(s / fArc);
      var bob = Math.sin(nowMs / 1000 * (6.283 / c[4]) + i * 1.9) * 1.3;
      /* arc: a steeper peak than a plain sine. The crest height is unchanged (so
         it still clears the heading) but neighbours fall away faster, lifting the
         centred card clear above the newer card's top edge — its title reads
         without popping. Raising the exponent sharpens the peak further. */
      var arc = Math.pow(Math.sin(Math.PI * u), 4);
      var y = 58 - arc * 34 + c[0] + bob;
      var sc = 0.92 + c[3] * 0.08;
      var pax = (mx - 0.5) * c[3] * -26, pay = (my - 0.5) * c[3] * -16;
      /* blend toward the popped/presented pose (centred, flat, lifted) */
      var tx = x + (fPresX - x) * pop, ty = y + (fPresY - y) * pop, tsc = sc + (fPresSc - sc) * pop, pmul = 1 - pop;
      el.style.transform = "translate(" + tx.toFixed(2) + "vw," + ty.toFixed(2) + "vh) translate("
        + (pax * pmul).toFixed(1) + "px," + (pay * pmul).toFixed(1) + "px) scale(" + tsc.toFixed(3) + ")";
      /* section fade only — the dim goes on .alp-fin below, NOT here. opacity<1 on
         the card (ancestor of the frosted .alp-fin) isolates it into its own group
         and flattens the child's backdrop-filter, so a dimmed card renders CLEAR
         and the frost snaps back when the dim lifts. Keeping the card opaque and
         dimming the frosted face itself preserves the blur the whole way. */
      el.style.opacity = vis.toFixed(3);
      el.style.pointerEvents = "auto";
      /* true deck order: one consistent front-to-back stack (each trailing card
         sits over the one ahead of it), not a centre-on-top peak. Only the card
         that is actively OPEN floats on top (z 200); the instant it's closed it
         drops to its own deck layer, so it sinks back UNDER its newer neighbour
         as it eases home — the newer card is already on top there (z 50+i+1), so
         the returning card slides behind it with no paint-order flip. */
      el.style.zIndex = (el === poppedCard) ? 200 : el.__hover ? 150 : 50 + i;
      var fin = el.querySelector(".alp-fin");
      if (fin) {
        // the deck dims around the lifted card via the frosted face's OWN opacity,
        // so backdrop-filter keeps sampling (see note on el.style.opacity above)
        fin.style.opacity = (el === liftEl ? 1 : (1 - 0.64 * dimF)).toFixed(3);
        if (pop > 0.01) {
          var k = 1 - pop;                  // flatten the glass tilt as it pops up
          fin.style.transform = "perspective(900px) rotateY(" + (c[2] * k).toFixed(2) + "deg) rotateX("
            + (c[5] * k).toFixed(2) + "deg) rotateZ(" + (c[1] * k).toFixed(2) + "deg)";
        } else if (vis > 0.5 && !el.__hover && el.__base != null && !transitioning) {
          /* Chromium won't repaint a card's backdrop-filter until its OWN
             transform changes; nudge .alp-fin every parked frame so the frost
             keeps sampling the headline behind it. Gated to !transitioning — the
             re-raster of 9 frosted cards is the single heaviest per-frame cost,
             and during the section scrub the cards are flying off-screen so a
             stale frost is invisible. This removes the services↔inspections jank. */
          el.__fk = (el.__fk || 0) + 1;
          fin.style.transform = el.__base + ((el.__fk % 2) ? " translateZ(0.04px)" : "");
        }
      }
    }
  }
  computeFleet();
  window.addEventListener("resize", computeFleet);

  Array.prototype.forEach.call(root.querySelectorAll(".alp-qa button"), function (btn) {
    btn.addEventListener("click", function () {
      var qa = btn.parentElement;
      var open = qa.classList.contains("alp-open");
      Array.prototype.forEach.call(root.querySelectorAll(".alp-qa.alp-open"), function (o) {
        o.classList.remove("alp-open"); o.querySelector(".alp-a").style.maxHeight = "0";
        o.querySelector("button").setAttribute("aria-expanded", "false");
      });
      if (!open) {
        qa.classList.add("alp-open");
        btn.setAttribute("aria-expanded", "true");
        var a = qa.querySelector(".alp-a");
        a.style.maxHeight = a.scrollHeight + "px";
      }
    });
  });

  /* nav CTAs: visible from section 2 onward in story mode only */
  function updateNavCtas() {
    nav.classList.toggle("alp-ctas", MODE === "story" && !introActive && cur >= 1);
    var on = nav.classList.contains("alp-ctas");
    Array.prototype.forEach.call(nav.querySelectorAll(".alp-nbtn"), function (b) {
      b.tabIndex = on ? 0 : -1;
    });
  }

  /* estimate modal: our own dark form → emails the workshop (no GHL).
     The "Request sent." confirmation is its own separate popup (#alp-sent). */
  var estOpen = false, sentOpen = false, estPrevFocus = null;
  var estEl = document.getElementById("alp-est");
  var estForm = document.getElementById("alp-est-form");
  var sentEl = document.getElementById("alp-sent");
  var estErr = document.getElementById("alp-est-err");
  var estSending = false;
  function openEst() {
    estEl.hidden = false;
    root.classList.add("alp-modal-open");
    estOpen = true;
    estPrevFocus = document.activeElement;
    document.getElementById("alp-est-x").focus();
    track("estimate_open");
  }
  function closeEst() {
    estEl.hidden = true;
    root.classList.remove("alp-modal-open");
    estOpen = false;
    if (estPrevFocus && estPrevFocus.focus) estPrevFocus.focus();
  }
  function closeSent() {
    sentEl.hidden = true;
    root.classList.remove("alp-modal-open");
    sentOpen = false;
    estForm.reset(); /* fresh form for next time */
    if (estPrevFocus && estPrevFocus.focus) estPrevFocus.focus();
  }
  function estShowErr(msg) { estErr.textContent = msg; estErr.hidden = false; }
  /* submit → email straight to the workshop via Web3Forms (no GHL).
     The form only fires submit once the required fields are valid, so we close
     the form and open the separate "Request sent." popup straight away, sending
     in the background — no stuck button. If the send actually fails, the form
     comes back (with the typed details intact) so the lead isn't lost. */
  estForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (estSending) return;
    estSending = true;
    estErr.hidden = true;
    var fd = new FormData(estForm);
    fd.append("access_key", FORM_KEY);
    fd.append("from_name", "Addept Automotive — Website");
    fd.append("subject", "New estimate request" + (fd.get("rego") ? " — " + fd.get("rego") : ""));
    if (fd.get("email")) fd.append("replyto", fd.get("email"));
    /* close the form popup, open the separate confirmation popup */
    estEl.hidden = true; estOpen = false;
    sentEl.hidden = false; sentOpen = true;
    document.getElementById("alp-sent-x").focus();
    track("estimate_submit");
    fetch(FORM_ENDPOINT, { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!(d && d.success)) throw new Error(d && d.message);
        estSending = false;
        estForm.reset(); /* sent for real — clear it for next time */
        track("estimate_success"); /* true conversion — the email actually went through */
      })
      .catch(function () {
        /* real failure — reopen the form (details still there) with an error */
        sentEl.hidden = true; sentOpen = false;
        estEl.hidden = false; estOpen = true;
        document.getElementById("alp-est-x").focus();
        estShowErr("Hmm, that didn’t go through — please try again, or call us.");
        estSending = false;
        track("estimate_error"); /* send failed — watch this vs estimate_success */
      });
  });
  root.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest(".alp-openest")) { e.preventDefault(); openEst(); }
  });
  document.getElementById("alp-est-x").addEventListener("click", closeEst);
  document.getElementById("alp-est-bg").addEventListener("click", closeEst);
  document.getElementById("alp-sent-x").addEventListener("click", closeSent);
  document.getElementById("alp-sent-bg").addEventListener("click", closeSent);
  /* the modals manage their own scrolling — keep story-mode wheel/touch out */
  ["wheel", "touchstart", "touchmove"].forEach(function (ev) {
    estEl.addEventListener(ev, function (e) { e.stopPropagation(); });
    sentEl.addEventListener(ev, function (e) { e.stopPropagation(); });
  });

  /* idle nudge: parked too long without input → the scroll hint dips once */
  var lastNavT = performance.now(), nudgedFor = -1;
  setInterval(function () {
    if (MODE !== "story" || introActive || transitioning || cur === nudgedFor || cur >= SEC.length - 1) return;
    if (performance.now() - lastNavT > 8000) {
      nudgedFor = cur;
      hint.classList.add("alp-nudge");
      setTimeout(function () { hint.classList.remove("alp-nudge"); }, 1200);
    }
  }, 1500);

  /* loader: rotate witty status lines while the reel buffers */
  (function () {
    var lWit = document.getElementById("alp-lwit");
    if (!lWit) return;
    var lines = ["Rolling the car in…", "Warming up the diagnostics…", "Checking the torque specs…"];
    var li = 0;
    var iv = setInterval(function () {
      if (bursting) { lWit.style.opacity = 0; clearInterval(iv); return; }
      lWit.style.opacity = 0;
      setTimeout(function () {
        li = (li + 1) % lines.length;
        lWit.textContent = lines[li];
        lWit.style.opacity = 1;
      }, 420);
    }, 2100);
  })();

  /* tab-blur title swap */
  (function () {
    var realTitle = document.title;
    document.addEventListener("visibilitychange", function () {
      document.title = document.hidden ? "It won't fix itself." : realTitle;
    });
  })();

  /* Easter egg: triple-click the brand — spark burst + engine rev */
  (function () {
    var brand = document.querySelector("#alp-nav .alp-brand");
    var clicks = 0, lastClick = 0;
    brand.addEventListener("click", function (e) {
      var now = performance.now();
      if (now - lastClick > 600) clicks = 0;
      lastClick = now; clicks++;
      if (clicks >= 3) {
        clicks = 0;
        e.preventDefault(); e.stopPropagation();
        sndRev();
        try {
          window.dispatchEvent(new CustomEvent("alp-burst", { detail: { x: e.clientX, y: e.clientY } }));
        } catch (err) {}
        track("easter_egg");
      }
    });
  })();

  /* single master sound toggle (bottom-right pill), OFF by default — governs
     both the page/UI sounds (SND) and the welding synth (weldSnd). Replaces
     the old nav speaker button; the click is the gesture that unlocks audio. */
  (function () {
    var pill = document.createElement("button");
    pill.id = "alp-mute";
    pill.type = "button";
    function syncPill() {
      pill.textContent = SND.on ? "SOUND ON" : "SOUND OFF";
      pill.setAttribute("aria-pressed", SND.on ? "true" : "false");
    }
    syncPill();
    pill.addEventListener("click", function (e) {
      e.stopPropagation();
      /* only turn OFF when audio is genuinely playing (context running). If it
         reads "on" from a saved preference but the context is still suspended
         (the browser never let it start without a gesture), this click UNLOCKS
         it instead of toggling off — so one press always gets sound, not two. */
      var playing = SND.on && SND.ctx && SND.ctx.state === "running";
      if (playing) {
        SND.on = false;
        if (weldSnd) weldSnd.master.gain.setTargetAtTime(0, weldSnd.ac.currentTime, 0.03);
        stopIntroAudio();
      } else {
        SND.on = true;
        if (weldSnd) weldSnd.master.gain.setTargetAtTime(0.14, weldSnd.ac.currentTime, 0.03);
        sndInit();
        /* start the sounds only AFTER the context is actually running — resume()
           is async, so firing them immediately scheduled against a frozen clock */
        var startSnd = function () {
          sndTick();                          // confirmation tick
          if (loaderPhase) startIntroAudio();  // clicked during the loader → intro/odometer bed
        };
        if (SND.ctx && SND.ctx.state === "suspended") SND.ctx.resume().then(startSnd).catch(startSnd);
        else startSnd();
      }
      track("sound_toggle", { on: SND.on ? 1 : 0 });
      try { localStorage.setItem("alp-sound", SND.on ? "1" : "0"); } catch (err) {}
      syncPill();
    });
    root.appendChild(pill);
    var lastTickEl = null;
    document.addEventListener("pointerover", function (e) {
      if (!e.target.closest) return;
      var el = e.target.closest(".alp-btn, .alp-call, .alp-nbtn, #alp-dots button, .alp-qa button, .alp-rgoog");
      if (el && el !== lastTickEl) sndTick();
      lastTickEl = el;
    }, { passive: true });
    document.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("a, button") && e.target.closest("#alp-mute") === null) sndPress();
    }, { passive: true });
  })();

  // ── Reviews: marquee, drag, stats count-up ─────────────────────────────────
  /* the section lives in the story now — REVCTL lets the tick loop wake the
     marquee and fire the count-up when the visitor arrives at it */
  var REVCTL = { wake: function () {}, stats: function () {} };
  var revIdx = SEC.length - 1;
  (function () {
    var revEl = document.getElementById("alp-reviews");
    var rwrap = document.getElementById("alp-rwrap");
    var rtrack = document.getElementById("alp-rtrack");
    var mqMode = FINE && !REDUCE;
    if (mqMode) {
      revEl.classList.add("alp-mq");
      /* clones make the wrap seamless; hidden from AT and the tab order */
      rtrack.innerHTML += REVIEWS.map(function (r) { return rcard(r, true); }).join("");
    }
    /* reduced motion: default native scroll layout, no marquee, no clones */

    function revVis() { return MODE === "story" && cur === revIdx && !introActive; }

    /* marquee: own sleep/wake rAF, transform-only, modulo wrap at the clone seam */
    var mqRun = false, mqOff = 0, mqHalf = 0, mqPrevT = 0, mqVel = 0;
    var mqHover = false, mqDrag = 0, mqFocus = false; // drag: 0 idle / 1 undecided / 2 dragging
    var MQ_SPEED = 46;
    function mqMeasure() { mqHalf = rtrack.scrollWidth / 2; }
    function mqPaused() { return mqHover || mqDrag === 2 || mqFocus; }
    function mqApply() {
      if (mqHalf > 0) mqOff = ((mqOff % mqHalf) + mqHalf) % mqHalf;
      rtrack.style.transform = "translate3d(" + (-mqOff).toFixed(2) + "px,0,0)";
    }
    function mqStep(ts) {
      if (!mqRun) return;
      if (!revVis() || mqPaused()) { mqRun = false; return; }
      var dt = mqPrevT ? Math.min((ts - mqPrevT) / 1000, 0.05) : 0.016;
      mqPrevT = ts;
      mqOff += (MQ_SPEED + mqVel) * dt;
      mqVel *= Math.pow(0.001, dt);
      mqApply();
      requestAnimationFrame(mqStep);
    }
    function mqWake() {
      if (mqMode && !mqRun && revVis() && !mqPaused()) {
        mqRun = true; mqPrevT = 0;
        if (!mqHalf) mqMeasure();
        requestAnimationFrame(mqStep);
      }
    }
    if (mqMode) {
      window.addEventListener("resize", mqMeasure);
      /* the belt only pauses while the pointer sits on an actual card
         (reading); the gaps and the empty band keep it rolling */
      rwrap.addEventListener("pointerover", function (e) {
        mqHover = !!(e.target.closest && e.target.closest(".alp-rcard"));
        if (!mqHover) mqWake();
      });
      rwrap.addEventListener("mouseleave", function () { mqHover = false; mqWake(); });

      /* drag-to-scroll: commit only on horizontal intent so vertical scrolling
         over the cards keeps feeding the page; capture survives the iframe */
      var dsx = 0, dsy = 0, dOff0 = 0, dLastX = 0, dLastT = 0, dragMoved = false;
      rwrap.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
        mqDrag = 1; dsx = e.clientX; dsy = e.clientY; dOff0 = mqOff; dragMoved = false;
        dLastX = e.clientX; dLastT = performance.now();
        e.preventDefault();
      });
      rwrap.addEventListener("pointermove", function (e) {
        if (!mqDrag) return;
        var dx = e.clientX - dsx, dy = e.clientY - dsy;
        if (mqDrag === 1) {
          if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            mqDrag = 2; rwrap.classList.add("alp-grabbing");
            try { rwrap.setPointerCapture(e.pointerId); } catch (err) {}
          } else if (Math.abs(dy) > 10) { mqDrag = 0; return; }
          else return;
        }
        dragMoved = true;
        mqOff = dOff0 - dx; mqApply();
        var nowT = performance.now();
        if (nowT - dLastT > 0) mqVel = -((e.clientX - dLastX) / (nowT - dLastT)) * 1000 * 0.4;
        dLastX = e.clientX; dLastT = nowT;
      });
      function dragEnd() {
        if (mqDrag === 2) rwrap.classList.remove("alp-grabbing");
        mqDrag = 0; mqWake();
      }
      rwrap.addEventListener("pointerup", dragEnd);
      rwrap.addEventListener("pointercancel", function () { mqVel = 0; dragEnd(); });
      rwrap.addEventListener("click", function (e) {
        if (dragMoved) { e.stopPropagation(); e.preventDefault(); dragMoved = false; }
      }, true);

      /* keyboard: reveal the focused card via the transform (the browser's
         auto-scroll on overflow:hidden would desync the marquee math) */
      rwrap.addEventListener("focusin", function (e) {
        mqFocus = true;
        rwrap.scrollLeft = 0;
        var card = e.target.closest ? e.target.closest(".alp-rcard") : null;
        if (card) {
          var pad = (rwrap.clientWidth - card.offsetWidth) / 2;
          mqOff = Math.max(0, card.offsetLeft - pad); mqApply();
        }
      });
      rwrap.addEventListener("focusout", function () { mqFocus = false; mqWake(); });
    }

    /* stats count-up: fired by the tick loop on arrival at the section */
    var statsDone = REDUCE;
    function runStats() {
      if (statsDone) return;
      statsDone = true;
      var nums = revEl.querySelectorAll(".alp-rnum");
      var t0 = performance.now();
      (function statTick() {
        var q = expoOut(clamp01((performance.now() - t0) / 1300));
        for (var i = 0; i < nums.length; i++) {
          var n = parseFloat(nums[i].getAttribute("data-n"));
          var dec = parseInt(nums[i].getAttribute("data-dec") || "0", 10);
          var v = (n * q).toFixed(dec);
          if (!dec) v = String(Math.round(n * q)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
          nums[i].textContent = v + (q >= 1 ? (nums[i].getAttribute("data-suf") || "") : "");
        }
        if (q < 1) requestAnimationFrame(statTick);
      })();
    }
    if (!statsDone) {
      var nums0 = revEl.querySelectorAll(".alp-rnum");
      for (var z = 0; z < nums0.length; z++) nums0[z].textContent = "0";
    }
    REVCTL.wake = mqWake;
    REVCTL.stats = runStats;

    /* the booking flow section keeps an observer for its video backdrop */
    var bookTracked = false;
    if (typeof IntersectionObserver !== "undefined") {
      var bio = new IntersectionObserver(function (ents) {
        for (var i = 0; i < ents.length; i++) {
          bookVis = ents[i].isIntersecting;
          if (bgVid) { if (bookVis) bgVid.play().catch(function () {}); else bgVid.pause(); }
          if (bookVis && !bookTracked) { bookTracked = true; track("booking_view"); }
        }
      }, { root: root, threshold: 0.06 });
      bio.observe(document.getElementById("alp-flowbody")); // video backs the whole flow now — keep it playing across all of it
    } else { bookVis = true; }
  })();

  /* booking page character: split the flow-page copy into letters and rain each
     in (the services-section effect) as its block scrolls into view. */
  (function setupFlowReveal() {
    var flowBody = document.getElementById("alp-flowbody");
    if (!flowBody) return;
    var SKIP_TAG = { IFRAME: 1, IMG: 1, INPUT: 1, BR: 1, CANVAS: 1, svg: 1, SVG: 1 };
    var SKIP_CLS = ["alp-qn", "alp-qarrow", "alp-cic", "alp-carr"];
    function skipEl(el) {
      if (el.namespaceURI === "http://www.w3.org/2000/svg") return true;
      if (SKIP_TAG[el.tagName]) return true;
      for (var i = 0; i < SKIP_CLS.length; i++) if (el.classList && el.classList.contains(SKIP_CLS[i])) return true;
      return false;
    }
    function split(el) {
      if (!el || el.__rvl) return;
      el.__rvl = true;
      var n = 0;
      (function walk(node) {
        var kids = Array.prototype.slice.call(node.childNodes), i, c;
        for (i = 0; i < kids.length; i++) {
          c = kids[i];
          if (c.nodeType === 3) {
            var t = c.nodeValue;
            if (!t || !/\S/.test(t)) continue;           // leave pure-whitespace nodes alone
            var w = document.createElement("span");        // one wrapper per run so letters
            w.className = "alp-rlw";                        // stay a single flex item (FAQ buttons)
            for (var j = 0; j < t.length; j++) {
              var ch = t.charAt(j);
              if (/\s/.test(ch)) { w.appendChild(document.createTextNode(ch)); continue; }
              var s = document.createElement("span");
              s.className = "alp-rl";
              s.style.setProperty("--d", (((n * 2654435761) % 1000) / 1000).toFixed(3)); // shuffled like rain
              s.textContent = ch; n++;
              w.appendChild(s);
            }
            node.replaceChild(w, c);
          } else if (c.nodeType === 1 && !skipEl(c)) {
            walk(c);
          }
        }
      })(el);
      el.classList.add("alp-rvl");
    }
    /* the prominent, always-visible copy — headings, eyebrows, leads, FAQ
       questions, contact details, hours, footer. (Accordion answers are left
       out so a closed FAQ can never leave hidden letters behind.) */
    var sel = ".alp-heroh,.alp-h2,.alp-eyebrow,.alp-lead,.alp-qa button,.alp-cplate,.alp-fcopy,.alp-fnav a,.alp-fsoc a";
    var els = Array.prototype.slice.call(flowBody.querySelectorAll(sel));
    els.forEach(split);
    if (REDUCE || typeof IntersectionObserver === "undefined") {
      els.forEach(function (el) { el.classList.add("alp-in"); });   // no scroll-reveal — just show
      return;
    }
    /* populate on the way in, de-populate once a block is fully off-screen (the
       reset is never seen), so it re-animates every time you scroll back to it.
       Hysteresis between the two thresholds stops edge flicker. */
    var rio = new IntersectionObserver(function (ents) {
      for (var i = 0; i < ents.length; i++) {
        var e = ents[i];
        if (e.intersectionRatio >= 0.18) e.target.classList.add("alp-in");
        else if (e.intersectionRatio <= 0.001) e.target.classList.remove("alp-in");
      }
    }, { root: root, threshold: [0, 0.18] });
    els.forEach(function (el) { rio.observe(el); });
  })();

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

  /* Hero entrance: every element arrives on its own vector. Headline lines
     slide in from alternating sides with a touch of rotation while their words
     do a short masked rise; the eyebrow drops from above; the lead is pushed
     in from the viewer through a blur; the buttons are pulled in from below
     with an overshoot; the ticks rise last. Scrub-driven and exactly settled
     at q=1 like every other channel. */
  function styleHeroFx(q) {
    var n = heroLns.length, st = Math.min(0.11, 0.38 / Math.max(n - 1, 1));
    for (var k = 0; k < n; k++) {
      var lk = expoOut(clamp01((q - 0.12 - k * st) / 0.5));
      var dir = k % 2 ? 1 : -1;
      var ls = heroLns[k].style;
      ls.opacity = lk.toFixed(3);
      ls.transform = "translateX(" + (dir * (1 - lk) * 7).toFixed(2) + "vw) rotate(" + (dir * (1 - lk) * 2.2).toFixed(2) + "deg)";
      var ws = heroLnWords[k];
      for (var w2 = 0; w2 < ws.length; w2++) {
        var wr = expoOut(clamp01((q - 0.12 - k * st - w2 * 0.02) / 0.42));
        ws[w2].style.transform = "translateY(" + ((1 - wr) * 70).toFixed(1) + "%)";
      }
    }
    var copy = secCopy[0];
    for (var c2 = 0; c2 < copy.length; c2++) {
      var el2 = copy[c2], cl = el2.className, s3 = el2.style;
      if (cl.indexOf("alp-eyebrow") !== -1) {
        var e0 = expoOut(clamp01(q / 0.42));
        s3.opacity = e0.toFixed(3);
        s3.transform = "translateY(" + ((1 - e0) * -2.4).toFixed(2) + "em) scale(" + (0.92 + 0.08 * e0).toFixed(3) + ")";
        s3.filter = blurPx((1 - e0) * 6);
      } else if (cl.indexOf("alp-lead") !== -1) {
        var l1 = expoOut(clamp01((q - 0.55) / 0.4));
        s3.opacity = l1.toFixed(3);
        s3.transform = "scale(" + (1.1 - 0.1 * l1).toFixed(3) + ") translateY(" + ((1 - l1) * 0.4).toFixed(3) + "em)";
        s3.filter = blurPx((1 - l1) * 8);
      } else if (cl.indexOf("alp-btnrow") !== -1) {
        var bq = clamp01((q - 0.64) / 0.36), b1 = backOut(bq);
        s3.opacity = Math.min(1, bq * 2.5).toFixed(3);
        s3.transform = "translateY(" + ((1 - b1) * 1.6).toFixed(3) + "em) scale(" + (0.82 + 0.18 * b1).toFixed(3) + ")";
        s3.filter = "";
      } else if (cl.indexOf("alp-ticks") !== -1) {
        var t1 = expoOut(clamp01((q - 0.78) / 0.22));
        s3.opacity = t1.toFixed(3);
        s3.transform = "translateY(" + ((1 - t1) * 1.2).toFixed(3) + "em)";
        s3.filter = "";
      } else {
        var d1 = expoOut(clamp01((q - 0.6) / 0.4));
        s3.opacity = d1.toFixed(3);
        s3.transform = "translateY(" + ((1 - d1) * 0.6).toFixed(3) + "em)";
        s3.filter = blurPx((1 - d1) * 6);
      }
    }
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
    /* the section frame slides into place on a quick ease-out (~the video move)
       so it is fully settled BEFORE the headline populates — you then watch the
       letters write in on the slower word clock, rather than the block still
       sliding while the text is already half-done. Hero keeps its bespoke
       entrance; exits stay on the video-coupled exit curve. */
    var posQ = (i === 0 || exitQ > 0) ? enterQ : expoOut(clamp01((performance.now() - entT0) / 900));
    var dx = s.enter[0] * (1 - posQ) + s.exit[0] * exitQ;
    var dy = s.enter[1] * (1 - posQ) + s.exit[1] * exitQ;
    inner.style.transform = "translate(" + dx.toFixed(2) + "vw," + dy.toFixed(2) + "vh)";
    /* the staggered word/copy exit is the fade — the block itself only lets go
       at the very end, otherwise the choreography would leave half-transparent */
    inner.style.opacity = exitQ > 0 ? (1 - expoIn(exitQ)).toFixed(3) : 1;

    if (i === 0 && exitQ <= 0) {
      /* hero arrival: boxes/hairlines/floats ride the generic channels while
         the headline lines, copy and buttons fly their own vectors */
      styleTextFx([], [], secLines[i], secBoxes[i], secFloats[i], enterQ, exitQ, 0, "mask");
      styleHeroFx(enterQ);
      /* line wrappers hold identity on exit, so the generic exit stays clean */
    } else {
      var fx = i === 0 ? "mask" : tuneFor(i).fx;
      if (i !== 0) {
        el.classList.toggle("alp-ltsec", fx !== "mask");
        el.classList.toggle("alp-ltopen", !!FX_OPEN[fx]);
      }
      styleTextFx(fx === "mask" ? secHeadsW[i] : secHeadsCh[i], secCopy[i], secLines[i], secBoxes[i], secFloats[i], enterQ, exitQ,
        s.enter[0] > 0 ? 1 : s.enter[0] < 0 ? -1 : 0, fx);
    }
    if (s.svc) {
      showSvcLayer(enterQ, exitQ, vis, dx, dy);
      renderFleet(vis);
    }
  }

  var lastTs = null, parkedDirty = true;

  /* far dot jump: cross-dissolve the current frame + section straight into the
     target's — no scrub-through, no black flash. Both are drawn fully settled
     and their opacities are crossfaded by the eased transition progress. */
  function renderJump() {
    var jdis = easeIO(Math.min(tT / tDur, 1));
    scrubStrideNow = 1;
    var jfi = Math.round(tFrom / 100 * (TOTAL_FRAMES - 1));
    var jti = Math.round(tTo / 100 * (TOTAL_FRAMES - 1));
    tendBitmaps(jti);
    var jf = getDrawable(jfi), jt = getDrawable(jti);
    if (jf.img) drawImageCover(jf.img);
    if (jt.img) { ctx.globalAlpha = jdis; drawImageCover(jt.img); ctx.globalAlpha = 1; }
    drawnFrame = -1;
    dim.style.background = grade(lerp(tFrom, tTo, jdis));
    glow.style.opacity = "0";
    canvas.style.transform = "";
    for (var i = 0; i < SEC.length; i++) {
      if (i === toIdx) {
        /* destination section plays its normal per-letter entrance (entQFor /
           svc clock) over the video crossfade — same effect as a scroll arrival */
        styleSectionState(i, entQFor(i), 0);
      } else {
        if (secEls[i].style.visibility !== "hidden") { secEls[i].style.opacity = 0; secEls[i].style.visibility = "hidden"; }
        if (i === svcIdx) hideSvcLayer();
      }
    }
    for (var an = 0; an < ANNOS.length; an++) if (annoEls[an].style.opacity !== "0") annoEls[an].style.opacity = 0;
    for (var g = 0; g < GHOSTS.length; g++) if (ghostEls[g].style.opacity !== "0") ghostEls[g].style.opacity = 0;
    hint.style.opacity = 0;
    var jflow = toIdx === -2;                 // entering booking — the HUD fades out
    dots.style.opacity = jflow ? 0 : 1; dots.style.pointerEvents = jflow ? "none" : "auto"; count.style.opacity = jflow ? 0 : 1;
    for (var j = 0; j < dotEls.length; j++) dotEls[j].className = (j === toIdx) ? "alp-on" : "";
  }

  function render(p, force) {
    if (jumpMode) { renderJump(); return; }
    var fpos = Math.min(Math.max((p / 100) * (TOTAL_FRAMES - 1), 0), TOTAL_FRAMES - 1);
    scrubStrideNow = scrubStride();
    var i0 = Math.floor(fpos), i1 = Math.min(i0 + 1, TOTAL_FRAMES - 1);
    var fa = fpos - i0;
    if (scrubStrideNow > 1) {
      /* quantise to the stride grid: every paint lands on a prepared bitmap */
      i0 -= i0 % scrubStrideNow;
      if (i0 > TOTAL_FRAMES - 1) i0 = TOTAL_FRAMES - 1;
      fa = 0;
    }
    tendBitmaps(scrubStrideNow > 1 ? i0 : Math.round(fpos));
    var dkey = scrubStrideNow > 1 ? i0 * 64 : (fpos * 64) | 0;
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
        if (i === fromIdx) styleSectionState(i, 1, ease(clamp01(tq / tuneFor(toIdx).txtExit)));
        else if (i === toIdx) styleSectionState(i, i === svcIdx ? ease(clamp01((tq - tuneFor(toIdx).txtStart) / Math.max(0.05, 1 - tuneFor(toIdx).txtStart))) : entQFor(i), 0);
        else {
          if (secEls[i].style.visibility !== "hidden") { secEls[i].style.opacity = 0; secEls[i].style.visibility = "hidden"; }
          if (i === svcIdx) hideSvcLayer();
        }
      } else if (i === cur && MODE === "story" && !introActive) {
        styleSectionState(i, entQFor(i), 0);
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
      ael.style.width = Math.max(br[0] - tl[0] + (a.padR || 0), 20).toFixed(1) + "px";
      ael.style.height = Math.max(br[1] - tl[1], 20).toFixed(1) + "px";
    }

    for (var g = 0; g < GHOSTS.length; g++) {
      var gh = GHOSTS[g], gel = ghostEls[g];
      var gq = (p - gh[1]) / (gh[2] - gh[1]);
      if (gq < -0.1 || gq > 1.1) { if (gel.style.opacity !== "0") gel.style.opacity = 0; continue; }
      gel.style.opacity = Math.sin(Math.PI * clamp01(gq)).toFixed(3);
      gel.style.transform = "translate(" + ((1 - gq) * 110 - 55).toFixed(2) + "vw,-50%)";
    }

    /* the HUD fades as the booking page rides over the film */
    var inFlow = MODE === "flow" || bridgeT > 0.08;
    /* crossfade the booking video with the film. Fully in booking (flow) = 1.
       During the bridge ride it tracks bridgeT so that scrolling UP fades the
       video out — the reviews reappear by the time the booking heading is about
       mid-screen (bridgeT ~0.5) rather than only at the very top. */
    if (bookbgEl) {
      var bo = (MODE === "flow" ? 1 : clamp01((bridgeT - 0.28) / 0.42)).toFixed(3);
      if (bookbgEl.style.opacity !== bo) bookbgEl.style.opacity = bo;
    }
    /* mobile: each time a new section lands, hide the scroll hint for 5s, then
       wake the loop once so it can fade in */
    if (IS_MOBILE && cur !== hintPrevCur) {
      hintPrevCur = cur;
      hintHoldUntil = performance.now() + 5000;
      setTimeout(function () { parkedDirty = true; }, 5060);
    }
    /* re-center the reviews footer once its section has landed and settled */
    if (cur !== rfootPrevCur) {
      rfootPrevCur = cur;
      if (cur === revIdx) { setTimeout(centerReviewFoot, 90); setTimeout(centerReviewFoot, 780); }
    }
    var hintHeld = IS_MOBILE && performance.now() < hintHoldUntil;
    hint.style.opacity = (inFlow || transitioning || hintHeld) ? 0 : 0.6;
    dots.style.opacity = inFlow ? 0 : 1;
    dots.style.pointerEvents = inFlow ? "none" : "auto";
    count.style.opacity = inFlow ? 0 : 1;
    for (var j = 0; j < dotEls.length; j++) dotEls[j].className = (j === cur && !inFlow) ? "alp-on" : "";
  }

  var cwheel = cnum.querySelector(".alp-cw span");
  function setCounter(idx) {
    cwheel.style.transform = "translateY(-" + (idx * 1.25).toFixed(2) + "em)";
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
        /* jumpMode cross-dissolves straight to the target (handled in render);
           pNow holds the destination so grade/ghosts/etc never scrub through */
        pNow = jumpMode ? tTo : lerp(tFrom, tTo, q);
        /* finish the fleet's exit as we leave services: drive the deck to its
           end (in the scroll direction) so the trailing card slides fully off
           screen during the handoff instead of freezing/fading mid-screen */
        if (fromIdx === svcIdx) {
          var fEnd = scrollDir > 0 ? 1 : 0;
          fleetT += (fEnd - fleetT) * 0.22;
          if (Math.abs(fEnd - fleetT) < 0.002) fleetT = fEnd;
        }
        needs = true;
        if (tT >= tDur) {
          transitioning = false;
          jumpMode = false;
          if (toIdx === -2) finishEnterFlow();
          else {
            cur = toIdx; setCounter(cur); setHash(HASHES[SEC[cur].id]);
            track("section_view", { section_id: SEC[cur].id });
            if (cur === revIdx) { REVCTL.wake(); REVCTL.stats(); track("story_complete"); }
          }
          updateNavCtas();
          cooldownUntil = performance.now() + 420;
        }
      } else if (MODE === "story" && cur === svcIdx) {
        // fleet travel: lerp toward the scroll-driven goal (frozen while a card
        // is popped); parallax tracks the mouse
        if (!fleetFrozen) {
          fleetT += (fleetGoal - fleetT) * 0.09;
          if (Math.abs(fleetGoal - fleetT) < 0.0004) fleetT = fleetGoal;
        }
        // pop animation: ease each card toward its popped/settled target
        for (var pci = 0; pci < svcCardEls.length; pci++) {
          var pce = svcCardEls[pci], ptt = pce.__popT || 0, pvv = pce.__pop || 0;
          if (Math.abs(ptt - pvv) > 0.002) pce.__pop = pvv + (ptt - pvv) * 0.22;
          else pce.__pop = ptt;
        }
        cline.style.transform = "scaleX(" + ((cur + Math.max(fleetT, 0.04)) / SEC.length).toFixed(3) + ")";
        needs = true;
      } else if (MODE === "story" && cur === revIdx && !introActive && (bridgeGoal !== bridgeT || bridgeT > 0)) {
        // bridge ride: the booking page slides over the film, scroll-driven
        bridgeT += (bridgeGoal - bridgeT) * 0.18;
        if (Math.abs(bridgeGoal - bridgeT) < 0.0006) bridgeT = bridgeGoal;
        pNow = lerp(SEC[revIdx].stop, 100, bridgeT);
        root.scrollTop = Math.round(bridgeT * spacerH);
        needs = true;
        if (bridgeGoal >= 1 && bridgeT > 0.995) finishBridge();
      } else if (MODE === "story" && cur === entFor && cur !== svcIdx && performance.now() - entT0 < tuneFor(entFor).wordMs + tuneFor(entFor).wordDelay + 120) {
        needs = true; // text entrance clock still playing after the video parked
      } else if (MODE === "flow" && flowReady && root.scrollTop < spacerH - 8) {
        /* safety net: a fast/momentum scroll-up can carry past the spacer edge
           with no wheel/touch event left to trigger the handback, stranding us
           in flow over the bare film. Hand back to the reviews bridge here. */
        startBridgeBack();
        needs = true;
      }
      if (needs || parkedDirty) { parkedDirty = false; render(pNow, false); }
    } catch (e) { /* loop must survive */ }
  })();

  /* keep "Read all reviews on Google" centered in the gap between the bottom of
     the review cards and the top of the scroll indicator, on any viewport */
  var rfootWrap = document.getElementById("alp-rfoot-wrap");
  var rwrapForFoot = document.getElementById("alp-rwrap");
  function centerReviewFoot() {
    if (!rfootWrap || !rwrapForFoot || !hint) return;
    var cardBottom = rwrapForFoot.getBoundingClientRect().bottom;
    var hintTop = hint.getBoundingClientRect().top;
    if (!cardBottom || !hintTop || hintTop <= cardBottom + 1) return; // reviews not on screen / not settled
    var fr = rfootWrap.getBoundingClientRect();
    if (!fr.height) return;
    var footCenter = fr.top + fr.height / 2;
    var gapCenter = (cardBottom + hintTop) / 2 - 2; // sit 2px above dead-center
    var next = (rfootWrap.__ty || 0) + (gapCenter - footCenter);
    rfootWrap.__ty = next;
    rfootWrap.style.transform = "translateY(" + next.toFixed(1) + "px)";
  }

  window.addEventListener("resize", function () { drawnFrame = -1; parkedDirty = true; measureSpacerH(); centerReviewFoot(); });

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  try { history.scrollRestoration = "manual"; } catch (e) {}
  root.scrollTop = 0;

  render(pNow, true);

})();
