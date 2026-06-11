/* Addept Automotive — scroll-scrub landing experience (v4 "smooth" engine).
   Injects a fixed fullscreen scroll container over the host page (works standalone
   and pasted into GoHighLevel via <script src=".../embed.js">).

   v4 performance contract:
   - the rAF loop can never die (scheduled first, body in try/catch)
   - frames are pre-decoded into a sliding ImageBitmap window around the current
     frame, so drawing never triggers a synchronous JPEG decode mid-scroll
   - no backdrop-filter anywhere (it forces re-blurs of moving video every frame)
   - no animated CSS filters on text; no per-frame getBoundingClientRect
   - devicePixelRatio capped; per-chapter work skipped when invisible */
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
  var SCRUB_VH = 1300;
  var SMOOTH = 0.085;
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
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ── Styles ─────────────────────────────────────────────────────────────────
  var css = ""
  + "#alp-root{position:fixed;inset:0;overflow-y:auto;overflow-x:hidden;background:#000;z-index:999990;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;color:#fff;}"
  + ":where(#alp-root) *,:where(#alp-root) *::before,:where(#alp-root) *::after{box-sizing:border-box;margin:0;padding:0;}"
  + "#alp-canvas{position:fixed;inset:0;width:100vw;height:100vh;z-index:0;transform-origin:50% 60%;will-change:transform;}"
  + ".alp-vignette{position:fixed;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse 85% 75% at 50% 45%,transparent 35%,rgba(0,0,0,.6) 100%);}"
  + "#alp-dim{position:fixed;inset:0;pointer-events:none;z-index:2;will-change:opacity;}"
  + "#alp-glow{position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;box-shadow:inset 0 0 140px 10px rgba(255,166,77,.5),inset 0 0 60px 4px rgba(255,120,40,.28);will-change:opacity;}"
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
  + ".alp-anno .alp-alabel.bottom{top:calc(100% + 12px);}"
  + ".alp-anno .alp-aline{position:absolute;left:24px;width:1px;background:rgba(255,255,255,.3);height:12px;}"
  + ".alp-anno .alp-aline.top{bottom:100%;}"
  + ".alp-anno .alp-aline.bottom{top:100%;}"
  + "@media (max-width:900px){.alp-anno{display:none;}}"
  /* chapters */
  + ".alp-section{position:fixed;inset:0;z-index:10;display:flex;align-items:center;pointer-events:none;opacity:0;visibility:hidden;will-change:transform,opacity;}"
  + ".alp-section.alp-top{align-items:flex-start;}"
  + ".alp-section.alp-top .alp-inner{padding-top:max(13vh,100px);}"
  + ".alp-section .alp-inner{pointer-events:auto;}"
  + ".alp-w{display:inline-block;}"
  /* loading */
  + "#alp-loader{position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:#000;transition:opacity .5s ease;}"
  + "#alp-loader img{width:74px;height:74px;border-radius:50%;animation:alp-pulse 1.6s ease-in-out infinite;}"
  + "@keyframes alp-pulse{0%,100%{opacity:.45}50%{opacity:1}}"
  + "#alp-loadbar{width:150px;height:3px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;}"
  + "#alp-loadbar div{height:100%;width:0;background:rgba(255,255,255,.35);border-radius:99px;transition:width .3s ease;}"
  /* nav */
  + "#alp-nav{position:fixed;top:0;left:0;right:0;z-index:30;display:flex;align-items:center;justify-content:space-between;padding:18px 32px;will-change:opacity;}"
  + "#alp-nav .alp-brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:#fff;}"
  + "#alp-nav .alp-brand img{width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.2);}"
  + "#alp-nav .alp-brand span{font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.9);}"
  + "#alp-nav a.alp-call{padding:9px 20px;border-radius:99px;border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.8);font-size:13px;font-weight:600;text-decoration:none;background:rgba(10,10,10,.45);transition:background .2s,color .2s;white-space:nowrap;}"
  + "#alp-nav a.alp-call:hover{background:rgba(255,255,255,.16);color:#fff;}"
  /* dots */
  + "#alp-dots{position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:30;display:flex;flex-direction:column;gap:9px;transition:opacity .4s;}"
  + "#alp-dots button{position:relative;display:flex;align-items:center;justify-content:flex-end;background:none;border:none;cursor:pointer;padding:2px;}"
  + "#alp-dots button i{display:block;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.2);transition:all .3s;}"
  + "#alp-dots button.alp-on i{width:8px;height:8px;background:rgba(255,255,255,.85);}"
  + "#alp-dots button span{position:absolute;right:18px;padding:2px 8px;border-radius:5px;font-size:9px;color:rgba(255,255,255,.65);background:rgba(0,0,0,.7);opacity:0;transition:opacity .2s;white-space:nowrap;pointer-events:none;}"
  + "#alp-dots button:hover span{opacity:1;}"
  /* type */
  + ".alp-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:5px 13px;border-radius:99px;border:1px solid rgba(255,255,255,.12);background:rgba(10,10,10,.55);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:22px;}"
  + ".alp-h1{font-weight:800;line-height:1.04;letter-spacing:-.035em;font-size:clamp(2.6rem,7vw,5rem);}"
  + ".alp-h2{font-weight:800;line-height:1.07;letter-spacing:-.03em;font-size:clamp(1.9rem,4.5vw,3rem);}"
  + ".alp-lead{margin-top:18px;color:rgba(255,255,255,.58);line-height:1.65;font-size:clamp(.98rem,1.8vw,1.2rem);max-width:30em;}"
  + ".alp-ticks{margin-top:26px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;font-size:11px;letter-spacing:.05em;color:rgba(255,255,255,.38);}"
  + ".alp-ticks span{display:inline-flex;align-items:center;gap:6px;}"
  + ".alp-ticks svg{width:12px;height:12px;}"
  /* buttons */
  + ".alp-btn{display:inline-flex;align-items:center;gap:10px;padding:14px 30px;border-radius:99px;font-size:14px;font-weight:700;letter-spacing:.02em;text-decoration:none;cursor:pointer;border:none;transition:transform .2s,background .2s;}"
  + ".alp-btn-light{background:#fff;color:#000;box-shadow:0 18px 50px rgba(0,0,0,.35);}"
  + ".alp-btn-light:hover{transform:scale(1.03);background:rgba(255,255,255,.92);}"
  + ".alp-btn-ghost{background:rgba(20,20,20,.55);color:#fff;border:1px solid rgba(255,255,255,.22);}"
  + ".alp-btn-ghost:hover{background:rgba(255,255,255,.18);}"
  + ".alp-btnrow{margin-top:30px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;}"
  /* filmstrip */
  + "#alp-striphead{position:absolute;top:max(13vh,90px);left:7vw;right:7vw;}"
  + "#alp-strip{position:absolute;left:0;right:0;top:54%;transform:translateY(-50%);}"
  + "#alp-striptrack{display:flex;gap:18px;padding:0 7vw;will-change:transform;width:max-content;}"
  + ".alp-scard{width:330px;flex-shrink:0;padding:26px 24px;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:rgba(8,8,8,.8);}"
  + ".alp-scard .alp-snum{font-size:10px;letter-spacing:.25em;color:rgba(255,255,255,.3);margin-bottom:14px;}"
  + ".alp-scard h3{font-size:17px;font-weight:700;letter-spacing:-.01em;color:rgba(255,255,255,.95);}"
  + ".alp-scard p{margin-top:9px;font-size:13px;line-height:1.6;color:rgba(255,255,255,.5);}"
  /* hours */
  + ".alp-hours{margin:30px auto 0;max-width:380px;width:100%;}"
  + ".alp-hours div{display:flex;justify-content:space-between;gap:24px;padding:11px 4px;border-bottom:1px solid rgba(255,255,255,.08);font-size:14px;}"
  + ".alp-hours div:last-child{border-bottom:none;}"
  + ".alp-hours b{color:rgba(255,255,255,.85);font-weight:600;}"
  + ".alp-hours span{color:rgba(255,255,255,.45);}"
  /* scroll cue */
  + "#alp-hint{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:20;display:flex;align-items:center;gap:8px;padding:7px 16px;border-radius:99px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.6);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.45);transition:opacity .4s;will-change:opacity;}"
  + "#alp-hint svg{width:13px;height:13px;animation:alp-bounce 1.6s infinite;}"
  + "@keyframes alp-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}"
  /* flow content */
  + "#alp-flow{position:relative;z-index:12;}"
  + "#alp-flowfade{height:26vh;background:linear-gradient(to bottom,rgba(5,5,5,0),#050505);}"
  + "#alp-flowbody{background:#050505;}"
  + ".alp-fsec{max-width:1040px;margin:0 auto;padding:70px 24px;}"
  + ".alp-fhead{text-align:center;margin-bottom:40px;}"
  + ".alp-fhead .alp-lead{margin-left:auto;margin-right:auto;}"
  + "#alp-calcard{background:#fff;border-radius:18px;padding:10px;box-shadow:0 30px 80px rgba(0,0,0,.5);min-height:600px;}"
  + "#alp-calcard iframe{width:100%;min-height:600px;border:none;border-radius:12px;display:block;}"
  /* faq */
  + ".alp-faq{max-width:760px;margin:0 auto;}"
  + ".alp-qa{border:1px solid rgba(255,255,255,.08);border-radius:14px;margin-bottom:10px;overflow:hidden;background:rgba(255,255,255,.02);}"
  + ".alp-qa button{width:100%;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 20px;background:none;border:none;color:rgba(255,255,255,.88);font-size:15px;font-weight:600;font-family:inherit;text-align:left;cursor:pointer;}"
  + ".alp-qa button svg{width:16px;height:16px;flex-shrink:0;transition:transform .25s;color:rgba(255,255,255,.4);}"
  + ".alp-qa.alp-open button svg{transform:rotate(180deg);}"
  + ".alp-qa .alp-a{max-height:0;overflow:hidden;transition:max-height .3s ease;}"
  + ".alp-qa .alp-a p{padding:0 20px 18px;font-size:14px;line-height:1.65;color:rgba(255,255,255,.5);}"
  /* contact */
  + ".alp-contact{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:900px;margin:0 auto;}"
  + ".alp-cbox{padding:26px 22px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);text-align:center;}"
  + ".alp-cbox .alp-clabel{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:10px;}"
  + ".alp-cbox a{color:#fff;text-decoration:none;font-size:15px;font-weight:600;line-height:1.5;}"
  + ".alp-cbox a:hover{text-decoration:underline;}"
  + ".alp-cbox p{color:rgba(255,255,255,.6);font-size:13px;line-height:1.7;}"
  + ".alp-footer{padding:36px 24px 46px;text-align:center;color:rgba(255,255,255,.25);font-size:12px;border-top:1px solid rgba(255,255,255,.06);margin-top:30px;}"
  /* layout */
  + ".alp-left{padding-left:7vw;padding-right:5vw;max-width:760px;}"
  + ".alp-center{margin:0 auto;text-align:center;padding:0 6vw;max-width:820px;}"
  + ".alp-center .alp-lead{margin-left:auto;margin-right:auto;}"
  /* mobile */
  + "@media (max-width:760px){"
  +   "#alp-nav{padding:14px 16px;}"
  +   "#alp-nav .alp-brand span{display:none;}"
  +   "#alp-dots{display:none;}"
  +   ".alp-left,.alp-center{padding-left:22px;padding-right:22px;text-align:left;max-width:100%;}"
  +   ".alp-center .alp-lead{margin-left:0;}"
  +   ".alp-hours{margin-left:0;}"
  +   ".alp-scard{width:76vw;padding:20px;}"
  +   ".alp-contact{grid-template-columns:1fr;}"
  +   ".alp-fsec{padding:48px 16px;}"
  +   "#alp-striphead{left:22px;right:22px;}"
  + "}";

  // ── Content ────────────────────────────────────────────────────────────────
  var check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  var SERVICES = [
    ["Service & Routine Maintenance", "Oil changes, tyre rotations, fluid checks and filter replacements."],
    ["Brake Services", "Inspection, repair and replacement of brake pads, rotors and fluid."],
    ["Engine Diagnostics & Repair", "Identifying and fixing engine issues, including tune-ups."],
    ["Transmission Services", "Transmission fluid changes, repair and replacement."],
    ["Suspension & Steering", "Repair and maintenance of shocks, struts and steering components."],
    ["Exhaust System Repairs", "Mufflers, catalytic converters and exhaust pipes — repaired or replaced."],
    ["Auto Electrical", "Battery test & replacement, alternator replacement and professional electrical troubleshooting."],
    ["WOF Repairs", "We don't do the WOF test itself — but we're fully equipped to fix any fails you've encountered."]
  ];
  var stripCards = SERVICES.map(function (s, i) {
    return '<div class="alp-scard"><div class="alp-snum">0' + (i + 1) + '</div><h3>' + s[0] + "</h3><p>" + s[1] + "</p></div>";
  }).join("");

  var FAQS = [
    ["How often should I get my car serviced?", "Regular maintenance is crucial — typically every 12 months or 10,000 km."],
    ["What is included in a service?", "We replace the engine oil and oil filter, and check all other fluids, filters, suspension, bushes, brakes and tyres."],
    ["How do I know if my brakes need replacing?", "Look for signs like squealing noises or increased stopping distances."],
    ["What should I do if my check engine light comes on?", "It's a warning — bring your car in for diagnostics so we can identify the issue promptly."],
    ["Can you do pre-purchase inspections?", "Yes. We give a vehicle you're about to buy or sell a thorough inspection and list anything it may need now or in the near future."]
  ];
  var faqHtml = FAQS.map(function (qa) {
    return '<div class="alp-qa"><button type="button">' + qa[0] + chevron + '</button><div class="alp-a"><p>' + qa[1] + "</p></div></div>";
  }).join("");

  /* Chapters: [id, enterStart, enterEnd, exitStart, exitEnd, html] — cut-aligned */
  var CHAPTERS = [
    ["hero", -4, 0, 9.5, 12,
      '<div class="alp-inner alp-left">'
      + '<div class="alp-eyebrow alp-rise">Queenstown · Independent Mechanics</div>'
      + '<h1 class="alp-h1 alp-split">Your vehicle,\nrunning at its best.</h1>'
      + '<p class="alp-lead alp-rise">First-rate servicing, diagnostics and repairs — specialising in European and Japanese vehicles, with top-tier customer care and respect for your budget.</p>'
      + '<div class="alp-btnrow alp-rise"><a class="alp-btn alp-btn-light" href="#alp-booking">Make a booking</a>'
      + '<a class="alp-btn alp-btn-ghost" href="' + PHONE_TEL + '">Call ' + PHONE_DISPLAY + "</a></div>"
      + '<div class="alp-ticks alp-rise"><span>' + check + "WOF repair specialists</span><span>" + check + "Diesel engine solutions</span><span>" + check + "Frankton, Queenstown</span></div>"
      + "</div>"],
    ["about", 12.2, 15.5, 17.2, 19.8,
      '<div class="alp-inner alp-center">'
      + '<h2 class="alp-h2 alp-split">First-rate repairs.\nTop-tier care.</h2>'
      + '<p class="alp-lead alp-rise">Addept Automotive is your go-to for peak vehicle performance and reliability — comprehensive diagnostics, routine maintenance, diesel engine solutions and WOF repairs, plus a tyre &amp; battery marketplace.</p>'
      + "</div>"],
    ["services", 19.8, 23, 35.3, 37.6,
      '<div class="alp-inner" style="position:absolute;inset:0;">'
      + '<div id="alp-striphead"><div class="alp-eyebrow alp-rise">Our Services</div>'
      + '<h2 class="alp-h2 alp-split">Everything under the hood — and around it.</h2></div>'
      + '<div id="alp-strip"><div id="alp-striptrack">' + stripCards + "</div></div>"
      + "</div>"],
    ["inspections", 37.6, 41, 45.8, 48.8,
      '<div class="alp-inner alp-left">'
      + '<div class="alp-eyebrow alp-rise">Pre-Purchase Inspections</div>'
      + '<h2 class="alp-h2 alp-split">Buying? Selling?\nKnow first.</h2>'
      + '<p class="alp-lead alp-rise">We give any vehicle you’re about to buy or sell a thorough inspection — and list anything it needs now or in the near future. No surprises after the handshake.</p>'
      + '<div class="alp-btnrow alp-rise"><a class="alp-btn alp-btn-ghost" href="' + PHONE_TEL + '">Call ' + PHONE_DISPLAY + "</a></div>"
      + "</div>"],
    ["overhauls", 50.2, 54, 71, 75,
      '<div class="alp-inner alp-left" style="max-width:560px;">'
      + '<div class="alp-eyebrow alp-rise">European & Japanese Specialists</div>'
      + '<h2 class="alp-h2 alp-split">Overhauls are\nour specialty.</h2>'
      + '<p class="alp-lead alp-rise" style="font-size:clamp(.92rem,1.5vw,1.05rem);">Engine and transmission overhauls and intricate auto electrical work — the deep jobs other shops send away.</p>'
      + "</div>"],
    ["hours", 75.5, 79, 84, 87.8,
      '<div class="alp-inner alp-center">'
      + '<h2 class="alp-h2 alp-split">Drop in. We’ll sort it.</h2>'
      + '<div class="alp-hours alp-rise">'
      + "<div><b>Monday – Thursday</b><span>7:00am – 5:00pm</span></div>"
      + "<div><b>Friday</b><span>By appointment only</span></div>"
      + "<div><b>Saturday – Sunday</b><span>Closed</span></div>"
      + "</div>"
      + '<p class="alp-lead alp-rise" style="font-size:13px;margin-top:22px;color:rgba(255,255,255,.35);">35B Brookes Road, Frankton, Queenstown 9300</p>'
      + "</div>"],
    ["cta", 88.2, 93, 100, 104,
      '<div class="alp-inner alp-center">'
      + '<h2 class="alp-h1 alp-split" style="font-size:clamp(2.2rem,5.5vw,3.8rem);">Book your\nvehicle in.</h2>'
      + '<p class="alp-lead alp-rise">Pick a time that suits below — or call us first for an estimate.</p>'
      + '<div class="alp-btnrow alp-rise" style="justify-content:center;"><a class="alp-btn alp-btn-light" href="#alp-booking">Make a booking</a></div>'
      + '<p class="alp-rise" style="margin-top:18px;font-size:12px;color:rgba(255,255,255,.3);">' + PHONE_DISPLAY + " &nbsp;·&nbsp; " + EMAIL + "</p>"
      + "</div>"]
  ];
  var CHAPTER_TOP = { overhauls: 1 };

  var GHOSTS = [
    ["SERVICING", 8, 15],
    ["DIAGNOSTICS", 16.5, 23.5],
    ["INSPECTIONS", 34, 41],
    ["OVERHAULS", 46.5, 54],
    ["QUEENSTOWN", 71.5, 79],
    ["BOOK IT IN", 84.5, 92]
  ];

  /* Annotations — one keyframe per video frame, machine-tracked off the footage
     (car: phase-correlation pinned to verified anchors; engine: CSRT tracker).
     Format: [p, x, y, w, h] in % of the source frame. */
  var ANNOS = [
    { label: "Thorough pre-purchase inspections", side: "top", in: 39.24, out: 43.2,
      keys: [
        [39.24,61.3,42.8,44.4,38.4], [39.66,59.4,42.6,44.6,38.5], [40.08,57.3,42.4,44.9,38.7], [40.51,55.0,42.3,45.1,38.8],
        [40.93,52.8,42.2,45.3,38.9], [41.35,50.9,42.1,45.5,39.1], [41.77,49.4,42.2,45.8,39.2], [42.19,48.0,42.3,46.0,39.4],
        [42.62,46.5,42.5,46.2,39.5], [43.04,44.7,42.8,46.4,39.6], [43.46,42.7,43.1,46.7,39.8], [43.88,40.7,43.5,46.9,39.9],
        [44.3,38.9,43.8,47.1,40.0], [44.73,37.5,44.1,47.4,40.2], [45.15,36.5,44.3,47.6,40.3], [45.57,35.6,44.5,47.8,40.4],
        [45.99,34.7,44.6,48.0,40.6], [46.41,33.8,44.7,48.3,40.7], [46.84,32.7,44.8,48.5,40.9], [47.26,31.7,44.9,48.7,41.0],
        [47.68,30.7,44.9,48.9,41.1], [48.1,29.7,44.8,49.2,41.3], [48.52,28.8,44.8,49.4,41.4]
      ] },
    { label: "Engine & transmission overhauls", side: "top", in: 52.74, out: 70.6,
      keys: [
        [52.74,46.5,25.3,21.1,27.2], [53.16,46.9,25.4,21.1,27.2], [53.59,47.3,25.6,21.1,27.2], [54.01,47.8,25.9,21.1,27.2],
        [54.43,48.4,26.2,21.1,27.2], [54.85,48.9,26.6,21.1,27.2], [55.27,49.4,27.0,21.1,27.2], [55.7,49.9,27.3,21.1,27.2],
        [56.12,50.4,27.7,21.1,27.2], [56.54,50.8,28.1,21.1,27.2], [56.96,51.3,28.4,21.1,27.2], [57.38,51.7,28.7,21.1,27.2],
        [57.81,52.1,28.9,21.1,27.2], [58.23,52.4,29.1,21.1,27.2], [58.65,52.7,29.3,21.1,27.2], [59.07,53.0,29.4,21.1,27.2],
        [59.49,53.2,29.5,21.1,27.2], [59.92,53.4,29.6,21.1,27.2], [60.34,53.6,29.6,21.1,27.2], [60.76,53.8,29.7,21.1,27.2],
        [61.18,54.0,29.7,21.1,27.2], [61.6,54.3,29.8,21.1,27.2], [62.03,54.6,29.9,21.1,27.2], [62.45,54.9,29.9,21.1,27.2],
        [62.87,55.4,30.0,21.1,27.2], [63.29,55.8,30.1,21.1,27.2], [63.71,56.4,30.2,21.1,27.2], [64.14,56.9,30.3,21.1,27.2],
        [64.56,57.5,30.5,21.1,27.2], [64.98,58.0,30.6,21.1,27.2], [65.4,58.5,30.7,21.1,27.2], [65.82,59.0,30.8,21.1,27.2],
        [66.24,59.5,30.9,21.1,27.2], [66.67,60.0,31.0,21.1,27.2], [67.09,60.4,31.0,21.1,27.2], [67.51,60.7,31.1,21.1,27.2],
        [67.93,60.9,31.2,21.1,27.2], [68.35,61.1,31.3,21.1,27.2], [68.78,61.1,31.6,21.1,27.2], [69.2,61.1,31.8,21.1,27.2],
        [69.62,61.1,32.1,21.1,27.2], [70.04,61.1,32.5,21.1,27.2], [70.46,61.1,32.8,21.1,27.2], [70.89,61.2,33.1,21.1,27.2]
      ] }
  ];

  var GRADE = [
    [0, 0, 0, 0, 0.14], [11, 8, 6, 10, 0.30], [20, 36, 16, 6, 0.26],
    [37, 30, 12, 28, 0.30], [50, 10, 10, 10, 0.46], [70, 8, 8, 8, 0.46],
    [77, 0, 6, 12, 0.42], [92, 0, 0, 0, 0.58], [100, 0, 0, 0, 0.62]
  ];

  var DOTS = [
    ["Home", 1], ["About", 16], ["Services", 28], ["Inspections", 43],
    ["Overhauls", 62], ["Hours", 81], ["Book", 95]
  ];

  // ── DOM ────────────────────────────────────────────────────────────────────
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var fontLink = document.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap";
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
    + CHAPTERS.map(function (c) {
        return '<div class="alp-section' + (CHAPTER_TOP[c[0]] ? " alp-top" : "") + '" data-sec="' + c[0] + '">' + c[5] + "</div>";
      }).join("")
    + '<div id="alp-nav">'
    +   '<a class="alp-brand" href="#top"><img src="' + LOGO + '" alt="Addept Automotive"><span>Addept Automotive</span></a>'
    +   '<a class="alp-call" href="' + PHONE_TEL + '">Call now</a>'
    + "</div>"
    + '<div id="alp-dots">' + DOTS.map(function (d) {
        return '<button type="button" data-at="' + d[1] + '" aria-label="' + d[0] + '"><span>' + d[0] + "</span><i></i></button>";
      }).join("") + "</div>"
    + '<div id="alp-hint">' + chevron + "<span>Scroll</span></div>"
    + '<div id="alp-scrub" style="position:relative;height:' + SCRUB_VH + 'vh;z-index:2;"></div>'
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
    // form_embed.js calls scrollIntoView on its iframe whenever the widget
    // re-renders — which yanks the page around long after load. Allow it only
    // when the user is actually at the booking section.
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

  // ── Frame engine: JPEGs load once; a sliding ImageBitmap window keeps the
  //    frames around the playhead pre-decoded so drawing is always cheap. ────
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
  var bitmaps = new Map(); // index → ImageBitmap (or null while decoding)
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
      if (bmpResizeOk) { bmpResizeOk = false; bitmaps.delete(idx); } // retry path without resize
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

  // drawable for frame i. Annotations are positioned for the TRUE playhead, so a
  // substitute frame must stay within ±2 frames — beyond that the tracked boxes
  // visibly desync from the footage. Otherwise decode the exact frame now.
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
    return { img: frames[i], exact: true }; // sync decode — correct beats fast here
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

  // ── Choreography ───────────────────────────────────────────────────────────
  var dim = document.getElementById("alp-dim");
  var glow = document.getElementById("alp-glow");
  var nav = document.getElementById("alp-nav");
  var hint = document.getElementById("alp-hint");
  var scrub = document.getElementById("alp-scrub");
  var dots = document.getElementById("alp-dots");
  var secEls = Array.prototype.slice.call(root.querySelectorAll(".alp-section"));
  var ghostEls = Array.prototype.slice.call(root.querySelectorAll(".alp-ghost"));
  var annoEls = Array.prototype.slice.call(root.querySelectorAll(".alp-anno"));
  var dotEls = Array.prototype.slice.call(root.querySelectorAll("#alp-dots button"));
  var stripTrack = document.getElementById("alp-striptrack");
  var stripCardsEls = Array.prototype.slice.call(root.querySelectorAll(".alp-scard"));

  var chapterKids = secEls.map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".alp-w, .alp-rise"));
  });

  // filmstrip card metrics cached — no layout reads in the render loop
  var stripMetrics = [], stripTravel = 0;
  function measureStrip() {
    stripMetrics = stripCardsEls.map(function (el) { return { c: el.offsetLeft + el.offsetWidth / 2 }; });
    stripTravel = Math.max(stripTrack.scrollWidth - root.clientWidth, 0);
  }
  measureStrip();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measureStrip(); });

  var smooth = 0, prevSmooth = 0, lastState = "";

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

  function render() {
    var vh = root.clientHeight;
    var max = scrub.offsetHeight - vh;
    if (max <= 0) return;
    var p = clamp01(smooth / max) * 100;

    // fractional playhead: draw frame i0, then crossfade i1 on top by the
    // fractional part — slow scrolling glides instead of stepping
    var fpos = Math.min(Math.max((p / 100) * (TOTAL_FRAMES - 1), 0), TOTAL_FRAMES - 1);
    var i0 = Math.floor(fpos), i1 = Math.min(i0 + 1, TOTAL_FRAMES - 1);
    var fa = fpos - i0;
    tendBitmaps(Math.round(fpos));
    var dkey = (fpos * 64) | 0; // 1/64-frame granularity
    if (dkey !== drawnFrame) {
      var d0 = getDrawable(i0);
      if (d0.img) {
        drawImageCover(d0.img);
        var d1 = fa > 0.02 ? bitmaps.get(i1) : null;
        if (d1) {
          ctx.globalAlpha = fa;
          drawImageCover(d1);
          ctx.globalAlpha = 1;
        }
        // latch only when fully resolved; otherwise retry next tick
        if (d0.exact && (fa <= 0.02 || d1)) drawnFrame = dkey;
      }
    }

    var hand = clamp01((p - 95) / 5);
    canvas.style.transform = hand > 0 ? "scale(" + (1 + hand * 0.06).toFixed(4) + ")" : "";

    dim.style.background = grade(p);
    var glowOp = clamp01((p - 89) / 5) * (1 - clamp01((p - 99) / 4));
    glow.style.opacity = (glowOp * 0.55).toFixed(3);

    for (var i = 0; i < CHAPTERS.length; i++) {
      var c = CHAPTERS[i];
      var enter = ease(clamp01((p - c[1]) / (c[2] - c[1])));
      var exit = ease(clamp01((p - c[3]) / (c[4] - c[3])));
      var vis = enter * (1 - exit);
      var el = secEls[i];
      if (vis <= 0.005) {
        if (el.style.visibility !== "hidden") { el.style.opacity = 0; el.style.visibility = "hidden"; }
        continue;
      }
      el.style.visibility = "visible";
      el.style.opacity = vis.toFixed(3);
      el.style.transform = "translateY(" + ((1 - enter) * 9 - exit * 9).toFixed(2) + "vh)";

      var kids = chapterKids[i], n = kids.length;
      if (n && enter < 1) {
        var stag = 0.5 / n;
        for (var k = 0; k < n; k++) {
          var r = ease(clamp01((enter - k * stag) / 0.5));
          kids[k].style.opacity = r.toFixed(3);
          kids[k].style.transform = "translateY(" + ((1 - r) * 0.55).toFixed(3) + "em)";
        }
      } else if (n && el.dataset.kidsDone !== "1") {
        for (var k2 = 0; k2 < n; k2++) { kids[k2].style.opacity = 1; kids[k2].style.transform = ""; }
      }
      el.dataset.kidsDone = (n && enter >= 1) ? "1" : "0";

      if (c[0] === "services" && stripTravel > 0) {
        var hold = clamp01((p - c[2]) / (c[3] - c[2]));
        var tx = -hold * stripTravel;
        stripTrack.style.transform = "translateX(" + tx.toFixed(1) + "px)";
        var cx = root.clientWidth / 2;
        for (var sc = 0; sc < stripMetrics.length; sc++) {
          var dxc = Math.abs(stripMetrics[sc].c + tx - cx) / root.clientWidth;
          var f = clamp01(1 - dxc * 1.6);
          stripCardsEls[sc].style.opacity = (0.5 + f * 0.5).toFixed(3);
        }
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

    nav.style.opacity = Math.max(0.4, 1 - (p / 100) * 4).toFixed(2);
    hint.style.opacity = (p > 90 || root.scrollTop > max + vh * 0.5) ? 0 : 0.5;
    var dotsOn = root.scrollTop < max - vh * 0.2;
    dots.style.opacity = dotsOn ? 1 : 0;
    dots.style.pointerEvents = dotsOn ? "auto" : "none";
    for (var j = 0; j < dotEls.length; j++) {
      var at = parseFloat(dotEls[j].getAttribute("data-at"));
      dotEls[j].className = Math.abs(p - at) < 8 ? "alp-on" : "";
    }

    if (root.scrollTop > max - vh * 1.2) loadCalendar();
  }

  (function tick() {
    requestAnimationFrame(tick); // scheduled first — the loop survives anything below
    try {
      if (document.hidden) return;
      var target = root.scrollTop;
      var diff = target - smooth;
      if (diff > 0.5) scrollDir = 1; else if (diff < -0.5) scrollDir = -1;
      smooth += Math.abs(diff) < 0.5 ? diff : diff * SMOOTH;
      var state = ((smooth * 4) | 0) + "x" + window.innerWidth + "f" + drawnFrame;
      if (state !== lastState) { lastState = state; prevSmooth = smooth; render(); }
    } catch (e) { /* never let a frame error kill the loop */ }
  })();

  window.addEventListener("resize", function () {
    drawnFrame = -1; lastState = "";
    measureStrip();
  });

  dotEls.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var at = parseFloat(btn.getAttribute("data-at")) / 100;
      root.scrollTo({ top: at * (scrub.offsetHeight - root.clientHeight), behavior: "smooth" });
    });
  });

  root.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a[href^='#']") : null;
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    e.preventDefault();
    if (id === "top") { root.scrollTo({ top: 0, behavior: "smooth" }); return; }
    var el = document.getElementById(id);
    if (el) { loadCalendar(); root.scrollTo({ top: el.offsetTop - 20, behavior: "smooth" }); }
  });

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

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  // the story always starts at the top — block browser scroll restoration from
  // re-applying a stale position to the container after reload
  try { history.scrollRestoration = "manual"; } catch (e) {}
  root.scrollTop = 0;
  setTimeout(function () { if (smooth < 1 && root.scrollTop > 0 && performance.now() < 3000) root.scrollTop = 0; }, 300);

  render();
})();
