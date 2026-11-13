# R2 (release gate)

**release gate.**

- what: native-baseline, three runs a lane interleaved, and compare --engines; a series it leaves undetermined gets one top-up of three more runs a lane, pooled by the same rule, and one still undetermined after it is reported, not failed
- display: own; load: idle; estimated 45 min
- run: a facade instrument or suite (no run name); the harness's output in `run/`
- checkout: /Users/new/Developer/GitHub/cua/.claude/worktrees/t76-gate/ at 514f5c62dd6c74b1ed24c48f112ca9c35a70eece, clean
- candidate: /Users/new/.local/share/cua-171/gate/artifact/cua-engine-0.4.0-linux-x64 (sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937 as given); candidate: sha256 f7c12e9bc2ca415050c9dd0f955012aedc3f5d0e1fbcd8661daea7bee0b83937, x86_64-unknown-linux-musl static-pie, cua-engine 0.4.0 (514f5c62dd6c); attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/43405393873/attempts/1, built from 514f5c62dd6c74b1ed24c48f112ca9c35a70eece (refs/heads/feat/171-m4) on a github-hosted runner
- command: `/Users/new/.local/share/cua-171/locked.sh t18-gate /usr/bin/node /Users/new/Developer/GitHub/cua/.claude/worktrees/t76-gate/scripts/linux-engine-gate/gate.mjs run R2 --candidate /Users/new/.local/share/cua-171/gate/artifact/cua-engine-0.4.0-linux-x64 --out /Users/new/.local/share/cua-171/gate/out`
- started 2026-11-13T12:13:29.881Z
- finished 2026-11-13T12:35:00.937Z; exit 0
