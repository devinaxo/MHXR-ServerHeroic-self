#!/usr/bin/env python3
"""Locate a text label inside an LP4 atlas by its index signature.

The Japanese labels are drawn in the brightest index (15, 20.9% of the atlas) with
a dark outline. Background is index 0. So a label shows up as a dense rectangular
cluster of index-15 pixels standing out from mostly index-0 background.

This scans for exactly that and prints candidate boxes, so the region to erase is
measured rather than guessed.

Usage:
    python3 tex_label.py <atlas.png> [--y0 N] [--y1 N] [--min-w 40] [--min-h 12]
"""
import argparse
from PIL import Image

LEGEND = [
    (255, 0, 255), (255, 0, 0), (0, 255, 0), (0, 0, 255),
    (255, 255, 0), (255, 128, 0), (0, 255, 255), (255, 0, 128),
    (128, 255, 0), (0, 128, 255), (128, 0, 255), (255, 255, 128),
    (0, 255, 128), (128, 0, 128), (128, 128, 128), (255, 255, 255),
]
LOOKUP = {c: i for i, c in enumerate(LEGEND)}
BRIGHT = 15


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('atlas')
    ap.add_argument('--y0', type=int, default=0)
    ap.add_argument('--y1', type=int, default=None)
    ap.add_argument('--min-w', type=int, default=40)
    ap.add_argument('--min-h', type=int, default=10)
    args = ap.parse_args()

    im = Image.open(args.atlas).convert('RGB')
    w, h = im.size
    px = im.load()

    y1 = args.y1 or h
    # bright mask
    bright = bytearray(w * h)
    for y in range(args.y0, y1):
        for x in range(w):
            bright[y * w + x] = 1 if LOOKUP.get(px[x, y]) == BRIGHT else 0

    # row profile over the scan window
    print(f'atlas {w}x{h}, scanning y {args.y0}..{y1}')
    print('\nrows with the most bright pixels:')
    rows = []
    for y in range(args.y0, y1):
        n = sum(bright[y * w + x] for x in range(w))
        rows.append((n, y))
    for n, y in sorted(rows, reverse=True)[:20]:
        print(f'  y {y:5d}: {n:4d} bright')

    # contiguous runs of "busy" rows
    thr = 6
    runs = []
    start = None
    for n, y in rows:
        if n >= thr and start is None:
            start = y
        elif n < thr and start is not None:
            runs.append((start, y - 1))
            start = None
    if start is not None:
        runs.append((start, rows[-1][1]))

    print(f'\nrow runs with >= {thr} bright pixels (candidate labels):')
    for y0, y1_ in runs:
        if y1_ - y0 + 1 < args.min_h:
            continue
        # horizontal extent within the run
        xs = [x for y in range(y0, y1_ + 1) for x in range(w) if bright[y * w + x]]
        if not xs:
            continue
        x0, x1 = min(xs), max(xs)
        if x1 - x0 + 1 < args.min_w:
            continue
        area = sum(bright[y * w + x] for y in range(y0, y1_ + 1) for x in range(x0, x1 + 1))
        box = (x1 - x0 + 1) * (y1_ - y0 + 1)
        print(f'  y {y0:5d}..{y1_:5d}  x {x0:4d}..{x1:4d}  '
              f'box {x1 - x0 + 1:4d}x{y1_ - y0 + 1:3d}  fill {area / box:5.1%}')


if __name__ == '__main__':
    main()
