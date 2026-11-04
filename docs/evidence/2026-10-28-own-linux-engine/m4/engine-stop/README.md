# M4 T7b: the REPL host's stop lets the engine drain

Development runs on the #171 VM (`dc-linux171-1e68`, 8 vCPU), 2026-11-04, idle, not a release gate. Every run is on a
private Xvfb the harness starts itself (`startPrivateServer`, under its watchdog), with Openbox and the run's own xterm
and Chrome on the run's own session bus; the harness withdraws its live-run declaration first, so nothing reaches `:0`.
The experiment is `scripts/linux-engine-diff/engine-stop.mjs` (its README section "M4 T7b's addition"):

```bash
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$CANDIDATE" --control-root "$CONTROL" --out "$OUT" --trials 10
```

Each run starts a fresh `cua serve` of the lane's checkout on that display (`CUA_NATIVE_ENGINE=cua`, the candidate as
`CUA_LINUX_ENGINE_BIN`, `CUA_DESKTOP_MODE=dedicated`, the computer surface alone, no secrets, this machine's cua home
and its pinned vendor runtime and sandbox helper, so the trusted worker runs under the real Linux sandbox), and stops it
by one production path: `idle` (end_task, then the idle stop at `CUA_RUNTIME_IDLE_MS=1`), `eof` (the MCP stream's
end), `signal` (SIGTERM to the REPL host's supervisor), `remote` (end_task, then DELETE on cua's Streamable HTTP
handler, `remote-serve.mjs`). Cases: `hold`, key_down of Shift on the xterm (the foreground route, XTEST), the keymap
read before the stop (held, the positive control) and after it; `burst`, 16 press_key one after another into the
covered Chrome keys page, the stop straight after the last answer, the field read at its caret. Lanes: `drain`, this
branch's REPL host; `kill`, the REPL host of f59575fb (the branch before T7b, exported with the worktree's
`node_modules`), whose stop SIGKILLs the tree at once. The engine is the same in both lanes.

| Directory | Harness and REPL host (`drain`) | Candidate | Verdict |
|---|---|---|---|
| `idle/` (`engine-stop-20261104T090549`) | 6b84f21a | musl build of 6b84f21a, `cua-engine 0.3.0 (6b84f21a8929)`, sha256 `50145451f2012a5cf7e657652dddea3a5f18c03ed6a01dbf24f8b1fbc2ae9928` | **pass** (exit 0) |
| `idle-first/` (`engine-stop-20261104T084547`, the first full sitting) | 4d6f5703 | musl build of 83ac9666, `cua-engine 0.3.0 (83ac9666ead5)`, sha256 `57c0e421754cbfaab7a2c50859939db049c2ed3a180abba6e93c040e8c1f2d8c` | **pass** (exit 0) |

Both candidates are made as the release workflow makes them (a hermetic Cargo home, the remapped paths,
`cargo build --release --locked --target x86_64-unknown-linux-musl`, stripped, static-pie), from an export of the commit.
6b84f21a's engine also carries T7 fix 3 (task 56's paste commits ec4c1deb and 69e3724b), which this experiment does not
exercise.

**Edited after the sittings** (T7b's fix, the review's item 8): the first two rows of each sitting's `results.jsonl`
named the control's checkout by its absolute path under the owner's home; that value is replaced by the symbolic label
`control-f59575fb` (key `control_label`, as the experiment records it from the fix on). Nothing else was changed.
The fix's sittings and the budget as it stands after them are in `fix/README.md` and task 57's report; the budget
below is T7b's first account.

## `idle/`

| lane | path | case | runs | pass | engine after the stop began, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 150.7 | 167.7 |
| drain | idle | burst | 10 | 10 | 359.4 | 369.2 |
| drain | eof | hold | 10 | 10 | 80.6 | 91.7 |
| drain | eof | burst | 10 | 10 | 290.5 | 299.3 |
| drain | signal | hold | 10 | 10 | 80.3 | 91.8 |
| drain | signal | burst | 10 | 10 | 278.3 | 297.9 |
| drain | remote | hold | 10 | 10 | 334.5 | 364.9 |
| drain | remote | burst | 10 | 10 | 396.2 | 418.7 |
| kill | idle | hold | 10 | 0 | 131.2 | 143.3 |
| kill | idle | burst | 10 | 10 | 126.9 | 137.8 |
| kill | eof | hold | 10 | 0 | 77.2 | 87.8 |
| kill | eof | burst | 10 | 10 | 64 | 74.2 |
| kill | signal | hold | 10 | 0 | 68.1 | 80.2 |
| kill | signal | burst | 10 | 10 | 64.8 | 72.7 |
| kill | remote | hold | 10 | 0 | 155.4 | 168.8 |
| kill | remote | burst | 10 | 10 | 151.4 | 161.5 |

- **The hold.** On every path the drain lane's key was down before the stop (40 of 40) and nothing was down after it
  (40 of 40): the engine's exit released its XTEST key. The control left it down on every run (40 of 40), which the
  harness then released: a SIGKILLed engine never runs its release.
- **The burst.** Every drain run landed all 16 keys in order (40 of 40). Its engine lived 262–452 ms after the stop began
  (medians 278–396), against 56–200 ms in the control: the exit's settle, 300 ms after the last key to a window whose
  redirect it holds. The control lost no key here (40 of 40 exact). Through cua's service the keys are about 100 ms
  apart (its action settle), so at a stop no backlog is left queued in Chrome, the condition under which the unredirect
  cut keys in T7's direct-to-engine runs; the control cannot show the cut at idle through this path, and the drain's
  effect on the burst shows in the engine's lifetime, which is the settle's. No run started with a cut tail.
- **Every run** had one engine under its session, approved only its own scene's app (`XTerm`, `Google-chrome`), and no
  run failed on its way (0 errors).

`idle-first/` agrees: drain 80 of 80; the control's holds 0 of 40 released; drain bursts 270–403 ms after the stop.
`remote` there was 147 ms (hold) and 371 ms (burst) at the median.

## The budget, with numbers

- **The engine's drain**, from its SIGTERM, with no request running: an armed late-take watch runs out at most 300 ms
  (and two 2 ms polls) after its drag's release, each pending FocusOut at most 100 ms after its window's last input,
  then the settle until 300 ms after the last key (the watch's Escape included): about 600 ms at most after a watched
  drag, 300 ms after a key, nothing after input older than that. Its ceiling is the engine's backstop: 2 s after the
  signal it exits whatever it is doing (a request still running finishes inside those 2 s or is cut).
- **The REPL host** (`stopProcessTree`): the freeze (its `ps` listings), then SIGTERM and SIGCONT to the engine, then at
  most `ENGINE_EXIT_WAIT_MS` = 2250 ms for its exit, then SIGKILL to the frozen set: the backstop plus 250 ms, so the
  host's own SIGKILL never comes while the engine is still within its drain. `stop()` then waits up to
  `2 * EXIT_GRACE_MS` = 2000 ms for the launcher's exit after that SIGKILL, so the two waits follow each other and do not
  overlap: `stop()` at most the freeze + 2250 + 2000 ms. Measured above: the engine gone at most 452 ms after the stop
  began, on every path.
- **Upstream's bounded termination** (`src/mcp/upstream.mjs` `teardown`, budget B = 5000 ms from `server.mjs`
  `teardownBudgetMs`): EOF at 0, SIGTERM to the owned group at `by(0.4)` = 2000 ms if it has not emptied, SIGKILL at
  `by(0.7)` = 3500 ms (or the anchor released by `by(0.85)` = 4250 ms). The owned group (the process tree, `ps`, on
  this VM) holds the anchor, the supervisor and the two outer `codex-linux-sandbox` launchers; `bwrap` leads a group of
  its own, and the trusted worker and the engine are in the inner sandbox's session. So, sandboxed (the default):
  - `by(0.4)`'s SIGTERM never reaches the engine. It reaches the supervisor, whose handler joins the stop in flight
    (its forced shutdown awaits the same stop), and the frozen launcher, where it waits until the SIGKILL.
  - `by(0.7)`'s SIGKILL takes the supervisor and the worker's launcher; `bwrap` dies with its parent
    (`--die-with-parent`) and its PID namespace with it, the engine included. That is the one escalation that can take
    the engine: 3500 ms after the teardown began. On an idle connection (end_task's idle stop, the stream's end, a
    remote DELETE) the host begins the stop at once and the engine was gone by 452 ms: a margin of about 3 s. In
    general the drain is safe whenever the supervisor begins the stop within 1500 ms less the freeze, since the engine
    is gone 2 s after its signal at the latest. When admitted work holds the EOF drain past 2000 ms, `by(0.4)`'s
    SIGTERM forces the supervisor's shutdown then; the engine's drain proper (about 600 ms at most) ends before 3500 ms,
    and only an engine whose last request is still running at its backstop, 2 s later, would be taken first, 0.5 s
    before its backstop would have cut it.
  - With the sandbox disabled (a disabled call policy, or `CUA_SHIM_SANDBOX=disabled`), the worker and the engine are
    in the owned group, and `by(0.4)`'s SIGTERM is the engine's second signal, which ends it at once: there its drain
    must end within 2000 ms of the teardown's start, which the stop begun at once (at most about 600 ms) does.
