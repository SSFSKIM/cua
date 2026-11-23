# M6a venue pilot (#171, task 143; the M6a pre-flight §5.2, "The venue pilot")

**All four questions are answered yes on both legs, and the pilot's verdict is PASS on both.** The verdict requires
every mandatory step to pass and all four answers to be yes. The hosted `ubuntu-24.04-arm` runner is a working arm64
venue for acceptance 12 with this recipe, and so is its x64 control on `ubuntu-24.04`.

- **Run:** [45150450103](https://github.com/SSFSKIM/cua/actions/runs/45150450103), `linux-runtime.yml` dispatched on
  `m6a-t6-pilot` at 7dfc6af6fc1c53e2da0df15e999ae28b10cb5e72. That commit is main's code (da7585c3), plus the M6a
  pre-flight and this task's harness after its review fixes.
- **Files:** this directory holds each leg's artifact as uploaded, which is exactly the pilot's `ARTIFACT_FILES`:
  - `pilot.json`: the steps, the answers, the verdict, the confinement step and the trace summary;
  - `smoke.json` and `smoke-traced.json`: each step's name and status only.

  The raw streams (doctor's and the install's output, the smokes' own reports, the strace file) stayed in the run's
  scratch directory and were not uploaded. The homes are the run's, the secret store is empty, and every window is
  the harness's.
- **Recipe, per leg:**
  1. Install the apt packages, then record `bwrap --ro-bind / / true`.
  2. Apply doctor's remedy, `kernel.apparmor_restrict_unprivileged_userns=0`.
  3. Run `scripts/accept/linux-runtime-pilot.mjs` inside `scripts/accept/linux-runtime-env.sh`. The wrapper provides
     fresh homes, a private Xvfb with Openbox, and a private bus with accessibility on; it unsets app-env.mjs's
     variables.
  4. The pilot checks doctor's four environment rows and runs today's `cua install` (which fetches the vendor's pinned
     deb for the leg, F8 (ii)). It then checks `sandbox.launcher`, and runs the item 1 smoke with the shared
     confinement step, once plain and once under `strace -f -y --pidns-translation`.

| Question | arm64 | x64 | Evidence (the same on both legs unless noted) |
|---|---|---|---|
| 1. Does bubblewrap get its user namespace? | yes | yes | Before the remedy, `restrict=1` and bwrap fails with `setting up uid map: Permission denied`. After it, doctor's `sandbox.userns` passes. The kernel that answered the confinement cell runs under `codex-linux-sandbox` → `bwrap` → `codex-linux-sandbox`, each certified by the executable read from /proc. The cell reported pid 2 in its namespace, and a 50 ms /proc sampler bound that to one process under this session's serve |
| 2. Is gedit's tree served on the private bus? | yes | yes | `accessibility.bus` and `accessibility.enabled` pass on the `dbus-run-session` bus. The typing step passed, and the marker was read back once from a tree whose source is `at_spi` |
| 3. Do the positive controls connect while the kernel is refused? | yes | yes | The controls reach the X socket, the bus's socket, a TCP listener and a Unix listener (`ok`). The kernel gets `EPERM` on all four, an errno that proves refusal for each target. Each listener accepted only the control's one connection, both before and after the kernel's cell |
| 4. Does `strace -f` follow the helper's children? | yes | yes | The trusted worker, and the kernel under the pinned helper, both descend from the serve being judged in the trace. The kernel made 227 calls after its exec on arm64 and 230 on x64. The trace holds 155 processes |

**Measured, not judged:** the serve's process tree made 125 calls that name a path under `runtimes/` on each leg. This
counts relative paths resolved against their -y-decoded base and attempted execs, with 0 calls left unresolved, so the
count is complete. On main's code these are the vendor tree's reads. E1's judge, after M6a, requires 0 there.

**Times per leg:**
- install: about 22 to 24 s;
- each smoke: about 169 to 174 s, most of it the fixture's last step and gedit's exit.

**Earlier runs:**
- [45141056542](https://github.com/SSFSKIM/cua/actions/runs/45141056542) (6d39cb0d) answered yes on both legs under
  the first judges. Task 143's review found those judges too lenient, and they were fixed test-first.
- [45147992954](https://github.com/SSFSKIM/cua/actions/runs/45147992954) (629b31d9) ran the fixed judges. Both legs
  failed closed: a kernel cell has no `process` global, so the cell reported no identity and no kernel was bound
  (confinement no, userns unanswered). One call of the counter was also left unresolved, on a pipe descriptor. Both
  were fixed in 7dfc6af6.
- [45140841963](https://github.com/SSFSKIM/cua/actions/runs/45140841963) (72d1d653) stopped at the recording step,
  whose `bash -e` treated bubblewrap's expected refusal as a failure.
