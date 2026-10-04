// Read-only cross-references over `otool -tV` text of an arm64 Mach-O: function boundaries, call targets and the
// addresses an adrp+add pair materialises (Rust string literals live unterminated in __TEXT,__const, so a literal is
// identified by the bytes that start at the referenced address). Nothing here executes the binary.

const INSN = /^([0-9a-f]{16})\t(\S+)\t?([^;]*?)\s*(?:;\s*(.*))?$/;

export function parseOtool(text) {
  const fns = [];
  let current = null;
  for (const line of text.split('\n')) {
    const m = line.match(INSN);
    if (m) {
      if (!current) continue;
      current.instructions.push({addr: parseInt(m[1], 16), op: m[2], args: m[3].trim(), comment: m[4] ?? null});
    } else if (/^[^\s(/].*:$/.test(line)) {
      current = {name: line.slice(0, -1).replace(/^"|"$/g, ''), instructions: []};
      fns.push(current);
    }
  }
  return fns.filter(f => f.instructions.length);
}

// adrp xN, page ; 0xPAGE   then   add xM, xN, #imm   ->   PAGE + imm
export function stringRefs(fn) {
  const pages = new Map();
  const out = [];
  for (const i of fn.instructions) {
    if (i.op === 'adrp') {
      const reg = i.args.split(',')[0].trim();
      const page = i.comment?.match(/^0x([0-9a-f]+)/i);
      if (page) pages.set(reg, parseInt(page[1], 16));
    } else if (i.op === 'add') {
      const m = i.args.match(/^(\w+),\s*(\w+),\s*#(0x[0-9a-f]+|\d+)$/i);
      if (m && pages.has(m[2])) out.push(pages.get(m[2]) + Number(m[3]));
    }
  }
  return out;
}

export function calls(fn) {
  return fn.instructions.filter(i => i.op === 'bl' || i.op === 'b').map(i => {
    const stub = i.comment?.match(/symbol stub for: (\S+)/);
    if (stub) return stub[1];
    if (i.op === 'bl' && !/^0x/.test(i.args)) return i.args.replace(/^"|"$/g, '');
    return null;
  }).filter(Boolean);
}

export function parseSections(otoolL) {
  const out = [];
  let cur = null;
  for (const line of otoolL.split('\n')) {
    const m = line.trim().match(/^(sectname|segname|addr|size|offset)\s+(\S+)/);
    if (!m) continue;
    if (m[1] === 'sectname') { cur = {sectname: m[2]}; out.push(cur); continue; }
    if (!cur) continue;
    cur[m[1]] = m[1] === 'segname' || m[1] === 'sectname' ? m[2] : (m[1] === 'offset' ? Number(m[2]) : parseInt(m[2], 16));
  }
  return out.filter(s => s.segname && Number.isFinite(s.addr) && Number.isFinite(s.size) && Number.isFinite(s.offset));
}

// The printable ASCII bytes starting at a virtual address (up to max), or null if it is not inside a file-backed
// section. Zero-fill sections (offset 0) are skipped.
export function makeReader(buffer, sections) {
  return (addr, max = 64) => {
    const s = sections.find(x => x.offset > 0 && addr >= x.addr && addr < x.addr + x.size);
    if (!s) return null;
    const start = s.offset + (addr - s.addr);
    let end = start;
    while (end < buffer.length && end - start < max && buffer[end] >= 0x20 && buffer[end] < 0x7f) end++;
    return buffer.toString('latin1', start, end);
  };
}

// Every place `key` occurs inside a file-backed __TEXT literal section, as virtual addresses.
export function literalAddresses(buffer, sections, key) {
  const out = [];
  const needle = Buffer.from(key, 'latin1');
  for (const s of sections.filter(x => x.segname === '__TEXT' && ['__const', '__cstring'].includes(x.sectname))) {
    let from = s.offset;
    for (;;) {
      const at = buffer.indexOf(needle, from);
      if (at < 0 || at >= s.offset + s.size) break;
      out.push(s.addr + (at - s.offset));
      from = at + 1;
    }
  }
  return out;
}

// Enum -> &str tables: pointer slots in data-constant sections whose value targets `va`, each returned with the start
// of its table (the run of adjacent slots that also point into __TEXT literals), because code materialises only the
// table base and indexes it. Chained-fixup pointers keep the target's offset from the image base in their low 36
// bits; classic rebased pointers hold the address itself.
const IMAGE_BASE = 0x100000000;
export function pointerTables(buffer, sections, va) {
  const literal = sections.filter(x => x.segname === '__TEXT' && ['__const', '__cstring'].includes(x.sectname));
  const target = i => {
    const lo = buffer.readUInt32LE(i);
    const hi = buffer.readUInt32LE(i + 4);
    const viaOffset = IMAGE_BASE + lo + (hi & 0xf) * 2 ** 32;
    return [viaOffset, lo + hi * 2 ** 32];
  };
  const isLiteral = i => target(i).some(t => literal.some(x => t >= x.addr && t < x.addr + x.size));
  const out = [];
  for (const s of sections.filter(x => x.offset > 0 && ['__DATA_CONST', '__DATA'].includes(x.segname) && ['__const', '__data'].includes(x.sectname))) {
    for (let i = s.offset; i + 8 <= s.offset + s.size; i += 8) {
      if (!target(i).includes(va)) continue;
      let start = i;
      while (start - 8 >= s.offset && isLiteral(start - 8)) start -= 8;
      out.push({base: s.addr + (start - s.offset), slot: s.addr + (i - s.offset)});
    }
  }
  return out;
}
