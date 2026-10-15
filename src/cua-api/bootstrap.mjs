// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/globals.js:2-27
// (the first-cell bootstrap the banner imports), for docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3,
// CuaBootstrap; Design "Owned facade and first-call documentation"). #120's clean-room rewrite replaces this port before
// distribution.
//
// The own host's banner (src/runtime/launch.mjs) imports this module in a fresh kernel's first cell. It reads the
// enabled surfaces from nodeRepl.env.CUA_REPL_ENABLED_SURFACES (required; "browser" and "computer" only), creates the
// facade for exactly those surfaces (./create-tinysky-alt.mjs; global `agent` with the browser surface), aliases
// `initialize` to its getState and installs it as global `cua`.
import {create_tinysky_alt} from './create-tinysky-alt.mjs';

const nodeRepl = globalThis.nodeRepl;
const setting = (nodeRepl == null ? undefined : nodeRepl.env)?.CUA_REPL_ENABLED_SURFACES;
if (setting === undefined) throw new Error('CUA_REPL_ENABLED_SURFACES is required');
const surfaces = new Set(setting.split(',').map(surface => surface.trim()).filter(Boolean));
const KNOWN_SURFACES = ['browser', 'computer'];
for (const surface of surfaces) {
  if (!KNOWN_SURFACES.includes(surface)) throw new Error(`unknown CUA_REPL_ENABLED_SURFACES surface=${surface}`);
}
const cua = await create_tinysky_alt({browser: surfaces.has('browser'), computer: surfaces.has('computer')});
Object.assign(cua, {initialize: cua.getState});
Reflect.set(globalThis, 'cua', cua);
