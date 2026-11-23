# M6a venue pilot (#171, task 143; the M6a pre-flight §5.2, "The venue pilot")

**All four questions are answered yes on both legs.** The hosted `ubuntu-24.04-arm` runner works as the arm64 venue
for acceptance 12 with this recipe, and so does its x64 control on `ubuntu-24.04`.

- **Run:** [45141056542](https://github.com/SSFSKIM/cua/actions/runs/45141056542), `linux-runtime.yml` dispatched on
  `m6a-t6-pilot` at 6d39cb0dc928a7b46cbe35a060340d608c065b74. That commit is main's code (da7585c3) plus the M6a
  pre-flight and this task's harness. Its artifacts are `linux-runtime-pilot-arm64` and `linux-runtime-pilot-x64`.
- **Recipe, per leg:**
  1. Install the apt packages, then record `bwrap --ro-bind / / true`.
  2. Apply the remedy doctor names, `kernel.apparmor_restrict_unprivileged_userns=0`.
  3. Inside `scripts/accept/linux-runtime-env.sh`, run `scripts/accept/linux-runtime-pilot.mjs`. It checks doctor's
     four environment rows, runs today's `cua install` (which fetches the vendor's pinned deb for the leg, F8 (ii)),
     checks `sandbox.launcher`, then runs the item 1 smoke (`linux-native.mjs --selection default`) with the shared
     confinement step, once plain and once under `strace -f`.
- **Files:** each leg's `pilot.json` (steps, answers, confinement, trace summary), `smoke.json` and
  `smoke-traced.json`. They hold labels, outcomes, counts and the run's own paths. The homes are the run's, the secret
  store is empty, every window is the harness's, and no raw trace is kept.

| Question | arm64 | x64 | Evidence (the same on both legs) |
|---|---|---|---|
| 1. Does bubblewrap get its user namespace? | yes | yes | Before the remedy, `restrict=1` and bwrap failed with `setting up uid map: Permission denied`. After it, doctor's `sandbox.userns` passes, and the kernel's parents are `codex-linux-sandbox < bwrap < codex-linux-sandbox < supervisor < serve` |
| 2. Is gedit's tree served on the private bus? | yes | yes | `accessibility.bus` and `accessibility.enabled` pass on the `dbus-run-session` bus. The smoke's marker is read back once from a tree whose source is `at_spi` |
| 3. Do the positive controls connect while the kernel is refused? | yes | yes | The controls get `ok` on the X socket, the bus's socket, the TCP listener and the Unix listener. The kernel gets `EPERM` on all four. Each listener accepted 1 connection, the control's, before and after the kernel's cell |
| 4. Does `strace -f` follow the helper's children? | yes | yes | Under `--pidns-translation` the kernel's exec is seen under the pinned helper and serve, and its calls go on after the exec (227 calls on arm64, 230 on x64). The trace holds 155 processes |

**Measured, not judged.** In the traced run, the serve's process tree made 103 file calls under `runtimes/` on each
leg. On main's code these are the vendor module tree's reads. They show that E1's judge has something to catch, so it
has teeth: after M6a, E1 requires 0 there.

**Times per leg.** Install: about 23 s. Each smoke: about 171 to 174 s, most of it the fixture's last step and gedit's
exit. With strace, the run takes no longer.

The first dispatch, [45140841963](https://github.com/SSFSKIM/cua/actions/runs/45140841963), stopped on both legs at
the recording step: the step's `bash -e` treated bubblewrap's expected refusal as a failure. The workflow's second
commit fixes that.
