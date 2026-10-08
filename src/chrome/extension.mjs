// Fixed names of cua's own Chrome extension route (spec
// docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md): the extension's id, the native-messaging host
// name it connects to, the extension<->host protocol version, and where a host's backend socket lives in a cua home.
//
// The id is derived from the public key the manifest carries as `key` (so the unpacked load, the self-hosted CRX and
// the Store build share it): the first 32 hex characters of sha256(DER SubjectPublicKeyInfo), each mapped 0-f -> a-p.
// The private key stays with the owner (~/.config/cua/extension-key.pem); S0 generated it.
import {createHash} from 'node:crypto';
import {join} from 'node:path';

export const CUA_EXTENSION_ID = 'jkejaaijdfpohkdhankllbekkhmnippb';
export const CUA_HOST_NAME = 'io.github.ssfskim.cua';
export const PROTOCOL_VERSION = 1;

export function extensionIdFromKey(base64PublicKey) {
  const hex = createHash('sha256').update(Buffer.from(base64PublicKey, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

// MAWS's in-app browser backends are told from Chrome's by their instance id (maws:<appSessionId>), never by profile
// name (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md).
export const isMawsInstance = id => typeof id === 'string' && id.startsWith('maws:');

// A host's socket and status file are named by the profile's extension instance id, so `cua serve` can pre-list the
// path of every bound profile before its Chrome runs. Twelve hex characters keep the path under the macOS sun_path
// limit (104 bytes) at the default home.
export const socketNameFor = instanceId => createHash('sha256').update(String(instanceId)).digest('hex').slice(0, 12);

// $CUA_HOME/chrome/b: the hosts' sockets (<name>.sock) and status files (<name>.json), 0700. Short on purpose.
export const backendDir = home => join(home, 'chrome', 'b');
// $CUA_HOME/chrome/m: the sockets of client-mode hosts, which `cua serve` (and `cua profiles list`) run in-process for
// each configured MAWS backend (src/chrome/client-mode.mjs), 0700. Nothing scans it: a process lists exactly the
// client-mode hosts it opened, so one MAWS session's backend never reaches another process's vendor service.
export const clientModeDir = home => join(home, 'chrome', 'm');
// $CUA_HOME/chrome/logs: one log per host (<pid>.log, renamed <name>.log once the extension said hello), and the
// launcher's append-only log of each start and of whatever Node itself writes to stderr (warnings, a crash before main).
export const logDir = home => join(home, 'chrome', 'logs');
export const launcherLog = home => join(logDir(home), 'launcher.log');
// $CUA_HOME/chrome/host: the shell launcher the native-messaging manifest names (`cua chrome register` writes it).
export const launcherPath = home => join(home, 'chrome', 'host');

// macOS limits a Unix socket path to 103 bytes (sun_path is 104 with its terminator; Linux allows 107). The name is
// fixed-length, so a home's socket path length is exact: `cua chrome register` refuses a home where it is longer.
export const MAX_SOCKET_PATH_BYTES = 103;
export const socketPathFor = (home, name) => join(backendDir(home), `${name}.sock`);
export const longestSocketPath = home => socketPathFor(home, 'f'.repeat(12));
