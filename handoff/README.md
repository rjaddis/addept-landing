# Addept Automotive — new badge logo implementation

This folder contains the official brand badge (`addept-logo-badge.svg` — piston and
crossed wrenches behind a near-black banner reading ADDEPT AUTOMOTIVE) and the
instructions to wire it into the landing page nav, replacing the current circular
photo crop + text wordmark.

The design decision (already approved): **badge solo** — the banner carries the
brand name, so the nav shows the badge by itself at 68px tall with a soft drop
shadow, dimming to 85% opacity on hover. No wordmark text next to it, no circle,
no border.

## Files

- `addept-logo-badge.svg` — tightly-cropped badge, viewBox `143 165 769 485`
  (~1.59:1 aspect). White + #221f1f linework; designed for dark backgrounds.

## Where to change things

Everything lives in `deploy/embed.js`. The script is embedded on
addeptauto.co.nz (GoHighLevel) but served from Vercel — so **relative image URLs
will NOT work**; they'd resolve against the host page's domain. Use the absolute
Vercel URL.

### 1. Add the asset

Copy `addept-logo-badge.svg` into `deploy/` so Vercel serves it at
`https://addept-landing.vercel.app/addept-logo-badge.svg`.

### 2. Add the URL constant (~line 25)

Near the existing `LOGO` constant:

```js
var LOGO = "https://assets.cdn.filesafe.space/.../66bab601cbbc6c959ddd0be1.jpeg"; // keep — still used by the loader
var BADGE = "https://addept-landing.vercel.app/addept-logo-badge.svg";
```

### 3. Nav markup (~line 396)

Replace:

```js
+ '<a class="alp-brand" href="#top"><img src="' + LOGO + '" alt="Addept Automotive"><span>Addept Automotive</span></a>'
```

with (badge solo — the `<span>` wordmark is removed on purpose):

```js
+ '<a class="alp-brand" href="#top"><img src="' + BADGE + '" alt="Addept Automotive"></a>'
```

### 4. Nav CSS (~lines 81–84)

Replace the three `.alp-brand img` / `:hover img` / `.alp-brand span` rules:

```js
+ "#alp-nav .alp-brand img{width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.2);transition:transform .35s cubic-bezier(.2,.8,.2,1);}"
+ "#alp-nav .alp-brand:hover img{transform:rotate(-12deg) scale(1.06);}"
+ "#alp-nav .alp-brand span{font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.9);}"
```

with:

```js
+ "#alp-nav .alp-brand img{height:68px;width:auto;display:block;filter:drop-shadow(0 4px 14px rgba(0,0,0,.5));transition:opacity .25s;}"
+ "#alp-nav .alp-brand:hover img{opacity:.85;}"
```

### 5. Mobile CSS (~line 190)

Inside the `@media (max-width:760px)` block, replace the now-dead rule
`#alp-nav .alp-brand span{display:none;}` with a smaller badge:

```js
+   "#alp-nav .alp-brand img{height:48px;}"
```

### 6. Leave the loader alone (for now)

`#alp-loader` (~line 428) also uses `LOGO` — the circular photo with a pulse
animation. Keep it as-is unless asked; its styles assume a square/circular
image and the wide badge would need its own treatment there.

## Acceptance checklist

- [ ] Badge renders top-left at 68px tall (48px under 760px viewport), no circle crop, no border, no text beside it
- [ ] Soft drop shadow visible over the bright hero footage
- [ ] Hover dims badge to 85% opacity (no rotation — that was the old mark's behavior)
- [ ] "Call now" pill unchanged on the right
- [ ] Image loads from the absolute Vercel URL (test on the embedded GoHighLevel page, not just the Vercel preview)
- [ ] Loader still shows the old circular photo (intentional)
