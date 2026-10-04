// CUA browser-backend framing as the pinned vendor client speaks it (M7 prototype, not production).
//
// Source: @oai/browser-desktop 0.1.1 in ChatGPT 26.928.40906, scripts/browser-service.mjs (readable tree):
//   66712-66721  N_   encode: u32 length (host endianness via os.endianness) + UTF-8 JSON text
//   66722-66826  ih   decoder: buffers chunks, emits every complete frame, throws "native pipe frame exceeds limit"
//                     when a declared length exceeds maxFrameBytes (default 4294967295)
//   66828-66841  Wee/Hee  read/write UInt32LE on little-endian hosts, BE otherwise
//   66667-66688  wi.handleData  JSON.parse each frame; any decode error closes the transport
// This host (arm64) is little-endian, so frames are UInt32LE. The probe asserts that rather than assuming it.
import {endianness} from 'node:os';

export const HEADER_BYTES = 4;
const LE = endianness() === 'LE';

export function encodeFrame(message, maxFrameBytes = 0xffffffff) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > maxFrameBytes) throw new Error(`frame of ${body.length} bytes exceeds limit ${maxFrameBytes}`);
  const frame = Buffer.alloc(HEADER_BYTES + body.length);
  if (LE) frame.writeUInt32LE(body.length, 0); else frame.writeUInt32BE(body.length, 0);
  body.copy(frame, HEADER_BYTES);
  return frame;
}

// Returns push(chunk) -> parsed messages; throws on an oversized declared length or invalid JSON, after which the
// caller must close the connection (the vendor closes its transport on any decode error).
export function frameDecoder(maxFrameBytes = 0xffffffff) {
  let pending = Buffer.alloc(0);
  return function push(chunk) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
    const out = [];
    while (pending.length >= HEADER_BYTES) {
      const length = LE ? pending.readUInt32LE(0) : pending.readUInt32BE(0);
      if (length > maxFrameBytes) throw new Error('native pipe frame exceeds limit');
      if (pending.length < HEADER_BYTES + length) break;
      out.push(JSON.parse(pending.subarray(HEADER_BYTES, HEADER_BYTES + length).toString('utf8')));
      pending = pending.subarray(HEADER_BYTES + length);
    }
    return out;
  };
}

export const hostEndianness = () => endianness();
