# M4: the harness never changes a window it did not open, T4b's audit round (task 36)

The task review of task 35's build returned five findings, each reproduced by a hermetic probe that came back clean.
This round fixed them (`scripts/linux-engine-diff/README.md`, "Windows the harness did not open"):

- the two observers that act on the display are fenced: xprobe `grabs` runs only on a private display marked
  `CUA171_PRIVATE_DISPLAY`, and `retention` redirects only a window the run opened;
- the audit counts property writes and deletes, attribute changes other than our own event selection, Composite
  redirects, and XTEST and pointer warps by where they land;
- ownership is judged in trace order (`foreign.mjs`), with no window resolved on the display after the run;
- every title carries a per-run nonce, and a window already on the display at the start is never found or adopted;
- the whole run is recorded server-side through RECORD (`xprobe record-run`) and every request of the harness's and
  the engines' clients is judged, sampled by an audit pass or not.

These are development runs (`--dev`), not a release gate. The candidate is a musl build made as the release workflow
makes it (`/Users/new/.local/share/cua-171/task36/musl-build.sh`): `cua-engine 0.3.0 (ac4a5367cac9)`, sha256
`8a7f2af94eda5cdacd51ebc2bbbb8517f2bf9d40e0882f105878084264cf2e1f`, static-pie. The engine's sources are those of
e6ed649f and of every later head of this round. The vendor builds are the pinned and the newest build, as in T4's runs.
Window ids only; no title of a window the harness did not open is recorded.

## Condition A: whole-run coverage through RECORD holds

1. RECORD is present on `:0` and on a private Xvfb (opcode 146 on both).
2. No new package and no lockfile change. xprobe already linked x11rb's `record` feature. The watcher also needs
   X-Resource (x11rb's `res` feature, a feature of the same x11rb 0.13.2), to find the process behind each client;
   `Cargo.lock` is byte-identical before and after.
3. Both arms of every timed pass run under it equally: it is one server-side context for every client, from the run's
   start to its end.

## On a private display (`private-controls.sh`, `controls.mjs`, `private/`)

Xvfb `:92` with Openbox. The person's window is an xprobe recorder the script starts, so it is no client of the
harness's (`0x00400000`), activated first. A second recorder, started before the run, carries exactly the title the
run's own recorder will have.

`grabs.txt`: xprobe `grabs` refuses the private display until it is marked (exit 1), answers once it is
(`{"pointer":"free","keyboard":"free"}`), and refuses `:0` (exit 1): there it only reads whether `:0` is marked.

`controls.json`: one harness Desktop per control, each begun with the person's window active, so the holder opens.

| Control | Expected | The run's trace (xtrace) | The whole-run record (RECORD) |
|---|---|---|---|
| clean: a key to the run's own window | pass | clean | clean |
| an engine's key to the person's window, on a request no audit pass samples | fail | clean (the engine is not traced) | `RedirectWindow`, `SendEvent FocusIn`, `KeyPress`, `KeyRelease`, `FocusOut` on `0x00400000` (cua-engine) |
| XTEST at a foreign target: a warp onto the person's window, a click | fail | `WarpPointer`, `XTEST ButtonPress`, `ButtonRelease` on its frame `0x00200139` | the same (xtrace's client) |
| a property write on the person's window (`WM_NAME`) | fail | `ChangeProperty` ×2 | the same |
| an override-redirect change of the person's window | fail | `ChangeWindowAttributes override-redirect` | the same |
| a window there before the run, with the run's exact title | pass, its own window found | clean | clean; the run found its own recorder, the pre-created one stayed foreign |

The other reviewer's probes (a ConfigureWindow then a rejected CreateWindow of that id, a child under a foreign
parent, a foreign window reparented into a harness window, a reused closed id) are display-free negative controls in
`test/linux-engine-diff/foreign-judge.test.mjs`, on xtrace's lines and on the record's.

## On `:0`, started with the owner's Chrome active (`diff-run.sh`)

The scenes `gedit`, `minimized`, `minimized-xterm`, `minimized-recorder`, `device-xterm` (beside `minimized-xterm`,
whose label it had shared) and `device-chrome-dnd`; the operations `tree`, `press_key`, `click`, every minimized case,
every xterm device case, and the Chrome drop cases that take the foreground route, park the real pointer, or are
judged by the grab watch.

| Run | Head | Result | What it found |
|---|---|---|---|
| `run-1` | ac4a5367 | exit 1 | the harness's trace passed Node's 512 MB string limit about 40 minutes in, so the run was unaudited (the bulk: every xdotool call's connection setup, XKB keymap and keyboard mapping, about 60 KB of list output a call); and the record failed each foreground Chrome drop on Chrome's drag image, an override-redirect window it opens per drag under the pointer |
| `run-2` | 12eaebae | exit 1 | the record did not take the harness's own Chrome drop window (`0x00708e99`) for the window the harness found; its trace did |
| `run-3` | 39b4d1bb | exit 0 | every verdict PASS |

Fixed between them: lists capped at 256 entries in xtrace and both files read line by line (12eaebae); a harness
window's client's override-redirect popups taken as that window's (12eaebae); an error matched only to its own request,
and a window's birth timed by the server's clock (e1c6d400). Run-2's record was not kept, so which of the last two
defects caused its miss is not shown; each could, and each has a test that failed before its fix. A record that is not
clean is now kept with its run (`record.jsonl.gz`, 39b4d1bb).

`run-3`, the proof:

- `meta.active_start`: `0x00600002`, `foreign`. The end row: start and end `0x00600002`, `foreign`, neither acted on;
  the holder `0x0220000e`.
- The harness's own trace: 20,540 requests, 6,100 changes of a window, every one of its own; 3,301 XTEST inputs and
  warps it could not place (the parked pointer and the nudges: xdotool moves without reading the pointer after).
- The whole-run record: 23,866 requests of the harness's and the engines' clients, 18,474 changes of a window, every one
  of its own; none it could not place; no client it could not attribute.
- The 43 route audits, the activating stub's included: clean, none with a foreign change (528 XTEST inputs unplaced
  in their traces, every one placed by the record).
- The activating stub was failed by the witness and the audit; the foreground and in-front checks held.
- `display-before.txt`, `display-after.txt`: the only client window on `:0` is the owner's `0x600002`, Chrome pid 9910
  ran throughout, and the active window was `0x600002` before and after. No harness process was left, and no scratch
  directory held.

## RECORD's overhead (`record-overhead.mjs`, `record-overhead.json`)

One timed operation, cua's background `press_key` on a harness gedit window (its SendEvents are requests the record
copies), with a whole-run record on against off, in four interleaved blocks a side of fresh engines, 40 samples a side.
On: 101.108 ms median; off: 101.095 ms. The bootstrap 95% interval of the difference is [−0.041, +0.071] ms, inside
the bound of 5.05 ms: **same (within noise)**. Each "on" block's record was clean.

## What the audit does not cover (for the pull request)

- The record attributes a client by its process when RECORD reports it: a client that ends before that read, or whose
  slot is reused meanwhile, is counted as unattributed (0 in `run-3`), or taken for its successor. The harness's own
  tools connect through its xtrace proxy, one long-lived client.
- XTEST and warps are placed by where they land as read right after the server handled them: the input focus, or the
  root child under the pointer. A read that lags reads a later pointer. Under another client's active pointer grab the
  events go to that client, which placement does not model. The route audits place only what their trace shows.
- An override-redirect root window the client of a live harness window opens during the run counts as the harness's.
  Chrome serves the person's windows and the harness's from one client, so a popup of the person's Chrome opened
  during a run counts so too.
- In xtrace, a window's end is seen only by a DestroyWindow of ours, a DestroyNotify our connections received, or its
  client's resource-id base handed to a new connection; a registered window's later lives count as foreign there (so
  the backstop reopening a window under the same id, with its end seen, would fail the trace's audit), and a reply
  cannot tell a window created inside a harness window from one another client reparented in. The record sees both.
- Not counted as changes of a window: ChangeSaveSet, a ConvertSelection naming another's window, MULTIPLE selection
  targets' properties (they fail closed), and desktop-wide state (keyboard and pointer mappings, the bell, GrabServer).
- The post-request grab check counts a grab released with its client or its window as still held (it fails closed);
  a passive grab a held button activated shows no request.
- Only the session's display is recorded; a private display's traffic is not.
