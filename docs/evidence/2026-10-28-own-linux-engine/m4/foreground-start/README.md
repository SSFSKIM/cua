# T7 fix 3, carried to T18: the foreground sample's start (task 74, worker 3)

The problem (Decision Log, T7, "Carried to T18"): a foreground-route sample that follows a Chrome sample could fail
its witness falsely. A vendor build's Chrome sample left the run's Chrome active. The route's activation then took
the focus from Chrome inside the span, Chrome unmapped its own popup, and `judgeRestacks` failed closed. Task 56's
speed series saw it once in 40 samples.

The fix (`scripts/linux-engine-diff/foreground-start.mjs`, from 3dc4573a; the records from fcc88055): each
foreground-route sample starts outside its span. When another of the run's clients holds the active window, the run's
front window takes it back, as every condition means it to. The sample then waits, at most 1 s, until none of those
clients has a popup open (`xprobe popups`). A popup that never closes is recorded and the sample goes on, so an unmap
inside the span still fails it. The rule is not loosened. `witness_allowed` and `witness_after_changes` are recorded as
before. Each sample row carries `foreground_start`:
- `activated_front`: whether the front window took the focus back.
- `popups_while_active`: the popups the client holding the focus had open, each of which the route's activation would
  have closed inside the span.
- `popups_at_start`, `quiet`, `waited_ms`: the quiet wait, after the front window's activation.

## The runs

Every run was made on a private Xvfb with Openbox and no RECORD (`proof-b.sh`). The candidate was the musl build
83dd7e5b (0.3.0), against the pinned and the newest vendor builds. The scenes were `chrome-textarea` (or
`chrome-address-bar`) then `gnome-text-editor`, with `type_text`, 15 blocks, `--samples-input 2`, `--dev`. Each block
has one Chrome → gnome-text-editor transition, and the top-up adds one more. Each harness is `git archive` of the
commit named, so the rows' `commit` is null.

| run | harness | scenes | gte samples | after Chrome | Chrome active at the start | its popup open | witness reds |
|---|---|---|---:|---:|---:|---:|---:|
| `b-control-1/` | 69af6889 (no fix) | chrome-address-bar, gnome-text-editor | 150 | 16 | – | – | 0 |
| `b-control-2/` | 69af6889 (no fix) | chrome-textarea, gnome-text-editor | 150 | 16 | – | – | **5** |
| `b-fix-1/` | 4a0cc7af (fix) | chrome-textarea, gnome-text-editor | 150 | 16 | 16 | (not recorded yet) | 0 |
| `b-fix-2/` | fcc88055 (fix) | chrome-textarea, gnome-text-editor | 150 | 16 | 16 | 5 | 0 |

- **The red, without the fix** (`b-control-2/`): it came every time the newest build's Chrome series came just before
  cua's gnome-text-editor series. That was 5 of 5 times, in blocks 2, 5, 8, 11 and 14. Each time Chrome unmapped its
  override-redirect window 15–25 ms into the span, at the activation (`witness_restacks`), and cua's
  gnome-text-editor verdict failed on that alone. Task 56's red had the same order: newest, then cua, in block 2.
- **With the fix** (`b-fix-2/`): after each of the newest build's Chrome series, Chrome was active with one popup open
  (`popups_while_active` 1 in 5 of 5). The front window took the focus back outside the span. The popup had closed by
  the quiet check (`popups_at_start` 0, waits 3–6 ms). Every witness was clean, and every verdict passed.
- Across both fix runs there were 300 gnome-text-editor samples and 32 Chrome → gnome-text-editor transitions. Chrome
  held the focus at every transition, and no sample had a witness red.
- `b-control-1/`'s address-bar order did not reproduce the red. The newest build's address-bar sample does not leave a
  popup.

`python3 -I analyze-b.py <run>/results.jsonl` reads each run: every gnome-text-editor sample after a Chrome one, and
the totals.
