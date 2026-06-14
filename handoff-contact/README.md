# Addept Automotive — Contact panel redesign (V5 bracketed plates)

Approved redesign of the **Contact** block inside the booking drawer
(`#alp-contact` in `deploy/embed.js`, ~line 661). Replaces the three centered
`.alp-cbox` cards with three bracketed "diagnostic plate" tiles: Phone & Email
side-by-side in a narrower top row, and a Workshop bar beneath that matches the
combined width of the two above. The heading ("Contact" eyebrow + "Get in
touch") is unchanged.

`Contact Final reference.html` in this folder shows the approved design — it's
the V5 block (ignore V1–V4 above it).

## Layout summary

- Top row: **Phone** and **Email** plates, two equal columns, capped at 540px
  and centered.
- Below: a full-width **Workshop** plate, also 540px and centered — so its left
  and right edges line up exactly with the two plates above.
- Every plate: corner brackets, an uppercase label + mono index (01/02/03) on
  top, a Space Grotesk value, and a quiet monospace caption line.
- All three are compact (~half the height of the old cards).

## 1. Replace the contact markup (~lines 661–669)

Swap the `#alp-contact` section's inner from the old `.alp-fhead` + `.alp-contact`
grid + the standalone hours `.alp-cbox` to:

```js
+   '<div class="alp-fsec" id="alp-contact">'
+     '<div class="alp-fhead"><div class="alp-eyebrow">Contact</div><h2 class="alp-h2">Get in touch</h2>'
+       '<p class="alp-lead">Booked up, broken down, or just not sure where to start — get hold of us and we&rsquo;ll tell you what&rsquo;s actually going on.</p></div>'
+     '<div class="alp-cwrap">'
+       '<div class="alp-crow">'
+         '<a class="alp-cplate alp-brk" href="' + PHONE_TEL + '"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>'
+           '<div class="alp-ctop"><span class="alp-clab">' + IC_PHONE + "Phone</span><span class=\"alp-cidx\">01</span></div>"
+           '<div class="alp-cval">' + PHONE_DISPLAY + '</div><div class="alp-ccap">Mon&ndash;Thu &middot; 7am&ndash;5pm</div></a>'
+         '<a class="alp-cplate alp-brk" href="mailto:' + EMAIL + '"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>'
+           '<div class="alp-ctop"><span class="alp-clab">' + IC_MAIL + "Email</span><span class=\"alp-cidx\">02</span></div>"
+           '<div class="alp-cval" style="font-size:15px;">' + EMAIL + '</div><div class="alp-ccap">Replies within a day</div></a>'
+       "</div>"
+       '<a class="alp-cplate alp-cwide alp-brk" href="' + MAPS + '" target="_blank" rel="noopener"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>'
+         '<div class="alp-ctop"><span class="alp-clab">' + IC_PIN + "Workshop</span><span class=\"alp-cidx\">03</span></div>"
+         '<div class="alp-cval alp-cval-wide">35B Brookes Road, Frankton, Queenstown 9300</div><div class="alp-ccap">Open in Google Maps &rarr;</div></a>'
+     "</div>"
+   "</div>"
```

Notes:
- The old standalone "Operating hours" `.alp-cbox` is folded into the Phone
  caption ("Mon–Thu · 7am–5pm"). If you'd rather keep full hours somewhere,
  they already live in the Hours section (06).
- `IC_PIN` doesn't exist yet — add it (step 3).

## 2. Replace the contact CSS (~lines 338–344)

Delete the old `.alp-contact`, `.alp-cbox`, `.alp-cbox .alp-clabel`,
`.alp-cbox a`, `.alp-cbox p` rules and add:

```js
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
+ ".alp-brk>i{position:absolute;width:13px;height:13px;border-style:solid;border-color:rgba(255,255,255,.8);border-width:0;transition:border-color .3s;}"
+ ".alp-brk>i.tl{top:0;left:0;border-top-width:2px;border-left-width:2px;}"
+ ".alp-brk>i.tr{top:0;right:0;border-top-width:2px;border-right-width:2px;}"
+ ".alp-brk>i.bl{bottom:0;left:0;border-bottom-width:2px;border-left-width:2px;}"
+ ".alp-brk>i.br{bottom:0;right:0;border-bottom-width:2px;border-right-width:2px;}"
+ ".alp-brk:hover>i{border-color:#fff;}"
```

Mobile (~line 369, where `.alp-contact{grid-template-columns:1fr;}` is): replace
that line with:

```js
+   ".alp-crow{grid-template-columns:1fr;}"
+   ".alp-cval-wide{font-size:15px;white-space:normal;}"
```

so on phones the two top plates stack and the address can wrap.

## 3. Add the pin icon (~line 428, beside IC_PHONE / IC_MAIL)

```js
var IC_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
```

(`IC_PHONE` and `IC_MAIL` already use `fill:none;stroke:currentColor` via the
`.alp-clab svg` rule, so they'll render as outlines here too — matches the
reference.)

## 4. Fonts

Space Grotesk and IBM Plex Mono are already loaded for the hero/section work.
If for some reason Plex Mono isn't in the font link, add `IBM+Plex+Mono:wght@400;500`
to the existing Google Fonts URL.

## Acceptance checklist

- [ ] Contact shows Phone + Email as two equal plates in a centered 540px row, Workshop as a 540px bar below with matching left/right edges
- [ ] Every plate has corner brackets that brighten on hover; label + 01/02/03 index up top; Space Grotesk value; mono caption beneath
- [ ] Workshop address sits on ONE line, nearly filling the bracket width, caption "Open in Google Maps →" beneath
- [ ] Plates are compact (~half the old card height)
- [ ] Phone dials, Email opens mail client, Workshop opens Google Maps
- [ ] Mobile: top two stack to one column; address wraps instead of overflowing
- [ ] Compare against the V5 block in `Contact Final reference.html`
