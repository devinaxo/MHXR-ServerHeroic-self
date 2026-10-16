#!/usr/bin/env python3
"""crcJam, the checksum the resource manifests use.

Table-driven CRC-32 (poly 0xEDB88320, init 0xFFFFFFFF) WITHOUT the final XOR,
matching crc/crcjam which the server uses in initResourceDownloadList.ts.

    crcJam("123456789") = 340bc6d9   (zlib gives cbf43926, the complement)
    crcJam("")         = ffffffff

Usage: python3 crcjam.py <file>...
"""
import sys

_TAB = []
for _i in range(256):
    _c = _i
    for _ in range(8):
        _c = 0xEDB88320 ^ (_c >> 1) if _c & 1 else _c >> 1
    _TAB.append(_c)


def crcjam(data, crc=0xFFFFFFFF):
    for b in data:
        crc = _TAB[(crc ^ b) & 0xFF] ^ (crc >> 8)
    return crc & 0xFFFFFFFF


def crcjam_file(path, chunk=4 * 1024 * 1024):
    crc = 0xFFFFFFFF
    with open(path, 'rb') as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            crc = crcjam(b, crc)
    return crc & 0xFFFFFFFF


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    for p in sys.argv[1:]:
        print(f'{crcjam_file(p):08x}  {p}')
