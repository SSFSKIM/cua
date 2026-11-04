# The never-taken paste: why gnome-terminal sometimes never takes cua's paste at twice the load (task 56)

The question the design session asked: in a key-then-paste run that ends unconfirmed with nothing pasted (transfer
`ended`, two requests, the target's one `TARGETS` only), did the chord reach VTE's window? Did the terminal ask for
CLIPBOARD, and for which targets? Did cua's owner answer each request, and how fast? Did the terminal ask for the data
later, after cua's transfer window had ended?

**Answer.** In all 30 recorded never-taken runs the paste chord reached the terminal's window (`0x00c00006`). These
are synthetic KeyPress/KeyRelease events: Control_L, Shift_L, then `v` with `Shift,Control`. The terminal sent one
CLIPBOARD request, for `TARGETS`. This was not a paste request: gnome-terminal refreshes its cached TARGETS this way
at every owner change, and it sends no TARGETS request when it pastes. cua's owner answered every one of those
requests with the property set, within 6.5 ms. But in every never-taken run, the answer reached the terminal **after**
the chord. In every run that pasted (36 of 36), it came **before** the chord. gnome-terminal (3.52) clears its cached
clipboard targets at each owner change. It enables `paste-text` and pastes only once the new targets have arrived
(`terminal-app.cc` `clipboard_owner_change_cb`, `terminal-window.cc`
`request_clipboard_contents_for_paste`). So it dropped the chord and never asked for the data. It did not ask later
either: in each run's span (at least 18.6 s, the retry-guard wait included) its only later request was the TARGETS
refresh after cua's engine exited, which the server answered with property None. **The cause is the order in which
cua dispatches: it sends the chord without waiting until the target has its TARGETS answer. It is not the terminal
under load, and it is not a declared limit.** In 14 of the 27 runs in `proxied-2/`, and in all 3 in `proxied-1/`, the
terminal had asked for TARGETS before cua sent the chord, and cua's answer still came after the chord. In the other 13
in `proxied-2/`, the terminal asked only after the chord was sent. A bounded wait in cua before dispatch would cover
both cases: dispatch once the owner has served the target client's TARGETS request made since the take.

Everything here ran on a private Xvfb that the probe started (the harness's `startPrivateServer`). The live-run
declaration was withdrawn before anything started, so the spawner refused every display the probe did not create,
`:0` included. The engine is the musl build of 418f1e26 (`cua-engine 0.3.0 (418f1e267ca0)`, built by
`task56/build-musl.sh`, the release workflow's way), and the harness is 418f1e26's. The load is twice the gate's:
16 stress-ng matrixprod workers on 8 cores.

## Step 1: the committed rows (`step1.txt`, from `tabulate.py`)

Every gnome-terminal paste run in `fix2/`. "Own" means a miss of the run's own paste. Guard refusals are the engine's
"a previous paste could not be confirmed" answers. The raw-only column counts runs that the raw count fails only
because they follow an unconfirmed paste (`rawOks`). Every one of those runs passed, because the harness waits out the
guard (11 s).

| sitting | lane | runs | ok | own: never taken | own: landed, scrolled, unconfirmed | guard refusals | raw-only |
|---|---|---:|---:|---:|---:|---:|---:|
| `terminal-030-load2` (0.3.0) | timer | 30 | 30 | 0 | 0 | 0 | 0 |
| | unredirect | 60 | 54 | 3 (22, 26, 31) | 3 (29, 54, 59) | 0 | 5 |
| | control | 10 | 7 | 1 (9) | 2 (3, 8) | 0 | 1 |
| `fresh-terminal-load2` (df1e835f) | timer | 34 | 33 | 1 (3) | 0 | 0 | 1 |
| | unredirect | 48 | 45 | 3 (11, 15, 17) | 0 | 0 | 3 |
| | control | 10 | 10 | 0 | 0 | 0 | 0 |
| `fresh-terminal-load2-b` (3dac77a8) | timer | 45 | 43 | 2 (13, 14) | 0 | 0 | 1 |
| | unredirect | 38 | 36 | 2 (3, 7) | 0 | 0 | 2 |
| | control | 10 | 8 | 2 (3, 8) | 0 | 0 | 2 |
| **all** | | **285** | **266** | **14 (4.9%)** | **5 (1.8%, 0.3.0 only)** | **0** | **15** |

By sitting, never taken: 4 of 100 (0.3.0), 4 of 92 and 6 of 93 (fresh). Every miss before each streak in the fresh
sittings is the never-taken kind: fresh a timer, trial 3 before 4–33; unredirect, 11, 15 and 17 before 18–47. Fresh b
timer, 13 and 14 before 15–44; unredirect, 3 and 7 before 8–37. In each of these the recorder's file received exactly
the run's keys (`abcDefgH`) and nothing else, so nothing was inserted and nothing partial. The field's text around the
caret was the same at the confirmation's end as at the observation (`observed_around` = `unconfirmed_around`). The
other families' sitting (`fresh-others-paste-load2`, seven families, 511 paste runs) has no never-taken run.

## Step 2: the probe

`probe.mjs` builds the focus-timer experiment's scene: Openbox, the front window covering two gnome-terminal windows
A and B, and a full screen. Each run is its paste scenario: `abcDefgH`, then `type_text` of the run's own text,
pipelined, from one fresh engine per run, on the timer lane (the engine as it ships). The text is read back from the
recorder's file, as the harness reads it. After an unconfirmed answer the probe waits out the retry guard (11 s).
Each terminal server's X connection goes through an xtrace proxy that belongs to the probe. Each line of the trace is
stamped on arrival (`performance.now()`, the probe's clock). The engines connect directly. `analyze.py` reads terminal
A's connection run by run (`analysis.json`). `excerpts/` holds every never-taken run's selection, focus and key lines,
plus three passing runs for contrast. `xtrace.stamped.log.gz` is the whole trace.

| directory | proxy | runs | never taken | ok |
|---|---|---:|---:|---:|
| `proxied-1/` | yes, until 3 never-taken | 6 | 3 | 3 |
| `proxied-2/` | yes, 60 runs | 60 | 27 | 33 |
| `direct-1/` | no | 6 | 0 | 6 |
| `direct-2/` | no, 200 runs | 200 | 21 | 178, and 1 other (below) |

**What every run shows, in `proxied-1/` and `proxied-2/` (66 runs):**

- The engine takes CLIPBOARD and both terminals get the XFixes owner change. Both clear their targets and ask for
  `TARGETS`. Terminal B's request is the "other" request in the engine's record, and terminal A's is the one
  attributed request.
- In each of the 30 never-taken runs, A's event stream reads XFixes `set owner`, then the chord's six key events, then
  the owner's `SelectionNotify` for TARGETS (`(generated)`, property `GDK_SELECTION`). After that A sends a
  `GetProperty` (which reads the five targets), and no data conversion follows.
- In each of the 36 runs that pasted, A's stream reads XFixes `set owner`, then the owner's TARGETS `SelectionNotify`,
  then the chord. After the chord comes A's data conversion: `text/plain` or `text/plain;charset=utf-8`, served at
  once.

The order is the order in which A received the events, because xtrace writes a connection's messages in the order it
forwards them. The stamps are arrival times at the probe's reader, which batches lines under load, so a tie of 0.0 ms
in the table below is a batch, and the order holds within it. Whether A had asked before the chord was sent comes from
the X sequence numbers. A KeyPress event carries the sequence number of the last request of A's that the server had
processed. A chord whose sequence number is at least that of A's TARGETS conversion was sent after the server had
passed that conversion on to cua's owner as a SelectionRequest.

**The loss check, run by run.** The proxy sits in the stream, so every byte A sent or received passed through it. As a
mechanical check, A's request sequence numbers are consecutive over each run's span, a gap of 0 in every run. Over the
whole trace they are consecutive too: 7,356 requests in `proxied-1/`, 17,489 in `proxied-2/`, no gap (`a_seq_gaps`,
`a_seq_gaps_whole_trace` in `analysis.json`). No run lost anything, so none was rerun.

| sitting | trial | A requests in the run (seq gaps) | owner change → A asks TARGETS | A asked before the chord was sent | owner answers TARGETS (ms, property) | answer after the chord (ms) | chord v at, window | data asked | engine answered / owner gone (ms) | A conversions after the answer |
|---|---:|---|---:|---|---|---:|---|---|---|---|
| proxied-1 | 0 | 197 (0) | 6.5 ms | yes | 0.009, GDK_SELECTION | 0.0 | +185.6 ms, 0x00c00006 | none | 2193.6 / 2495.9 | TARGETS → None |
| proxied-1 | 1 | 192 (0) | 0.0 ms | yes | 1.863, GDK_SELECTION | 1.9 | +216.9 ms, 0x00c00006 | none | 2222.8 / 2526.4 | TARGETS → None |
| proxied-1 | 5 | 192 (0) | 0.5 ms | yes | 6.523, GDK_SELECTION | 5.2 | +137.9 ms, 0x00c00006 | none | 2157.6 / 2459.4 | TARGETS → None |
| proxied-2 | 1 | 192 (0) | 2.0 ms | yes | 0.307, GDK_SELECTION | 0.0 | +168.9 ms, 0x00c00006 | none | 2183.1 / 2486.3 | TARGETS → None |
| proxied-2 | 2 | 192 (0) | 1.7 ms | yes | 0.664, GDK_SELECTION | 0.4 | +145.2 ms, 0x00c00006 | none | 2157.2 / 2459.2 | TARGETS → None |
| proxied-2 | 4 | 192 (0) | 1.4 ms | yes | 0.078, GDK_SELECTION | 0.0 | +135.9 ms, 0x00c00006 | none | 2151.0 / 2456.0 | TARGETS → None |
| proxied-2 | 5 | 192 (0) | 0.7 ms | no | 0.301, GDK_SELECTION | 0.9 | +135.1 ms, 0x00c00006 | none | 2153.6 / 2460.2 | TARGETS → None |
| proxied-2 | 7 | 193 (0) | 2.5 ms | no | 0.005, GDK_SELECTION | 0.0 | +158.2 ms, 0x00c00006 | none | 2176.5 / 2478.6 | TARGETS → None |
| proxied-2 | 8 | 192 (0) | 1.4 ms | no | 6.536, GDK_SELECTION | 7.5 | +144.5 ms, 0x00c00006 | none | 2149.0 / 2449.5 | TARGETS → None |
| proxied-2 | 10 | 193 (0) | 3.8 ms | no | 0.572, GDK_SELECTION | 1.7 | +144.3 ms, 0x00c00006 | none | 2167.3 / 2469.3 | TARGETS → None |
| proxied-2 | 11 | 192 (0) | 0.8 ms | no | 0.022, GDK_SELECTION | 0.6 | +159.7 ms, 0x00c00006 | none | 2165.6 / 2471.2 | TARGETS → None |
| proxied-2 | 12 | 192 (0) | 0.5 ms | no | 0.614, GDK_SELECTION | 1.1 | +145.2 ms, 0x00c00006 | none | 2158.5 / 2458.9 | TARGETS → None |
| proxied-2 | 14 | 192 (0) | 0.0 ms | yes | 3.926, GDK_SELECTION | 1.7 | +183.2 ms, 0x00c00006 | none | 2196.9 / 2500.0 | TARGETS → None |
| proxied-2 | 15 | 193 (0) | 3.4 ms | yes | 0.015, GDK_SELECTION | 0.0 | +151.3 ms, 0x00c00006 | none | 2169.7 / 2473.4 | TARGETS → None |
| proxied-2 | 17 | 192 (0) | 0.4 ms | no | 0.508, GDK_SELECTION | 0.9 | +167.0 ms, 0x00c00006 | none | 2176.7 / 2479.3 | TARGETS → None |
| proxied-2 | 18 | 192 (0) | 4.6 ms | no | 0.188, GDK_SELECTION | 4.4 | +147.0 ms, 0x00c00006 | none | 2150.9 / 2450.6 | TARGETS → None |
| proxied-2 | 20 | 192 (0) | 0.4 ms | yes | 6.25, GDK_SELECTION | 4.2 | +151.0 ms, 0x00c00006 | none | 2156.7 / 2457.1 | TARGETS → None |
| proxied-2 | 22 | 194 (0) | 0.0 ms | no | 0.006, GDK_SELECTION | 0.0 | +139.0 ms, 0x00c00006 | none | 2142.9 / 2444.2 | TARGETS → None |
| proxied-2 | 23 | 192 (0) | 0.2 ms | yes | 2.719, GDK_SELECTION | 2.3 | +168.8 ms, 0x00c00006 | none | 2188.0 / 2492.9 | TARGETS → None |
| proxied-2 | 26 | 192 (0) | 0.2 ms | yes | 3.68, GDK_SELECTION | 2.7 | +175.4 ms, 0x00c00006 | none | 2192.5 / 2499.2 | TARGETS → None |
| proxied-2 | 28 | 193 (0) | 3.3 ms | no | 2.961, GDK_SELECTION | 3.2 | +131.7 ms, 0x00c00006 | none | 2147.8 / 2448.9 | TARGETS → None |
| proxied-2 | 37 | 192 (0) | 3.4 ms | yes | 0.597, GDK_SELECTION | 0.2 | +181.1 ms, 0x00c00006 | none | 2181.4 / 2482.5 | TARGETS → None |
| proxied-2 | 39 | 192 (0) | 4.3 ms | no | 0.345, GDK_SELECTION | 4.1 | +130.3 ms, 0x00c00006 | none | 2153.3 / 2453.8 | TARGETS → None |
| proxied-2 | 44 | 193 (0) | 3.0 ms | no | 0.004, GDK_SELECTION | 3.0 | +165.5 ms, 0x00c00006 | none | 2162.9 / 2466.1 | TARGETS → None |
| proxied-2 | 45 | 192 (0) | 0.3 ms | yes | 1.567, GDK_SELECTION | 0.0 | +140.2 ms, 0x00c00006 | none | 2156.7 / 2462.6 | TARGETS → None |
| proxied-2 | 46 | 192 (0) | 0.8 ms | yes | 6.007, GDK_SELECTION | 5.6 | +137.4 ms, 0x00c00006 | none | 2150.2 / 2451.6 | TARGETS → None |
| proxied-2 | 47 | 194 (0) | 1.1 ms | yes | 0.869, GDK_SELECTION | 0.5 | +153.6 ms, 0x00c00006 | none | 2166.4 / 2469.0 | TARGETS → None |
| proxied-2 | 48 | 192 (0) | 1.9 ms | yes | 0.715, GDK_SELECTION | 0.6 | +143.9 ms, 0x00c00006 | none | 2154.3 / 2454.5 | TARGETS → None |
| proxied-2 | 49 | 192 (0) | 0.6 ms | yes | 0.121, GDK_SELECTION | 0.1 | +135.0 ms, 0x00c00006 | none | 2154.6 / 2455.1 | TARGETS → None |
| proxied-2 | 54 | 192 (0) | 0.7 ms | no | 0.385, GDK_SELECTION | 0.9 | +139.4 ms, 0x00c00006 | none | 2157.2 / 2458.7 | TARGETS → None |

**The transfer's end.** After the chord, A asked for nothing but the TARGETS refresh. So the engine's transfer
reached `ended` 500 ms after its dispatch (`TRANSFER_QUIET`). The engine went on serving until its answer, at the
confirmation's 2 s deadline (2.14–2.22 s after the run's start), and the owner was gone when the engine exited
(2.44–2.53 s). The terminal's next CLIPBOARD request was the refresh after that exit, answered with property None by
the server, since nothing owned CLIPBOARD. No data request followed, up to the next run's start.

**What the trace does not show:** what gnome-terminal did with the chord. The recorder received no byte for it (no
`^V`), so the terminal swallowed the chord while `paste-text` had no targets. That reading rests on gnome-terminal
3.52's source, not on a trace inside the process.

## The proxy's cost (`compare.txt`, from `compare.py`)

The proxy slows the terminal's side of the race. A's TARGETS round trip crosses the proxy three times: the owner
notice in, the request out, the answer in. The chord crosses it once. In the same scene at the same load:

| | runs | never taken | passing runs' confirmation, median (p90) |
|---|---:|---:|---|
| through the proxy (`proxied-2/`) | 60 | 27 (45%) | 24.9 ms (38.4) |
| direct (`direct-2/`) | 200 | 21 (10.5%) | 24.2 ms (33.1) |

So the proxy raises the never-taken rate about four times, while the pastes that land confirm almost as fast. The
direct runs show the same signature in the engine's own record: each row's `--stats` paste `log`, which lists the
owner's requests with when it handled each, in ms after the chord's dispatch (0 for one at or before it). All 21 never-taken runs asked for no data. In 12 of them, the target's TARGETS was served
at least 1 ms after the chord was dispatched; none of the 178 passing runs show that. The engine's millisecond
resolution leaves the other 9 at "+0 ms". The probe's direct rate (10.5%) is about twice the harness sittings' (4.9%).
The probe pastes back to back with no other scenario in between.

**Also seen** (not this question): `direct-2/` trial 28 is a scrolled paste that landed exactly (`abcDefgHPastedabc`).
It stayed unconfirmed: the count went from 1,377 at the observation to 1,317 at the confirmation's end, one row out,
and the scrolled rule did not confirm it.

## Reproducing

`sittings.sh 1 both` (the proxied sitting until 3 never-taken runs, then as many runs direct) and `sittings-2.sh`
(60 runs proxied, 200 direct). Then `python3 -I analyze.py <run dir> --excerpts <run dir>/excerpts` and
`python3 -I compare.py <run dir>...`. The scripts take the exported harness directory and the engine binary as
arguments.
