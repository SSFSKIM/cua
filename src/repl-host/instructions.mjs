// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua-repl/dist/lib/js/oai_js_cua_repl/src/instructions.js:3-29
// and launch.js:15-60 (how the vendor's cua-repl launcher assembles the tool overrides its node_repl serves), for
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M2: the effective retained tool text, in place of the base
// text M1 served). The texts are byte-for-byte copies in ./instructions/ (PROVENANCE.md there). The vendor launcher hands
// its node_repl these overrides in NODE_REPL_TOOL_OVERRIDES; cua's launch (src/runtime/launch.mjs) hands the own host the
// same JSON in CUA_REPL_TOOL_OVERRIDES, which ./tools.mjs applies. Changes from the source: no cloud-browser variant
// (CUA_REPL_BROWSER_ENV cloud/orbit and its guidance switch select an excluded document), no Windows platform, and the
// approved exclusion edits of the browser text (BROWSER_EDITS below). #120's clean-room rewrite replaces this port
// before distribution.
import {readFileSync} from 'node:fs';

const PLATFORMS = {linux: 'linux', darwin: 'macos'};
const read = name => readFileSync(new URL(`./instructions/${name}`, import.meta.url), 'utf8');
const text = name => read(`${name}.md`).trimEnd();

// The approved edits of {macos,linux}/browser.md (docs/doperpowers/research/2026-10-14-own-repl-host/surface-inventory.md
// Table 2, "documentation text edit" rows for cua-repl/instructions/{linux,macos}/browser.md:10,22,25,42,43: remove the
// in-app browser and MCP Apps instructions, an excluded desktop-only provider, and keep the generic extension/cdp text
// and the surrounding prose verbatim). Each is [exact vendor text, replacement] and must occur exactly once.
export const BROWSER_EDITS = [
  ['For an existing tab identified by URL in browser context (including the current IAB tab):\n', 'For an existing tab identified by URL in browser context:\n'],
  ['To open a URL in the in-app browser (`@Browser`):\n\n```javascript\nlet tab = await cua.createBrowserTab("iab", url, { visible: boolean });\n```\n\n', ''],
  ['- `"mcpapps"`: use `cua.getBrowser({ id: "mcpapps" })` for existing full-screen MCP Apps in the task’s side panel.\n', ''],
  ['- `"iab"` (in-app browser): in `createBrowserTab`, use `visible: true` to show the browser; `false` to keep it hidden.\n', ''],
];

// `source` with every edit applied; throws when an edit's text does not occur exactly once (the vendor text moved).
export function applyEdits(source, edits) {
  let out = source;
  for (const [from, to] of edits) {
    const at = out.indexOf(from);
    if (at === -1 || out.indexOf(from, at + 1) !== -1) throw new Error(`instruction edit does not match exactly once: ${JSON.stringify(from.slice(0, 60))}`);
    out = out.slice(0, at) + to + out.slice(at + from.length);
  }
  return out;
}

// The overrides for `platform` (process.platform) and the enabled `surfaces` -> {server_instructions, tools: {js:
// {description, field_descriptions: {code}}, js_reset: {description}}}, as the vendor launcher builds them.
export function toolOverrides({platform, surfaces}) {
  const dir = PLATFORMS[platform];
  if (!dir) throw new Error(`unsupported cua_repl platform=${platform}`);
  const description = [text(`${dir}/description`)];
  description.push(surfaces.includes('browser') ? applyEdits(read(`${dir}/browser.md`), BROWSER_EDITS).trimEnd() : text('browser-disabled'));
  description.push(surfaces.includes('computer') ? text(`${dir}/computer`) : text('computer-disabled'));
  description.push(text(`${dir}/output`));
  return {
    server_instructions: text('server'),
    tools: {
      js: {description: description.join('\n\n'), field_descriptions: {code: text('code')}},
      js_reset: {description: text('reset')},
    },
  };
}
