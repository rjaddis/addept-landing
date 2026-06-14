# Addept Automotive — new service icon set (v2)

Eight redesigned service icons for the landing page's frosted-glass card fleet,
replacing the originals with more literal, recognizable symbols. Same brand
grammar as before: **24×24 viewBox, stroke currentColor, stroke-width 1.6, round
caps and joins, no fill.**

| File | Service | What it shows now |
| --- | --- | --- |
| `oil-service.svg` | Oil & General Service | Oil can with spout, cap and handle |
| `brakes.svg` | Brake Services | Brake disc with bolt holes + caliper arc over the top |
| `engine.svg` | Engine Diagnostics | Check-engine-light silhouette with intake T |
| `gearbox.svg` | Transmission | H-pattern manual shifter (5 knobs + gate) |
| `suspension.svg` | Suspension | Shock absorber — eyes top/bottom, coil body |
| `exhaust.svg` | Exhaust | Muffler with baffles, tailpipe and fume puffs |
| `electrical.svg` | Auto Electrical | Lightning bolt in a circle |
| `inspection.svg` | Pre-Purchase Inspections | Magnifier with a check mark |

The `check` and `chevron-down` utility glyphs are unchanged.

## How to implement in `deploy/embed.js`

The icons live in the `ICONS` array (~line 220), right after the `SERVICES`
array. Each entry is the **inner markup only** (no `<svg>` wrapper) — the
wrapper is added at render time (~line 245) as
`<svg class="alp-fico" viewBox="0 0 24 24">…</svg>`, and the CSS rule
`.alp-fcard svg.alp-fico` (~line 132) already applies the stroke styling.

So: replace each of the 8 strings in `ICONS` with the inner markup of the
matching SVG file in this folder (everything between `<svg …>` and `</svg>`).
**Order matters** — the array maps 1:1 onto `SERVICES`:

```
0 oil-service  → Oil & General Service
1 brakes       → Brake Services
2 engine       → Engine Diagnostics
3 gearbox      → Transmission
4 suspension   → Suspension
5 exhaust      → Exhaust
6 electrical   → Auto Electrical
7 inspection   → Pre-Purchase / WOF
```

Mind the JS string quoting: the inner markup uses double quotes for attributes,
and the array entries are single-quoted strings — keep it that way and no
escaping is needed.

No other changes required — no CSS edits, no new files to deploy (the markup is
inlined into the JS). The SVG files in this folder are reference copies; they
don't need to be uploaded anywhere.

## Acceptance checklist

- [ ] All 8 frosted-glass service cards show the new icons, dark ink (#181520), no fill
- [ ] Stroke weight looks identical to before (1.6, set by CSS — don't add stroke attributes to the inner markup)
- [ ] Icons still scale with the card (CSS sizes them at 8.2cqw)
- [ ] Check ticks and the scroll-cue chevron are unchanged
