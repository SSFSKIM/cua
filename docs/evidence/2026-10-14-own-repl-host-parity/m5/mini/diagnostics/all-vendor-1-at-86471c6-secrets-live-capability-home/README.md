# Diagnostic: mini vendor `--suite all --through M5` at 86471c6 (not a control)

Labelled diagnostic, not oracle evidence. Commands, from this worktree at `86471c6` (code equal to reviewed merge `28bfd5a`):

```sh
node scripts/repl-parity.mjs prepare --device mini --commit 86471c6982ba783676f8c853c3c08555382a0b3e --profile ssfs
node scripts/repl-parity.mjs run --host vendor --device mini --suite all --through M5 --out <this dir>
node scripts/repl-parity.mjs cleanup-prepared --device mini      # {"removed": true}
```

- Prepare: fresh `cua install` scratch home with the managed Node, no `CUA_NODE`, no `--node`. The own host's Node would be
  `<scratch home>/node/24.22.0/bin/node` v24.22.0 (`nodeMode: managed`); harness Node on the mini v24.18.0. See `prepare-summary.json`.
- Run: 2026-10-16 09:59–10:34 UTC. 479 cases, 0 pending, complete, **assertions FAIL**: 454 covered; all 25
  `secrets/browser-live/*` (secrets-live) cases fail. Every cell in those cases answers
  `Live secrets require a real capability scratch HOME` (isError), and the assertion reports `true !== false`.
- Load: mini 2.44 / 2.86 / 2.97 before, 4.65 / 5.63 / 4.89 after; this Mac 239 / 195 / 172 before, 102 / 142 / 189 after (not a timed run).
- ssfs readiness (profiles list, key/ready/reason only) before, every 5 minutes during, and after: ready throughout (`ssfs-readiness.log`).

## Cause (harness)

`scripts/browser-parity/capability-home.mjs` `prepareCapabilityHome` places the capability home under `~/.cp` when the run
is managed (`CUA_PARITY_NODE_MODE=managed`, introduced by c02691b with the managed-Node preparation), and under `/tmp`
otherwise. `test/repl-parity/fixtures/live-secret-service.mjs` `assertScratchHome` still requires the capability home's
parent to be `/tmp` or `os.tmpdir()`, so every live-secret service refuses in a managed run, on either host. The mini
oracle's secrets-live controls predate managed preparation, so the two changes were never exercised together live.
