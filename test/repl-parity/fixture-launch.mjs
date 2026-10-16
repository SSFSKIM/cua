// The environments the live repl-parity fixtures build for their launches (serve-cells.mjs, probe-boundary.mjs), and the
// failing-sandbox launcher a boundary probe writes. Side-effect free, so the unit tests can check them; the fixtures
// themselves stay remote-only.
//
// Explicit diagnostic CUA_NODE survives rebuilt environments. Managed release mode instead resolves the fresh
// scratch installation and clears any inherited override; its mode must survive a boundary's child launch.
import {quote} from '../../scripts/browser-parity/topology.mjs';
import {desktopSessionEnv} from '../../src/runtime/linux-desktop.mjs';

export const explicitNode = ambient => ({...(ambient.CUA_PARITY_NODE_MODE?{CUA_PARITY_NODE_MODE:ambient.CUA_PARITY_NODE_MODE}:{}),...(ambient.CUA_PARITY_NODE_MODE!=='managed'&&ambient.CUA_NODE?{CUA_NODE:ambient.CUA_NODE}:{})});

// The serve-cells connection: built, not inherited (only the X session, PATH and TMPDIR come from the caller).
export function cellsServeEnv(ambient, {scratch, sandbox, host}) {
  return {...desktopSessionEnv(ambient), PATH: ambient.PATH, HOME: scratch.userHome, TMPDIR: ambient.TMPDIR,
    CUA_HOME: scratch.dir, CUA_SHIM_SANDBOX: sandbox, CUA_REPL_HOST: host, CUA_BROWSER_SERVICE: 'cua', CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off', ...explicitNode(ambient)};
}

// A boundary probe's serve-cells child.
export function boundaryServeEnv(ambient, {tmp, home, host, facts, control, sandbox, witness, brokenSandbox}) {
  return {...(ambient.CUA_PARITY_CAPTURE_CHROME==='1'?{CUA_PARITY_CAPTURE_CHROME:'1'}:{}),CUA_PARITY_SCRATCH_PREFIX:ambient.CUA_PARITY_SCRATCH_PREFIX,PATH: ambient.PATH, HOME: ambient.HOME, ...desktopSessionEnv(ambient), TMPDIR: tmp, CUA_HOME: home, CUA_REPL_HOST: host, CUA_PARITY_REMOTE: '1',
    CUA_PARITY_EXPECTED: JSON.stringify(facts), CUA_PARITY_CONTROL_DIR: control, CUA_PARITY_SANDBOX: sandbox, CUA_PARITY_BANNER_WITNESS: witness ? '1' : '0',
    CUA_PARITY_BROKEN_SANDBOX: brokenSandbox || '', ...explicitNode(ambient)};
}

// A boundary probe's negative preflight connection, in a scratch capability home.
export function boundaryPreflightEnv(ambient, {scratch, tmp, host}) {
  return {PATH: ambient.PATH, HOME: scratch.userHome, TMPDIR: tmp, CUA_HOME: scratch.dir, CUA_REPL_HOST: host, CUA_BROWSER_SERVICE: 'cua',
    CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off', CUA_SHIM_SANDBOX: 'scoped', ...explicitNode(ambient)};
}

// A sandbox launcher that records it was invoked (at `marker`, shell-quoted: a TMPDIR-derived path is data, never
// syntax) and refuses.
export function failingSandboxScript(marker) {
  return `#!/bin/sh\nprintf invoked > ${quote(marker)}\nprintf 'fixture sandbox launcher refused\\n' >&2\nexit 73\n`;
}
