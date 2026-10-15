# The own host's lifeline under the real sandbox launcher, scoped, on the mini (#116 M4, 2026-10-15)

**Why.** The spec's Decision Log, M4 task 3 ruling 2: a child of cua's own host must never keep running once its supervisor is gone. Every kernel and trusted worker now watches a lifeline (`src/repl-host/lifeline.mjs`), and that has to hold under the real `codex sandbox` launcher, not only under the test double. The session added two requirements:
- The scoped policy must let the child read its lifeline without widening the policy. The FIFO lives under the child's own TMPDIR, the scoped temporary root.
- The own-host confinement cases must still show 0 differences against the M1 vendor control.

**Result at `6f7cf58`** (mini parity clone, clean, browser-only, scoped): all three checks hold.

### 1. Supervisor killed while the kernel and worker are busy (`result.json`, `ok: true`)

Command: `device.mjs`, run on the mini.

- **Setup.** Each scenario uses a fresh session in a scratch capability home. It runs the real proxy (`openConnection`, as `cua serve` builds it), its anchor, cua's supervisor, and, under the real launcher, a kernel and a trusted worker.
  - The launcher is CodexCLI's `codex sandbox` with `default_permissions="node_repl"` and `network={enabled=false}`, one per child.
  - The only addition to the production launch is a fixture trusted service, `spin`, that blocks the worker's event loop.
  - Both children were busy in synchronous code (91–99% CPU) when the kill came.
- **The children could read their lifelines under the real scoped policy.** Each busy kernel and worker holds exactly one FIFO open (`lsof`). Since c2939ef a required lifeline fails closed: a child announces `runtime_ready` only once its watcher runs. So the session's successful calls (`serverInfo cua-repl-host 0.4.0`, results marked `{host: cua, version: 0.4.0}`) themselves prove the watcher was running inside the sandbox.
  - The FIFO is under the launch's TMPDIR (`/var/folders/.../T/`), the policy's own temporary root.
  - No sandbox policy was changed.
- **`supervisor`.** SIGKILL to the supervisor only; the proxy and anchor live on, as in production. The busy kernel and worker were gone after **209 ms**. Nothing that was recorded was left, and nothing was reparented to launchd.
- **`everything-above`.** SIGKILL to the proxy, the anchor and the supervisor together, so nothing of cua's can tear the group down and only the lifeline can end the children. Both busy children were gone after **209 ms**. Nothing was left, and nothing was reparented to launchd.
- **Cleanup.** Every recorded process was gone. No `/tmp/cua-m4t3-*` and no `cua-lifeline-*` directory remained. No own-host process remained on the mini.

### 2. Confinement against the M1 vendor control (`cells-cua/`, `cells-diff-m0-vendor-1.json`)

Run: `run --host cua --device mini --suite cells --through M1`, at `6f7cf58`, diffed against `m0/vendor-1` (the M1 control) with `--through M1 --expected`.

- 111 cases, 145 cells, complete, assertions PASS.
- **0 differences.** The 134 expected entries are all the `cua/replHost` identity slot.
- All 12 connections attest 0.4.0.
- All five confinement cases (`default`, `scoped`, `disabled`, `trusted-write-root-overlap`, `no-unsandboxed-fallback`) pass their assertions, with no difference from the vendor.

### 3. A denied lifeline fails closed (unit and host tests, not live)

`test/repl-host/orphan-lifecycle.test.mjs` uses a sandbox double that takes read access to the child's FIFO away. A kernel so denied fails the cell with `cua-repl-host lifeline unavailable: … EACCES …` in its exit diagnostic. A denied worker fails the request with the vendor's exit sentence, and its diagnostic, carrying the lifeline sentence, goes to the host's stderr. Neither runs unprotected.

### Diagnostics

`diagnostics/` holds two earlier runs. Neither is counted.
- `first-run-launcher-misclassified.json`: the script counted the launcher (whose command line names its child) as the child. The real children had their FIFO, and ended in ~208 ms.
- `at-22fc0f5-before-fail-closed.json`: the same pass at 22fc0f5, before the fail-closed change.

The Linux real-launcher check moves to M5's Linux sitting.

### Commands (from this worktree; on the mini, in `~/Developer/GitHub/cua-parity`)

```
node scripts/repl-parity.mjs prepare --device mini --commit 6f7cf58b948cb7b98d6188fb8441ba43efdd2c27 --profile ssfs --node /Users/new/.nvm/versions/node/v24.18.0/bin/node
ssh mini 'cd ~/Developer/GitHub/cua-parity && CUA_NODE=<own Node> CUA_PARITY_SCRATCH_PREFIX=cua-m4t3- node docs/evidence/2026-10-14-own-repl-host-parity/m4/lifeline-sandbox-check/device.mjs' > result.json
node scripts/repl-parity.mjs run --host cua --device mini --suite cells --through M1 --out m4/lifeline-sandbox-check/cells-cua
node scripts/repl-parity.mjs diff m0/vendor-1 m4/lifeline-sandbox-check/cells-cua --through M1 --expected test/repl-parity/expected-differences.json
```
