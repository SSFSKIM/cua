# M4 T7b's second fix: the design session's second rulings

These are development runs on the #171 VM (`dc-linux171-1e68`, 8 vCPU), 2026-11-04, not a release gate.
- Every sitting ran on a private Xvfb that the harness started itself, with the live-run declaration withdrawn and
  nothing on `:0`. Every probe ran under its own `xvfb-run -noreset`.
- No other session's `stress-ng` was running at the start of any of them (`pgrep -x stress-ng`: 0).
- The candidate is the musl build of f8ec5038, made as the release workflow makes it: `cua-engine 0.3.0
  (f8ec5038f46a)`, sha256 `8a41cded6f0c1b5bc1bc9a47fc003161abb48a076a90eb563941fcea8b7c9ea3`. Its production code is
  that of 10adbc4e; f8ec5038 only moves a test.
- The control is the REPL host of f59575fb (`control-f59575fb`, the branch before T7b), running the same engine.
- The harness is e7d4032a's. In the paths below, `<worktree>` is the fix worktree and `<probes>` the probe directory.

```bash
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$CANDIDATE" --control-root "$CONTROL" --out fix2/idle --trials 10
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$CANDIDATE" --control-root "$CONTROL" --out fix2/idle-disabled --sandbox disabled --cases hold,handle --trials 10
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$CANDIDATE" --control-root "$CONTROL" --out fix2/load2-burst --cases burst --paths idle,eof,signal,remote --load-factor 2 --trials 10
```

| Directory | Sandbox | Load | Verdict |
|---|---|---|---|
| `idle/` | scoped | none | **pass**: drain 130 of 130 (hold 50, burst 40, handle 40); control: key left down 50 of 50, button 1 left down 40 of 40, bursts 0 of 40 cut (reported) |
| `idle-disabled/` | disabled | none | **pass**: drain 90 of 90 (hold 50, handle 40); control: key left down 40 of 40 on the four paths, button 1 left down 40 of 40; on `held-back` the control released 10 of 10 (reported: there the group's SIGTERM is the engine's own first signal) |
| `load2-burst/` | scoped | 2x (16 stress-ng workers, load 17.2 at the end) | **pass**: drain 40 of 40 in order; control 0 of 40 cut (reported) |

In every run of every lane, the session's one engine was found before the stop. No run failed on its way. No run left
a process stopped once it had ended: `stopped_left` is `[]` in all 520 rows.

## The drag_handle case (ruling 3)

Each run starts a `drag_handle` on the xterm at its top left + (60, 60), moves it 80 px right and 30 px down, and never
ends it. Then comes the path's stop.
- Drain lane, 80 of 80 runs (both sandboxes, the four paths): no button down at the server afterwards
  (`xprobe buttons-down` `[]`), and the pointer at the model's last `move_to` point.
- Control: button 1 still down in 80 of 80 runs, released by the harness afterwards.

## The burst control (ruling 4)

Through the production paths, the control's bursts are reported, not required: 0 of 40 cut idle, and 0 of 40 at twice
the load. The service spaces each window input 100 ms behind the previous key, and the stop's own latency follows.
What these paths prove is the held-input half: hold and handle, drain 180 of 180 against the control's 170 of 170
left down (with the sandbox disabled, `held-back` is reported). `--require-burst-cut` makes the cut required, for T8.

## The budget's measured terms (ruling 2: B = 1000 ms, R = 200 ms, W = 1250 ms)

- `probes/freeze-{idle,load2}.log`, 20 trials each. **F**, the REPL host's freeze, measured from the stop's start to
  the engine's SIGTERM. Each trial calls `kernel-child.mjs` `stopProcessTree` (the function the supervisor's stop of
  the worker runs) on a real sandboxed worker tree of 5 processes, with Shift held.
  - Idle: F 22.5 / 27.9 / 42.3 ms (min / p50 / max).
  - At twice the load: F 41.8 / 47.8 / 79.7 ms.
  - The engine's drain after its SIGTERM: at most 13 ms. Shift was released in every trial, and nothing was left
    stopped.
- `probes/forced-{idle,load2}.log`, 20 trials each. **The forced release**: the engine holds a drag_handle's button 1
  and Shift, a 23 s desktop scroll runs, and SIGTERM comes inside the scroll. The backstop ends the engine, its
  release first. The release's own time (the exit after the signal, less B):
  - idle: 1.5 / 1.7 / 4.3 ms;
  - at twice the load: 3.1 / 8.9 / 20.1 ms.
  - Both keys and buttons were up in every trial. R's 200 ms bound is 10 times the worst measured, so B and R stay
    as ruled.
- The arithmetic: the engine's release is done by by(0.4) + F + B + R = by(0.4) + F + 1200, under by(0.7) =
  by(0.4) + 1500 for F < 300; measured, F ≤ 80. The host's kill comes at W = B + R + 50 after the engine's SIGTERM,
  after the engine's worst exit.

## The residual, rerun (`probes/admitted-residual-long-request*.log`)

Admitted work holds the drain past by(0.4) while an engine request of its own runs on (the same 23 s desktop scroll),
with Shift held.
- Sandboxed: by(0.4) comes at 7000 ms after the end, and the supervisor's stop tells the engine at about 7050. The
  backstop ends the scroll and the engine releases first: `keys=[]` at +8092 ms, before by(0.7) at 8500. The teardown
  needed only SIGTERM, and `keys after []`, `stopped after []`.
- With the sandbox disabled, the group's SIGTERM is the engine's first signal: `keys=[]` at +8043 ms, the teardown
  SIGTERM only.
- Before this fix, the same probe ended `keys after [50]`, the engine SIGKILLed (`fix/probes/residual-long-request.log`).
- `probes/admitted-{sandboxed,disabled}-fixed.log`: the sleeping cell of the first fix, rerun on this engine. Both
  end `keys after []` and `stopped after []`.

## Edits to `fix/`

Following the re-review: the denied strace attachment line is removed from `fix/probes/worker-dies-disabled.log` and
`disabled-noreset.log`, and the unrelated `$CUA_HOME/run` entry line (with its UUID) is removed from
`fix/probes/{sandboxed,disabled}-{fixed,noreset}.log`. Neither was evidence of anything.
