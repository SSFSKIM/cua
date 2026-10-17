## cua #115 helper spike: the native helper needs a working `$CODEX_CLI_PATH app-server`

**Bottom line:** I tested `SkyComputerUseService` on the mini through cua's real `serve`. It does run `$CODEX_CLI_PATH app-server --listen stdio://`, from the environment node_repl passed to it. If that app-server fails, **every native call fails, including list_apps**. A launcher that implements only `sandbox` would break macOS computer use completely.

**Setup.** Scratch directory `~/cua-115-spike` on the mini, with a `--shared` clone at 76c3b84.
- `serve-spike.mjs` calls cua's real `serve()`. Its `prepareLaunch` hook changes only `CODEX_CLI_PATH`, either replacing it with the shim or deleting it. Everything else is exactly what buildLaunch builds (default CUA_HOME, vendor host, computer surface, secrets off).
- `driver.mjs` speaks MCP over stdio and accepts only Finder's approval request, for the session only.
- Calls per phase:
  1. banner
  2. `cua.listApps`
  3. a 3 s wait
  4. Finder: `cua.getApp` + `getAXState({emit:false})`
  5. `listApps` again
  6. Finder `getAXState` again
- Process polling ran every 150 ms. Per helper I took snapshots of its children (`pgrep -P`) and its environment (`ps eww`). I also read the helper's unified log.
- No helper was running before any phase. Each helper the spike started quit by itself about 30 ms after the session closed, so I never had to kill one.
- The frontmost app was unchanged in every phase. No prompts appeared. Pid 65489 and ChatGPT.app were not touched.

### Phase 1: forward (two runs)
- **node_repl** ran the shim twice at kernel start: `sandbox -c shell_environment_policy.inherit="all" -c default_permissions="node_repl" -c permissions.node_repl={…} …` (kernel and trusted worker).
- **How the helper starts.** node_repl runs `/usr/bin/open -g "<runtime>/…/Codex Computer Use.app"`. The helper's parent is launchd (ppid 1), but its environment is node_repl's whole launch environment: `CODEX_CLI_PATH` = the shim, `CODEX_HOME` = `~/Library/Application Support/cua/state/codex`, plus `SKY_CUA_SERVICE_PATH`, the `NODE_REPL_*` variables, PATH, and so on. So `open` does pass the environment through.
- **The helper runs the CLI itself.**
  - The shim's parent was SkyComputerUseService, with argv `app-server --listen stdio://`, cwd `/`, and cua's CODEX_HOME.
  - Timing, from the helper log: helper starts (45.586), then node_repl connects (45.738), then it logs "Computer Use Client" with the shim path (45.740), then the app-server is spawned (45.753).
  - So it is spawned when the first client connects or makes its first request, not when the helper starts. That came during the first native call.
- **What it asked.** The traced exchange was `initialize`, then `configRequirements/read` (the result had a `requirements` key), then `config/read` (the result had `config`, `model`, `approval_policy`, `sandbox_mode`, …).
  - The helper then terminated the app-server: no exit line was logged and nothing was orphaned. It lived well under 250 ms.
  - The helper never sent an `initialized` notification.
- **It happens once per helper.** The app-server ran once; the other three native calls reused the cached policy.
- **All native calls succeeded.** For example, listApps#1 took 711 ms and Finder's AX read 335 ms. Finder's approval request offered `persist: ["session","always"]` at riskLevel low.

### Phase 2: refuse (`app-server` gets one stderr line and exit 1)
- node_repl's two `sandbox` invocations were forwarded as before. The kernel works.
- The helper ran `app-server --listen stdio://` **four times, once per native call**: a failure is not cached, so every call retries.
- **All four calls failed with the same text:**
  `Computer Use server error -10005: codex app-server exited before returning a response`
  - That includes both `listApps` calls (623, 38 ms).
  - The Finder calls failed before any approval request was sent (0 requests).
- It fails outright; nothing works in a reduced mode.

### Phase 3: `CODEX_CLI_PATH` removed
- The helper's environment had no `CODEX_CLI_PATH`. Its locator logged **`/usr/bin/env`** as the CLI on every call. In other words, it fell back to `/usr/bin/env codex …`, looked up on its PATH, which cua fixes to `/usr/bin:/bin:/usr/sbin:/sbin`.
- No `codex` is on that PATH, so it failed instantly. The 150 ms polling never caught a child of the helper.
- It did **not** fall back to ChatGPT.app's `Resources/codex-cli` or any other bundle. The bundle-relative fallbacks do not exist for this standalone helper, and `/Applications/Codex.app` is absent on the mini.
- **All four calls failed** with the same `-10005: codex app-server exited before returning a response`.

### What this means for a sandbox-only launcher
- Pointed at a launcher that refuses `app-server`, macOS computer use is completely broken: every native call fails, retried per call, before any app approval.
- Leaving `CODEX_CLI_PATH` unset does not help either; see the first surprise below.
- **The smallest fix:** the launcher's `app-server --listen stdio://` should speak newline-delimited JSON-RPC and answer three methods: `initialize`, `configRequirements/read` and `config/read`, in that order.
  - In this run (cua's CODEX_HOME), the real CLI answered `configRequirements/read` with an object whose only key is `requirements`; I logged key names only, so I can't confirm what the value was.
  - `config/read` returns a config object; I logged its key names only, not the values.
  - Before building the stub, capture the real responses' values from the pinned CLI with this CODEX_HOME.
- This is section 4's recommendation 4 from the static report, now confirmed. It should be required by #115, not optional.
- Keep the stub fast and quiet on EOF: the helper kills the process right after `config/read`.

### Surprises
1. **node_repl runs the kernel unsandboxed when `CODEX_CLI_PATH` is unset.** In phase 3 the kernel (`node --experimental-vm-modules …`) and the trusted worker ran as direct children of node_repl, with no `codex sandbox` wrapper. Cua's launch comment says "no unsandboxed fallback", but that holds only because cua always sets the variable. #115 must never leave it unset, and an invalid path is worth testing too.
2. **Without `CODEX_CLI_PATH`, the helper runs whatever `codex` is on its PATH.** That is cua's fixed PATH today, but any PATH change would hand the helper an arbitrary `codex`.
3. **One app-server lookup ignores `CODEX_CLI_PATH`.** In every phase, about 15 ms after starting, the helper logged `Failed to configure Codex Computer Use Statsig … codex app-server exited before returning auth status`, after about 5 ms. The shim was never called for it, so that analytics lookup uses another path that does not exist here. It is harmless, since phase 1 worked. The helper also opened two TLS connections at startup, which looks like analytics; cua's `NODE_REPL_DISABLE_ANALYTICS` does not suppress them.
4. **The policy is read through cua's CODEX_HOME.** This confirms the earlier evidence that a helper keeps its launcher's configuration: a bad `config.toml` there would surface as a -10005 on every call.

### Artifacts
Copied to `/Users/new/.claude/jobs/1ea561bc/tmp/115/spike-helper/` on this Mac:
- `driver.mjs`
- `serve-spike.mjs`
- `codex` (the shim; the app-server branch logs method names and response key names only)
- `shim.log`: phases forward, run 2; refuse; unset. Run 1's four lines were cleared while I fixed the tracing, and they are summarised above.

The scratch directory stays on the mini. It holds:
- `phase-*.json` and `serve-*.stderr`: these include process lists, so they were not copied.
- `smoke-codex-home`: an empty CODEX_HOME used for the shim's smoke test.

The shim's mode is left at `refuse`.