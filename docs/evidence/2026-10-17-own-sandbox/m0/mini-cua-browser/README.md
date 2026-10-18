# #115 M0 baseline: cua's own host, browser-only session, on the mini

This is acceptance 11's second configuration: cua's own REPL host serving the browser surface alone, measured on its cold rows only. There are no native calls and no Chrome is started; the first cell runs the bootstrap and the API document. M4 repeats it into `m4/mini-cua-browser/`, and `compare --same-host` judges `cold.miss.first_js` and `cold.hit.first_js`. In M4 the launcher moves from `codex-cli` to `cua` and TMPDIR from `inherited` to `session`; both are permitted changes.

```sh
node scripts/mini-rules.mjs browser     # = native-baseline run --device mini --experiment 115-m0 --host cua --surfaces browser --out …/run-N, three times, each behind the mini rules
```

## Result

All three runs completed, at harness commit `90cbfe0`. `summary.md` lists no problems. Every connection attested `cua-repl-host 0.5.0` on the run's managed Node.

Judged rows (pooled medians):

| Row | Median | Samples | p95 |
|---|---|---|---|
| `cold.miss.first_js` | **1,160.5 ms** | 6 | 2,165.4 ms |
| `cold.hit.first_js` | **316.6 ms** | 9 | 428.1 ms |

## How each run was set up

- **Install.** Each run installed the runtime fresh into its own scratch home. The browser surface starts no native helper, so a fresh copy raises no prompt.
- **Environment.** HOME was that home's scratch, with a TMPDIR of the run's own (`<home>/harness-tmp`).
- **Witness.** The launch witness reads `{launcher: codex-cli, tmpdir: inherited}`: before M1 the own host still launches its children through the Codex CLI.
- **Cleanup.** Each run's scratch home was removed, and no serve was left behind. Terminal was frontmost after every run, and no Chrome was opened, so none needed closing.

## Loads

The 1-minute-load bar was 5 for all three runs. It moved from 2 at about 14:10Z, as explained in `../mini-vendor-computer/README.md`.

| Run | Started (UTC) | Gate's 2nd reading | Device before | Device after | Controller 1-min load before → after |
|---|---|---|---|---|---|
| run-1 | 14:53:46 | 2.61 | 3.36 3.21 3.11 | 3.30 3.20 3.11 | 219.78 → 223.48 |
| run-2 | 14:55:14 | 2.51 | 2.86 3.04 3.05 | 2.62 2.98 3.02 | 207.81 → 209.52 |
| run-3 | 14:56:41 | 2.75 | 3.20 3.03 3.04 | 3.54 3.11 3.06 | 204.22 → 207.67 |

No system prompt appeared.
