# The `capabilities/history` hang (M2 task 3, 2026-10-15)

## Symptom

`capabilities/history` sometimes ran its 60 s cell budget and timed out. It happened on the own host and on the vendor host alike.

| Host | Hung runs | Runs |
|---|---|---|
| Own host, `aff75b4` (`own-before-fix-20-runs.txt`) | 3 | 20 |
| Own host, `aff75b4`, overall | about 12 | about 110 |
| Vendor host, rmcp 1.5.0 attested (`vendor-30-runs.txt`) | 4 | 30 |

All runs were browser-only on the mini with `--service cua`, the case alone.

## Mechanism

**Supervisor message log** (`supervisor-inner-messages-hung.jsonl`): in a hung run, the supervisor sends `exec-3` (the history cell) to the kernel, and the kernel then sends nothing for 60 s.

**Kernel phase lines** (`kernel-phases-hung.log`):
- The kernel received `exec-3`, built it and entered `module.evaluate()`.
- It never reached `nodeRepl.rpc`.
- Neither its 500 ms stall detector nor a 5 s dump timer ever ran, so its main thread had stopped.
- Its process state was `S` (sleeping), not `T`.

**Native stack** (`kernel-sample-before-fix.txt`, macOS `sample`): the main thread is in `Date.prototype.toISOString`, during the facade's conversion of the query's `from`/`to` dates:
- `DateCache::LocalOffsetInMs`
- `icu::TimeZone::detectHostTimeZone`
- `tzsetwall_basic`
- `notify_register_tz`
- `bootstrap_look_up2`
- `mach_msg`, waiting on launchd.

**TZ does not avoid it** (`kernel-sample-with-TZ.txt`): a kernel with `TZ=Asia/Seoul` hung on the same stack, because Apple's libc registers the notify watch either way. That attempt was reverted.

## Sandboxed reproduction without the harness (`sandbox-tz-probe.sh`)

The probe runs `codex sandbox` with the same scoped policy.

| First local-time use | Variation | Blocked |
|---|---|---|
| At start-up | user Node 24.18 and the vendor's Node 24.21, each with and without the vendor's `LANG` and `__CF_USER_TEXT_ENCODING` | 0 of 240 |
| At start-up, again | | 0 of 40 |
| About 2.5 s into the process, after 200 `vm.createContext` | | 10 of 40, then 5 of 40 |
| At start-up, then the same late lookup | | 0 of 40 |

## Fixes

**`8e3d148`: settle the zone at start-up.** `worker-runtime.mjs`, which the kernel and the trusted worker load first, calls `new Date(0).getTimezoneOffset()` as it loads.
- 40 own-host history runs at `8e3d148`: 0 hung (`own-at-fix-runs.txt`).
- Two of the listed runs did not reach the case, both for harness reasons: a fixture `fetch failed`, and one transient `Prepared profile ssfs is not ready`.

**`d29907a`: a child that does not finish starting is replaced.** A 300-iteration stress of the real supervisor and sandbox at `9bad10c` still caught a trusted worker blocked in that start-up lookup, about once in 600 starts:
- its first rpc timed out;
- `turn_ended` then waited forever;
- the host's EOF drain never ended.

The fix:
- The runtime announces `runtime_ready` once it has loaded.
- The supervisor holds each child's work until then.
- A child not ready within 10 s is replaced, 3 starts in all. After that the waiting work fails with a sentence.
- A child that exits while starting still answers with its exit diagnostic.

**Not changed.** The vendor host keeps hanging on this case at about one run in eight. The corpus oracle stays strict: a hung vendor run is recorded and the pair is rerun.

## Verification of `d29907a`

`own-host-stress.mjs` drove the real own supervisor of the prepared clone under the real `codex sandbox` on the mini, 600 iterations, each with a fresh kernel and worker (`stress-600-at-d29907a.txt`):
- **0 hung.**
- Two start-ups blocked (iterations 487 and 503). Each was replaced after 10 s, and the first rpc answered (`js` about 10.3 s).
- `iter487-js-*.txt` is the sampled stuck child.
- `worker-sample-startup-block-at-9bad10c.txt` is the stuck worker that showed the start-up block before the fix.
