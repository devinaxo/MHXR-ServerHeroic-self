#!/usr/bin/env python3
"""Build the calibration dictionary for the material-name wrap test.

Maps the CURRENT pack name -> a test string. Two alphabet "rulers" pin the box
pixel width; the rest test whether any break code is honored in this box.

    python3 lavoro-traduzione/materiali/build-calibration-dict.py
    -> lavoro-traduzione/materiali/build/calibration.json
"""
import json, pathlib

REPO = pathlib.Path(__file__).resolve().parents[2]
OUT = REPO / 'lavoro-traduzione/materiali/build/calibration.json'

TESTS = {
    'Blue Mushroom':      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',   # ruler, uppercase
    'Blue Mushroom+':     'abcdefghijklmnopqrstuvwxyz',   # ruler, lowercase
    'Monster Marrow':     'Alpha\nBeta',                  # LF
    'Flame Tree Sap':     'Gamma\rDelta',                 # CR
    'Flame Tree Resin':   'Epsilon\r\nZeta',              # CRLF (control)
    'Thunder Silk++':     'Eta<BR>Theta',                 # tag
    'Iron Ore':           'Iota\x0bKappa',                # vertical tab
    'Machalite Ore':      'Kappa Lambda Mu',              # spaces (word wrap?)
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(TESTS, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'{len(TESTS)} test rows -> {OUT.relative_to(REPO)}')
for k, v in TESTS.items():
    print(f'  {k!r:20} -> {v!r}')
