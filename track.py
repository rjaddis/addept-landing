#!/usr/bin/env python3
"""Track the car and engine through their frame ranges with CSRT,
smooth the tracks, and emit per-frame keyframes as JS arrays."""
import cv2, json, sys

FRAMES = "/Users/ryan/addept-rebuild/deploy/frames/frame_%04d.jpg"
W, H = 1600, 900
TOTAL = 238  # frames used by the site (1-based file numbers)

def p_of(frame_no):  # scroll % for a 1-based frame number
    return (frame_no - 1) / (TOTAL - 1) * 100

def track(start, end, init_pct):
    """init_pct = (x, y, w, h) in % of frame; returns list of (frame_no, x, y, w, h) in %."""
    x = init_pct[0] / 100 * W
    y = init_pct[1] / 100 * H
    w = init_pct[2] / 100 * W
    h = init_pct[3] / 100 * H
    img = cv2.imread(FRAMES % start)
    if img is None:
        sys.exit(f"missing frame {start}")
    tracker = cv2.TrackerCSRT_create()
    tracker.init(img, (int(x), int(y), int(w), int(h)))
    out = [(start, x / W * 100, y / H * 100, w / W * 100, h / H * 100)]
    for f in range(start + 1, end + 1):
        img = cv2.imread(FRAMES % f)
        ok, box = tracker.update(img)
        if not ok:
            print(f"  lost at frame {f}", file=sys.stderr)
            box = out[-1][1:]  # carry last box (already %)
            out.append((f, *box))
            continue
        bx, by, bw, bh = box
        out.append((f, bx / W * 100, by / H * 100, bw / W * 100, bh / H * 100))
    return out

def smooth(track_pts, win=2):
    """centered moving average over ±win frames per component"""
    n = len(track_pts)
    sm = []
    for i in range(n):
        lo, hi = max(0, i - win), min(n, i + win + 1)
        xs = track_pts[lo:hi]
        sm.append((track_pts[i][0],
                   sum(p[1] for p in xs) / len(xs), sum(p[2] for p in xs) / len(xs),
                   sum(p[3] for p in xs) / len(xs), sum(p[4] for p in xs) / len(xs)))
    return sm

def emit(name, pts):
    rows = ",\n        ".join(
        f"[{p_of(f):.2f}, {x:.1f}, {y:.1f}, {w:.1f}, {h:.1f}]" for f, x, y, w, h in pts)
    print(f"      // {name}: frames {pts[0][0]}-{pts[-1][0]}, auto-tracked (CSRT)")
    print(f"      keys: [\n        {rows}\n      ]")
    return [[round(p_of(f), 2), round(x, 1), round(y, 1), round(w, 1), round(h, 1)] for f, x, y, w, h in pts]

print("tracking car (94-116)...", file=sys.stderr)
car = smooth(track(94, 116, (61, 44, 37, 36)))
print("tracking engine (126-169)...", file=sys.stderr)
eng = smooth(track(126, 169, (47, 26, 19, 25)))

data = {"car": emit("car", car), "engine": emit("engine", eng)}
with open("/Users/ryan/addept-rebuild/tracks.json", "w") as fh:
    json.dump(data, fh)
print("wrote tracks.json", file=sys.stderr)
