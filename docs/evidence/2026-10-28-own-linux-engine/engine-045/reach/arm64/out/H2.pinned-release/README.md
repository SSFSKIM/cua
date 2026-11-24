# H2 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: T17's Electron cells at the gate's window load
- display: private; load: gate-windows; estimated 25 min
- run: `pinned-H2`; the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t163-h10/ at 2c66966bdab7b29836779401019f43abc6cb9890, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-arm64-045/engine/linux/cua-engine (sha256 f81121552e77f50ec2d8dcf3135006a9245c411f2b67bc9cfbe408850e6e637c as given)
- command: `/Users/new/.local/share/cua-171/locked.sh m5-gate /Users/new/.local/share/cua-171/node24/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t163-h10/scripts/linux-engine-gate/gate.mjs run H2 --pinned /Users/new/.local/share/cua-171/m5/home-arm64-045 --out /Users/new/.local/share/cua-171/m5/out-arm64-h10`
- started 2026-11-24T06:53:41.491Z
- finished 2026-11-24T07:11:39.656Z; exit 0; private display's watchdog: clean
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
