// The D-Bus wire, as far as the run's org.a11y.Bus stand-in needs it (a11y-stub.mjs; #171 M4, task 48): the marshalling
// of the basic, array, struct, dict-entry and variant types, messages with their header fields, the frame length, the
// client's EXTERNAL authentication line, and a unix:path= address. Written from the D-Bus specification (the wire
// format, "Message Protocol"), with no dependency, as the engine's own client is (native/linux-engine/src/dbus.rs).
// Alignment is to the type's size from the message's start; a message's body begins at a multiple of 8, so a body is
// marshalled from offset 0. Unix file descriptors are never negotiated, so `h` is only ever read as a number.

/** Message types. */
export const MESSAGE = { CALL: 1, RETURN: 2, ERROR: 3, SIGNAL: 4 };

/** The header flag of a call that wants no reply. */
export const NO_REPLY_EXPECTED = 0x1;

/** The largest message the specification allows (128 MiB). */
export const MAX_MESSAGE = 128 * 1024 * 1024;

const ALIGN = { y: 1, b: 4, n: 2, q: 2, i: 4, u: 4, x: 8, t: 8, d: 8, h: 4, s: 4, o: 4, g: 1, v: 1, a: 4, '(': 8, '{': 8 };

/** The index just after the complete type that starts at `i` in `sig`. */
function typeEnd(sig, i) {
  const c = sig[i];
  if (c === 'a') return typeEnd(sig, i + 1);
  if (c === '(' || c === '{') {
    const close = c === '(' ? ')' : '}';
    let j = i + 1;
    while (j < sig.length && sig[j] !== close) j = typeEnd(sig, j);
    if (j >= sig.length) throw new Error(`unterminated ${c} in signature ${sig}`);
    return j + 1;
  }
  if (c !== undefined && 'ybnqiuxtdhsogv'.includes(c)) return i + 1;
  throw new Error(`unsupported signature ${JSON.stringify(sig)}`);
}

/** A signature split into its complete types. */
export function splitSignature(sig) {
  const out = [];
  for (let i = 0; i < sig.length; ) {
    const end = typeEnd(sig, i);
    out.push(sig.slice(i, end));
    i = end;
  }
  return out;
}

class Writer {
  constructor(littleEndian, base = 0) {
    this.le = littleEndian;
    this.base = base;
    this.buf = Buffer.alloc(256);
    this.pos = 0;
  }

  room(n) {
    if (this.pos + n <= this.buf.length) return;
    const next = Buffer.alloc(Math.max(this.buf.length * 2, this.pos + n));
    this.buf.copy(next, 0, 0, this.pos);
    this.buf = next;
  }

  align(n) {
    while ((this.base + this.pos) % n) this.u8(0);
  }

  u8(v) {
    this.room(1);
    this.buf[this.pos++] = v;
  }

  number(size, method, v) {
    this.align(size);
    this.room(size);
    this.buf[`${method}${this.le ? 'LE' : 'BE'}`](v, this.pos);
    this.pos += size;
  }

  raw(bytes) {
    this.room(bytes.length);
    bytes.copy(this.buf, this.pos);
    this.pos += bytes.length;
  }

  write(type, value) {
    switch (type[0]) {
      case 'y':
        return this.u8(value);
      case 'b':
        return this.number(4, 'writeUInt32', value ? 1 : 0);
      case 'n':
        return this.number(2, 'writeInt16', value);
      case 'q':
        return this.number(2, 'writeUInt16', value);
      case 'i':
        return this.number(4, 'writeInt32', value);
      case 'u':
      case 'h':
        return this.number(4, 'writeUInt32', value);
      case 'x':
        return this.number(8, 'writeBigInt64', BigInt(value));
      case 't':
        return this.number(8, 'writeBigUInt64', BigInt(value));
      case 'd':
        return this.number(8, 'writeDouble', value);
      case 's':
      case 'o': {
        const bytes = Buffer.from(String(value), 'utf8');
        this.number(4, 'writeUInt32', bytes.length);
        this.raw(bytes);
        return this.u8(0);
      }
      case 'g': {
        const bytes = Buffer.from(String(value), 'ascii');
        this.u8(bytes.length);
        this.raw(bytes);
        return this.u8(0);
      }
      case 'v': {
        const [sig, inner] = value;
        this.write('g', sig);
        return this.write(sig, inner);
      }
      case 'a': {
        const element = type.slice(1);
        this.number(4, 'writeUInt32', 0);
        const lengthAt = this.pos - 4;
        this.align(ALIGN[element[0]]);
        const start = this.pos;
        for (const item of value) this.write(element, item);
        this.buf[`writeUInt32${this.le ? 'LE' : 'BE'}`](this.pos - start, lengthAt);
        return undefined;
      }
      case '(':
      case '{': {
        this.align(8);
        splitSignature(type.slice(1, -1)).forEach((member, i) => this.write(member, value[i]));
        return undefined;
      }
      default:
        throw new Error(`unsupported type ${type}`);
    }
  }

  bytes() {
    return Buffer.from(this.buf.subarray(0, this.pos));
  }
}

class Reader {
  constructor(buf, littleEndian, base = 0) {
    this.buf = buf;
    this.le = littleEndian;
    this.base = base;
    this.pos = 0;
  }

  need(n) {
    if (this.pos + n > this.buf.length) throw new Error('the message ends inside a value');
  }

  align(n) {
    const pad = (n - ((this.base + this.pos) % n)) % n;
    this.need(pad);
    this.pos += pad;
  }

  number(size, method) {
    this.align(size);
    this.need(size);
    const v = this.buf[`${method}${this.le ? 'LE' : 'BE'}`](this.pos);
    this.pos += size;
    return v;
  }

  read(type) {
    switch (type[0]) {
      case 'y':
        this.need(1);
        return this.buf[this.pos++];
      case 'b':
        return this.number(4, 'readUInt32') !== 0;
      case 'n':
        return this.number(2, 'readInt16');
      case 'q':
        return this.number(2, 'readUInt16');
      case 'i':
        return this.number(4, 'readInt32');
      case 'u':
      case 'h':
        return this.number(4, 'readUInt32');
      case 'x':
        return this.number(8, 'readBigInt64');
      case 't':
        return this.number(8, 'readBigUInt64');
      case 'd':
        return this.number(8, 'readDouble');
      case 's':
      case 'o': {
        const length = this.number(4, 'readUInt32');
        this.need(length + 1);
        const text = this.buf.toString('utf8', this.pos, this.pos + length);
        this.pos += length + 1;
        return text;
      }
      case 'g': {
        this.need(1);
        const length = this.buf[this.pos++];
        this.need(length + 1);
        const text = this.buf.toString('ascii', this.pos, this.pos + length);
        this.pos += length + 1;
        return text;
      }
      case 'v': {
        const sig = this.read('g');
        if (splitSignature(sig).length !== 1) throw new Error(`a variant of signature ${JSON.stringify(sig)}`);
        return [sig, this.read(sig)];
      }
      case 'a': {
        const element = type.slice(1);
        const length = this.number(4, 'readUInt32');
        this.align(ALIGN[element[0]]);
        this.need(length);
        const end = this.pos + length;
        const items = [];
        while (this.pos < end) items.push(this.read(element));
        if (this.pos !== end) throw new Error('an array element crosses its array');
        return items;
      }
      case '(':
      case '{': {
        this.align(8);
        return splitSignature(type.slice(1, -1)).map((member) => this.read(member));
      }
      default:
        throw new Error(`unsupported type ${type}`);
    }
  }
}

/** `values` marshalled as `signature`, aligned from `offset` (a body: 0). */
export function marshal(signature, values, { littleEndian = true, offset = 0 } = {}) {
  const w = new Writer(littleEndian, offset);
  splitSignature(signature).forEach((type, i) => w.write(type, values[i]));
  return w.bytes();
}

/** The values of `signature` in `bytes`, aligned from `offset`. Throws on anything short, long or malformed. */
export function unmarshal(signature, bytes, { littleEndian = true, offset = 0 } = {}) {
  const r = new Reader(bytes, littleEndian, offset);
  const values = splitSignature(signature).map((type) => r.read(type));
  if (r.pos !== bytes.length) throw new Error('bytes are left after the values');
  return values;
}

const FIELDS = { path: [1, 'o'], interface: [2, 's'], member: [3, 's'], errorName: [4, 's'], replySerial: [5, 'u'], destination: [6, 's'], sender: [7, 's'], signature: [8, 'g'] };
const FIELD_NAMES = Object.fromEntries(Object.entries(FIELDS).map(([name, [code]]) => [code, name]));

/**
 * A message's bytes: `{type, flags, serial, path, interface, member, errorName, replySerial, destination, sender,
 * signature, body}`, each header field written when it is given (`signature` only when not empty).
 */
export function encodeMessage(m, { littleEndian = true } = {}) {
  const signature = m.signature ?? '';
  const body = signature ? marshal(signature, m.body ?? [], { littleEndian }) : Buffer.alloc(0);
  const fields = [];
  for (const [name, [code, sig]] of Object.entries(FIELDS)) {
    const value = name === 'signature' ? signature || undefined : m[name];
    if (value !== undefined && value !== null) fields.push([code, [sig, value]]);
  }
  const w = new Writer(littleEndian);
  w.u8(littleEndian ? 0x6c : 0x42);
  w.u8(m.type);
  w.u8(m.flags ?? 0);
  w.u8(1);
  w.write('u', body.length);
  w.write('u', m.serial);
  w.write('a(yv)', fields);
  w.align(8);
  w.raw(body);
  return w.bytes();
}

/** The byte order a message's first byte names. */
function byteOrder(first) {
  if (first === 0x6c) return true;
  if (first === 0x42) return false;
  throw new Error(`a message whose first byte (${first}) names no byte order`);
}

/** The whole length of the message at the start of `buf`, or null until its fixed header has arrived. */
export function frameLength(buf) {
  if (buf.length < 16) return null;
  const le = byteOrder(buf[0]);
  const body = le ? buf.readUInt32LE(4) : buf.readUInt32BE(4);
  const fields = le ? buf.readUInt32LE(12) : buf.readUInt32BE(12);
  const total = Math.ceil((16 + fields) / 8) * 8 + body;
  if (total > MAX_MESSAGE) throw new Error(`a message of ${total} bytes, over the specification's limit`);
  return total;
}

/**
 * The message `bytes` (one whole frame) holds: the header's values and fields by name, and its body's values, or
 * `body: null` when the body is of a type this codec does not read (its header still decoded, so a caller can be
 * answered).
 */
export function decodeMessage(bytes) {
  const le = byteOrder(bytes[0]);
  const r = new Reader(bytes, le);
  r.pos = 1;
  const type = r.read('y');
  const flags = r.read('y');
  r.read('y');
  const bodyLength = r.read('u');
  const serial = r.read('u');
  const m = { type, flags, serial, signature: '' };
  for (const [code, [, value]] of r.read('a(yv)')) {
    if (FIELD_NAMES[code]) m[FIELD_NAMES[code]] = value;
  }
  r.align(8);
  const body = bytes.subarray(r.pos, r.pos + bodyLength);
  try {
    m.body = m.signature ? unmarshal(m.signature, body, { littleEndian: le }) : [];
  } catch {
    m.body = null;
  }
  return m;
}

/** The client's first line: the nul byte, then EXTERNAL authentication as this process's user. */
export function authExternal(uid = process.getuid()) {
  return Buffer.from(`\0AUTH EXTERNAL ${Buffer.from(String(uid)).toString('hex')}\r\n`, 'latin1');
}

/** The socket path of the first `unix:path=` entry of a D-Bus address, its `%xx` escapes undone. */
export function socketPath(address) {
  for (const entry of String(address).split(';')) {
    const [transport, rest = ''] = entry.split(/:(.*)/s);
    if (transport !== 'unix') continue;
    for (const pair of rest.split(',')) {
      const [key, value] = pair.split(/=(.*)/s);
      if (key === 'path' && value) return value.replace(/%([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
  }
  throw new Error(`the bus address ${address} has no unix:path= entry: the stand-in dials a unix:path= address only`);
}
