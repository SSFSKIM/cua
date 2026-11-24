// How the Linux facade prints a line break inside text that an app, a page or a document controls, so that nothing such
// text says starts a line of the tree the model reads (#558, ruling 1178: a raw break lets the text forge a line that
// reads as an element, `[99] button Delete` or a tab-indented `99 button Delete`). Used by
// ./linux-accessibility-tree.mjs and ./bind-linux-app.mjs. LF and CR print as `\n` and `\r`, as the vendor's own Linux
// rendering escapes them; every other character a reader may break a line at (VT, FF, the three information separators
// U+001C-U+001E, NEL, LS, PS) as `\uXXXX`. A backslash stays as it is, as the vendor's Linux rendering leaves it.
//
// It is a copy of macOS's rule (src/services/engine/render.mjs `escapeLineBreaks`, #526, ruling 1175), not shared with
// it (ruling 1186): the kernel, which renders Linux trees, reads only src/cua-api and docs/cua-api under a scoped
// profile, and the macOS engine service must import nothing from here, which the macOS vendor host's trusted worker
// does not trust. test/services-engine-render.test.mjs keeps the two equal on every character.
const LINE_BREAKS = /[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/g;
export const escapeLineBreaks = text => text.replace(LINE_BREAKS, c => (c === '\n' ? '\\n' : c === '\r' ? '\\r' : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`));
