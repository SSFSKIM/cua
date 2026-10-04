// Module customization hooks (node:module register) that run `cua` itself with one change: each runtime launch the
// Chrome backend listing makes (src/profiles/inventory.mjs) is torn down for real and then reported unconfirmed, the
// verdict a real teardown gives only when an owned process survives. Load with --import (serve-cli.test.mjs).
const UPSTREAM = new URL('../../src/mcp/upstream.mjs', import.meta.url).href;
const INVENTORY = new URL('../../src/profiles/inventory.mjs', import.meta.url).href;
const STUB = `import {spawnUpstream as spawnReal} from ${JSON.stringify(UPSTREAM)};
export * from ${JSON.stringify(UPSTREAM)};
export function spawnUpstream(...args) {
  const upstream = spawnReal(...args);
  const terminate = upstream.terminate;
  upstream.terminate = async options => ({...await terminate(options), confirmed: false, reason: 'a group member survived (test)'});
  return upstream;
}`;

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (resolved.url !== UPSTREAM || context.parentURL !== INVENTORY) return resolved;
  return {url: `data:text/javascript,${encodeURIComponent(STUB)}`, shortCircuit: true};
}
