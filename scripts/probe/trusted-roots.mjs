// The trusted-root step of scripts/probe-secrets.mjs (issues #20, #34): a model cell tries to write an importable
// module into every trusted code root (cua's src/services and src/secrets, the runtime's state/codex and its vendor
// modules). With the sandbox on (CUA_SHIM_SANDBOX=default) that must fail everywhere: a guarantee, PASS or FAIL. Under
// the default (`disabled`, the owner's decision on #20) a cell may write wherever the user can, so the same attempt
// only records which roots it could write: INFO, the accepted consequence, never a failure. In both modes the probe
// removes what it wrote and checks it is gone; a file it could not remove from a trusted root is a FAIL.
export const SANDBOX_ON_STEP = 'sandbox on (CUA_SHIM_SANDBOX=default): trusted roots unwritable';
export const SANDBOX_DISABLED_STEP = 'sandbox disabled (default): trusted roots a cell could write (accepted, #20)';

// The cell: each attempt creates a new file (`wx`), so nothing that already exists is ever overwritten.
export const plantCell = (paths, name) => `const fs = await import("node:fs");
const attempt = path => { try { fs.writeFileSync(path, "export const planted = true;\\n", {flag: "wx"}); return "written"; } catch (error) { return error.code ?? "error"; } };
const roots = ${JSON.stringify(paths)};
const out = {roots: roots.map(root => attempt(root + "/${name}")), cwd: attempt(nodeRepl.cwd + "/${name}"), tmp: attempt(nodeRepl.tmpDir + "/${name}"), cwdDir: nodeRepl.cwd, tmpDir: nodeRepl.tmpDir};
nodeRepl.write(JSON.stringify({ok: true, result: out}));`;

// mode: the CUA_SHIM_SANDBOX of the connection. roots: [{label, path}]. results: the cell's per-root outcome
// ('written' or an error code), null when the cell gave none (raw: what it gave instead). planted: labels of roots where
// the probe found its file after the cell; survivors: paths still present after the probe removed them.
export function trustedRootStep(mode, {roots, results, planted = [], survivors = [], cwd, tmp, raw}) {
  const on = mode === 'default';
  const name = on ? SANDBOX_ON_STEP : SANDBOX_DISABLED_STEP;
  const complete = Array.isArray(results) && results.length === roots.length;
  const comparison = complete ? `; for comparison, own cwd ${cwd}, tmpDir ${tmp}` : '';
  const leftBehind = survivors.length ? `; the probe could not remove ${survivors.join(', ')}: delete it by hand` : '';
  if (on) {
    const ok = complete && results.every(r => r !== 'written') && !planted.length && !survivors.length;
    const observed = complete ? roots.map((root, i) => `${root.label} ${results[i]}`).join(', ') : `no complete answer: ${raw ?? 'none'}`;
    return {name, status: ok ? 'PASS' : 'FAIL', detail: `${roots.length} trusted roots: ${observed}${planted.length ? `; planted in ${planted.join(', ')}` : ''}${comparison}${leftBehind}`};
  }
  if (!complete) return {name, status: survivors.length ? 'FAIL' : 'INFO', detail: `not observed: ${raw ?? 'no answer'}${leftBehind}`};
  const writable = roots.filter((root, i) => results[i] === 'written' || planted.includes(root.label)).map(root => root.label);
  const refused = roots.map((root, i) => [root.label, results[i]]).filter(([label]) => !writable.includes(label)).map(([label, code]) => `${label} (${code})`);
  const removal = survivors.length ? leftBehind.slice(2) : 'every file the probe wrote was removed and verified removed';
  return {name, status: survivors.length ? 'FAIL' : 'INFO',
    detail: `writable: ${writable.join(', ') || 'none'}; refused: ${refused.join(', ') || 'none'}${comparison}; ${removal}; accepted under the trust model (owner decision, #20): code integrity is the user's responsibility; CUA_SHIM_SANDBOX=default restores the guarantee`};
}
