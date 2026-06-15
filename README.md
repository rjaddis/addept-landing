# Addept Automotive — Landing Page

Cinematic stepped landing page for [Addept Automotive](https://addeptauto.co.nz/) (Queenstown mechanics), built as a single self-hosted embed for GoHighLevel.

**Live (Vercel, rjaddis-projects):** https://addept-landing-olive.vercel.app
**GHL embed (one line, full-page custom code):**

```html
<script src="https://addept-landing-olive.vercel.app/embed.js"></script>
```

## How it works

- `deploy/embed.js` — the entire experience in one dependency-free script. Injects a fixed fullscreen layer over the host page:
  - **Stepped section navigation** (Noomo-style): the page parks at 7 stops; a scroll gesture plays the background video to the next stop. Wheel/touch/keyboard/dot-nav input.
  - **Scroll-scrubbed video background**: 238 JPEG frames (`deploy/frames/`), drawn to canvas with a sliding pre-decoded ImageBitmap window, sub-frame crossfade blending, and ±2-frame substitution cap so drawing never blocks.
  - **Machine-tracked annotations**: dashed brackets that track the car (phase-correlation, pinned to verified anchors) and the engine block (CSRT) with one keyframe per video frame.
  - **Services card fleet**: 8 frosted-glass cards (geometry measured from Noomo's actual WebGL card textures) riding an arc track across the screen, scroll-driven, with backdrop-blur, slab edges, sheen, float and mouse parallax.
  - **Flow handoff**: after the final CTA the page hands off to native scrolling for the GHL booking calendar (lazy-loaded; its scroll-hijack is neutralised), FAQs and contact.
- `deploy/index.html` — thin shell for standalone hosting/preview.
- `deploy/vercel.json` — cache headers (immutable frames, short-cache embed.js).
- `track.py`, `tracks.json` — the OpenCV tracking pipeline that produced the annotation keyframes.
- `embed-v4-backup.js`, `embed-v5-backup.js` — pre-rewrite snapshots.

## Develop

```sh
cd deploy && python3 -m http.server 8456   # http://localhost:8456
```

Browsers cache embed.js aggressively — hard-refresh (Cmd+Shift+R) after edits.

## Deploy

```sh
cd deploy && npx vercel deploy --prod --yes   # project: addept-landing
```

## Notes

- Video frames are extracted from `landing-bg.mp4` (gearbook-dashboard repo); frames 239+ are excluded (carry Gearbook branding). Re-extract: see git history or `ffmpeg -i landing-bg.mp4 -vf "select='not(mod(n\,2))',scale=1600:-2" -vsync vfr -q:v 5 frames/frame_%04d.jpg`.
- The GHL booking calendar ID lives in `CAL_URL` inside `embed.js`.
- All choreography (section stops, fleet arc, annotation keyframes, colour grade) is plain config data at the top of `embed.js`.
