# M6a T6: the cells' fourth pilot (#171, task 152; a development run, not counted)

This pilot ran at head 37b40ad29b82d7c9cdf82ea108fa2ff6419097d5, with fix wave 1's judges. It adds the watch's ruled
treatment of an executable it could not read. When `/proc/<pid>/exe` cannot be read, the sampler reads
`/proc/<pid>/stat` again:

- if the process has gone, or its pid now has another start time, it is skipped as `gone`;
- if the process is now exiting, a zombie or dead, it is skipped as `exiting`;
- if the process is still alive, its unread executable is kept, and that fails the engine check.

Every run's `watch.engineProcesses` lists each cua-engine the sampler saw: its pid, its start time, its executable,
and whether it was skipped and why. The older cua is 0d19fdfadce47fc6ba88db180fb4845346c9be26.

**Runs:**

- **x64:** this VM, on a private display under the host lock, with `--samples 20`. Report: `x64/runtime.json`.
- **arm64 and the hosted x64 control:** [45252913316](https://github.com/SSFSKIM/cua/actions/runs/45252913316).
  Reports: `arm64/runtime.json` and `x64-hosted/runtime.json`.

| Cell | x64 (VM) | arm64 | x64 (hosted control) |
|---|---|---|---|
| E0 | PASS | PASS | PASS |
| E1 | PASS | PASS | PASS |
| E2 | PASS | PASS | PASS |
| E3 | PASS | PASS | PASS |
| E4 | PASS | PASS | PASS |
| E5 | PASS | PASS | PASS |
| U0 | PASS | PASS | PASS |
| U1 | PASS | PASS | PASS |
| U2 | PASS | PASS | PASS |
| U3 | PASS | PASS | PASS |
| U4 | PASS | PASS | PASS |
| U5 | PASS | PASS | PASS |

Every leg's verdict is `{pass: true, scope: full, acceptance: true}`.

**Short-lived cua-engines the sampler skipped:**

| Leg | Seen | Judged (read alive) | Skipped | Where |
|---|---|---|---|---|
| x64 (VM) | 25 | 21 | 4: 2 gone, 2 exiting | E1 smoke, E1 traced smoke, E3 smoke, U5 smoke |
| arm64 | 23 | 20 | 3, all exiting | E1 traced smoke, E1 traced witness, U3 smoke |
| x64 (hosted) | 21 | 20 | 1, exiting | E1 traced smoke |

No cua-engine was alive with an unreadable executable on any leg.

**Measured, not judged:**

| | x64 (VM) | arm64 | x64 (hosted) |
|---|---|---|---|
| Serve start to first answer, median of 20, at the head | 780 ms | 561 ms | 483 ms |
| The same under the cua before M6a | 737 ms | 555 ms | 477 ms |

The x64 VM's difference, 43 ms, is the largest on any leg. It is below the pre-flight's 50 ms threshold for a finding.
The pilots before this one measured 9 ms and 25 ms the other way on the same VM, so this is likely noise. A counted
run should look at it again.
