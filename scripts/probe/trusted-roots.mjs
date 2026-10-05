// The trusted-root step of scripts/probe-secrets.mjs (issues #20, #34, #36): a model cell tries to write an importable
// module into every trusted code root (cua's src/services and src/secrets, the runtime's state/codex and its vendor
// modules), and, for comparison, into its own run directory and $TMPDIR. Under the scoped default every trusted root
// must refuse while the run directory and $TMPDIR take the write (the profile cua sends, not node_repl's write-denying
// default): a guarantee, PASS or FAIL. With CUA_SHIM_SANDBOX=disabled, requested explicitly, a cell may write wherever
// the user can, so the same attempt only records which roots it could write: INFO, the accepted consequence, never a
// failure. In both modes the probe removes what it wrote and checks it is gone; a file it could not remove from a
// trusted root is a FAIL.
export const SANDBOX_SCOPED_STEP = 'sandbox scoped (default): trusted roots unwritable, run directory and $TMPDIR writable';
export const SANDBOX_DISABLED_STEP = 'sandbox disabled (CUA_SHIM_SANDBOX=disabled): trusted roots a cell could write (accepted, #20)';

// The cell: each attempt creates a new file (`wx`), so nothing that already exists is ever overwritten.
export const plantCell = (paths, name) => `const fs = await import("node:fs");
const attempt = path => { try { fs.writeFileSync(path, "export const planted = true;\\n", {flag: "wx"}); return "written"; } catch (error) { return error.code ?? "error"; } };
const roots = ${JSON.stringify(paths)};
const out = {roots: roots.map(root => attempt(root + "/${name}")), cwd: attempt(nodeRepl.cwd + "/${name}"), tmp: attempt(nodeRepl.tmpDir + "/${name}"), cwdDir: nodeRepl.cwd, tmpDir: nodeRepl.tmpDir};
nodeRepl.write(JSON.stringify({ok: true, result: out}));`;

// mode: the CUA_SHIM_SANDBOX of the connection, scoped or disabled. roots: [{label, path}]. results: the cell's per-root
// outcome ('written' or an error code), null when the cell gave none (raw: what it gave instead). cwd, tmp: its outcome
// in its run directory and $TMPDIR. planted: labels of roots where the probe found its file after the cell; survivors:
// paths still present after the probe removed them.
export function trustedRootStep(mode, {roots, results, planted = [], survivors = [], cwd, tmp, raw}) {
  if (mode !== 'scoped' && mode !== 'disabled') throw new Error(`trustedRootStep takes scoped or disabled, not ${mode}`);
  const complete = Array.isArray(results) && results.length === roots.length;
  const leftBehind = survivors.length ? `; the probe could not remove ${survivors.join(', ')}: delete it by hand` : '';
  if (mode === 'scoped') {
    const ok = complete && results.every(r => r !== 'written') && !planted.length && !survivors.length && cwd === 'written' && tmp === 'written';
    const observed = complete ? `${roots.map((root, i) => `${root.label} ${results[i]}`).join(', ')}; run directory ${cwd}, $TMPDIR ${tmp}` : `no complete answer: ${raw ?? 'none'}`;
    return {name: SANDBOX_SCOPED_STEP, status: ok ? 'PASS' : 'FAIL', detail: `${roots.length} trusted roots: ${observed}${planted.length ? `; planted in ${planted.join(', ')}` : ''}${leftBehind}`};
  }
  const name = SANDBOX_DISABLED_STEP;
  if (!complete) return {name, status: survivors.length ? 'FAIL' : 'INFO', detail: `not observed: ${raw ?? 'no answer'}${leftBehind}`};
  const writable = roots.filter((root, i) => results[i] === 'written' || planted.includes(root.label)).map(root => root.label);
  const refused = roots.map((root, i) => [root.label, results[i]]).filter(([label]) => !writable.includes(label)).map(([label, code]) => `${label} (${code})`);
  const removal = survivors.length ? leftBehind.slice(2) : 'every file the probe wrote was removed and verified removed';
  return {name, status: survivors.length ? 'FAIL' : 'INFO',
    detail: `writable: ${writable.join(', ') || 'none'}; refused: ${refused.join(', ') || 'none'}; for comparison, own cwd ${cwd}, tmpDir ${tmp}; ${removal}; accepted under the trust model (owner decision, #20): code integrity is the user's responsibility; the scoped default keeps them read-only`};
}
