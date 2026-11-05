# M4 T7, task 60: the FocusOut timer gives way to a paste settle

The design session's ruling on task 59's measurement (2026-11-04): a background request's `FocusOut` goes at the end
of the request, the window's redirect retained; the timers, the flushes and their waits, and the Escape-restart lock go;
the late-take Escape still goes at once. A paste whose window took keys within S waits, before its observation and its
clipboard lock, until S has passed since the last key to that window. S comes from the wait rule.

Development runs on the #171 VM (8 vCPU), 2026-11-05 UTC, not a release gate. Every sitting ran on a private Xvfb the
harness started itself, with Openbox and the run's own applications, homes and session bus; nothing ran on `:0`.
`pgrep -x stress-ng` was empty before each sitting (`scripts/sitting.sh` refuses otherwise). "Twice the load" is the
harness's 16 stress-ng CPU workers on 8 cores (`--load-factor 2`; load average about 16.4 to 17.1 at the sittings'
ends). Firefox is the Mozilla deb unpacked beside task 59's run, first on `PATH` (task 59's README says why). Each
harness is an export of its commit (`scripts/export-harness.sh`; no `.git`, so the `meta` rows say `commit: null`).
Every engine is a musl build made the release workflow's way (`scripts/build-musl.sh`):

| build | `--version` | sha256 | used by |
|---|---|---|---|
| d7f432f4 | `cua-engine 0.3.0 (d7f432f411e5)` | `22578f92a3b3a9883b0d4d3fb4c3f400b9c184480ad315b0237d8bdbef3ab627` | `settle/` |
| 3171c182 | `cua-engine 0.3.0 (3171c18200cc)` | `614af3dc94b9fac7241029c437ea9cda3dc036734fa43f7bad291a95efe2f4e7` | `accept/idle-3171c182-stopped/` |
| 5570d064 | `cua-engine 0.3.0 (5570d064e6f6)` | `fe9ccb35e8d61a31289be1849d2724ddd744d5311e845d17ab1eeac3805eed4f` | `accept/`, `engine-stop/`, `speed/` |

5570d064's engine sources are the branch head's (the later commits change the harness and docs only).

## S, by the wait rule (`settle/`)

The key-then-paste scenario (8 keys, then `type_text` to the same window, pipelined) on the 8 families of task 59,
lanes `settle-25`, `settle-50`, `settle-75` and `settle-100` (`--paste-settle-ms`, the redirect kept), in one sitting
idle (`settle/idle/`, harness d7f432f4) and one at twice the load (`settle/load2/`). T7's measurement rules: an
independent start for every Chromium run, the retry guard waited out after an unconfirmed paste, 30 consecutive
independent runs in at most 60, raw counts beside them. Every row is in `settle/verdicts.md`.

| family | idle 25 / 50 / 75 / 100 | 2x 25 / 50 / 75 / 100 |
|---|---|---|
| chrome | held / held / held / held | **21 of 60** / held / held / held |
| electron | held (2 refused in 49) / held / held / held | **56 of 60** / **33 of 60** / **13 of 60** / held |
| firefox | held (2 refused in 45) / held / held / held | **19 of 60** / **5 of 60** / held / held |
| gedit, kate, qtcreator, writer, gnome-terminal | held / held / held / held | held / held / held / held |

"held" is 30 consecutive (kate's one idle miss at 25 was an identity-race error, not the paste). The misses are the
race task 59 found: `refused` (the field changed between the observation and the dispatch) or `unconfirmed` (the paste
landed at a caret the observation did not have), with the keys exact in every one. **S = 100 ms**, the smallest step
that held on every family idle and at twice the load (`settle::PASTE_SETTLE`). 0 is task 59's measurement
(`../focus-timer/zero/`): Chrome, Electron, Firefox and gnome-terminal missed.

## What it costs and what it gains (`accept/`, `accept/latency-*.md`)

The pipeline's median (the first request sent to the last answer) per scenario, the engine as it ships, against T7's
timer lane in task 59's sittings (the same harness rules and families):

| scenario | T7's timer, idle → shipped, idle | T7's timer, 2x → shipped, 2x |
|---|---|---|
| A-B-A (24 keys, two window switches) | 216–224 → 27–53 ms | 231–250 → 55–89 ms |
| key-then-paste | 143–290 → 148–271 ms | 187–614 → 193–613 ms |
| burst (20 keys, one window) | 12–17 → 20–31 ms | 21–33 → 35–106 ms |

- **The window switch gains about 95 ms each**: a request to another window no longer waits out the rest of the first
  window's 100 ms. A-B-A pays two, about 190 ms idle.
- **Key-then-paste costs what it cost**: the paste waits the settle's rest after the last key, median 97.7–99.3 ms per
  family (each paste's `--stats` record, `paste.settle`; the last key came 0.7–2.3 ms before), the same wait T7's flush
  gave it.
  Against no settle (task 59's zero lane) it is about 100 ms dearer, which is what keeps the paste from racing the
  keys. A paste with no key to its window within 100 ms waits nothing.
- **A burst costs more per request**: each request now opens and ends its own synthetic-focus session (the server-time
  anchor, the modifier map, the focus walk), where T7 reused one; about 0.6 ms a request idle, 1.5–4 ms at twice the
  load on Qt (kate 21 → 76 ms, qtcreator 28 → 106 ms for 20 keys). 0.3.0 paid 100 ms a request.

## T7's acceptance series on the new build (`accept/`)

The focus-timer experiment's default lanes on every family: `shipped` (the engine as it ships) and `control` (each
request's redirect dropped for bursts and A-B-A; the settle dropped, the redirect kept, for key-then-paste), the three
scenarios, an audit pass per family and lane, and on Chrome and Electron the stop runs.

| sitting | judged series | audits | stops |
|---|---|---|---|
| `accept/idle/` (harness 5570d064) | 24 of 24 at 30 consecutive, no miss | 16 clean | SIGTERM after keys 30/30 and after clicks 30/30, each family; SIGKILL 3/3 |
| `accept/load2/` (harness 2da8b63e) | 24 of 24 at 30 consecutive, no miss | 16 clean | the same |

- Every audit: one synthetic-focus session per request, every `FocusOut` attributed to its own request and none
  deferred past that request's answer (`deferred` 0), nothing forbidden.
- The controls fail on Chromium: idle, Chrome's bursts 9 of 10 and A-B-A 10 of 10, Electron's 8 and 9, the text wrong;
  at twice the load Chrome 10 and 9, Electron 8 and 9. `accept/idle/`'s control kept the paste settle, so its paste
  control showed nothing on Chrome or Electron and the sitting's verdict failed on that alone; the control then
  dropped the settle as well, still with each request unredirected (`accept/idle-control-unredirected/`, harness
  68b601d0: Chrome 0 of 10, Electron 10 of 10), and finally dropped the settle alone, the redirect kept
  (`accept/idle-control-paste/`, harness 2da8b63e): Chrome 2 of 10, Electron 10 of 10; at twice the load 6 and 10.
  Firefox's paste control missed 4 of 10 at twice the load; the other families' controls show nothing, as before.
- The stops: SIGTERM straight after the burst's last answer leaves every key in order, every session closed, the
  exit's settle run, exit 143, median 300 ms after the answer (301–302 at twice the load); SIGKILL skips the settle.

`accept/idle-3171c182-stopped/` is the sitting that found the click cut (Decisions, below): on the build before the
fix, SIGTERM straight after ten clicks lost them in 7 of 10 runs on Chrome and 7 of 10 on Electron, idle. It was
stopped by SIGINT once that showed; it left its private Xvfb running, which was ended by hand.

## T7b's production stop (`engine-stop/idle/`, harness 2da8b63e)

`scripts/engine-stop.sh`, the experiment as task 57 ran it (`--trials 10`, scoped, drain lane this branch's REPL host,
kill lane f59575fb's): **pass**. The drain released or landed 130 of 130 (hold 50, burst 40, handle 40); the engine was
gone 74–373 ms after the stop on the four paths (median per cell; bursts 290–373, since the exit settles 300 ms after
the last key) and about 7084 ms after the stream's end on `held-back` (by(0.4) is at 7000). The control left the key
down 50 of 50 and button 1 down 40 of 40; its bursts were not cut (reported, as before).

## The speed series (`speed/`, harness 2da8b63e)

Task 56 fix 3's paste series (`scripts/speed.sh`: gedit, chrome-textarea, gnome-text-editor in `dedicated` mode;
`type_text`, `type_text_selection`, `clipboard_write`; the pinned and newest vendor builds; `--dev`):

| scene, operation | cua cold / warm | bar | verdict |
|---|---|---|---|
| gedit `type_text` | 77.2 / 68.0 ms | 847.8 / 855.4 (newest) | faster [−784, −749] cold, [−812, −772] warm |
| gedit `type_text_selection` | 75.4 / 70.0 | 858.4 / 855.9 | faster |
| gedit `clipboard_write` | 74.1 / 75.2 | – (both vendor builds fail it: declared) | pass (declared) |
| chrome-textarea `type_text` | 78.1 / 67.3 | 931.8 / 927.6 (pinned) | faster [−877, −832], [−872, −842] |
| gnome-text-editor `type_text` | 85.2 / 78.7 | – (declared) | 39 of 40 witnessed clean |

The one red sample is the false red T7 carried to T18: a cold foreground sample in block 2, where activating the
target took the focus from the run's Chrome, which unmapped and destroyed its own popup at 30 ms, inside the span. The
same one-in-40 showed in task 56's `speed-new/`. No sample of these ops follows a key, so the settle waits nothing here.

## Files

- `settle/{idle,load2}/`, `accept/{idle,load2,idle-control-unredirected,idle-control-paste,idle-3171c182-stopped}/`, `engine-stop/idle/`,
  `speed/`: each sitting's `results.jsonl`, `summary.md`, `watchdog.jsonl`, its stdout (`stdout.txt`) and the
  applications' stderr, every home path replaced by a label (`scripts/copy-evidence.py`).
- `settle/verdicts.md`, `accept/verdicts.md` (`scripts/verdicts.py`), `accept/latency-idle.md`,
  `accept/latency-load2.md` (`scripts/latency.py`, against task 59's sittings).
- `scripts/`: the builds, the harness exports, the sittings' drivers and the tables' scripts.
