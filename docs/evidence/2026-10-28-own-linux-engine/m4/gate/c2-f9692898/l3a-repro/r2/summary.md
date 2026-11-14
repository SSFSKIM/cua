# linux-engine-diff summary

## t77-l3a-repro (experiment settle; development run, not a release gate)

| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |
|---|---|---:|---|---:|---|
| chrome-text clipboard_read background | shipped | 61 | 2 (0 / 0 / 2 / 0) | 0 | not reached |

| cell | audit | requests | runs that ran their input | effects missed |
|---|---|---:|---:|---:|
| chrome-text clipboard_read background | **5 of 5 runs did not run their input (context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent)** | 5348 | 0 of 5 | 0 |

**Incomplete or failed:** chrome-text clipboard_read background (shipped): no 60 consecutive passing runs in 61; chrome-text clipboard_read background: the audit failed: 5 of 5 runs did not run their input (context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent; context menu did not open; no clipboard action was sent).

desktop: started with no window active, ended with 0x00e0000c active (harness), neither acted on; holder none; the harness's own trace: 1368 requests, 1184 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

