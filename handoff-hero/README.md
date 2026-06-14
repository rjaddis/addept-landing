# Addept Automotive — final hero (A4c-5 / F3)

Approved redesign of the **hero section** in `deploy/embed.js`. Layout, copy and
button typography change; **every animation stays exactly as it is** — the
section's enter/exit drift, the word-by-word headline population, the rising
elements and the drawing hairline all keep their current engine and timing.

`Hero Final reference.html` in this folder is a self-contained static mockup of
the end state — open it in a browser as the visual source of truth (it has no
animation; the live page keeps its existing ones).

## What changes

1. **Copy** — eyebrow, headline, punchline, ticks; the lead paragraph is gone.
2. **Headline style** — uppercase Space Grotesk (the existing `.alp-giant`
   voice) instead of Inter 800, with corner brackets framing the statement and
   a dimmed punchline below.
3. **Button/pill type (F3)** — `Make a booking`, `Request estimate` and the
   nav `Call now` pill become Space Grotesk 600, uppercase, 12px, `.14em`
   tracking.
4. **Layout** — the hero column anchors toward the bottom of the viewport
   instead of vertical center.

## How animations are preserved (do not change the engine)

The engine animates `.alp-w` spans (created from `.alp-split` headlines),
`.alp-rise` elements, and `.alp-hr` hairlines (~line 599:
`querySelectorAll(".alp-w, .alp-rise")`). The new markup keeps those exact
classes on the equivalent elements, and the section keeps
`enter: [0, 10], exit: [0, -11]` — so intro/outro and word population are
untouched. The bracket corner `<i>`s are plain elements: they simply fade with
the section, which is the intended behavior.

## 1. Fonts (~line 370)

Add weight 600 to the existing Google Fonts link:

```js
fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap";
```

## 2. Replace the hero SEC entry (~line 265)

```js
{ id: "hero", stop: 1, enter: [0, 10], exit: [0, -11], html:
  '<div class="alp-inner alp-left">'
  + '<div class="alp-eyebrow alp-rise">Queenstown\u2019s Independent Workshop</div>'
  + '<div class="alp-hbrk">'
  +   '<i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>'
  +   '<h1 class="alp-heroh alp-split">We\u2019ll tell you what\u2019s\nactually wrong\nwith your car.</h1>'
  + "</div>"
  + '<h2 class="alp-heroh alp-herodim alp-split">Wild concept, we know.</h2>'
  + '<i class="alp-hr" data-o="l" style="max-width:360px;"></i>'
  + '<div class="alp-btnrow alp-rise"><a class="alp-btn alp-btn-light" href="#alp-booking">Make a booking</a>'
  + '<a class="alp-btn alp-btn-ghost" href="#alp-booking">Request estimate</a></div>'
  + '<div class="alp-ticks alp-rise"><span>' + check + "Euro &amp; Japanese specialists</span><span>" + check + "Tuning &amp; emissions solutions</span></div>"
  + "</div>" },
```

Notes:
- Both headline blocks keep `alp-split` → words populate exactly as before.
- The lead paragraph is **removed** entirely.
- `Request estimate` points at `#alp-booking` (same form). If you'd rather it
  open the phone, use `PHONE_TEL` — owner's call.
- The old hero had three ticks; now two.

## 3. New CSS — add near the other type rules (~line 99)

```js
+ ".alp-heroh{font-family:'Space Grotesk',Inter,sans-serif;font-weight:500;line-height:1.04;letter-spacing:.005em;text-transform:uppercase;font-size:clamp(1.7rem,3.2vw,2.5rem);}"
+ ".alp-herodim{color:rgba(255,255,255,.45);margin-top:26px;}"
+ ".alp-hbrk{position:relative;display:inline-block;padding:14px 16px 12px;margin:18px 0 0 -16px;}"
+ ".alp-hbrk i{position:absolute;width:15px;height:15px;border-style:solid;border-color:rgba(255,255,255,.85);border-width:0;}"
+ ".alp-hbrk i.tl{top:0;left:0;border-top-width:2px;border-left-width:2px;}"
+ ".alp-hbrk i.tr{top:0;right:72px;border-top-width:2px;border-right-width:2px;}"
+ ".alp-hbrk i.bl{bottom:0;left:0;border-bottom-width:2px;border-left-width:2px;}"
+ ".alp-hbrk i.br{bottom:5px;right:72px;border-bottom-width:2px;border-right-width:2px;}"
```

The 72px right inset and the 5px raise on the bottom-right corner are
deliberate optical choices — keep them. If the headline wraps differently at
some widths and a right corner lands oddly, adjust only these two offsets.

## 4. Bottom-anchored hero column

The hero section currently centers vertically (`.alp-section` is
`align-items:center`). Anchor **only the hero** low: add

```js
+ ".alp-section.alp-hero-low{align-items:flex-end;}"
+ ".alp-section.alp-hero-low .alp-inner{padding-bottom:14vh;}"
```

and give the hero section that class where sections are instantiated (the
`SEC.map` that renders `<section class="alp-section …">` — add
`alp-hero-low` when `s.id === "hero"`). If sections aren't classed per-id,
key off the existing `data-` attribute or index 0.

## 5. F3 button + pill typography

**Modify** the existing `.alp-btn` rule (~line 105): change
`font-size:14px;font-weight:700;letter-spacing:.02em;` to

```
font-family:'Space Grotesk',Inter,sans-serif;font-weight:600;text-transform:uppercase;font-size:12px;letter-spacing:.14em;padding:15px 30px;
```

(keep everything else in the rule). This intentionally restyles **all** pill
buttons site-wide — inspections "Call", the booking CTA — so the system stays
consistent.

**Modify** `#alp-nav a.alp-call` (~line 85): change
`font-size:13px;font-weight:600;` to

```
font-family:'Space Grotesk',Inter,sans-serif;font-weight:600;text-transform:uppercase;font-size:12px;letter-spacing:.14em;
```

## Acceptance checklist

- [ ] Hero shows: capsule eyebrow → bracketed 3-line uppercase statement → dimmed "Wild concept, we know." → hairline → two pills → two ticks, anchored toward the bottom of the viewport
- [ ] Headline words still populate one-by-one on load/scroll exactly like the old hero; eyebrow/buttons/ticks still rise; hairline still draws; section still drifts in/out on scroll the same way
- [ ] Top-right and bottom-right bracket corners sit 72px in from the bracket's right edge; bottom-right raised 5px
- [ ] All pill buttons and the nav Call now are Space Grotesk 600 caps, 12px, .14em tracking
- [ ] No lead paragraph; ticks read "Euro & Japanese specialists · Tuning & emissions solutions"
- [ ] Counter (01—07) and scroll cue unchanged
- [ ] Mobile: nothing overflows; brackets stay glued to the statement
- [ ] Compare against `Hero Final reference.html` side by side
