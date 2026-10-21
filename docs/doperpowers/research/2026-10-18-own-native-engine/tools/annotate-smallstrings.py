#!/usr/bin/env python3 -I
"""Annotate Swift small-string immediates in Ghidra decompiler output.

Swift stores string literals of up to 15 UTF-8 bytes as two 64-bit words: word 0 holds
bytes 0-7, word 1 holds bytes 8-14 with the discriminator in its top byte (0xE0|count for
ASCII, 0xA0|count for non-ASCII). The decompiler prints them as bare hex constants, so each
`.c` file is rewritten in place with `/* "literal" */` after any constant that decodes to
printable text (word 0 alone, or a word 1 whose count is <= 7 and stands alone).

Usage: python3 -I annotate-smallstrings.py <dir-or-file>...
Idempotent: a constant already followed by a comment is left alone.
"""
import re
import sys
from pathlib import Path

HEX = re.compile(r"0x([0-9a-fA-F]{3,16})(?!\s*/\*)")


def decode_word(value: int):
    """Return the text a 64-bit immediate contributes, or None."""
    top = value >> 56
    if (top & 0xF0) == 0xE0 and (top & 0x0F) <= 15:
        count = top & 0x0F
        body = (value & 0x00FFFFFFFFFFFFFF).to_bytes(7, "little")
        if count <= 7:
            text = body[:count]
            if text and all(32 <= b < 127 for b in text):
                return f'"{text.decode()}" (len {count})'
            return None
        rest = body.rstrip(b"\0")
        if all(32 <= b < 127 for b in rest):
            return f'..."{rest.decode()}" (len {count}, tail)'
        return None
    if (top & 0xF0) == 0xA0:
        count = top & 0x0F
        return f"(non-ASCII small string, len {count})"
    raw = value.to_bytes(8, "little").rstrip(b"\0")
    if len(raw) >= 3 and all(32 <= b < 127 for b in raw):
        return f'"{raw.decode()}"'
    return None


def annotate_line(line: str) -> str:
    def repl(m):
        try:
            v = int(m.group(1), 16)
        except ValueError:
            return m.group(0)
        d = decode_word(v)
        if d is None:
            return m.group(0)
        return f"{m.group(0)} /* {d} */"

    return HEX.sub(repl, line)


def process(path: Path):
    src = path.read_text(errors="replace")
    out = "\n".join(annotate_line(l) for l in src.split("\n"))
    if out != src:
        path.write_text(out)
        return True
    return False


def main(argv):
    n = 0
    for arg in argv[1:]:
        p = Path(arg)
        files = sorted(p.glob("*.c")) if p.is_dir() else [p]
        for f in files:
            if process(f):
                n += 1
    print(f"annotated {n} files")


if __name__ == "__main__":
    main(sys.argv)
