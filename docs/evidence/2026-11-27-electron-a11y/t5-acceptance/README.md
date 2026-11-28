# #228 task 5: the acceptance through the confined service (session task 183)

The pre-flight's §G live tests 1 and 3 (`docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md`), run as a
session runs them: `cua serve` over MCP, cells in its `js` tool, the kernel under the default scoped sandbox, the
engine in the trusted worker, and the applications outside the sandbox. "A test of the engine alone would pass where
the service cannot see what the test saw" (§G). Two checks run beside them: a screenshot asks nothing, and gedit's
observation is unchanged.

- **Head:** `47c565ce9` on `228-t5`: feat/228 at `3944622de`, main merged at `a84715092`, the 0.4.7 pin with
  `MIN_ENGINE_VERSION` 0.4.7 (`62a30edee`), and this driver.
- **Release:** `linux-engine-v0.4.7`, built from `3944622de` by run
  https://github.com/SSFSKIM/cua/actions/runs/46181361665. `cua install` at the head fetched it by the pin, so the
  runtime was `cua-linux-x64-e0.4.7-n24.22.0-s0.163.0-mb71dc1f8185d` (`out/install-candidate.json`). Its x64 asset's
  SHA-256 is `05b9cac46a266f70e280fad533f96f4b9dd5d725348b1ebf2217b9f0b16632cc`, and it reports
  `cua-engine 0.4.7 (3944622deb44)`.
- **Base:** main at `a84715092` (cua 0.30.5, engine 0.4.6, none of #228), installed by its own checkout into a home of
  its own (`out/install-base.json`).
- **Run:** on the #171 VM (x86-64, Ubuntu 24.04), 2026-11-28 20:03 to 20:04Z, under the host lock
  (`out/lock-lines.txt`). It exited 0, with verdict PASS (`out/verdict.json`).

## How it ran

`run.sh` runs everything inside one `scripts/accept/linux-runtime-env.sh` environment:

- a private Xvfb (`:99`, never `:0`) with Openbox;
- a session bus of its own, and the accessibility bus it activates;
- a fresh `HOME`, `XDG_RUNTIME_DIR` and `CUA_HOME`, none of the caller's display or bus variables, and
  `CUA_SHIM_SANDBOX` unset. Doctor's `sandbox` row reads `CUA_SHIM_SANDBOX=scoped (the default)`
  (`out/doctor-candidate.json`).

Inside it, `run.sh`:

1. installs the head and the base;
2. sends the screenshot's request straight to the two engines (`engine-direct.mjs`);
3. runs the driver, `scripts/accept/linux-electron-a11y.mjs`, three times: for the candidate, for the base as a
   control, and for the head with `CUA_LINUX_ENGINE_BIN` naming 0.4.6 as a control;
4. holds each run to what it must show (`judge.mjs`).

The command:

    locked.sh t183 timeout -s TERM -k 60 40m run.sh <run> <out> <head> <base> <electron> <0.4.6 x64> <0.4.7 x64>

**The applications.**
- The Electron fixture is `scripts/native-matrix/fixtures/electron/` on the repository's Electron 44.9.0. Each scenario
  starts its own instance with a user-data directory of its own.
- gedit and zenity are third-party, so they run with no network (`unshare --user --net`).

**The bus.** The driver watches it as task 1's runner does (`../t1-rule/`):
- An unfiltered `dbus-monitor` of the run's accessibility bus.
- Each observation sits between two markers. A marker is a `GetAttributes` the driver sends to the registry's own
  object, which no application receives.
- The second marker's arrival proves the monitor saw everything routed before it, so a count of zero is a count.
- Whether an application is on the bus is read from the registry's listing and each name's process. A listing that
  cannot be read whole counts as unknown, never as empty.
- The switches are read and set on `org.a11y.Status`.

**Every expectation is a check.** A scenario passes only when each of its checks did. Each report has a `checks` list
and the observations' text.

## The checks, at the head (`out/candidate.json`: PASS, 4 of 4)

| Check | What ran | Result |
|---|---|---|
| **§G 1, launched by cua** | `IsEnabled` and `ScreenReaderEnabled` read back off. `launch_app` of a desktop entry that runs the fixture. Then `getApp` of its window, then `getAXState`. | Both observations have `24 push button Fixture button`: the page's 21 lines, `Accessibility source: at_spi`. The window's process is the launched fixture, in this PID namespace: it was started outside the sandbox. The first observation sent one `GetAttributes`, to the fixture's application. The second sent none, since the app was already asked. The switches were still off afterwards, so the bridge came from the launch's `ACCESSIBILITY_ENABLED=1`. |
| **§G 3, started by hand, off the bus** | Both switches off. The fixture started by the driver with none of the three variables and no flag. Then `getApp`, then `getAXState`. | The registry's listing, read whole, had no application of the fixture's process. Both observations end with the sentence word for word (below), and nothing was asked. |
| **A picture asks nothing** | `IsEnabled` on. The fixture started by hand, on the bus and bare. Its first observation is the facade's own `getScreenshot`, then `getAXState`. | The screenshot answered with its image and sent no `GetAttributes` or `GetRelationSet`. The next `getAXState` sent one `GetAttributes`, to the fixture's application, and had `Fixture button`. |
| **gedit is unchanged** | One gedit, settled first: 5 reads until two reads 500 ms apart were equal and its file was loaded. Then observed through the head, then the base, then the head again, each pass `getApp` and `getAXState`. | All three passes are equal byte for byte: getApp's observation 9,291 bytes, the next `getAXState` 11,522 bytes. Nothing was asked in any pass. |

§G 3's observation, as the facade rendered it, the same both times:

    Accessibility source: x11
    0 window cua Electron fixture, Description: cua-electron-fixture / cua-electron-fixture
    No accessibility tree: cua-electron-fixture, an Electron app by its window's role, is not on the accessibility bus, which it joins only as it starts; start it again with launch_app to get its elements.

The driver writes the sentence out itself (`offTheBusSentence`), so the check holds the facade to the ticket's text
rather than to its own.

**The screenshot is the app's first observation.** `getApp` reads the tree before it returns the app
(`src/cua-api/create-tinysky-alt.mjs`), so in a session the first observation of a window is always a tree read. To
make a picture the first observation, the cell binds the window with the facade's own `bind_linux_app`, over the
session's own `cua.computer`, exactly as `getApp` does, but without that first read. It then calls the bound app's
`getScreenshot`. It is the same module the facade loads (the checkout's `src/cua-api/bind-linux-app.mjs`), going
through the same service and engine.

## It can fail

**The base control** (`out/base-control.json`: main, cua 0.30.5 with engine 0.4.6). In each scenario the session opens,
the fixture's window is seen and the switches are as set. Then each fails on its content:

| Check | What happened |
|---|---|
| §G 1 | Without the launch's variable the fixture is not on the bus. Both observations are `Accessibility source: x11` with one node (`0 window cua Electron fixture, ...`), with no button and no `GetAttributes`. |
| §G 3 | The same two lines, with no sentence after them. |
| Screenshot | The screenshot still asks nothing. The next `getAXState` sends no `GetAttributes` and has no button. |

**The 0.4.6 override** (`out/override-control.json`: the head, `CUA_LINUX_ENGINE_BIN` naming a copy of 0.4.6 in the
run). §G 1 fails because the open is refused. `cua serve` exits 1 before it answers `initialize`, and its stderr reads:

    cua: the default engine (cua) selects cua's own engine, and CUA_LINUX_ENGINE_BIN names /Users/new/.local/share/cua-171/t183/run3/engine-046/cua-engine, which is 0.4.6, older than 0.4.7, which this cua needs: unset CUA_LINUX_ENGINE_BIN, then run `node /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/228-t5/bin/cua.mjs install --engine` [engine_outdated]
      a `cua` from another checkout installs that checkout's engine, not this one's

`judge.mjs` holds the code, the sentence and the hint to `outdatedOverrideMessage` and `ENGINE_HINT_LITERAL`
(`scripts/accept/linux-runtime-cells.mjs`) with the minimum 0.4.7.

**Why the minimum is 0.4.7** (`out/engine-direct.jsonl`). This is the request the facade's `getScreenshot` now sends,
`get_window_state` with `{window, include_screenshot: true, tree_wanted: false}`. It went straight to each engine
binary (`server --desktop dedicated`), for a zenity window on the run's display:

- 0.4.6 (`cua-engine 0.4.6 (61c97dda619f)`) answered `ok: false` with this error, word for word:

      failed to parse command input: unknown field `tree_wanted`, expected one of `window`, `query`, `include_screenshot`

  The same request without the field got its picture, so the refusal is the field's.
- 0.4.7 (`cua-engine 0.4.7 (3944622deb44)`) answered both with the picture.

So with the minimum left at 0.4.5, every screenshot on a 0.4.5 or 0.4.6 engine would fail.

## Files

- `run.sh`, `engine-direct.mjs`, `judge.mjs`: the run.
- `../../../../scripts/accept/linux-electron-a11y.mjs`: the driver. Its pure pieces are tested in
  `test/accept-linux-electron-a11y.test.mjs`.
- `out/`:
  - `candidate.json`, `base-control.json`, `override-control.json`: the driver's reports, with every check and
    observation.
  - `engine-direct.jsonl`;
  - `verdict.json`;
  - `install-*.json`, `doctor-*.json`;
  - `steps.log`, `lock-lines.txt`.

Two earlier runs, not counted, found bugs in the driver and not in cua:
- the engine's window record names no process, so the driver now reads `_NET_WM_PID` from X;
- gdbus types an empty listing as `(@a(so) [],)`, and the driver now reads that form;
- gedit's status bar still showed "Loading file" in the first pass, which is why the settle pass now runs first.
