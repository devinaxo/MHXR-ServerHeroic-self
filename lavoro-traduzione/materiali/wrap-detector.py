#!/usr/bin/env python3
"""Predict how the game wraps an item/material name.

The material-list name box draws with the game's system font (GUI_font.arc ->
GUI/font/font0_high), which is PROPORTIONAL, then breaks the line at a fixed
PIXEL width, with NO word-boundary preference. That is why "Blue Mushroom"
comes out as "Blue Mushroo" / "m" and not "Blue" / "Mushroom".

This tool reads the glyph advances from build/font/font0_high and wraps a string
greedily by pixels. Use it to check a name (or a batch) and to detect breaks
that fall inside a word.

    python3 lavoro-traduzione/materiali/wrap-detector.py "Flame Tree Sap"
    python3 lavoro-traduzione/materiali/wrap-detector.py --calibrate
    python3 lavoro-traduzione/materiali/wrap-detector.py --batch names.txt
"""
import struct, sys, pathlib

HERE = pathlib.Path(__file__).resolve().parent
FONT = HERE / 'build' / 'font' / 'font0_high'
# Pixel width of the name box. Fitted from the owner's in-game observations
# (see --calibrate). Refine it if a test shows otherwise.
BOX = 308

def widths(path=FONT):
    b = path.read_bytes()
    w = {}
    i = 0x4c
    while i + 16 <= len(b):
        code = struct.unpack_from('<I', b, i)[0]
        if 0x20 <= code <= 0x7e:
            w[chr(code)] = b[i + 9]
        i += 16
    return w

W = widths()

def pix(s):
    return sum(W.get(c, 20) for c in s)

def wrap(s, box=BOX):
    lines, cur = [], ''
    for ch in s:
        if cur and pix(cur + ch) > box:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines

def midword(lines, s):
    """True if any break falls between two non-space characters."""
    out = []
    pos = 0
    for i, ln in enumerate(lines):
        pos += len(ln)
        if i < len(lines) - 1 and pos < len(s) and s[pos - 1] != ' ' and s[pos] != ' ':
            out.append(i)
    return out

def report(s, box=BOX):
    L = wrap(s, box)
    bad = midword(L, s)
    tag = ' OK ' if len(L) == 1 or not bad else 'BAD '
    print(f'{tag} {s!r}  ->  {L}')
    for i in bad:
        print(f'      break {i} splits a word')

def calibrate():
    # what the owner reported (line1 the game produced)
    obs = [
        ('Blue Mushroo', 'Blue Mushroom'),
        ('Monster Marr', 'Monster Marrow'),
        ('Flame Tree Sa', 'Flame Tree Sap'),
        ('Flame Tree R', 'Flame Tree Resin'),
        ('Thunder Tree ', 'Thunder Tree Sap'),  # line1 keeps the space, trimmed at draw
        ('Thunder Silk+', 'Thunder Silk++'),
    ]
    lo, hi = 0, 10 ** 9
    for a, full in obs:
        lo = max(lo, pix(a))            # a fits: W >= pix(a)
        hi = min(hi, pix(full[:len(a) + 1]) - 1)  # next char does not: W < that
        print(f'  {pix(a):4d} <= W <= {pix(full[:len(a)+1])-1:4d}   ({a!r})')
    status = 'OK' if lo <= hi else 'CONFLICT (observations noisy)'
    print(f'\nfeasible W: [{lo}, {hi}]  {status}')

if __name__ == '__main__':
    if '--calibrate' in sys.argv:
        calibrate()
    elif '--batch' in sys.argv:
        f = sys.argv[sys.argv.index('--batch') + 1]
        for line in pathlib.Path(f).read_text(encoding='utf-8').splitlines():
            if line.strip():
                report(line)
    elif len(sys.argv) > 1:
        for s in sys.argv[1:]:
            report(s)
    else:
        print(__doc__)
