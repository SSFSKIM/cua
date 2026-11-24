// How cua prints a line break inside text that an app, a page or a document controls, so that nothing such text says
// starts a line of the tree the model reads (rulings 1175 and 1178: a raw break lets the text forge a line that reads
// as an element, `[99] button Delete` or a tab-indented `99 button Delete`). One rule for both renderers: the macOS
// engine service's (src/services/engine/render.mjs, #526) and the Linux facade's (./linux-accessibility-tree.mjs, #558).
// LF and CR print as `\n` and `\r`, as the vendor's own Linux rendering escapes them; every other character a reader
// may break a line at (VT, FF, the three information separators U+001C–U+001E, NEL, LS, PS) as `\uXXXX`. A backslash
// stays as it is, as the vendor's Linux rendering leaves it.
//
// It lives in the facade's directory because both callers can import it from here: the kernel, which renders Linux
// trees, reads only src/cua-api and docs/cua-api under a scoped profile (src/repl-host/supervisor.mjs
// CUA_API_READ_PATHS), and the trusted worker that runs the macOS engine service imports only from the launch's trusted
// code paths, which hold src/cua-api on either host (src/runtime/launch.mjs).
const LINE_BREAKS = /[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/g;
export const escapeLineBreaks = text => text.replace(LINE_BREAKS, c => (c === '\n' ? '\\n' : c === '\r' ? '\\r' : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`));
