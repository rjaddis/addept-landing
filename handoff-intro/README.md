# Addept Automotive — intro splash + new nav wordmark

Two approved changes for the live landing page (`deploy/embed.js`):

1. **Intro splash** — before anything else, a pure-black screen with the warm
   amber glow bleeding in from the edges, then the original badge logo scaling
   up into the middle (small + blurred → large + crisp), an
   "FRANKTON · QUEENSTOWN · EST. 2019" line with hairlines drawing outward, and
   a scroll cue. Dismisses on first scroll/click/keypress.
2. **Nav wordmark** — the top-left brand becomes **text only**: `ADDEPT` in
   Inter 800 + `AUTOMOTIVE` in Inter 400 at 75% white, 15px, `.12em` tracking,
   uppercase. No logo image in the nav — the badge artwork is reserved for the
   intro. (This supersedes the earlier "badge solo in nav" handoff, if applied.)

`Intro Animation reference.html` in this folder is a working demo of the exact
look, timing and easing — open it in a browser and use it as the source of
truth. All timings use the site's signature curve `cubic-bezier(.2,.8,.2,1)`.

## Files

- `addept-logo-badge.svg` — the badge, tightly cropped. Copy into `deploy/` so
  Vercel serves it; reference it by **absolute URL**
  (`https://addept-landing.vercel.app/addept-logo-badge.svg`) — the script runs
  embedded on addeptauto.co.nz, so relative paths won't resolve.
- `Intro Animation reference.html` — visual reference, not for deployment.

## Part 1 — nav wordmark (text only)

### Markup (~line 396)

Replace the `.alp-brand` anchor with:

```js
+ '<a class="alp-brand" href="#top"><b>Addept</b> <span>Automotive</span></a>'
```

### CSS (~lines 81–84)

Replace the `.alp-brand` rules (incl. the old `img` rules) with:

```js
+ "#alp-nav .alp-brand{font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#fff;text-decoration:none;white-space:nowrap;transition:opacity .25s;}"
+ "#alp-nav .alp-brand:hover{opacity:.8;}"
+ "#alp-nav .alp-brand b{font-weight:800;}"
+ "#alp-nav .alp-brand span{font-weight:400;color:rgba(255,255,255,.75);}"
```

### Mobile (~line 190)

Replace the old `#alp-nav .alp-brand span{display:none;}` (or the 48px badge
rule from the earlier handoff) with:

```js
+   "#alp-nav .alp-brand{font-size:13px;}"
```

Both words stay visible on mobile.

## Part 2 — intro splash overlay

Implement as a **fixed overlay above the sections** (don't add it to the
`SECS`/sections array — that would disturb the scroll-to-frame math). It shows
once after the loader finishes, then dismisses for good.

### Constant (~line 25)

```js
var BADGE = "https://addept-landing.vercel.app/addept-logo-badge.svg";
```

### Markup — append to the root HTML string (next to `#alp-loader`, ~line 428)

```js
+ '<div id="alp-intro">'
+   '<div class="alp-intro-glow"></div>'
+   '<div class="alp-intro-c">'
+     '<img src="' + BADGE + '" alt="Addept Automotive">'
+     '<div class="alp-intro-est"><i></i><span>Frankton · Queenstown · Est. 2019</span><i></i></div>'
+   '</div>'
+   '<div class="alp-intro-hint">' + chevron + "Scroll</div>"
+ "</div>"
```

(`chevron` is the existing SVG variable at ~line 207.)

### CSS — add to the style string

```js
+ "#alp-intro{position:fixed;inset:0;z-index:60;background:#000;display:flex;align-items:center;justify-content:center;opacity:1;transition:opacity .8s ease;}"
+ "#alp-intro.alp-out{opacity:0;pointer-events:none;}"
+ ".alp-intro-glow{position:absolute;inset:0;box-shadow:inset 0 0 140px 10px rgba(255,166,77,.5),inset 0 0 60px 4px rgba(255,120,40,.28);opacity:0;pointer-events:none;}"
+ "#alp-intro.alp-play .alp-intro-glow{animation:alpGlowIn 1.8s cubic-bezier(.2,.8,.2,1) .25s forwards,alpBreathe 7s ease-in-out 2.4s infinite;}"
+ "@keyframes alpGlowIn{to{opacity:1}}"
+ "@keyframes alpBreathe{0%,100%{opacity:1}50%{opacity:.7}}"
+ ".alp-intro-c{display:flex;flex-direction:column;align-items:center;gap:34px;}"
+ ".alp-intro-c img{width:min(58vw,620px);opacity:0;transform:scale(.55) translateY(16px);filter:blur(14px) drop-shadow(0 40px 90px rgba(0,0,0,.7));}"
+ "#alp-intro.alp-play .alp-intro-c img{animation:alpBadgeIn 1.4s cubic-bezier(.2,.8,.2,1) .9s forwards;}"
+ "@keyframes alpBadgeIn{60%{filter:blur(0) drop-shadow(0 40px 90px rgba(0,0,0,.7))}100%{opacity:1;transform:scale(1) translateY(0);filter:blur(0) drop-shadow(0 40px 90px rgba(0,0,0,.7))}}"
+ ".alp-intro-est{display:flex;align-items:center;gap:16px;opacity:0;transform:translateY(.9em);}"
+ "#alp-intro.alp-play .alp-intro-est{animation:alpRise .8s cubic-bezier(.2,.8,.2,1) 2s forwards;}"
+ ".alp-intro-est i{display:block;width:54px;height:1px;background:rgba(255,255,255,.22);transform:scaleX(0);}"
+ ".alp-intro-est i:first-child{transform-origin:right;}"
+ ".alp-intro-est i:last-child{transform-origin:left;}"
+ "#alp-intro.alp-play .alp-intro-est i{animation:alpDraw .7s cubic-bezier(.2,.8,.2,1) 2.3s forwards;}"
+ ".alp-intro-est span{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);white-space:nowrap;}"
+ "@keyframes alpRise{to{opacity:1;transform:translateY(0)}}"
+ "@keyframes alpDraw{to{transform:scaleX(1)}}"
+ ".alp-intro-hint{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:7px 16px;border-radius:99px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.6);color:rgba(255,255,255,.35);font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:0;}"
+ "#alp-intro.alp-play .alp-intro-hint{animation:alpRise .8s cubic-bezier(.2,.8,.2,1) 2.8s forwards;}"
+ ".alp-intro-hint svg{width:13px;height:13px;animation:alp-bounce 1.6s infinite;}"
+ "@media (prefers-reduced-motion:reduce){#alp-intro.alp-play .alp-intro-glow,#alp-intro.alp-play .alp-intro-c img,#alp-intro.alp-play .alp-intro-est,#alp-intro.alp-play .alp-intro-est i,#alp-intro.alp-play .alp-intro-hint{animation:none;opacity:1;transform:none;filter:none;}}"
```

(`alp-bounce` already exists at ~line 148.)

### JS — wire the lifecycle

Where the loader finishes and hides (search for where `#alp-loader` is faded
out / removed), add:

```js
var intro = document.getElementById("alp-intro");
intro.classList.add("alp-play");
function alpDismissIntro() {
  intro.classList.add("alp-out");
  setTimeout(function () { intro.remove(); }, 850);
  window.removeEventListener("wheel", alpDismissIntro);
  window.removeEventListener("touchstart", alpDismissIntro);
  window.removeEventListener("keydown", alpDismissIntro);
  intro.removeEventListener("click", alpDismissIntro);
}
window.addEventListener("wheel", alpDismissIntro, { passive: true });
window.addEventListener("touchstart", alpDismissIntro, { passive: true });
window.addEventListener("keydown", alpDismissIntro);
intro.addEventListener("click", alpDismissIntro);
```

If the loader logic starts the scroll engine / reveals section 0, leave all of
that untouched — the intro simply sits on top (z-index 60 is above sections and
nav, below nothing critical) and fades away.

## Acceptance checklist

- [ ] On load: black screen → amber glow bleeds in from edges → badge scales up blurred→crisp into center → EST line hairlines draw → scroll cue
- [ ] Timing/easing matches `Intro Animation reference.html` (open side-by-side)
- [ ] First scroll, tap, click or keypress fades the intro out (0.8s) and removes it; it never reappears
- [ ] Nav now shows ADDEPT (heavy) AUTOMOTIVE (lighter, 75% white) as text — no logo image, both words visible on mobile at 13px
- [ ] Badge loads from the absolute Vercel URL on the embedded GoHighLevel page
- [ ] `prefers-reduced-motion`: intro shows fully-formed (no animation) and still dismisses
- [ ] Loader behavior unchanged
