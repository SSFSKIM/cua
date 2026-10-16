// The identity of the REPL host that answers a connection (spec docs/doperpowers/specs/2026-10-14-own-repl-host-design.md,
// interface HostIdentity). cua's own host names itself in `initialize.serverInfo` ({name: REPL_HOST_NAME, version}) and
// marks each tool result with `_meta[REPL_HOST_META_KEY]` ({host: 'cua', version}); the vendor host carries neither, and
// its version is the pinned runtime release it ships in. REPL_HOST_VERSION is the own host's and its owned cua API's
// version, one number for both since they ship together: bump it with any change to what the own host answers (its
// handshake, its tools or the API a first call documents), so a recorded handshake of the older host is never replayed
// for the newer one (src/mcp/lazy-runtime.mjs handshakeRecords keys records by hostIdentity).
export const REPL_HOST_NAME = 'cua-repl-host';
export const REPL_HOST_VERSION = '0.4.0';
export const REPL_HOST_META_KEY = 'cua/replHost';

// -> {host: 'cua' | 'vendor', version}: the answering host of a connection whose selection is `host`, on runtime `release`.
export const hostIdentity = ({host, release}) => ({host, version: host === 'cua' ? REPL_HOST_VERSION : release});
