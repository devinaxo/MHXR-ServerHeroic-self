#!/usr/bin/env python3
"""Disassemble a vaddr range of an ELF (arm64) with capstone.

    python3 frida/disasm.py <elf> <start_vaddr_hex> <stop_vaddr_hex>
    python3 frida/disasm.py <elf> --sym <mangled_or_demangled_name>

Used to read the MHXR client (libMHS.so) story/drama code without Ghidra.
"""
import sys
import struct

from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN


def load_segments(path):
    with open(path, "rb") as f:
        data = f.read()
    assert data[:4] == b"\x7fELF"
    is64 = data[4] == 2
    assert is64, "only ELF64 is handled"
    e_phoff = struct.unpack_from("<Q", data, 0x20)[0]
    e_phentsize = struct.unpack_from("<H", data, 0x36)[0]
    e_phnum = struct.unpack_from("<H", data, 0x38)[0]
    segs = []
    for i in range(e_phnum):
        off = e_phoff + i * e_phentsize
        p_type = struct.unpack_from("<I", data, off)[0]
        if p_type != 1:  # PT_LOAD
            continue
        p_offset = struct.unpack_from("<Q", data, off + 0x08)[0]
        p_vaddr = struct.unpack_from("<Q", data, off + 0x10)[0]
        p_filesz = struct.unpack_from("<Q", data, off + 0x20)[0]
        segs.append((p_vaddr, p_offset, p_filesz))
    return data, segs


def vaddr_to_offset(segs, vaddr):
    for p_vaddr, p_offset, p_filesz in segs:
        if p_vaddr <= vaddr < p_vaddr + p_filesz:
            return p_offset + (vaddr - p_vaddr)
    raise ValueError(f"vaddr {vaddr:#x} not in any PT_LOAD segment")


def dynsyms(path):
    data, segs = load_segments(path)
    # use nm through subprocess for demangled names
    import subprocess
    out = subprocess.run(["nm", "-D", "-C", path], capture_output=True, text=True).stdout
    syms = []
    for line in out.splitlines():
        parts = line.split(maxsplit=2)
        if len(parts) != 3:
            continue
        addr, typ, name = parts
        try:
            syms.append((int(addr, 16), name))
        except ValueError:
            continue
    return sorted(syms)


def main():
    path = sys.argv[1]
    if sys.argv[2] == "--sym":
        needle = sys.argv[3]
        for addr, name in dynsyms(path):
            if needle in name:
                print(f"{addr:#x}  {name}")
        return
    start = int(sys.argv[2], 16)
    stop = int(sys.argv[3], 16)
    data, segs = load_segments(path)
    off = vaddr_to_offset(segs, start)
    length = stop - start
    code = data[off:off + length]
    md = Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
    md.detail = False
    for insn in md.disasm(code, start):
        print(f"{insn.address:#x}:  {insn.mnemonic}\t{insn.op_str}")


if __name__ == "__main__":
    main()
