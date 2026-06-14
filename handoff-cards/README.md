# Addept Automotive — new service cards (Monument layout, thick glass)

Approved redesign of the eight frosted-glass service cards in the fleet
(`deploy/embed.js`). Two changes in one:

1. **Layout** — centered service title at the **top**, a split hairline rule
   under it, rewritten benefit copy in the middle, and an uppercase footer
   line locked to the base. **No icon, no service numbering, and no dashes
   anywhere in the copy.**
2. **Thicker glass** — the panes now read as chunky "double glazed" slabs:
   three stacked edge offsets with a subtle glass-green tint, a 2px inner
   bevel, deeper drop shadow, blur bumped 16px → 18px, brighter border.

`Service Cards Final reference.html` in this folder is a self-contained demo
of the exact final look — open it in a browser as the source of truth.

## 1. Replace the `SERVICES` array (~line 209)

Entries become `[title, copy, foot]` triplets:

```js
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
```

## 2. Delete the `ICONS` array (~line 220)

The cards no longer carry icons. `ICONS` has no other consumers — remove it.
(`check` and `chevron` are separate variables; keep those.) This supersedes
the earlier `handoff-icons` instructions for the card fleet.

## 3. Replace the card builder (~line 241)

```js
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
```

## 4. CSS (~lines 123–137)

**Replace** the `.alp-fcard .alp-fin` rule with (note: now a flex column,
4px radius, thicker shadow stack, 18px blur, .32 border):

```js
+ ".alp-fcard .alp-fin{position:absolute;inset:0;padding:9.6cqw 8.4cqw 7cqw;border-radius:4px;color:#181520;overflow:hidden;display:flex;flex-direction:column;text-align:center;"
+   "background:linear-gradient(168deg,rgba(252,253,255,.16) 0%,rgba(237,239,246,.085) 42%,rgba(196,201,215,.14) 100%),rgba(237,239,246,.085);"
+   "-webkit-backdrop-filter:blur(18px) saturate(1.15);backdrop-filter:blur(18px) saturate(1.15);"
+   "border:1px solid rgba(255,255,255,.32);"
+   "box-shadow:-12px 14px 0 -1px rgba(196,214,209,.5),-6px 7px 0 0 rgba(225,236,233,.55),-2px 3px 0 0 rgba(245,250,248,.5),0 44px 110px rgba(0,0,0,.5),0 10px 26px rgba(0,0,0,.28),inset 0 2px 0 rgba(255,255,255,.5),inset 2px 0 0 rgba(255,255,255,.28),inset 0 -2px 0 rgba(120,128,150,.28),inset -2px 0 0 rgba(150,156,175,.2);"
+   "transition:transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s;}"
```

**Keep** the `.alp-fin::after` sheen rule as is.

**Delete** these three rules: `.alp-fcard svg.alp-fico`,
`.alp-fcard .alp-ffoot span`, `.alp-fcard .alp-ffoot b`.

**Replace** the `.alp-fcard p` and `.alp-fcard .alp-ffoot` rules and **add**
the title/rules rules:

```js
+ ".alp-fcard h3{margin:0;font-size:7.4cqw;font-weight:800;letter-spacing:-.015em;line-height:1.1;color:#181520;}"
+ ".alp-frules{display:flex;align-items:center;gap:4cqw;margin:5.2cqw 0 0;}"
+ ".alp-frules i{flex:1;height:1px;background:rgba(24,21,32,.28);}"
+ ".alp-fcard p{margin:6.4cqw auto 0;font-size:4.5cqw;line-height:1.65;font-weight:500;color:#181520;opacity:.72;max-width:92%;letter-spacing:0;}"
+ ".alp-fcard .alp-ffoot{margin-top:auto;padding-top:4.5cqw;font-size:2.9cqw;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#181520;opacity:.45;}"
```

Everything else (fleet positioning, bob animation, 3D cursor tilt, the
scroll choreography) stays untouched — the card is the same size and aspect,
only its contents and skin change.

## Acceptance checklist

- [ ] Every card: title centered at top → split rule → copy → uppercase footer at the bottom edge
- [ ] No icons, no "Service 0X / 08" labels, no dashes in any card text
- [ ] Glass looks thicker: visible stacked pane edges bottom-left, crisp 2px bevel highlight top/left
- [ ] Hover/cursor tilt and the slow bob still work
- [ ] Compare side by side with `Service Cards Final reference.html`
- [ ] Text never overflows a card at any viewport (copy lengths are tuned for the 1140:1260 aspect)
