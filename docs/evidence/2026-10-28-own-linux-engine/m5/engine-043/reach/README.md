# What a linux-engine 0.4.3 carrying #459's fix would reach in M5's acceptance (task 127)

Read-only analysis for the owner's choice under ruling 957: cut 0.4.3 with #459's fix before the default flip (T10),
or flip on 0.4.2 with #459 declared. No 0.4.3 build exists. This table is drafted from the fix's two designed forms,
not from task 126's prototype (`m5-p459`), which was not pushed when this was written. No run, no VM step, no code
change. The form is task 120's table for 0.4.2 (`m5/engine-042/reach/README.md` on `m5-reach-042`).

- **The engine** is 0.4.2 (`linux-engine-v0.4.2`, 9371d234). `native/linux-engine/` at H6 (69bd7993) is that tag, and
  line numbers below are at H6.
- **The harness** is H6, plus H7's candidate on `m5-h7` (cf1ef10f when read). H7 makes `t14-late`'s freeze wait for the
  browser's press mark, counts an unidentified or skipped row as unexercised, and keeps the inside freeze at 600 on both
  architectures. Ruling 957's judge change, which counts a drop that landed where the path did not end as wrong, was not
  on `m5-h7` yet.
- **Where the steps stand** comes from `m5/x64/README.md` ("At H6") and from arm64's H6 records (`m5/arm64/h6/`, task
  122's, not yet committed when read). The minutes are measured there, from acquiring the lock to releasing it, so they
  include the quiet waits.
- **The stored rows.** Every drop-signals, K and V5 row at H6 carries the engine's own hold, after-take and
  after-release records. `scan-h6.mjs` counts per cell the releases that came after a take, and those whose path
  outlasted the floor. Its output is `scan-h6.txt`, and `scan-a953.mjs` adds the a953 development runs. The drag
  experiment's lanes and the settle's run without `--stats` (834), so D1, D2, L1, L2a, L2b, S1, L3a and L3b keep no
  such records.

## In short

- **The fix acts at one point:** just before the button goes up on a Chromium drop the engine lets drop, meaning a
  drag, or a handle's end, whose source took `XdndSelection` before it. (b) waits after (a)'s motion at that same point.
  So the two forms reach the same steps. They differ in what they can change there.
- **Class A as briefed, 14 steps on each architecture:** V5, D1, D2, H1, H2, C1, K1, K2, K3, L2a, L2b, L4a, L4b and L4c.
  "As briefed" covers every Chromium-family source, Electron included.
- **Class A if the fix covers Chrome sources only, 9 steps on each:** V5, D1, C1, K1, K2, K3, L2a, L4b and L4c.
  - The Electron steps D2, H1, H2, L2b and L4a become B. The source's family is a condition the plan fixes.
  - Electron's drops already rest, revisit the last point and sync with the app before their release (ruling 827).
- **These leave 0.4.2's class A: S1, L1, L3a and L3b.** Their Chromium drags never take: the settle pages' pad, the
  scrollbar thumbs and the ranges. So the engine never releases one of them after a take.
- **Timing:** D1's dnd (#358) is the only judge of a reached drag's time.
  - x64's interval, [29.2, 36.9], is 3.1 ms inside the 40 ms bound (#457). arm64's, [26.7, 27.0], is 13.0 ms inside.
  - (a) stays inside only if its motion adds no pause of about 3 ms or more.
  - (b) adds its wait to every D1 dnd drag. On x64 almost any wait crosses the bound.
- **(b) brings new answers; (a) adds none.**
  - (b)'s refusal is an error on drops that V5's in-front and dedicated cells expect to land.
  - Its timeout leaves an unconfirmed notice on drops that V5's `confirm` cells require to carry nothing pending.
  - So its judges, item 2's deviations and the Linux document change with it.
- **The proposed reruns** are the same list for both forms. Each architecture includes V5 on `:0`, about 38 min: on x64
  in an owner window, as at H6, with the conditional V5 slots budgeted, and on arm64 with nobody needed.

  | scope | x64 | arm64 |
  |---|---:|---:|
  | as briefed | about 4.3 machine hours | about 4.4 |
  | Chrome only | about 2.4 | about 2.4 |

  Item 9 and the fresh-home doctor rerun for the new asset. R1–R4 rerun with the flip, as planned.
- **H7's C1 and L4c could run once, on 0.4.3.** Both are class A under every form and scope. Running them at H7 first
  costs about 7 minutes a VM and gives the 0.4.2 path its record. I would run them now.
- **No counted step tests #459 itself.**
  - L4b runs only the measurement lane `cua:accept`. The shipped twins, `t14-long` and `t14-floor`, are development plans.
  - V5's long-left cell runs the defect's shape, but only at idle, 9 samples a VM.
  - If 0.4.3 is cut for #459, a counted step running the twins at twice the load (about 23 min a VM) would show the fix on
    the released bytes.

## 1. The fix as designed, and where it would run

| form | where in 0.4.2's code | when it runs |
|---|---|---|
| (a) one keepalive motion at the path's last point before the release, "whatever the floor has left" | `drag_along`, between the last look and `route.release_button` (pointer.rs L781–782); `release_handle`, before `Desktop::button(…, false)` (handle.rs L766–768) | three conditions, all needed: (1) the press window is Chromium-family (`pressing_into`, `families::blink`: Chrome, Chromium, Electron); (2) the engine lets the drop through, so there is no guard and `hold` is set; (3) a take was seen by the release (`taken`, or a handle's `judging`) |
| (b) the same motion, then a wait of about 100 ms for the target's answer. A refusal cancels with the honest answer, and a timeout releases unconfirmed | the same place, before the release | the same |

**The routes the drops take, under the flags that ship:**
- **The background route, Chrome in front** (active, focused and unobscured, so no guard): V5's four in-front cells,
  D1's and L2a's dnd, K1's and K2's short drop, K3, C1, L4c and L4b.
- **The foreground route, in dedicated mode:** V5's three dedicated cells.
- **The desktop route, and a handle's end:** only Electron's lanes `cua:desktop` and `cua:handle` (H1, H2, L4a). No
  counted step sends a Chrome drop on the desktop route, or a Chrome handle that takes.
- **The guarded route has nothing to act on.**
  - A guarded drag cancels a take it sees before the release (`cancel_in_time`, pointer.rs L310–318).
  - The two measurement flags that let a guarded drag run on are `--dnd-cancel-after-release` and `--dnd-defer-take`
    (V5's late and late-take cells). Both hide the take until after the release (`DropGuard::looks`).
  - So no guarded drag ever releases after a take it saw, under either form.

**The assumptions this table rests on.** Task 126's code decides each of them.
1. **The forms act only after a take seen by the release.** If (a)'s motion ran on every Chromium-family release, the
   reach would grow back to about 0.4.2's class A: S1, L1, L3a, L3b, and every select, range, scroller and canvas
   cell. (b)'s wait would then cost every Chromium drag that never took up to 100 ms.
2. **"A Chromium drop" is the engine's Chromium family**, Electron included. §6 and §7.1 give the Chrome-only
   alternative.
3. **The measurement lane is included.** `--drag-dnd-release-at-accept` releases a drop the engine lets through, so the
   forms reach it unless they leave that path out. L4b runs only that lane.
4. **(a)'s pause is unknown.** The design names none.
   - The engine's notes on Chrome's drop (dnd.rs `RELEASE_AFTER_TAKE` and `KEEPALIVE`): the target accepts only a
     position the renderer has answered, and only a motion makes the browser send a new one.
   - So a motion the browser reads just before the release has no answer when the button goes up.
   - What (a) fixes, and what it costs D1, both depend on how long it leaves between the motion and the release.
5. **(b)'s answer is unknown.**
   - The target's `XdndStatus` can't be read from another process (the spec's T17 observation).
   - Chrome's cursor shows "Chrome's last status, which answers a position the renderer has handled, not necessarily
     the drag's last" (accept.rs).
   - Whatever (b) reads, this table assumes it ends in one of three ways: an accept (it releases), a refusal (it
     cancels) or the bound (it releases unconfirmed).

## 2. Where the floor runs out today

From the stored rows at H6 (`scan-h6.txt`). "Floor outlasted" means the release came at least 350 ms after the take,
with no keepalive in between, so it followed the path's last step at once. That is #459's shape. A cell not listed
never released after a take.

| step | cell (Chrome) | released after a take, x64 / arm64 | floor outlasted, x64 / arm64 | steps after the take, median x64 / arm64 |
|---|---|---:|---:|---:|
| V5 | `chrome_dnd_in_front_shared` | 9 / 9 | 8 / 3 | 51 / 15 |
| V5 | `chrome_dnd_covered_dedicated` | 9 / 9 | 9 / 9 | 223 / 226 |
| V5 | `chrome_dnd_long_left_in_front_shared` | 9 / 9 | 9 / 9 | 687 / 556 |
| V5 | `chrome_dnd_inzone_out_in_front_shared` | 9 / 9 | 6 / 0 | 32 / 0 |
| V5 | the three short cells (`short_in_front`, `short_covered_dedicated`, `short_pointer_outside_dedicated`) | 27 / 27 | 0 / 0 | 17 at most |
| K1, K2 | `chrome_dnd_short_in_front_shared` | 18 / 18 | 0 / 0 | 0 |
| K3 | `dragstart-150`, `dragstart-400` | 20 / 20 | 0 / 0 | 0 |
| C1 | `freeze-600`; the edge (`freeze-646` to `-652`) | 10 and 15 of 20 / 10 and 7 of 20 | 0 / 0 | 0 |
| L4c | the same, at twice the load | 9 and 4 of 20 / 6 and 6 of 20 | 0 / 0 | 0 |
| L4b (`cua:accept`) | `plain-long` | 300 / 300 | 0 / 183 | 380 / 400 |
| L4b (`cua:accept`) | `left`; `inzone-out` | 30; 30 / 30; 30 | 0; 0 / 17; 0 | 224; 27 / 242; 43 |

- **D1's and L2a's dnd** drag the same page path as V5's in-front cell (`drag.mjs` `pagePath('dnd')`, which run.mjs
  makes the device scene's `dndPath`). That row is the nearest record for them: at idle the floor ran out on most of
  x64's drags and on a third of arm64's.
- **L4b on x64:** `plain-long` was released at the accept cursor, before the floor's end (a median 223 ms after the
  take). On arm64 at twice the load the accept often came late, and 183 of 300 drags ran past 350 ms.
- **Electron (H1, H2, L4a).** Every one of the 280 drag-route drops and the 280 handles in each step came after a take.
  - The floor ran out on 174–260 of the drag-route drops, depending on step and architecture.
  - But every Electron drop rests, revisits its last sample and syncs with the app before the release (ruling 827). So
    for Electron, a floor that ran out does not mean the release followed the last step at once.
- **The development runs of #459** (a953, arm64 at twice the load, the shipped lane):
  - `t14-long`'s long-left outlasted the floor on 100 of 100. Five landed in the zone though the path ended outside
    it, and seven answered a false ok.
  - `t14-floor`'s `plain-long` outlasted it on 300 of 300, and all 300 landed. Its path ends in the zone.

## 3. The harness side of a 0.4.3 head

- **The pin.** It and `MIN_ENGINE_VERSION` 0.4.3 live in `runtime/engine/linux-engine.json` and
  `src/services/engine/linux/client.mjs`.
  - As at H⁗ (task 104) and 0.4.2, the pin reaches nothing beyond what the engine's diff reaches.
  - Item 9 and the fresh-home doctor rerun, because the asset's hash changes.
- **H7's changes come along unchanged.**
  - They reach C1 and L4c (task 125's byte comparison), which are class A here anyway.
  - Ruling 957's judge change re-judges the drop-signals steps' stored rows (§8.1 point 4). Every step it can touch is
    class A as briefed. With Chrome only, H1, H2 and L4a stay re-judged, not rerun.
- **(a) needs no judge change.** It adds no answer, and no judge reads its record in `--stats`.
- **(b) needs judges that know its two answers.** Each change comes with its negative controls and moves the harness
  head, but it reaches only steps that are already class A.

  | judge | steps | what (b)'s answers do there |
  |---|---|---|
  | `device.mjs` | V5, K1, K2 | a refusal is "a request failed" in the in-front and dedicated cells; a timeout's notice breaks the `confirm` cells |
  | `drop-signals-judge.mjs` | C1, K3, L4b, L4c, and the Electron steps | a refusal on a drop inside the zone is a missing landing |
  | the drag experiment's dnd effect | D1, D2, L2a, L2b | a refusal is a drag with no effect |

  - Item 2 lists the two new cua-only answers as declared deviations.
  - `docs/cua-api/linux-engine.md` describes them. It is served on both of R1's lanes, which rerun with the flip.
- **A counted step for #459** (proposed, §7.2): `t14-long` ×100 and `t14-floor` on the shipped lane at twice the load,
  judged by `chromeDropVerdict` with ruling 957's rule. A new step is a harness change, so it would ride in the same
  head.

## 4. The table

**The classes:**
- **A:** the fix's lines run in the step. It has a drop the engine releases after a take, from a source the fix covers.
- **B (static):** the step enters `drag_along` or `release_handle`, but every source is of a family the fix doesn't
  cover. The plan fixes that condition, so the same bytes go out.
- **B (plan):** the sources are Chromium-family, but the plan never makes a release after a take, for one of three
  reasons: the page has no draggable source; the drag is guarded and its take is cancelled before the release; or the
  take comes only after the release.
  - This is argued from both ends, the engine's condition and the step's plan, as ruling 843 argued.
  - Where the step's rows keep hold records, it is also shown at run time (`released_with_take`).
- **Unreached:** the step sends no drag or handle, or only ones refused before anything is sent.

**The columns:**
- The class is given as briefed / with Chrome only. The same class holds for (a) and (b).
- "Stands on" is the head of the step's latest record, x64 / arm64.
- The minutes run from acquiring the lock to releasing it, at the step's last run, x64 / arm64.

| step | venue, load | Chromium drops released after a take (route; floor outlasted at H6) | what (a) can change | what (b) adds | timing judges | class, as briefed / Chrome only | stands on | rerun | min x64 / arm64 |
|---|---|---|---|---|---|---|---|---|---:|
| V1, V2 | `:0`, idle | none: gedit's text; the desktop's, gedit's and Chrome's reads, `press_key`, `click` | – | – | their series; no drag | unreached | H⁗ / H⁵ | no | – |
| V3 | `:0`, idle | chrome-input's covered pad drag and the minimized drags, all refused before anything is sent | – | – | the refusal's time | unreached | H⁗ / H⁵ | no | – |
| V4 | `:0`, idle | no Chromium drag: its drags are GTK 4's, and its Chrome scenes are text | – | – | none | B (static) | H⁗ / H⁵ | no | – |
| **V5** | `:0`, idle, Chrome ballast | 63 a VM, in 7 cells. Four are in front on the background route (`in_front`, `short_in_front`, `inzone_out_in_front`, `long_left_in_front`); three are dedicated, on the foreground route (`covered_dedicated`, `short_covered_dedicated`, `short_pointer_outside_dedicated`). The floor ran out on 32 (x64) and 21 (arm64), all of `covered_dedicated` and `long_left` among them. The guarded, late, late-take, pointer-outside-shared, select and pad cells release after no take | the motion before 63 releases. The long paths' drops move toward the path's real end, and long-left's answers can only become more honest | a refusal is "a request failed" in the in-front and dedicated cells. A timeout's notice breaks the `confirm` cells, whose landed drops must carry nothing pending. New answers for item 2 | none on speed. Ruling 680's span rule is the late-take cell's, which no form reaches. The canary reads the hold, before the take | **A / A** | H6 / H6 | **yes**, both; x64 in an owner window | 37.6 / 36 |
| Z0 | `:0`, idle | Firefox and Writer | – | – | – | B (static) | H⁗ / H⁵ | no | – |
| **D1** | private, idle | Chrome's `dnd`, in front on the background route, 30 a lane on `cua` and `cua:0ms` (topped up to 40 for the speed rule). It drags V5's in-front path, whose floor ran out on 8 of 9 (x64) and 3 of 9 (arm64). select, range, scroller and canvas never take | the motion on every dnd drag, and what it costs #358 | the wait on every dnd drag. A refusal fails dnd's effect, one more drop | **#358: x64 [29.2, 36.9], 3.1 ms inside 40; arm64 [26.7, 27.0], 13.0 ms** (§5). Canvas never takes | **A / A** | H6 / H6 | **yes** | 24.0 / 23.9 |
| **D2** | private, idle | Electron's `dnd`, in front, settled before its release | the motion after the settle's second sync | the wait after it | none on speed (`LONG_PATHS` is Chrome's and Firefox's) | **A** / B (static) | H6 / H6 | as briefed | 19.5 / 18.8 |
| D3, D4, D5 | private, idle | Firefox, GTK, Qt, Writer and the terminals | – | – | D3's Firefox canvas | B (static) | H / H‴ | no | – |
| R1 | own, idle | gedit's `drag` through the facade | – | – | – | B (static) | H, re-judged at H‴ / H‴ | with the flip | – |
| R2, R3, R4, FB | own or private, idle | none | – | – | R2's in-cell times | unreached | H / H‴ | R1–R4 with the flip | – |
| E1 | own, idle | the recorder window's drags and a desktop `drag_handle` | – | – | desktop `move` | B (static) | H⁗ / H‴ | no | – |
| S1 | own, idle | Chrome's and Electron's pad drags: background, desktop `drag` and `drag_handle`, and dedicated. The pad (`pages/input.html` `#pad`) is an empty div with nothing to drag or select, so nothing takes | – | – | the settle, read after the answer | B (plan) | H6 / H6 | **the cross-check** (as briefed) | 35.1 / 34.1 |
| S2, S3, S4 | own, idle | Firefox, gedit, kate, Qt Creator, Writer, xterm, GTK 4 | – | – | – | B (static) | H6, H, H / H6, H‴, H‴ | no | – |
| F1a, F1b, F3a, F3b | own | none | – | – | the paste settle | unreached | H / H‴, H⁗ | no | – |
| F2, F4, ES | own | no drag from a Chromium source (ES's handle is xterm's) | – | – | the exit | B (static) | H / H‴, H⁗ | no | – |
| P1–P3, P4–P6 | private, idle | Firefox only | – | – | – | unreached, B (static) | H / H‴ | no | – |
| **H1** | private, idle | Electron's t17-fix3: 280 drag-route drops (`cua` and `cua:desktop`) and 280 handles, every one after a take. The floor ran out on 181 (x64) and 226 (arm64) of the drag-route drops, each settled before its release | the motion after the settle on the drag route, and before a handle's release | the wait. The hung sink (`slow`) never answers, so all 60 of its drops meet the bound | none on speed. #365's race is counted: 0 of 60 at H6 | **A** / B (static) | H6 / H6 | as briefed | 18.1 / 17.5 |
| **H2** | private, gate windows | as H1. Its `cua:desktop root` drops are confirmed by a gate Chrome window's activation | as H1 | as H1 | as H1 | **A** / B (static) | H6 / H6 | as briefed | 18.6 / 18.0 |
| **C1** | private, idle | `t14-late`: `freeze-600`'s 10 takes inside the hold, and 15 (x64) or 7 (arm64) of the edge's 20. The past band never takes. Every take came after the path, so the floor was filled and none ran out | the motion before each release, about 350 ms after the take and long after the thaw | the wait. A refusal on an inside-band drop is a drop that did not land, which counts against the band's 7 | the bands time the thaw against the hold's end, which comes before the take's floor: unchanged | **A / A** | H6 / H6; H7 planned | **yes**, once (§6) | 3.0 / 2.1 |
| **K1, K2** | private, idle, Chrome ballast, sandboxed | the canary's short drop in front, 9 takes each, the floor filled. Its select control never takes | the motion on 9 | the wait. A refusal or a timeout fails the cell's device verdict | the canary reads the hold's pings, which end at the take: unchanged | **A / A** | H6 / H6 | **yes** | 3.0 + 3.0 / 2.9 + 2.9 |
| **K3** | private, idle, sandboxed | `hold-regression`: 20 takes inside B, the floor filled | the motion on 20 | the wait. `holdRegressionVerdict` fails any drop that did not land | "inside B" is the take's time | **A / A** | H6 / H6 | **yes** | 1.2 / 1.1 |
| L1 | private, twice | Chrome's and Electron's scroller and range, 40 a side: none takes | – | – | the landed counts | B (plan) | H6 / H6 | no (an alternative cross-check) | 30.1 / 32.3 |
| **L2a** | private, twice | Chrome's `dnd`, 40 a side, on D1's path. At load more of its drags outlast the floor. select and canvas never take | the motion. The drop lands at the path's real end, inside the zone | the wait, with the bound likelier at load. A refusal lowers the landed count against the pinned build | no speed at load | **A / A** | H6 / H6 | **yes** | 27.2 / 30.5 |
| **L2b** | private, twice | Electron's `dnd` | as D2 | as D2 | none | **A** / B (static) | H6 / H6 | as briefed | 19.3 / 21.9 |
| L2c | private, twice | Firefox | – | – | – | B (static) | H / H⁗ | no | – |
| L3a, L3b | own, twice | Chrome's and Electron's pad drags, as in S1 | – | – | – | B (plan) | H6 / H6 (x64's L3a FAIL is on `activate_window`, ruling 950) | no | – |
| L3c, L3d, L3e | own, twice | no Chromium source | – | – | – | B (static) | H / H⁗ | no | – |
| **L4a** | private, twice | Electron's t17-fix3 at load, as in H1. The floor ran out on 187 (x64) and 260 (arm64) of 280 | as H1 | as H1, with the bound likelier | the residue (827 3b) and 830's mismatches, counted | **A** / B (static) | H6 / H6 | as briefed | 23.4 / 24.3 |
| **L4b** | private, twice | T14 on the measurement lane `cua:accept` only: 360 takes, released at Chrome's accept cursor or at the floor. The floor ran out on 0 (x64) and 200 (arm64) | if the forms cover `--drag-dnd-release-at-accept`: the motion before every release. Its `plain-long` landings (judged as shipped when a drag falls to the floor) and its listed false releases can move | the wait, after the accept the lane releases at. A refusal on `plain-long` is a missing landing | none | **A / A**; B (plan) if the forms leave the measurement lane out | H6 / H6 (arm64's FAIL ruled a finding, 871/872) | **yes** | 17.2 / 19.5 |
| **L4c** | private, twice | `t14-late` at load: 9 (x64) and 6 (arm64) inside-band takes, and 4 and 6 at the edge | as C1 | as C1, with the bound likelier just after a thaw at load | as C1 | **A / A** | H6 / H6 (arm64 FAIL, 954); H7 planned | **yes**, once (§6) | 3.3 / 4.5 |
| L5 | private, twice | none | – | – | – | unreached | H / H⁗ | no | – |

**The items beyond the gate's steps:**
- **Item 9, and item 1's fresh-home doctor:** the asset changes, so its hash, `file`'s line and doctor's `engine` row
  (0.4.3, the pin's hash) are shown again on each architecture. That takes about a minute, inside each VM's setup.
- **Item 10:** `ci-gate` runs on the 0.4.3 head. R1–R3 rerun with the flip.
- **Item 2:**
  - (a) adds no answer.
  - (b) adds two cua-only answers: the refusal at the target's answer, and the bound's unconfirmed release. They are
    declared beside the 21 commands' table, as 0.4.2's hold notice was (897).
- **Item 3** is reached through D1's dnd (§5). **Items 5 and 8** are reached through V5. **Items 4, 6 and 7** are
  unreached.

## 5. A few ms per drop against the timing judges

**D1's dnd, #358** (declared; the bound is 40 ms over the newest build, and ruling 929 left it unwidened).
- **The margins.** A cost added to every cua dnd drag moves the interval by about as much.

  | arch | cua at H6 | newest | interval | room to 40 ms |
  |---|---:|---:|---|---:|
  | x64 | 371.4 ms | 338.7 | [29.2, 36.9] | 3.1 ms (#457) |
  | arm64 | 355 ms | 328.2 | [26.7, 27.0] | 13.0 ms |

- **(a).** One motion is one request on the drag's route: a synthetic motion on the background route D1 uses, well
  under 1 ms at idle.
  - A pause after it crosses on x64 once the pause reaches about 3 ms.
  - Between H⁗ (0.4.1) and H6 (0.4.2, which added identification) the interval moved 3.7–4.6 ms. So 3.1 ms is about
    one release's change, even with nothing added.
- **(b).** The wait comes on every D1 dnd drag (the floor ran out on most of x64's), and lasts at least one renderer
  round trip.
  - Any wait of 3.1 ms crosses on x64, and any of 13 ms on arm64.
  - A wait that meets its 100 ms bound crosses on both.
- **The input:** task 126's x64 D1 latency, per form, answers this before any counted run.

**No other judge of a reached step reads a drag's time:**
- V5's device cases prove behaviour, not speed (device.mjs). Ruling 680's span rule belongs to the late-take cell,
  which no form reaches.
- The canary (K1's, K2's and V5's own) reads the pings during the hold. The hold ends at the take, before either form
  acts.
- C1's and L4c's bands time the thaw against the hold's end, which also comes before the take's floor. K3's "inside B"
  is the take's time.
- L2a, L2b, L4a, L4b and L4c judge no speed at load. The drop-signals rows' `ms` is recorded, not judged.
- The late-take watch counts from the release, which moves with the added cost. So its window relative to the release
  doesn't change.

## 6. The proposed reruns, per architecture

The order is the gate's: the private idle steps, the `:0` sitting, then the block at twice the load. Every step runs
at the 0.4.3 head, on the pinned 0.4.3 asset from the run's home. The lists are the same for (a) and (b). What (b) adds
is §3's judge changes, and a higher chance of failures in D1 and V5 (§5, §7).

**As briefed (Chrome, Chromium and Electron sources):**

| list | x64 (measured min) | arm64 (measured min) | planned (`steps.mjs`) |
|---|---:|---:|---:|
| A, private idle: D1, D2, H1, H2, C1, K1, K2, K3 | 90.4 | 87.2 | 152 |
| A, twice the load: L2a, L2b, L4a, L4b, L4c, quiet waits included | 90.4 | 100.7 | 101 |
| A, `:0`: V5 | 37.6, in the owner's window | 36 | 38 |
| Cross-check: S1, compared cell by cell with its H6 record (`compare-settle.mjs`) | 35.1 | 34.1 | 39 |
| Setup, the local proof, item 9 and the doctor | about 5 | about 5 | – |
| **Total** | **about 259 min, 4.3 h** | **about 263 min, 4.4 h** | 330 min, 5.5 h |

**Chrome sources only:**

| list | x64 | arm64 | planned |
|---|---:|---:|---:|
| A, private idle: D1, C1, K1, K2, K3 | 34.2 | 32.9 | 75 |
| A, twice the load: L2a, L4b, L4c | 47.7 | 54.5 | 54 |
| A, `:0`: V5 | 37.6, in the owner's window | 36 | 38 |
| Cross-check: H1, compared with its H6 record | 18.1 | 17.5 | 22 |
| Setup, the local proof, item 9 and the doctor | about 5 | about 5 | – |
| **Total** | **about 143 min, 2.4 h** | **about 146 min, 2.4 h** | 189 min, 3.2 h |

x64's L2b is 16.3 min at H6, where it followed V5 with no quiet wait, plus about 3 min for the quiet wait it has after
another step at twice the load.

**Optional, on both scopes:** L4d, a counted `t14-long` ×100 and `t14-floor` on the shipped lane at twice the load
(§7.2). From a953's arm64 times it takes about 23 min a VM (16.6 for `t14-floor`, 6.3 for `t14-long`). x64's should be
about the same.

- **The `:0` sittings:** one V5 sitting on each VM.
  - On x64 that is the owner's display. It needs an owner window announced 45 minutes ahead, with V5 alone (37.6 min
    at H6, capped at 55).
  - Budget the conditional V5 slots of 823.3 and 831 in it: up to two more of 60 minutes if V5 falls short on proven
    no-takes.
  - arm64's `:0` is nobody's display, so it needs no window.
- **The cross-check.**
  - **As briefed, S1.** It is the unreached step closest to the fix: it sends Chrome and Electron drags and handles on
    every route the fix names, and none takes.
  - Its #302 cells can vary by chance (electron-input `press_key`, 4 of 30 on x64 at H6, listed apart). A cross-check
    that differs calls for a full rerun (§8.1 point 3), so how those cells compare needs settling first (§7.6).
  - **With Chrome only, H1 is closer.** It sends Electron drops and handles after takes on all three routes, where the
    source's family keeps the branch off.
- **H7's C1 and L4c.**
  - Both are class A for 0.4.3 under every form and scope, so they would rerun at the 0.4.3 head whatever ran at H7.
  - They can run once, on 0.4.3, if the owner decides before H7's counted reruns start. That saves 6.3 min on x64 and
    6.6 on arm64.
  - Running them at H7 now gives the 0.4.2 path its counted record of the race fix without waiting for the decision.
    I would run them now.
- **Compared with the 0.4.2 path.** Flipping on 0.4.2 with #459 declared reruns only H7's C1 and L4c, and re-judges
  stored rows under 957. So the 0.4.3 path adds:
  - about 4.2 machine hours a VM as briefed, or 2.3 with Chrome only;
  - one owner window, for x64's V5;
  - the release itself: task 126's choice of form, its review, the build (about 7 minutes), the attestation check, the
    pin and `ci-gate`. The pre-flight's §9 put a cut at a day to a day and a half.
- **R1–R4** rerun with the flip (T10) on whichever pin T10 measures, about 95 min a VM, as §8.1 plans. If 0.4.3 comes
  before T10, nothing runs twice.
- **The unjudged passes:** V5's and D1's parts of arm64's current-stable Chrome pass should run on the engine that
  ships.

## 7. For the design session and the owner

1. **Scope the fix to Chrome sources.**
   - #459 is on Chrome's activation-confirmed route.
   - Electron's drops already settle before the release: a rest, a revisit of the last sample, two syncs with the app,
     then the cursor read at the release (ruling 827). The Electron controls showed 0 false oks at H6 on both
     architectures.
   - A form that also covers Electron puts its motion, and (b)'s wait, after the settle's second sync, inside the
     sequence 827 verified. It also adds the reruns of D2, H1, H2, L2b and L4a, about 1.7 machine hours a VM.
   - Limiting the fix to the Chrome family (WM_CLASS Google-chrome, Chromium or Chromium-browser, a static condition)
     avoids both.
2. **Count #459 itself.**
   - The gate's only long-path Chrome drop on the shipped lane is V5's long-left cell, at idle. L4b runs the unshipped
     accept lane. The defect was found at twice the load, in development runs.
   - If 0.4.3 is cut for #459, a counted step (L4d, about 23 min a VM) shows the fix on the released bytes.
   - Without one, the release's purpose rests on task 126's development runs.
3. **Rule on D1 for x64 before the rerun.** Decide what a #358 interval past 40 ms means for 0.4.3. Ruling 929 kept the
   bound, and ruling 944 put the margin on the owner's page. Task 126's latency per form is the input.
4. **(b) carries more risk of a failed rerun than (a).**
   - Its refusal fails V5's in-front and dedicated cells, K1's and K2's short drop, and K3's regression cells, wherever
     it reads a refusal on a drop that would have landed.
   - Its timeout breaks V5's `confirm` cells. Under arm64's lag at twice the load, the bound would be met often.
   - If (b) reads Chrome's cursor (the only answer from the target that the engine can read for a drop inside Chrome),
     it reads the status that T14 found can answer an earlier position.
   - It also costs judge changes and new declared answers (§3).
5. **The gate doesn't exercise two Chrome routes.** No counted step sends a Chrome drop on the desktop route, or a
   Chrome handle that takes. If the fix covers them, as the design says, a development run (or counted cells) on
   Chrome handles and desktop drops should show it.
6. **The cross-check's #302 cells (S1).** Rule first that #302's matched runs compare as counts, listed apart, so
   chance there doesn't call for a full rerun. The alternatives are L1 (30 min, judged per cell in 854's form) or, with
   Chrome only, H1.
7. **Keep the background route's motion synthetic.** It must be the route's own motion (`route.place_again`), never
   XTEST. V5's in-front cells are audited, and XTEST FakeInput on the background route is forbidden (audit.mjs
   `forbidden`).
8. **Ship nothing else in 0.4.3.** Anything bundled widens this table. #429, for x64's L3a FAIL (ruling 950's
   measurement), would reach every `activate_window` cell: S1–S4, L3a–L3e, V2's and V4's activations, and R1–R4.

## 8. Not shown

- **Any run.** Every claim here comes from the code at H6 (69bd7993), H7's candidate (cf1ef10f), the stored H6 rows and
  the step tables.
- **Task 126's code:** its condition, its family, the accept lane, (a)'s pause, and what (b) reads (§1's assumptions).
- **Whether (a) without a pause moves where Chrome drops.**
- **x64's minutes for the proposed L4d.** Only arm64's a953 times are given.
