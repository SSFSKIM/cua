# x64's reach on linux-engine 0.4.5

## At H10 (0.4.5)

Task 162, rulings 1193 and 1194. H10 is 2c66966bdab7b29836779401019f43abc6cb9890 on `engine-045-pin`: the 0.4.5 tag
commit 77ed101d4, the pin (x64 ef714179…c119a, release run 45335176072), `MIN_ENGINE_VERSION` 0.4.5, task 160's ×300
evidence and main at 0d4c59901. This is the first measurement of the shipped 0.4.5 bytes. **Every step passes; nothing
failed, so nothing stopped and nothing was rerun.** No row is unexercised or skipped. H2's 60 root-cell drags have an
end the judge does not verify, and it counts them out of its outcomes (below).

**Setup.**
- The checkout is a fresh worktree detached at H10 (`t162-x64`), with a real `npm ci`, Electron 44.9.0's binary present
  and xprobe built (`scripts/setup.log.txt`). Chrome is 156.0.8078.73. The checkout had 0 changes before and after.
- The home is home-x64-045, task 161's `cua install --engine` from the pin, checked again (`scripts/check-home.log.txt`):
  - its engine's sha256 is ef714179…c119a, the pin's x64 asset, and it reads `cua-engine 0.4.5 (77ed101d43ea)`
    (x86-64 static-pie);
  - `gate.mjs check --pinned` exited 0, with `engine_tree` `{"path":"native/linux-engine","commit":"77ed101d43ea9b071bd9783dd9bb3387733f9f6d","equal":true}` and `clean: true`;
  - the attestation of release run 45335176072 verified.
- Every counted step is `gate.mjs print <step> --pinned home-x64-045 --holder h10-x64`'s line (`scripts/commands.txt`),
  one hold of the host lock per step, released at its end (`scripts/drive.sh`, `scripts/step.sh`,
  `scripts/lock-lines.txt`). Inside its hold a step waits up to 6 minutes for a quiet host (no stress-ng, 1-minute load
  below 1.0).
- hold-sittings was absent and `df` showed 23–24G free before each step.
- Every run was on a private display (`:1`, the gate's own Xvfb; each `step.json` says `display: private`, watchdog
  clean). Nothing ran on any `:0`. The owner's Chrome was read by `ps` only.

### The steps

| step | what | minutes | verdict as printed |
|---|---|---:|---|
| H1 | t17-fix3, idle | 18.1 | No false ok, no drop at a stale position, no missing landing, no false error, every notice refused once; every cell of the plan ran. |
| H2 | t17-fix3, the gate's window load | 18.6 | the same sentence |
| L4a | t17-fix3, twice the load | 19.9 | the same sentence |
| L4d | t14-stale, twice the load | 20.2 | the same sentence; the plan-of-parts verdict passes, with no part failed |

`scripts/step-table.md` has the lock times, the loads and each end check (clean, clear on all four).

**Item 1: H1, H2 and L4a, the settle's rest (#487).** Each step's judge prints: "The settle's rest (#487, engine
0.4.5): 560 of 560 settled drags rested 30 ms; 0 another rest, 0 without rest_ms, 0 without the settle record; 0 drops
without the engine's settle count, 0 contradicting it, 0 with copies that disagree, 0 not labelled Electron's; 0 zero
counts not shown their own; 0 of 14 lanes and cells with no settle observed." Counted from the rows alone
(`scripts/rests.txt`): every Electron row of H1, H2 and L4a has a settle record, and the only `rest_ms` seen is 30 (560
of 560 in each); L4d's 30 Electron rows rested 30 ms too.

The judges' tables, all three steps:
- `cua` plain and `cua:handle` plain: 100 landed in each, all answered ok with nothing pending;
- left, inzone-out, and the four releases off the window (root, xterm, other, slow) on `cua:desktop` and
  `cua:handle`: 30 of 30 honest unconfirmed each;
- 0 false oks, 0 stale-position drops, 0 ambiguous, 0 errors;
- #365's race: 0 of 60 at each load. L4a's residue: 0 of 100 on plain and on handle plain (bound 2).
- H2's root cells (`cua:desktop` and `cua:handle`, 30 each) are the exception, as at earlier heads. They are released
  over the Chrome ballast, so their end is not verified (ruling 838). The judge counts them out of its outcomes (0
  judged drags, 30 "end not verified" each) and lists them as a finding ("root unmeasured"). They are reported here
  and not counted as outcomes. Their settle rests are counted in the 560.

**Item 2: L4d at ruling 993's bar.** The plan-of-parts verdict passes, with no part failed (`scripts/l4d-parts.txt`,
task 135's `l4d-h8.mjs` unchanged; its derived gate and schedule are 0.4.3's rule and are superseded by the rows' own
`release_sync` below):

| part | drags | landed | stale | false ok | honest unconfirmed | untaken | in the margin |
|---|---:|---:|---:|---:|---:|---:|---:|
| chrome t14-long (long-left) | 100 | 0 | 0 | 0 | 100 | 0 | 0 |
| chrome t14-floor plain-long | 300 | 300 | 0 | 0 | 1 (landed, answered unconfirmed) | 0 | 0 |
| chrome t14-floor left | 30 | 0 | 0 | 0 | 30 | 0 | 0 |
| chrome t14-floor inzone-out | 30 | 0 | 0 | 0 | 30 | 0 | 0 |
| electron t17-long (long-left) | 30 | 0 | 0 | 0 | 30 | 0 | 0 |

- 0 false oks and 0 stale-position drops on every Chrome cell.
- The Electron part passes 972's exercised-row rule: 30 of 30 exercised the long path (took, and outlasted the floor),
  against a minimum of 20.
- Chrome activated on none of the t14-long drags, and on 300 of 300 plain-long drags.
- The judge's T14 share, reported and not a fail: t14-floor 1 of 300 landed drops answered unconfirmed (within 5%);
  t14-long 0 of 0.

**L4d's release_sync (#512, 0.4.5's records).** Checked before counting: **all 460 Chrome rows carry `release_sync`
with all three new fields** (`overran`, `last_step_after_take_ms`, `unconfirmed`). From the rows' own records
(`scripts/release-sync.txt`, `scripts/release-sync.mjs`):

| cell | rows | overran floor_until | their `last_step_after_take_ms` (min / median / max, the upper median) | schedule after_path / in_floor | gate open | visits_dropped | `unconfirmed` by cause |
|---|---:|---:|---|---|---:|---|---|
| t14-long long-left | 100 | 100 | 428.7 / 460.1 / 500.3 | 100 / 0 | 100 | 0 on 100 | null 100 |
| t14-floor plain-long | 300 | 124 | 326.0 / 327.8 / 336.4 | 124 / 176 | 0 | 0 on 299, 1 on 1 | null 299, visit_dropped 1 |
| t14-floor left | 30 | 6 | 326.2 / 327.0 / 328.4 | 6 / 24 | 0 | 0 on 30 | null 30 |
| t14-floor inzone-out | 30 | 1 | 326.3 | 1 / 29 | 0 | 0 on 30 | null 30 |

- floor_until is 326 ms after the take. Every overran row took the after-path tail, and every row that did not overrun
  took the in-floor tail; long-left's after-path is its open gate, the t14-floor rows' is #512's overran rule with the
  gate shut. The rows that did not overrun ended 324.6–326.0 ms after the take on plain-long and left (inzone-out, whose path can end early:
  0–319).
- The tail sent 2 motions on 459 rows and 1 on the dropped-visit row. added_ms (min / median / max, the upper median): long-left 24.3 /
  24.8 / 31.0; plain-long 21.4 / 24.0 / 32.9; left 18.9 / 24.0 / 30.4; inzone-out 21.2 / 24.0 / 27.3.
- **The dropped visit (#512 item 2, exercised live).** plain-long row #268: in floor, not overran (last step 325.6 ms
  after the take), the tail dropped 1 of its 2 visits, and the engine answered it unconfirmed with option (c)'s notice
  (`unconfirmed: visit_dropped`). Its drop landed and Chrome activated, so it is the judge's one "landed drop answered
  unconfirmed" (T14's share above): honest, fail-closed, not a false ok. Task 160's ×300 had no dropped visit, so this
  is item 2's first live firing.

### Not run here

By the reach argument (ruling 1193 R3), D1, C1, K1–K3, L2a, L4b, L4c, item 9 and V5 (`:0`) were not rerun.

### Scans

Run before the commit (`scripts/scans.sh`; output in `scripts/scans.txt`, `scripts/title-scan.txt` and
`scripts/ls-ps-scan.txt`):
- 0 token-shaped strings;
- 0 key-code rows;
- no window titles: 0 values are not the harness's own;
- raw U+2028 / U+2029: none in any text file (`grep -rlIP`) and none in any gzipped file's content (`zgrep`). The
  plain `grep -rlP '\x{2028}|\x{2029}'` names two gzipped files, `out/H2.pinned-release/order.jsonl.gz` and
  `out/L4d.pinned-release/order.jsonl.gz`. That is the grep reading compressed binary bytes. Their decompressed content
  has no U+2028 or U+2029, and a byte-level (`LC_ALL=C`) search finds no E2 80 A8 or E2 80 A9 sequence in them.
