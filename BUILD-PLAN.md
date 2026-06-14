# Addept Landing — Build Plan & Phase Status

Resumable plan for the multi-phase improvement build. **A fresh session (phone
or desktop) can resume from this file alone** — say _"continue with phase N"_.

Production: https://addeptauto.co.nz/ · Preview: https://addept-landing.vercel.app
Everything lives in `deploy/index.html` (thin shell) + `deploy/embed.js` (~252 KB IIFE).

## Hard constraints (apply to every phase)
- **Do NOT change how the homepage looks or behaves.** All work is additive,
  a one-line enable, or guarded one-liners. Visual parity is the bar.
- **`embed.js` is ~252 KB — never read it whole.** Make targeted, line-anchored
  edits. Line numbers drift between phases, so **`grep` for the anchor** (a
  unique nearby string), don't trust the numbers in this file.
- **Keep each session lean** (the owner asks for < ~60% context). One phase per
  session is fine; each phase is independent and reversible.
- **Media via shell** (ffmpeg 8.1 + Node/sharp present). Masters are preserved;
  produce before/after evidence and get sign-off before replacing any master.
- **Verify before pushing**: serve `deploy/` locally, drive it, confirm zero
  console errors + visuals unchanged. Commit + push to `main` so the next
  device can continue.

## Phase status
| # | Phase | Status |
|---|-------|--------|
| 1 | Analytics (GA4 + conversion events) | ✅ done |
| 2 | Section-nav snappiness + scroll smoothness | ✅ done (commit `b9a6b3e`) |
| 3 | Video re-encode (booking background) | ✅ done |
| 4 | Film MozJPEG re-encode (scroll frames) | ⬅ **NEXT** |
| 5 | Contact icons in the nav (Call / Text / WhatsApp) | ⬜ pending |
| 6 | Local-SEO pages + sitemap/robots + cleanUrls | ⬜ pending |

### Done so far
- **Phase 1 — Analytics.** Guarded `track(ev, params)` (try/catch + `window.GA_ID`
  check) plus conversion events (`estimate_success/error`, `booking_calendar_open`,
  `sound_toggle`, + the existing pageview/section/story events).
  ⚠️ **Owner action still pending:** paste the real GA4 Measurement ID
  (`G-XXXXXXXXXX`) into `window.GA_ID` (grep `GA_ID` in `index.html`). Until then
  analytics no-ops by design.
- **Phase 2 — Section-nav + smoothness** (`embed.js` only, all behaviour-preserving):
  - **Snappier wheel trigger** — a decisive flick (`e.deltaY >= 50`) fires the
    move immediately instead of waiting for the `±110` accumulator; gentle
    scrolls still accumulate. The `+420 ms` post-move cooldown + `transitioning`
    guard swallow trackpad momentum (no double-advance).
  - **Snappier touch trigger** — a deliberate `~48 px` swipe fires (was a 70 px
    dead-zone); `touchUsed` still caps one move per gesture.
  - **`prefetchSweep`** now also warms a move's **opening** frames (not just the
    landing), inside the existing `BMP_INFLIGHT_MAX` cap — no decode burst, so
    the crash-tuned decode pipeline is untouched.
  - **`spacerH` cache** — `spacer.offsetHeight` is memoized (refreshed on resize)
    so the per-frame bridge-ride loop no longer forces a synchronous layout.
  - **Transition speed/easing unchanged.**
  - **Deferred on purpose** (don't redo blindly): (a) merging the two rAF loops —
    browsers already coalesce all rAF callbacks into one frame, so it's ~0 gain
    and risks the weld/spark choreography; (b) the `styleTextFx` per-letter
    value-cache — setting a style to its current value doesn't reflow in modern
    engines, so it's JS-only, brief, and risky vs. the visual-parity bar.

- **Phase 3 — Video re-encode** (additive, no master replaced):
  The plan assumed x264 CRF 21 would shrink the masters ~40-55%, but the two
  `workshop*.mp4` files were **already near-optimally encoded** (~2.9–3.3 Mbps
  H.264 @ 1080p) — re-encoding at any visually-lossless x264 CRF came out the
  same size or larger (CRF 23 ≈ 100%, CRF 25 ≈ 85%). So instead of touching the
  masters, we **added VP9 WebM `<source>` siblings** that capable browsers pick
  via `canPlayType('video/webm; codecs="vp9"')`; everyone else keeps the
  untouched mp4. CRF 34, `-b:v 0` (constant-quality), `-auto-alt-ref 1
  -lag-in-frames 25`, audio dropped.
  - `workshop.webm` 7.86 MB → **5.38 MB (−31.5%)**, PSNR 45.5 dB / SSIM 0.989
  - `workshop-mobile.webm` 5.84 MB → **3.39 MB (−42%)**, PSNR 45.8 dB / SSIM 0.988
  - Both > 44 dB (visually-lossless bar) with margin. Change is one guarded
    branch in `loadFlowMedia` (grep `webmOk`); the existing HEAD-probe existence
    check + mobile→desktop fallback are untouched. `vercel.json` cache rule and
    the playback attributes (muted/loop/playsinline/poster) are unchanged.
  - ⚠️ This env had **no ffmpeg** (apt-installed 6.1.1) and **no libvmaf** — used
    SSIM/PSNR for the quality gate. Before/after stills: `compare-*.png`
    (gitignored, evidence only).

---

## Phase 3 — Video re-encode (DONE — see note above)
**Goal:** shrink the looping booking-page background with no visible quality loss.

**Targets:** `deploy/workshop.mp4` (~7.5 MB) + `deploy/workshop-mobile.mp4` (~5.6 MB).
The `<video>` element is built in `embed.js` — **grep `workshop` / `loadFlowMedia`
/ `<video`** to find the build + the mobile-vs-desktop source selection.

**Approach** (ffmpeg 8.1; the background is muted + looping, so drop audio):
```sh
cd deploy
# H.264, visually-lossless for this footage, web-streamable
ffmpeg -i workshop.mp4 -c:v libx264 -profile:v high -crf 21 -preset slow \
  -pix_fmt yuv420p -an -movflags +faststart workshop.opt.mp4
ffmpeg -i workshop-mobile.mp4 -c:v libx264 -profile:v high -crf 21 -preset slow \
  -pix_fmt yuv420p -an -movflags +faststart workshop-mobile.opt.mp4
# optional extra savings on supporting browsers (add as a <source> BEFORE mp4):
ffmpeg -i workshop.mp4 -c:v libvpx-vp9 -crf 32 -b:v 0 -an workshop.webm
```
- Compare bytes + spot-check a few frames; CRF 20–21 is the visually-lossless
  band — nudge CRF if needed. Expect ~40–55% smaller.
- **Sign-off:** show the owner before/after (size delta + a still or two) BEFORE
  replacing masters. Keep originals (e.g. `*.orig.mp4`, or rely on git history).
- If you add a WebM `<source>`, place it before the MP4 `<source>` so capable
  browsers pick it; keep the MP4 fallback and the mobile variant.
- Don't change playback attributes (muted/loop/playsinline/poster) or layout.

**Verify:** booking page background plays + loops identically; no console errors;
mobile still gets the mobile file. Then commit + push.

---

## Phase 4 — Film MozJPEG re-encode
Re-encode the 238 scroll frames in `deploy/frames/` (`frame_0001.jpg` …) with
MozJPEG/sharp at **q ≈ 88–90**, trellis quant, optimized Huffman, **keep
1600×900** (portrait phones cover-crop by height — lowering res *reduces*
sharpness). Stays JPEG → scrub-decode speed unchanged. Expect ~21 MB → ~15–17 MB.
**Sign-off on 100% before/after crops** before replacing. Do NOT adopt AVIF/WebP
for the scrub (the abandoned `deploy/frames-avif/`, gitignored, was soft + slow to
decode — that's the known failure). Optional, owner-gated: trim frame count via
the existing sub-frame blend (`grep` for the `fa` blend / `TOTAL_FRAMES`).

## Phase 5 — Contact icons in the nav
Desktop top-right: **Call + WhatsApp**. Mobile top-right: **Call + Text +
WhatsApp** as ~40 px circular icon buttons (≥44 px tap target, ≥8 px gaps, visible
focus, `aria-label` + inline `<svg aria-hidden>`). Call/Text = white line icons;
**WhatsApp = official green glyph**. Mobile Call dials `tel:+64274393403`; desktop
Call opens a click-toggle popover with the number + Copy (desktop `tel:` is dead).
WhatsApp `https://wa.me/64274393403?text=…`; Text `sms:+64274393403` (mobile only).
Each reuses `track()` (`whatsapp_click`, `text_click`). Nav markup/CSS — grep the
nav (`.alp-call`, `.alp-nbook`, `.alp-nest`). ⚠️ The contact **section** was given a
separate "V5" redesign (bracketed diagnostic plates) — check its current markup
before adding the matching contact-row buttons there.

## Phase 6 — Local SEO (largest; its own session)
Generate **12 service pages + a `/services/` hub** from **one template + a
per-service data array** (a short Node script — don't hand-write). Each page:
branded-lightweight, **does NOT load `embed.js`**, real crawlable copy adapted
from the SERVICES array (grep `SERVICES`), Queenstown angle, NAP block
(Addept Automotive · 35B Brookes Road, Frankton · 027 439 3403 · Mon–Thu 7–5,
Fri by appt), 2–3 real reviews, `Service` + `AutoRepair` JSON-LD, CTAs
(`tel:` + booking). Plus `deploy/robots.txt`, `deploy/sitemap.xml`, and
`"cleanUrls": true` in `deploy/vercel.json`. Target "WOF **repairs**", not
issuing WOFs. Service list + URLs are in the full plan (see below).

---

## Dev / verify / deploy
```sh
cd deploy && python3 -m http.server 8456     # http://localhost:8456 (hard-refresh after edits)
cd deploy && npx vercel deploy --prod --yes  # project: addept-landing
```
Local verify pattern that worked for phase 2: serve `deploy/`, load with a
browser, drive section-nav / booking flow, confirm **zero console errors** and a
screenshot matching the live look.

_Fuller rationale + the phase-6 service-page list live in the owner's local plan
(`~/.claude/plans/im-happy-to-do-structured-gray.md`) — not needed to execute, but
the source of truth for scope decisions._
