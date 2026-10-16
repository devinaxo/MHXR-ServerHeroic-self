#!/usr/bin/env python3
"""Edit an LP4 texture by index, without ever knowing the real palette.

An LP4 texture is 4 bits per pixel: two pixels per byte, low nibble first, each
nibble an index into a 16-colour palette that is NOT stored in the file.

The palette is unnecessary for editing. Indices round-trip perfectly, so this
tool:

  decode  renders each index as a distinct, saturated colour and writes a legend
          showing which colour is which index
  encode  reads a PNG you edited, maps each pixel back to an index, and rebuilds
          the TEX with the original header

You therefore paint with the legend colours. Using a colour that is not in the
legend is an error and is rejected, because it cannot be mapped back.

Constraint to be aware of: you can only use the 16 colours already in the
texture's palette. For covering Japanese text that is not a problem -- the white
fill, the dark outline and the button background are all already present, since
the Japanese glyphs are drawn with exactly those.

Usage:
    python3 tex_index_tool.py decode <in.tex> <out.png> [--legend legend.png]
    python3 tex_index_tool.py encode <in.tex> <edited.png> <out.tex>
    python3 tex_index_tool.py verify <original.tex> <rebuilt.tex>
"""
import argparse
import struct
import sys
from pathlib import Path

from PIL import Image

# 16 unmistakable, maximally separated colours. Chosen for easy picking in an
# image editor, NOT for resemblance to the real palette.
LEGEND = [
    (255, 0, 255),    # 0  magenta   -- and fully transparent in-game
    (255, 0, 0),      # 1  red
    (0, 255, 0),      # 2  green
    (0, 0, 255),      # 3  blue
    (255, 255, 0),    # 4  yellow
    (255, 128, 0),    # 5  orange
    (0, 255, 255),    # 6  cyan
    (255, 0, 128),    # 7  pink
    (128, 255, 0),    # 8  lime
    (0, 128, 255),    # 9  azure
    (128, 0, 255),    # 10 violet
    (255, 255, 128),  # 11 pale yellow
    (0, 255, 128),    # 12 spring green
    (128, 0, 128),    # 13 purple
    (128, 128, 128),  # 14 grey
    (255, 255, 255),  # 15 white
]
NEAREST = {}


def build_nearest():
    for i, c in enumerate(LEGEND):
        NEAREST[c] = i
        NEAREST[c[:-1]] = i  # tolerate a dropped alpha channel


build_nearest()


def read_header(d, path):
    if d[:4] != b'TEX ':
        sys.exit(f'{path}: not a TEX file')
    return {
        'flags': struct.unpack_from('<H', d, 6)[0],
        'strip_h': struct.unpack_from('<I', d, 8)[0],
        'width': struct.unpack_from('<H', d, 0x0C)[0],
        'hdr': struct.unpack_from('<I', d, 0x10)[0],
    }


def geometry(d, h):
    """LP4 geometry from the payload length. Verified on parts00/parts03."""
    pay = len(d) - h['hdr']
    if pay % 2:
        sys.exit('payload is not a whole number of pixel pairs')
    texels = pay * 2
    w = h['width']
    if w <= 0 or texels % w:
        sys.exit(f'payload of {texels} texels does not divide by width {w}')
    return w, texels // w


def decode(inp, out, legend_out):
    d = Path(inp).read_bytes()
    h = read_header(d, inp)
    w, ht = geometry(d, h)
    pay = d[h['hdr']:]

    img = Image.new('RGB', (w, ht))
    px = img.load()
    i = 0
    for byte in pay:
        for v in (byte & 0x0F, byte >> 4):
            if i >= w * ht:
                break
            px[i % w, i // w] = LEGEND[v]
            i += 1
    img.save(out)
    print(f'decoded {inp}: {w}x{ht}, {i} texels -> {out}')
    print(f'  header kept verbatim ({h["hdr"]} bytes), strip_h={h["strip_h"]}')

    lg = Image.new('RGB', (16 * 64, 40), (20, 20, 20))
    lpx = lg.load()
    for i in range(16):
        for x in range(64):
            for y in range(40):
                lpx[i * 64 + x, y] = LEGEND[i]
    lg.save(legend_out)
    print(f'  legend -> {legend_out}   (16 swatches left to right = index 0..15)')
    print(f'  index 0 is magenta AND transparent in game: use it to erase.')


def encode(inp, edited, out):
    src = Path(inp).read_bytes()
    h = read_header(src, inp)
    w, ht = geometry(src, h)
    img = Image.open(edited).convert('RGB')
    if img.size != (w, ht):
        sys.exit(f'edited image is {img.size}, expected {(w, ht)}')

    bad = {}
    idx = []
    for y in range(ht):
        for x in range(w):
            c = img.getpixel((x, y))
            v = NEAREST.get(c)
            if v is None:
                bad[c] = bad.get(c, 0) + 1
                v = 0
            idx.append(v)
    if bad:
        print('ERROR: these colours are not in the legend and cannot be mapped:', file=sys.stderr)
        for c, n in sorted(bad.items(), key=lambda kv: -kv[1])[:8]:
            print(f'  rgb{c} x{n}', file=sys.stderr)
        sys.exit(1)

    outb = bytearray()
    for i in range(0, len(idx) - 1, 2):
        outb.append((idx[i] & 0x0F) | ((idx[i + 1] & 0x0F) << 4))
    if len(idx) % 2:
        outb.append(idx[-1] & 0x0F)

    result = bytearray(src[:h['hdr']]) + outb
    if len(result) != len(src):
        sys.exit(f'size changed: {len(src)} -> {len(result)}')
    Path(out).write_bytes(result)
    print(f'encoded {out}: {len(result)} bytes (same size as the original)')
    print(f'  {len(idx)} texels written, no palette needed')


def verify(a, b):
    da, db = Path(a).read_bytes(), Path(b).read_bytes()
    if da == db:
        print(f'IDENTICAL: {a} and {b} are byte-for-byte the same')
        return
    diff = sum(1 for x, y in zip(da, db) if x != y)
    print(f'differ in {diff} of {len(da)} bytes')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    d = sub.add_parser('decode')
    d.add_argument('inp')
    d.add_argument('out')
    d.add_argument('--legend', default=None)
    e = sub.add_parser('encode')
    e.add_argument('inp')
    e.add_argument('edited')
    e.add_argument('out')
    v = sub.add_parser('verify')
    v.add_argument('a')
    v.add_argument('b')
    args = ap.parse_args()

    if args.cmd == 'decode':
        decode(args.inp, args.out, args.legend or (args.out.rsplit('.', 1)[0] + '_legend.png'))
    elif args.cmd == 'encode':
        encode(args.inp, args.edited, args.out)
    else:
        verify(args.a, args.b)


if __name__ == '__main__':
    main()
