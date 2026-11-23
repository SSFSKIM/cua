# R2 (acceptance on the pinned release)

**acceptance on the pinned release.**

- what: native-baseline, three runs a lane interleaved, and compare --engines, the operations the engine answers judged by their in-cell time with the wall time beside it, which fails an operation only past a gross backstop of max(10%, 500 ms) over the vendor wall median (ruling 706); a series it leaves undetermined gets one top-up of three more runs a lane, pooled by the same rule, and one still undetermined after it fails, unless the design session declared it a gap by name: then it is unproved, listed apart from the passes
- display: own; load: idle; estimated 45 min
- run: a facade instrument or suite (no run name); the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t5-x64/ at fefe306c288956a48b6c086017f3cd1a58462a07, clean
- candidate: /Users/new/.local/share/cua-171/m5/home-x64/engine/linux/cua-engine (sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca as given); candidate: sha256 751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (c55c8e08d9cb); the pin's x64 asset of linux-engine-v0.4.0; native/linux-engine as at c55c8e08d9cbbb057b8b95434787b1e45d41184c, the checkout at fefe306c288956a48b6c086017f3cd1a58462a07; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43637317960/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/release/linux-engine-v0.4.0) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43608161213/attempts/1, built from c55c8e08d9cbbb057b8b95434787b1e45d41184c (refs/heads/feat/171-m4) on a github-hosted runner
- command: `/Users/new/.local/share/cua-171/locked.sh t5-x64 /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t5-x64/scripts/linux-engine-gate/gate.mjs run R2 --pinned /Users/new/.local/share/cua-171/m5/home-x64 --out /Users/new/.local/share/cua-171/m5/out-x64`
- started 2026-11-16T17:09:24.510Z
- finished 2026-11-16T17:31:12.507Z; exit 0
- unproved (declared gaps, not passes): none
- end check: clear (no cua171-run-* directory or session bus of one)
- end: clean (nothing left on the run's own side)
