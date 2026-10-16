#!/usr/bin/env python3
"""Erase the Japanese label from one button in an LP4 atlas.

The atlas is 512x2048 and holds a stack of button/frame strips. This paints a
rectangle of a chosen index over a region, which is the smallest possible test of
the write path: if the button loses its label in game, the loop closes.

Only the region named on the command line is touched. The output is a PNG in the
same legend colours that tex_index_tool.py encode expects.

Usage:
    python3 tex_erase.py <atlas.png> <out.png> --at x,y,w,h --index N [--preview]
"""
import argparse
from PIL import Image

LEGEND = [
    (255, 0, 255), (255, 0, 0), (0, 255, 0), (0, 0, 255),
    (255, 255, 0), (255, 128, 0), (0, 255, 255), (255, 0, 128),
    (128, 255, 0), (0, 128, 255), (128, 0, 255), (255, 255, 128),
    (0, 255, 128), (128, 0, 128), (128, 128, 128), (255, 255, 255),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('atlas')
    ap.add_argument('out')
    ap.add_argument('--at', required=True, help='x,y,w,h')
    ap.add_argument('--index', type=int, required=True)
    ap.add_argument('--preview', action='store_true',
                    help='also write a crop of the region, magnified')
    args = ap.parse_args()

    im = Image.open(args.atlas).convert('RGB')
    x, y, w, h = (int(v) for v in args.at.split(','))
    if not 0 <= args.index < 16:
        raise SystemExit('--index must be 0..15')

    before = im.crop((x, y, x + w, y + h))
    counts = {}
    for p in before.getdata():
        counts[p] = counts.get(p, 0) + 1
    print(f'region {w}x{h} at ({x},{y})')
    print('  before: ' + ', '.join(
        f'idx{LEGEND.index(c) if c in LEGEND else "?"}={n}'
        for c, n in sorted(counts.items(), key=lambda kv: -kv[1])[:6]))

    fill = Image.new('RGB', (w, h), LEGEND[args.index])
    im.paste(fill, (x, y))
    im.save(args.out)
    print(f'  painted index {args.index} rgb{LEGEND[args.index]}')
    print(f'  wrote {args.out}')

    if args.preview:
        mag = max(1, min(8, 1200 // max(w, h)))
        before.resize((w * mag, h * mag), Image.NEAREST).save(args.out + '.before.png')
        after = im.crop((x, y, x + w, y + h)).resize((w * mag, h * mag), Image.NEAREST)
        after.save(args.out + '.after.png')
        print(f'  previews at {mag}x -> {args.out}.before.png / .after.png')


if __name__ == '__main__':
    main()
