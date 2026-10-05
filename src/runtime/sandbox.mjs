// node_repl's per-call sandbox state: `_meta["codex/sandbox-state-meta"]` on a tools/call, the field Codex sends
// (issue #20). Without it node_repl applies its restrictive default to cells and trusted services: reads allowed, every
// write denied, temp directories included. CUA_SHIM_SANDBOX picks what cua sends on every call it makes to the runtime:
//   disabled  (default) the disabled permission profile: cells may write wherever the user can
//   default   nothing, leaving node_repl's write-denying default
// node_repl refuses the field without `sandboxCwd`, an absolute file URI; cua gives the launch's working directory.
import {pathToFileURL} from 'node:url';
import {fail} from './errors.mjs';

export const SANDBOX_META_KEY = 'codex/sandbox-state-meta';
const MODES = ['disabled', 'default'];

export function sandboxModeFrom(env) {
  const mode = env.CUA_SHIM_SANDBOX ?? 'disabled';
  if (!MODES.includes(mode)) fail('invalid_setting', 'CUA_SHIM_SANDBOX must be disabled or default');
  return mode;
}

// The value sent under SANDBOX_META_KEY for a launch working in `cwd`, or null to send none.
export function sandboxState(mode, cwd) {
  return mode === 'disabled' ? {permissionProfile: {type: 'disabled'}, sandboxCwd: pathToFileURL(cwd).href} : null;
}

// `meta` with cua's sandbox state in place of any the caller supplied: the policy is the server's, never the client's.
export function withSandbox(meta, state) {
  const {[SANDBOX_META_KEY]: _ignored, ...rest} = meta ?? {};
  return state ? {...rest, [SANDBOX_META_KEY]: state} : rest;
}
