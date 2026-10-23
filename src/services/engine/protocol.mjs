// EngineProtocol, the service's side (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Design "Protocol";
// Interfaces, EngineProtocol; the engine's side is native/engine/Sources/Engine/Protocol.swift): JSON-RPC 2.0 in frames
// of a 4-byte little-endian length then UTF-8 JSON, 8 MiB at most each way, as the vendor's transport
// (R/A-contract.md §2.2), speaking `cua-engine-1`.
//
// Errors are the vendor's classes (S/targets/mac/errors.js; R/A-contract.md §1.5), so src/services/sky.mjs classifies
// them unchanged: an engine error is SkyComputerUseError with the vendor's message envelope (`Computer Use server error
// <code>: <reason>`), its code, and as errorName the engine's own name, which for every vendor code is the vendor's
// name for it and otherwise an engine-only name (noWindowsAvailable, timeoutReached, concealedInputUnavailable,
// menuBarItemUnsupported, …) that the wrapper admits or withholds by its own list; an error without a name takes the
// vendor's mapping (its name for the code, else jsonRPCError). An input method's error also keeps the engine's input
// meta (`meta`). Everything else is SkyComputerUseTransportError with a bounded sentence of cua's.

import {interruptionMessage} from './interruption.mjs';

export const CLIENT_API_VERSION = 'cua-engine-1';
export const MAX_FRAME = 8 * 1024 * 1024;

// ServerErrorCode of the pinned vendor client (S/targets/mac/errors.js).
const VENDOR_CODES = {
  senderProcessNotAuthenticated: -10000, couldNotGetRequestData: -10001, couldNotGetRequestTypeName: -10002,
  couldNotResolveRequestType: -10003, unhandledEvent: -10004, unknownError: -10005, appNotAllowed: -10006,
  runningApplicationNotFound: -10007, accessibilityError: -10008, permissionsNotGranted: -10009, invalidApp: -10010,
  noActiveSession: -10011, userStoppedSession: -10012, incompatibleClientVersion: -10013, permissionsPending: -10014,
  blockedURL: -10015, userIntervened: -10016, couldNotGetSenderPID: -10017, ambiguousApp: -10018,
  couldNotGetBootstrapPort: -10019, screenLocked: -10020,
};
const NAME_BY_CODE = new Map(Object.entries(VENDOR_CODES).map(([name, code]) => [code, name]));

export class SkyComputerUseError extends Error {
  // `reason` is the engine's (or the service's) bounded sentence; the message wraps it as the vendor's helper does.
  constructor({code, reason, errorName = null, meta = null}) {
    super(`Computer Use server error ${code}: ${(code === -10016 && interruptionMessage(meta?.interruption)) || reason}`);
    this.name = 'SkyComputerUseError';
    this.code = code;
    this.errorName = typeof errorName === 'string' && errorName ? errorName : NAME_BY_CODE.get(code) ?? 'jsonRPCError';
    this.meta = meta;
    this.request = null;
    this.requestType = 'jsonRPC';
  }
}

export class SkyComputerUseTransportError extends Error {
  constructor(message, {cause} = {}) {
    super(message);
    this.name = 'SkyComputerUseTransportError';
    this.cause = cause;
  }
}

// The engine's wire error ({code, message, errorName?, meta?}) as the error the service raises.
export function serverError({code, message, errorName = null, meta = null}) {
  return new SkyComputerUseError({code, reason: message, errorName, meta});
}

export function encodeFrame(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > MAX_FRAME) throw new SkyComputerUseTransportError(`cua engine frame is too large: ${body.length}`);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export class FrameDecoder {
  buffer = Buffer.alloc(0);

  // The complete messages `chunk` finishes; throws on a declared length above the bound or a body that is not JSON.
  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
    const messages = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > MAX_FRAME) throw new SkyComputerUseTransportError(`cua engine frame is too large: ${length}`);
      if (this.buffer.length < 4 + length) break;
      const text = this.buffer.subarray(4, 4 + length).toString('utf8');
      this.buffer = this.buffer.subarray(4 + length);
      try { messages.push(JSON.parse(text)); } catch { throw new SkyComputerUseTransportError('cua engine returned an invalid JSON-RPC response'); }
    }
    return messages;
  }
}

// The vendor's response check (S/targets/mac/native-pipe.js): a numeric id, jsonrpc 2.0, exactly one of result and
// error, an error with a numeric code and a string message.
export function validResponse(message) {
  if (!message || typeof message !== 'object' || typeof message.id !== 'number' || message.jsonrpc !== '2.0') return false;
  const hasResult = Object.hasOwn(message, 'result');
  if (hasResult === Object.hasOwn(message, 'error')) return false;
  if (hasResult) return true;
  const {error} = message;
  return Boolean(error) && typeof error === 'object' && typeof error.code === 'number' && typeof error.message === 'string';
}
