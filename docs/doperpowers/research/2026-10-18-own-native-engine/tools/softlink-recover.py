#!/usr/bin/env python3 -I
"""Recover the names behind SkyComputerUseService's hashed soft-links (SoftLink module).

How the helper resolves a private symbol (from the decompiled SoftLink module, F §11):
  request hash  = SipHash-2-4(key = 00 01 .. 0f, exportTrieName ‖ salt)      (64-bit)
  image word    = (strategy << 56) | (SipHash-2-4(key, dyldImagePath ‖ salt) & 0x00FF_FFFF_FFFF_FFFF)
where `salt` is one of the 28 hex strings (125-128 chars) embedded in the binary, the trie name
carries its leading underscore, and `strategy` is SoftLink.ImageSearchStrategy (0 framework,
1 privateFramework, 2 library, 3 path). Each SymbolRequest is [hash("_name"), hash("name")]:
the second alternative is the dlsym form without the underscore (verified on CGEventPostToPid).

This script hashes every export of the candidate frameworks against every salt and scans the
helper's data segments for the resulting words, so each hit gives (address, name, salt).

Usage:
  python3 -I softlink-recover.py <helper binary> <exports dir> <out.tsv>
<exports dir> holds `<Image>.exports` files written by `xcrun dyld_info -exports <path>`.
Static only: the helper is read as bytes, never executed.
"""
import re
import struct
import sys
from pathlib import Path

MASK64 = (1 << 64) - 1
K0, K1 = 0x0706050403020100, 0x0F0E0D0C0B0A0908  # the textbook SipHash key, read from the IVs


def rotl(x, b):
    return ((x << b) | (x >> (64 - b))) & MASK64


def sipround(v0, v1, v2, v3):
    v0 = (v0 + v1) & MASK64; v1 = rotl(v1, 13); v1 ^= v0; v0 = rotl(v0, 32)
    v2 = (v2 + v3) & MASK64; v3 = rotl(v3, 16); v3 ^= v2
    v0 = (v0 + v3) & MASK64; v3 = rotl(v3, 21); v3 ^= v0
    v2 = (v2 + v1) & MASK64; v1 = rotl(v1, 17); v1 ^= v2; v2 = rotl(v2, 32)
    return v0, v1, v2, v3


class SipState:
    __slots__ = ("v", "pending", "count")

    def __init__(self):
        self.v = (K0 ^ 0x736F6D6570736575, K1 ^ 0x646F72616E646F6D,
                  K0 ^ 0x6C7967656E657261, K1 ^ 0x7465646279746573)
        self.pending = b""
        self.count = 0

    def copy(self):
        s = SipState.__new__(SipState)
        s.v, s.pending, s.count = self.v, self.pending, self.count
        return s

    def update(self, data: bytes):
        buf = self.pending + data
        self.count += len(data)
        v0, v1, v2, v3 = self.v
        n = len(buf) // 8
        for i in range(n):
            m = struct.unpack_from("<Q", buf, i * 8)[0]
            v3 ^= m
            v0, v1, v2, v3 = sipround(v0, v1, v2, v3)
            v0, v1, v2, v3 = sipround(v0, v1, v2, v3)
            v0 ^= m
        self.v = (v0, v1, v2, v3)
        self.pending = buf[n * 8:]

    def finalize(self) -> int:
        v0, v1, v2, v3 = self.v
        tail = self.pending + b"\0" * (7 - len(self.pending)) + bytes([self.count & 0xFF])
        m = struct.unpack("<Q", tail)[0]
        v3 ^= m
        v0, v1, v2, v3 = sipround(v0, v1, v2, v3)
        v0, v1, v2, v3 = sipround(v0, v1, v2, v3)
        v0 ^= m
        v2 ^= 0xFF
        for _ in range(4):
            v0, v1, v2, v3 = sipround(v0, v1, v2, v3)
        return v0 ^ v1 ^ v2 ^ v3


def siphash(msg: bytes) -> int:
    s = SipState()
    s.update(msg)
    return s.finalize()


def segments(data: bytes):
    """Yield (segname, vmaddr, fileoff, filesize) for every LC_SEGMENT_64 of a thin arm64 file."""
    magic, cputype, cpusub, filetype, ncmds, sizeofcmds, flags, reserved = struct.unpack_from("<IiiIIIII", data, 0)
    assert magic == 0xFEEDFACF, "not a 64-bit Mach-O"
    off = 32
    for _ in range(ncmds):
        cmd, cmdsize = struct.unpack_from("<II", data, off)
        if cmd == 0x19:  # LC_SEGMENT_64
            segname = data[off + 8:off + 24].rstrip(b"\0").decode()
            vmaddr, vmsize, fileoff, filesize = struct.unpack_from("<QQQQ", data, off + 24)
            yield segname, vmaddr, fileoff, filesize
        off += cmdsize


def find_salts(data: bytes):
    """The 125-128 character lowercase-hex NUL-terminated strings (E §3.1 lists 28)."""
    salts = []
    for m in re.finditer(rb"(?<![0-9a-f])[0-9a-f]{120,128}(?=\0)", data):
        salts.append((m.start(), m.group().decode()))
    return salts


def load_exports(exports_dir: Path):
    names = {}
    for f in sorted(exports_dir.glob("*.exports")):
        image = f.stem
        for line in f.read_text(errors="replace").splitlines():
            m = re.match(r"\s*0x[0-9A-Fa-f]+\s+(\S+)", line)
            if not m:
                # re-exported names live in the trie too: `[re-export] _CGEventPost (_SLEventPost from SkyLight)`
                m = re.match(r"\s*\[re-export\]\s+(\S+)", line)
            if not m:
                continue
            n = m.group(1)
            if n.startswith("_$s") or n.startswith("_OBJC_") or n.startswith("__Z"):
                continue
            names.setdefault(n, image)
            if n.startswith("_"):
                names.setdefault(n[1:], image + " (dlsym form)")
    return names


IMAGE_PATHS = [
    "/System/Library/PrivateFrameworks/SkyLight.framework/Versions/A/SkyLight",
    "/System/Library/Frameworks/CoreGraphics.framework/Versions/A/CoreGraphics",
    "/System/Library/Frameworks/ApplicationServices.framework/Versions/A/Frameworks/HIServices.framework/Versions/A/HIServices",
    "/System/Library/Frameworks/ApplicationServices.framework/Versions/A/ApplicationServices",
    "/System/Library/Frameworks/AppKit.framework/Versions/C/AppKit",
    "/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation",
    "/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation",
    "/usr/lib/system/libquarantine.dylib",
    "/usr/lib/system/libsystem_kernel.dylib",
    "/usr/lib/system/libsystem_info.dylib",
    "/usr/lib/system/libdyld.dylib",
    "/usr/lib/system/libsystem_c.dylib",
    "/usr/lib/system/libxpc.dylib",
    "/usr/lib/libSystem.B.dylib",
    "/usr/lib/libobjc.A.dylib",
    "/System/Library/Frameworks/IOKit.framework/Versions/A/IOKit",
    "/System/Library/Frameworks/Carbon.framework/Versions/A/Frameworks/HIToolbox.framework/Versions/A/HIToolbox",
    "/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/LaunchServices",
    "/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/CarbonCore.framework/Versions/A/CarbonCore",
    "/System/Library/Frameworks/ScreenCaptureKit.framework/Versions/A/ScreenCaptureKit",
    "/System/Library/Frameworks/Security.framework/Versions/A/Security",
    "/System/Library/PrivateFrameworks/CoreUI.framework/Versions/A/CoreUI",
    "/System/Library/PrivateFrameworks/ViewBridge.framework/Versions/A/ViewBridge",
    "/System/Library/PrivateFrameworks/UniversalAccess.framework/Versions/A/UniversalAccess",
    "/System/Library/PrivateFrameworks/AccessibilityUtilities.framework/Versions/A/AccessibilityUtilities",
    "/System/Library/PrivateFrameworks/RunningBoardServices.framework/Versions/A/RunningBoardServices",
    "/System/Library/PrivateFrameworks/CoreAnalytics.framework/Versions/A/CoreAnalytics",
    "/System/Library/Frameworks/WebKit.framework/Versions/A/WebKit",
    "/System/Library/Frameworks/Accessibility.framework/Versions/A/Accessibility",
]


def all_framework_paths():
    """Install-name candidates for every framework and system library on this machine."""
    paths = list(IMAGE_PATHS)
    for root in ("/System/Library/Frameworks", "/System/Library/PrivateFrameworks"):
        for fw in sorted(Path(root).glob("*.framework")):
            name = fw.stem
            for ver in ("A", "B", "C", "Current"):
                paths.append(f"{fw}/Versions/{ver}/{name}")
            paths.append(f"{fw}/{name}")
            for sub in sorted(fw.glob("Versions/*/Frameworks/*.framework")):
                n2 = sub.stem
                for ver in ("A", "B", "C"):
                    paths.append(f"{sub}/Versions/{ver}/{n2}")
    for root in ("/usr/lib", "/usr/lib/system", "/usr/lib/swift"):
        for lib in sorted(Path(root).glob("*.dylib")):
            paths.append(str(lib))
    return paths


def main(argv):
    binary, exports_dir, out = Path(argv[1]), Path(argv[2]), Path(argv[3])
    data = binary.read_bytes()
    salts = find_salts(data)
    names = load_exports(exports_dir)
    print(f"{len(salts)} salts, {len(names)} candidate names", file=sys.stderr)

    # Pre-absorb each salt-independent prefix once, then fork per salt.
    table = {}  # 64-bit word -> (kind, name, salt index, image)
    salt_bytes = [s.encode() for _, s in salts]
    for i, (name, image) in enumerate(names.items()):
        base = SipState()
        base.update(name.encode())
        for si, sb in enumerate(salt_bytes):
            st = base.copy()
            st.update(sb)
            h = st.finalize()
            table.setdefault(h, ("symbol", name, si, image))
        if i % 5000 == 0:
            print(f"  hashed {i}/{len(names)}", file=sys.stderr)
    for path in all_framework_paths():
        base = SipState()
        base.update(path.encode())
        for si, sb in enumerate(salt_bytes):
            st = base.copy()
            st.update(sb)
            h = st.finalize() & 0x00FFFFFFFFFFFFFF
            for strategy in range(4):
                table.setdefault((strategy << 56) | h, ("image", f"{path} [strategy {strategy}]", si, "-"))

    hits = []
    for segname, vmaddr, fileoff, filesize in segments(data):
        if segname in ("__PAGEZERO", "__LINKEDIT"):
            continue
        end = fileoff + filesize
        for off in range(fileoff, end - 7, 8):
            w = struct.unpack_from("<Q", data, off)[0]
            if w in table:
                kind, name, si, image = table[w]
                hits.append((vmaddr + (off - fileoff), kind, name, si, image, w))
    hits.sort()
    with out.open("w") as f:
        f.write("vmaddr\tkind\tname\tsalt\timage\tword\n")
        for a, kind, name, si, image, w in hits:
            f.write(f"0x{a:x}\t{kind}\t{name}\t{si}:{salts[si][1][:8]}\t{image}\t0x{w:016x}\n")
    print(f"{len(hits)} hits -> {out}", file=sys.stderr)
    with out.with_suffix(".salts.txt").open("w") as f:
        for i, (off, s) in enumerate(salts):
            f.write(f"{i}\tfileoff 0x{off:x}\t{s}\n")


if __name__ == "__main__":
    main(sys.argv)
