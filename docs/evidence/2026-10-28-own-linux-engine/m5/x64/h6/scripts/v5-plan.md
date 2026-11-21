x64 V5 sitting plan (task 123), sent 2026-11-20 ~22:30Z. Start only on the design session's GO.

Head and engine
- t123-x64: a fresh worktree detached and clean at H6 = 69bd7993e1f1cb252574939bd6e8e80674bab5b8, with npm ci, electron 44.9.0 and xprobe built under the lock (22:25Z, 0 changes before and after).
- Home: ~/.local/share/cua-171/m5/home-x64-042, its own `cua install`. The engine's sha256 is a1314106…5a78, which is the pin and the brief's, `cua-engine 0.4.2 (9371d2348cf8)`, static-pie, install.json build pinned. `gate.mjs check --pinned` exit 0, attestation verified, checkout at 69bd7993 clean.

When
- Ruling 933's window is 2026-11-21 02:30–08:00Z.
- V5 starts at 02:30Z, or at the GO if that comes later. The launcher refuses to start before 02:30Z or after 07:00Z. If it can't start by 07:00Z, I tell you at once.
- Expected length ~38 min (V5 at H⁗ on x64: 37.6 min). Its hard cap is 55 min: SIGTERM, then SIGKILL 120 s later. So the latest end is 07:55Z plus the kill grace, and it is done before 08:00Z in every case.
- The host lock's cap (CUA_LOCK_MAX) is set to the minutes left to 08:00Z less 2, so the hold ends before 08:00Z at worst.

The command
- `~/.local/share/cua-171/task123/run-sitting.sh "" ~/.local/share/cua-171/m5/zero-x64-h6 V5`.
- That is one hold of the host lock, holder task123-x64 (sitting-locked.sh), around sitting.sh (task 105's, as task 115 fixed its exit).
- sitting.sh runs exactly the line `gate.mjs print V5 --pinned home-x64-042 --out zero-x64-h6 --holder task123-x64` gave, with only its leading `locked.sh task123-x64` stripped:
  `node t123-x64/scripts/linux-engine-gate/sitting.mjs --dir <zero-x64-h6>/V5.pinned-release --hold ~/.local/share/cua-171/hold-sittings --terminal end -- env WRAP=<t123-x64>/docs/evidence/…/m5/guards/wrap71.py <t123-x64>/docs/evidence/…/m4/pointer-route/scripts/run71.sh <dir> <t123-x64>/ --vendor <home>/runtimes/26.928.40906-linux-x64/…/sky_linux_x64 --newest ~/.local/share/cua-171/vendor/deb-26.1023/…/sky_linux_x64 --cua <home>/engine/linux/cua-engine --scene device-firefox,device-chrome,device-chrome-dnd,identity,identity-gtk3,identity-gtk4,identity-kate --ops <the 44 ops, the same list as H⁗'s> --blocks 3 --run pinned-V5 --ballast gate --pinned --hold-canary relative`
- Against H⁗'s V5 line, the only change is `--hold-canary relative` (ruling 932), apart from the paths, holder and home.

What runs on :0
- Only V5. V1–V4 and Z0 do not run.
- What V5 starts on :0 is all run-owned:
  - task 59's Firefox 159 (PATH-checked: a Firefox step is refused unless firefox resolves to it);
  - Google Chrome 156.0.8078.73 on run-owned --user-data-dirs, for the scene windows and the gate's Chrome ballast;
  - the gedit, GTK 3, GTK 4 and kate identity scenes.
- These are driven by the pinned and newest vendor builds and by cua's 0.4.2 engine, through synthetic X input on :0. The pointer moves, and is read before the step and restored after it.
- The audit proxy (xtrace) runs on its own display (:40 on).

What doesn't run on :0
- Nothing of the owner's: no attach to or signal of the owner's Chrome, currently pid 2546101 (started 11-02 20:16:10, read by ps only), and never the owner's profile.
- No private step and no load during the hold. The lock is held across the step, and my private drivers are fenced: none starts a step that could still run at 02:15Z, and they resume only after the sitting's hold is released.
- No stress-ng.

Guards
- Precheck just before launch (precheck-zero.sh), recorded:
  - hold-sittings absent and no stress-ng;
  - the owner's Chrome pid by ps;
  - the load (I wait for the 1-minute load < 1.0);
  - the host lock's last line;
  - :0's pointer;
  - no /tmp/cua171-run-*, and `gate.mjs leftovers` clear;
  - Firefox on PATH, and google-chrome 156.0.8078.73;
  - df / over 20G free (ruling 937).
  Any miss and I don't start, and I tell you.
- The sitting launcher (sitting.mjs) runs its start check, then its end check and the all-clear however the step ends: no harness-titled window left, no key or button held, the audit of windows it didn't open, and processes left.
- wrap71 (M4's guards, unchanged): owner-check before and after, owner-watch, owner-diff, tmp-watch, a TMPDIR of the step's own, decoy connections, and the flag-and-stop on any reach into the person's session.
- If the all-clear fails, the launcher writes hold-sittings. sitting.sh then stops all :0 work, and so do my private drivers.
- I do not clear it, and I do not rerun. The dir comes to you with the findings counted by kind and window.

How it ends
- V5 ends at its verdict. The launcher's all-clear runs, the pointer is restored, and the hold is released.
- I read the guard records, the all-clear and the leftovers, and send you a two-line status within ~10 min of the end. That covers the verdict, the all-clear, flags, decoys, leftovers, the pointer, the owner's Chrome pid, and the relative canary's draggable max and median wait and plain max.
- A FAIL, or route D's "incomplete only by N premise-unmet samples", is reported as it stands, with the step dir, and never rerun by me.
- If anything looks wrong mid-run, my only action is the step's own SIGTERM through its timeout. No signal goes to anything I didn't start.
