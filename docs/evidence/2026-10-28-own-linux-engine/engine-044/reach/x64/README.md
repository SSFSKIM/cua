# x64's reach on linux-engine 0.4.4

## At H9 (0.4.4)

Task 148, rulings 1099, 1102 and 1113–1115. H9 is cd03a47bde2a484e1c3ecbf07cc97aada720fda7 on `engine-044-pin`: the
0.4.4 tag commit 23f34217, the pin, `MIN_ENGINE_VERSION` 0.4.4, and task 142's harness. **Every step passes; nothing
failed, so nothing stopped and nothing was rerun.** No row is unexercised or skipped. H2's 60 root-cell drags have an
end the judge does not verify, and it counts them out of its outcomes (below).

**Setup.**
- The checkout is a fresh worktree detached at H9 (`t148-x64`), with a real `npm ci`, Electron 44.9.0's binary present
  and xprobe built (`scripts/setup.log.txt`). Chrome is 156.0.8078.73.
- The home is home-x64-044, task 145's `cua install --engine` from the pin, checked again (`scripts/check-home.log.txt`):
  - its engine's sha256 is eff8befc…4d67ca, the pin's x64 asset, and it reads `cua-engine 0.4.4 (23f342178d94)`;
  - `gate.mjs check --pinned` exited 0, with `engine_tree` `{"path":"native/linux-engine","commit":"23f342178d94f81fc37a95124e818f8238b36ef0","equal":true}` and `clean: true`;
  - the attestations of runs 45138098451 (the release run) and 45135771944 verified.
- Every counted step is `gate.mjs print <step> --pinned home-x64-044 --holder h9-x64`'s line (`scripts/commands.txt`),
  one hold of the host lock per step, released at its end (`scripts/drive.sh`, `scripts/step.sh`, `scripts/lock-lines.txt`).
- hold-sittings was absent and `df` showed 49–51G free before each step.
- Every run was on a private display (`:1`, the gate's own Xvfb). Nothing ran on any `:0`. The owner's Chrome was read
  by `ps` only.

### The steps

| step | what | minutes | verdict as printed |
|---|---|---:|---|
| H1 | t17-fix3, idle | 18.1 | No false ok, no drop at a stale position, no missing landing, no false error, every notice refused once; every cell of the plan ran. |
| H2 | t17-fix3, the gate's window load | 18.6 | the same sentence |
| L4a | t17-fix3, twice the load | 19.9 | the same sentence |
| L4d | t14-stale, twice the load | 20.1 | each of the three parts: its judge's pass sentence (below) |

`scripts/step-table.md` has the lock times, the loads and each end check (clean, clear on all four).

**Item 1: H1, H2 and L4a, the settle's rest (#487).** Each step's judge prints: "The settle's rest (#487, engine
0.4.4): 560 of 560 settled drags rested 30 ms; 0 another rest, 0 without rest_ms, 0 without the settle record; 0 drops
without the engine's settle count, 0 contradicting it, 0 with copies that disagree, 0 not labelled Electron's."
Counted from the rows alone (`scripts/rests.txt`): every Electron row of H1, H2 and L4a has a settle record, and the
only `rest_ms` seen is 30 (560 of 560 in each); L4d's 30 Electron rows rested 30 ms too.

The judges' tables, all three steps:
- `cua` plain and `cua:handle` plain: 100 landed in each, all answered ok with nothing pending;
- left, inzone-out, and the four releases off the window (root, xterm, other, slow) on `cua:desktop` and
  `cua:handle`: 30 of 30 honest unconfirmed each;
- 0 false oks, 0 stale-position drops, 0 ambiguous, 0 errors;
- #365's race: 0 of 60 at each load. L4a's residue: 0 of 100 on plain and on handle plain (bound 2).
- H2's root cells (`cua:desktop` and `cua:handle`, 30 each) are the exception, as at earlier heads. They are released
  over the Chrome ballast, so their end is not verified (ruling 838). The judge counts them out of its outcomes (0
  judged drags, 30 "end not verified" each) and reports them as a finding: 0 ok and 30 unconfirmed of 30 on each lane.
  They are reported here and not counted as outcomes. Their settle rests are counted in the 560.

**Item 2: L4d at ruling 993's bar.** The plan-of-parts verdict passes, with no part failed. Counts are "all (gate open /
shut)", the gate derived by ruling 993's rule (`scripts/l4d-parts.txt`, task 135's `l4d-h8.mjs` unchanged):

| part | drags | gate open / shut | landed | stale | false ok | honest unconfirmed | untaken | in the margin |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| chrome t14-long (long-left) | 100 | 100 / 0 | 0 | 0 | 0 | 100 (100 / 0) | 0 | 0 |
| chrome t14-floor plain-long | 300 | 0 / 300 | 300 (0 / 300) | 0 | 0 | 0 | 0 | 0 |
| chrome t14-floor left | 30 | 0 / 30 | 0 | 0 | 0 | 30 (0 / 30) | 0 | 0 |
| chrome t14-floor inzone-out | 30 | 0 / 30 | 0 | 0 | 0 | 30 (0 / 30) | 0 | 0 |
| electron t17-long (long-left) | 30 | n/a | 0 | 0 | 0 | 30 | 0 | 0 |

- 0 false oks and 0 stale-position drops on every Chrome cell.
- The Electron part passes 972's exercised-row rule: 30 of 30 exercised the long path, against a minimum of 20.
- Chrome activated on none of the t14-long drags.

### Item 3: Chrome `drag_handle` long-left ×100 at twice the load (a development measurement, never counted)

This is task 132's handle set, run the same way (`handle/`, `scripts/handle.sh`, `scripts/handle-scripts/`):
- the command: `handle.sh handle-x64 chrome t132-handle-long 4 25 2 e044=<home-x64-044's engine> off=<off-044>@8`;
- 4 rounds at twice the load, the pinned 0.4.4 engine at 25 a round, interleaved with a control lane of the same
  binary with `--drag-dnd-release-sync off` at 8 a round;
- the plan `t132-handle-long` is task 132's `add-plans.py`, applied to the H9 checkout uncommitted after the counted
  steps had ended and reverted before this commit (`scripts/dev-plans.diff`);
- rows judged per row by H9's own `chromeDropVerdict` and joined to `--stats` (`scripts/handle-tables.md`).

| lane | drags | false ok | stale | honest unconfirmed | Chrome activated after the release | ended on the no-drop image | late-take rows |
|---|---:|---:|---:|---:|---:|---:|---:|
| e044 (0.4.4 as pinned) | 100 | **0** | **0** | 100 | 0 | 100 | 0 |
| off (control) | 32 | 0 | 0 | 32 | 0 | 32 | 0 |

`--stats` `handle.release_sync` on the 0.4.4 lane:
- the tail ran on 100 of 100, `schedule` `handle_end`, **`motions` 4** on every drag;
- **`interrupted_unconfirmed` true on 0 of 100**, and `stopped_for_motion` on 0 of 100;
- **added ms p50 16.8 / p95 22.4 / max 25.6.** On arm64 at ba5b0438 (task 132, 0.4.3) it was 20.6 / 26.1 / 30.0.

The control never ran the tail ("the form is off").

### Not run here

- Item 4 (`t487-named`) is arm64 only.
- By the reach argument, D1, C1, K1–K3, L2a, L4b, L4c, item 9 and V5 (`:0`) were not rerun.

### Scans

Run before the commit (`scripts/scans.txt`, `scripts/title-scan.txt`):
- 0 token-shaped strings;
- 0 key-code rows;
- no window titles. 0 values are not the harness's own. Task 148 added item 3's development labels to the scan's own
  list.
