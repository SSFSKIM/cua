# #228 pre-flight: an Electron app's tree on Linux without the flag (task 177, ruling 1245)

Base: origin/main 161008276 (M6b merged, cua 0.30.0, cua-engine 0.4.5). Nothing here is built and no product file
changes. The probes ran on private displays, each with a session bus, an accessibility bus and a home of its own,
against instances the run started. Their scripts, rows and the source lines are in
`docs/evidence/2026-11-27-electron-a11y/`: `out/summary.md` has every table, `sources.md` every excerpt, `README.md`
how they ran.

Each claim carries a mark. **P** means a probe showed it, and names the rows (`matrix` is `out/matrix.jsonl`). **S**
means it was read in the source at the version named. **U** means unverified.

## The finding

**An Electron app's tree needs two things. The flag is not the only way to get the second, and it does not give the
first.**

- **The bridge** puts the process on the accessibility bus. Chromium decides it once, when the app makes its first
  window. It starts when one of three variables is `1` (`ACCESSIBILITY_ENABLED`, `GNOME_ACCESSIBILITY`,
  `QT_ACCESSIBILITY`), else when `org.a11y.Status` `IsEnabled` is true on the session bus (S: Chromium 152,
  `atk_util_auralinux.cc` 125 to 191, called from `view_ax_platform_node_delegate_auralinux.cc` 184 to 192). Without
  it the app is not on the bus at all, flag or no flag: the fixture started with `--force-renderer-accessibility`,
  both switches off and no variable never registered (P: `matrix`, row `flag`).
- **The mode** puts content in the tree. With the bridge alone the fixture's tree is two nodes, the application and
  its frame (P: `matrix`). `--force-renderer-accessibility` sets the mode at the start. So does one AT-SPI request
  from any client, at any time: `Accessible.GetAttributes` or `Accessible.GetRelationSet` on any object of the app (S:
  `ax_platform_node_auralinux.cc` 2185 to 2212, whose comment reads "Most AT does not call AtkGetAttributes, but Orca
  does, which is why it's a good signal to enable accessibility"; P: `running`).

**cua's engine never sends either request** (P: `facts`: no line of `native/linux-engine/src` outside a comment names
`GetAttributes` or `GetRelationSet`). It asks for role names, names, states, text, actions and children, and a
Chromium app answers those without turning anything on (P: two such reads 1.5 s apart, 2 nodes both times). OpenAI's
builds read the same one node (M0.4), so they did not send them either.

**One `GetAttributes` is enough.** Sent to the running fixture, with no flag and no restart, it turns 2 nodes into 29,
the page's button among them, in 21 to 61 ms (P: 15 sessions in `matrix`, `matrix-recheck`, `running` and `launch`).
cua-engine 0.4.5, unmodified, then reads 28 nodes where it read 1 (P: `engine`). VS Code 1.148 goes from 2 nodes to
394, half a second after the request (P: `apps`); read through cua-engine, from 1 node to 393 (P: `vscode`).

So the ticket's intent is within reach for every Chromium app that is on the bus, an app the person started included,
with nothing added to anyone's command line. An app that is not on the bus cannot be changed from outside: nothing
after its start turns the bridge on (P: `running`, scenario `started-off`: `IsEnabled` on, `ScreenReaderEnabled` on, a
process named `orca`, a real key press, each followed by a 3 s wait).

**Recommended (§E):** the engine sends the request itself, when a tree was asked for and came back bare; `launch_app`
adds `ACCESSIBILITY_ENABLED=1` to the environment of what it starts, so the bridge of a fresh launch does not depend
on the session; an Electron window whose app is not on the bus gets one sentence saying so and what to do. It has
costs inside the person's app, one of them to a screen reader started later (§E5). Four taste calls go to the owner
(§F).

**The ticket's three open questions, in a line each.**
1. *How to detect an Electron app.* Before launch, by its executable's files: right for 8 of 10 samples, with no false
   positive in the 17 others it could examine; the desktop entry alone says nothing. After launch, by toolkit name
   `Chromium` when it is on the bus, and by its window's role, `browser-window`, either way; its executable's
   directory answers too, but not from inside cua's sandbox (§B, §E).
2. *Is there a variable or a session setting, so nothing goes on the command line?* Yes, for the bridge:
   `ACCESSIBILITY_ENABLED=1`, or `IsEnabled`, each read once at the app's start. Neither gives the tree's content; one
   request does, at any time (§A).
3. *Does the same apply to CEF?* Yes: CEF's sample behaves as Electron does. NW.js does not: it has no bridge at all
   (§C).

## A. What turns the tree on

The fixture is cua's (`scripts/native-matrix/fixtures/electron/`) on Electron 44.9.0, which embeds Chromium
152.0.7977.167 (P: `process.versions`). "On the bus" means registered with the AT-SPI registry. "Tree" means the
page's button is in a structural read.

| Candidate | Set before the app starts | On an app already running | Mark |
|---|---|---|---|
| `--force-renderer-accessibility` | The mode, complete and with the screen-reader flag. Not the bridge: with the switches off and no variable the app is not on the bus. With either, 29 nodes at the first read. | Not applicable. | P `matrix` (`flag`, `flag+env`, `flag+bus-IsEnabled`); S `browser_accessibility_state_impl.cc` 339 to 375 |
| `ACCESSIBILITY_ENABLED=1` | The bridge. The tree is 2 nodes until the request. | Not applicable: a variable. | P `matrix`; S `atk_util_auralinux.cc` 30 to 35, 125 to 136 |
| `GNOME_ACCESSIBILITY=1`, `QT_ACCESSIBILITY=1` | The same as `ACCESSIBILITY_ENABLED=1`. | Not applicable. | P `matrix`; S the same lines |
| Any of the three set to `0` | The bridge stays off even with `IsEnabled` on. | Not applicable. | P `matrix` (`bus-IsEnabled+env=0`); S 133 to 135 |
| `org.a11y.Status` `IsEnabled` | The bridge (Chromium 112 and later). The tree is 2 nodes until the request. | Nothing. | P `matrix`, `running`; S 147 to 167 |
| `org.a11y.Status` `ScreenReaderEnabled` | Chromium does not read it. The launcher turns `IsEnabled` on with it, so it acts as `IsEnabled` and no more. It cannot be set alone. | Nothing. | P `matrix` (read back on / on), `running`; S `at-spi-bus-launcher.c` 698 to 701; `atk_util_auralinux.cc` is the one file of Chromium that names `org.a11y.Status` (a search of its default branch, 2026-11-27), and it asks for `IsEnabled` alone |
| GSettings `org.gnome.desktop.interface toolkit-accessibility` | The same switch as `IsEnabled`: the launcher starts from the key and follows it. Chromium reads the key itself only when the bus call got no reply. | Nothing. | P `matrix` (`gsettings-toolkit-accessibility`), `switch`; S launcher 961 to 966, `atk_util_auralinux.cc` 169 to 173 |
| An AT-SPI request, `Accessible.GetAttributes` or `GetRelationSet`, on any object | Not applicable. | **The mode, on an app that is on the bus.** The button is in the tree 21 to 61 ms later. | P `matrix`, `running`; S `ax_platform_node_auralinux.cc` 2185 to 2212 |
| The requests cua's engine and the vendor's builds send (role name, name, children, states, text, actions) | Not applicable. | Nothing: 2 nodes at every read. | P `matrix` (read 1 and read 2), `engine` |
| A process named `orca` of the same user | Nothing by itself. | Nothing by itself. When a request changes the mode Chromium scans `/proc` once, and finding it raises the mode to complete with the screen-reader flag. When it starts after a request has already been answered, later requests change nothing and the mode stays as it was. | P `matrix` (`bus-IsEnabled+orca-process`), `running` (`kick-with-orca`); `running` (`orca-after-request`); S `browser_accessibility_state_impl_auralinux.cc` 39 to 52, 145 to 198 |
| A real key press | Not applicable. | It makes Chromium ask again whether to start the bridge, only when the mode already has the native APIs (the flag, or the app's own call). An app started with the flag and the switches off joined the bus after `IsEnabled` was turned on and a key was pressed in its window; an app started with neither did not. | P `running` (`started-flag-only`, `started-off`); S `atk_util_auralinux.cc` 203 to 211 |
| `app.setAccessibilitySupportEnabled(true)` | Needs the app's own code. | Works on Linux, though Electron's documents mark it macOS and Windows: the mode becomes complete, and the tree is there 24 ms later when the bridge is on. It does not start the bridge. | P `running` (`app-enables-bridge-on`, `app-enables-itself`); S Electron `electron_api_app.cc` 1292 to 1309 |
| `--disable-renderer-accessibility`, `--disable-platform-accessibility-integration` | The request then does nothing: 2 nodes after it. | Not applicable. | P `matrix`; S `browser_accessibility_state_impl.cc` 334 to 340, 846 to 854 |

**What the request gives, and for how long.**
- On Chromium 138 and later (Electron 37 and later) it adds the native APIs, web contents and extended properties to
  the mode, not the inline text boxes and not the screen-reader flag. The app's own
  `app.isAccessibilitySupportEnabled()` stays false, since that call wants the whole of `kAXModeComplete`, and no
  `accessibility-support-changed` event fires; `app.getAccessibilitySupportFeatures()` does show the three, so an app
  that asks for it can tell (P: `running`, the probe app's log; S: Chromium `browser_accessibility_state_impl.cc` 594
  to 596, Electron `electron_api_app.cc` 1205 to 1209).
- From Chromium 86 to 136 (Electron 11 to 36) the same two requests add `kAXModeComplete`, so the app's own call turns
  true (S: `sources.md`, the table of 16 releases; P: `versions`: after the request it was true on Electron 22.3.27,
  32.3.0 and 36.0.0, and false on 37.0.0 and 44.9.0).
- Before Chromium 86 the requests do nothing, and only the flag sets the mode (S: 80.0.3987.87 has no such line; U by
  probe).
- It lasts for the life of the process. The platform's mode is only ever added to (S: `EnableAXModeFromPlatform`, 561
  to 569, its only writer), and 45 s later, untouched, the tree and the mode were the same (P: `running`,
  `kick-attributes`). There is no request that turns it off.
- It is for the whole process: every web contents takes it, a hidden one when it is shown, and one made later at its
  start (S: 638 to 660, 821 to 835; U by probe).
- The object does not matter. The application root and the frame gave the same result, and so did either method (P:
  `running`, `kick-on-frame`, `kick-relations`).

**The bridge by version.** Chromium reads `IsEnabled` from 112 on (Electron 24). From 86 to 110 only the three
variables start it (S: `sources.md`, the same table; P: `versions`: Electron 22.3.27, on Chromium 108, was not on the
bus with `IsEnabled` on and no variable, and was on it with the variable).

**Where the variables come from in practice.** On Debian and Ubuntu the `at-spi2-core` package installs
`/etc/X11/Xsession.d/90qt-a11y`, which exports `QT_ACCESSIBILITY=1` into every X session (P: `facts`, this host's
file, owned by `at-spi2-core`). So an app a person starts from their menu or terminal there has the bridge whatever
the switch says. cua's launch does not pass that variable on: the runtime's environment is a fixed list
(`src/runtime/launch.mjs`), and so is the launched application's (`src/repl-host/launch-services.mjs` `DESKTOP_ENV`).
An app started through `launch_app` therefore has the bridge only by `IsEnabled` (S; P: `launch`: the fixture started
by `gio launch` with cua's list of variables was on the bus with the switch on and off it with the switch off; with
`QT_ACCESSIBILITY=1` or `ACCESSIBILITY_ENABLED=1` added it was on the bus with the switch off).

**The switches are the person's settings.** Setting `IsEnabled` over the bus writes GSettings `toolkit-accessibility`;
setting `ScreenReaderEnabled` writes `screen-reader-enabled`, and turns `IsEnabled` on with it (S: launcher 654 to
711; P: `switch`, in the session's own dconf file). `screen-reader-enabled` is the key a GNOME, MATE, Unity or
Cinnamon session starts Orca by (S: Orca's `orca-autostart.desktop.in`, `AutostartCondition=GSettings
org.gnome.desktop.a11y.applications screen-reader-enabled`): the computer would start speaking. Neither switch does
anything for an app that is already running, so there is no case for cua to set either on a person's session.

## B. Detecting an Electron app

**Before launch, from the package's files** (P: `detect`; the samples are vendors' packages unpacked in the scratch,
the controls this host's installed applications, of which 14 of 15 desktop entries resolved to a program). The Exec
line's program is resolved as a launcher would, and three checks are made on the executable: D1, `resources/app.asar`
beside it; D2, the bytes `ELECTRON_RUN_AS_NODE` in it; D3, Chromium's runtime files beside it (`icudtl.dat`, a V8
snapshot, a `.pak`).

| Check | Electron (10 samples) | Other Chromium (CEF's sample, NW.js, Chrome) | Other toolkits (14 controls) |
|---|---:|---:|---:|
| D1, `app.asar` beside the executable | 8 | 0 | 0 |
| D2, `ELECTRON_RUN_AS_NODE` in the executable | 8 | 0 | 0 |
| D3, Chromium's files beside the executable | 8 | 3 | 0 |
| The desktop entry's own text names Electron | 0 of 9 | | |

- **The two misses are packaging, not the checks.** Discord's package holds a 386 KB launcher that downloads the
  client into the home on first run. Logseq ships as one AppImage, a compressed file system behind an ELF header.
  Neither can be told before it has run.
- **The executable has to be found first.** For 7 of the 8 it is the Exec line's own program. Bitwarden's Exec is a
  shell wrapper, found by looking beside the script, which is a heuristic; Chrome's is one too.
- **The desktop entry says nothing.** None of the 9 samples' entries names Electron (P: `facts`), and no key of the
  format does.
- **A list finds what it lists.** The same app has a different id per packaging (`code`, `com.microsoft.VSCode`, a
  Flatpak id, a Snap id), so a list needs each (U: not measured further).
- So the best check before launch is D1 or D2 on the resolved executable: never wrong where it answered, and it
  answered for 8 of 10.

**After launch** (P: `apps`, `chrome`, `matrix`; six Electron samples started here: VS Code, Obsidian, Mattermost,
Bitwarden, Joplin, Signal).
- **`ToolkitName` is `Chromium`, version `1.0`, for every Chromium app on the bus:** the six, the fixture and the
  probe app, CEF's sample, Chrome. It says Chromium, not Electron (S: `atk_util_auralinux.cc` 110 to 111), and it says
  nothing for an app that is not on the bus.
- **The class tells Chrome from the rest only by a list.** Each app has its own (`code`, `md.obsidian.Obsidian`,
  `bitwarden`), Chrome's is `Google-chrome`, and CEF's sample sets none.
- **`WM_WINDOW_ROLE` is the sharper tell.** Electron gives every window `browser-window` (S: Electron
  `native_window_views.cc` 326; P: the fixture in `matrix-recheck` and the 5 samples whose main window opened), Chrome
  gives a tabbed window `browser`, NW.js `pop-up`, CEF's sample none.
- **For a process that is not on the bus, its executable's directory answers.** D3 on `/proc/<pid>/exe` was right for
  all 8 third-party processes that ran (Chrome's executable passes it in `detect`), and D1 and D2 told Electron from
  the others again. The children's `--type=` arguments (`zygote`, `gpu-process`, `renderer`) could be read for all of
  them as well, with at most one child unreadable.
- Whether `libatk-bridge-2.0` is mapped tells nothing: NW.js, which has no bridge, maps it through GTK.

**What the design needs of this.** Nothing before launch: the variable goes to every application `launch_app` starts
(§E2). After launch the engine has the toolkit name and the window's role and no more: in service it runs in the
sandbox's own PID namespace and cannot read a host process's `/proc` entry, so the file checks are out of its reach
there (§E).

## C. CEF and other embedders

- **CEF behaves as Electron does** (P: `apps`: the sample application of CEF 152.0.15, Chromium 152.0.7977.169, in its
  Chrome style). With `IsEnabled` on it is on the bus, toolkit `Chromium`, 4 nodes. One `GetAttributes` and 237 ms
  later it is 207 nodes, its address bar and the page among them. Its first window, Chromium's own terms dialog, went
  from 1 node to 11 (its two buttons among them) 11 ms after the request: a window with no page needs the request too.
  Its library links `libatk-bridge-2.0` and holds the variables' names (P: `facts`), so the bridge's rules are the
  same code. Its windows set neither a class nor a role, so a rule keyed on those does not see them; the toolkit name
  does. A CEF product (Spotify, Steam) was not run (U).
- **NW.js has no bridge at all** (P: `apps`, `apps-nwjs-forced`: NW.js 0.120.0, Chromium 157). It was never on the
  bus: not with `IsEnabled` on, not with the variable and the flag together. Its library does not link
  `libatk-bridge-2.0` and does not hold the variables' names (P: `facts`). No route reaches it, a restart included.
- **Qt WebEngine (U).** Not installed here. It is Chromium's renderer behind Qt's own accessibility bridge, not the
  code read in §A.
- **Chrome** is in §D: the same as Electron.

## D. What each route costs

**The time to the first tree** (P: `cost` startup, 6 fresh launches of the probe app per mode; `apps`).

- **An app that is already running.** The fixture and the probe app had their page in the tree 21 to 61 ms after the
  request (15 sessions). Real apps: Bitwarden 96 ms, Obsidian 111, Mattermost 133, CEF's sample 237, Joplin 289, VS
  Code 542 (394 nodes; its window's own panels, 18 nodes, were there after 19 ms). In an earlier run VS Code had its
  document at 0.7 s and a tree that grew until 2.1 s (P: `apps-first-run`).
- **An app cua has just launched.** The probe app's window is shown 426 to 495 ms after the spawn, whatever the mode.
  With the request sent the moment the app registered, the button was in a read 502 ms after the spawn (422 to 599),
  against 533 ms (443 to 578) with the flag. So the request need not cost the first tree anything over the flag; the
  engine's own association and wait were not in that measurement (U).
- **An app that is not on the bus.** Never, until it is restarted.

**The app's speed** (P: `cost`, the probe app; a page that builds 2,000 rows, rewrites each 5 times and clears them).

| Mode | Page time, ms | Renderer CPU, s | Browser-process CPU, s | Renderer memory after, MB |
|---|---:|---:|---:|---:|
| no bridge | 317 | 0.31 | 0.03 | 191 |
| bridge only (`IsEnabled`) | 316 | 0.32 | 0.03 | 188 |
| after the request | 516 | 0.54 | 0.20 | 212 |
| `--force-renderer-accessibility` | 633 | 0.69 | 0.26 | 227 |
| after the request, with a client re-reading the whole tree throughout | 525 | 0.55 | 0.56 | 211 |

- The bridge alone costs nothing that shows. The request's mode costs this page 63% more time and 0.4 s more CPU per
  run; the plain flag's mode costs 100% and 0.6 s, because it also builds the inline text boxes and the screen-reader
  content. The page is a worst case: every one of its 2,000 rows changes five times.
- Idle, all four modes spend the same: 0.15 s of browser-process CPU in 10 s, none in the renderer (P: `cost` idle).
- Startup, from the spawn to the window shown: 426 ms with no bridge, 437 with the bridge, 468 with the request sent
  as the app registers, 495 with the flag (medians of 6; the ranges overlap by 100 ms and more, so the differences are
  within the noise).
- A client that reads the tree costs the app's browser process the reads themselves (0.56 s against 0.20 s), in every
  mode alike.

**The app's behaviour** (P: `vscode`: VS Code 1.148.0 on Electron 43.8.10, read and photographed through cua-engine).
- **After the request nothing on the screen changes.** The window's picture before it, 5 s after and 15 s after is the
  same file, byte for byte. The engine reads 393 nodes where it read 1. VS Code does not take a screen reader to be
  there: its editor's field still reads "The editor is not accessible at this time. To enable screen reader optimized
  mode, use Shift+Alt+F4". So every part of the window is in the tree except the editor's own text, which VS Code
  gives only in that mode.
- **Started with the flag, VS Code changes itself, and for good.** It turns its Screen Reader Optimized mode on (a
  status-bar button of that name is in the tree and in the picture; 404 nodes), and it writes
  `"force-renderer-accessibility": true` into its own `argv.json` (its bundle's `workbench.contrib.linuxAccessibility`
  does that whenever the mode is on). From then on that VS Code starts with accessibility forced on every time, with
  or without cua. After the request its `argv.json` has no such line.
- The fixture and the probe app have nothing that depends on the mode: both routes gave them the same tree (29 and 25
  nodes).

**Other applications on the same bus** (P: `others`: gedit, gnome-text-editor, kate, qtcreator and the fixture started
together in one session).
- Turning `IsEnabled` or `ScreenReaderEnabled` on changes nothing in an application that is already running. GTK 3,
  GTK 4 and Qt 5 were on the bus with both switches off and stayed there; Qt 6 and Chromium were off the bus and
  stayed off, 5 s after each switch.
- It changes what starts afterwards: with `IsEnabled` on at the start all five were on the bus. Chromium's part of
  that is the bridge alone, which costs nothing measurable (above). What Qt 6's bridge costs a Qt application was not
  measured (U); cua's provisioning already sets the switch for it (#171 M3).
- `QT_ACCESSIBILITY=1`, Debian's and Ubuntu's session variable, puts Chromium on the bus and not Qt 6.
- So a bus property is no route to a running app, and at the start it does only what the variable does, for every
  application of the session instead of the one launched, by a write to the person's settings.

**Chrome** (P: `chrome`: Google Chrome 156.0.8078.73, an instance of the run's own on a profile inside the session,
started from the installed binary with `IsEnabled` on and no flag).
- **Chrome does not expose its tree without the flag either.** It is on the bus, and its tree is 4 nodes: the
  application and three frames with nothing readable under them. No toolbar, no tabs, no page. That is the Electron
  fixture's tree with two more frames.
- One `GetAttributes` and 270 ms later it is 239 nodes with the page's button.
- **What M0.4 saw on the VM was the flag.** `google-chrome` on the VM's PATH is `/usr/local/bin/google-chrome`, the
  wrapper cua's provisioning writes, which runs `/usr/bin/google-chrome-stable --force-renderer-accessibility ...` (P:
  `facts`, this host's file; `deploy/cloud-vm/cua-provision.sh`). A Chrome started by that name in #171's own evidence
  runs as
  `/opt/google/chrome/chrome --force-renderer-accessibility ...`
  (`docs/evidence/2026-10-28-own-linux-engine/m4/gate/out/Z0.release-gate/wrap-summary.json`). Chrome and Electron are
  the same code here and behave the same.

## E. The design

Nothing goes on a command line, no desktop entry is rewritten, no session switch is written, and nothing has to know
before launch whether an application is Electron.

One fact bounds every part of it: in service the engine runs inside the sandbox's own PID namespace, where a host
process's `/proc` entry cannot be read (`native/linux-engine/src/browser.rs`, its opening comment; the #171 spec's
ruling 899). So the engine can use what the accessibility bus and the X server tell it, and nothing from `/proc`. The
probes' file checks (D1 to D3) and their reads of a process's environment are for people, not for the engine.

### E1. The engine asks an application whose tree came back bare

- **Where.** `native/linux-engine/src/engine.rs`, `get_window_state`, after `tree::read` of the frame
  `atspi::associate` found; the decision and the wait in a small module of their own.
- **Only when a tree was asked for.** `getScreenshot` sends the same `get_window_state` and throws the tree away
  (`src/cua-api/bind-linux-app.mjs`). `get_window_state`'s input gains a field that says so, and for it the engine
  neither asks nor waits. A person's app is never changed for a picture.
- **Only when the tree is bare.** The read came back as the frame alone, which is how every Chromium window without
  the mode reads (P: `engine`, `vscode`: one node and `truncated: {failed: 1}`). An app that already gives its tree,
  by the flag, by its own code or by a screen reader that got there first, is never asked.
- **Only Chromium, and only the windows taste call 3 chooses.** The frame's own application root is asked its
  `ToolkitName` (one `Properties.Get`, in this bare case alone), and the window's `WM_WINDOW_ROLE` is read from X. A
  bare frame of any other toolkit gets that one question and nothing more.
- **The request.** `org.a11y.atspi.Accessible.GetAttributes` to that application root, the object the probes asked
  (the frame works too, P: `running`, `kick-on-frame`). A request that failed to send is not remembered, so the next
  observation tries again.
- **The wait, which this pre-flight does not settle.** The page arrives on its own time, after the request: 96 to 542
  ms in six applications, and up to 2.1 s in one earlier run of VS Code, with the window's own panels there first (18
  nodes after 19 ms) (P: `apps`, `apps-first-run`). The probes measured that on the whole application through a client
  of their own, not on the engine's frame, and with a rule that is not the engine's. What the task has to build and
  measure:
  - a bound in wall time that covers the reads themselves (`tree::read` has no deadline of its own);
  - an end on the frame's own content: a `document web` with children when the window has a page, and promptly when it
    has none (CEF's terms dialog was whole after 11 ms and never has a document);
  - when the bound passes with the frame still bare, the answer says so (§E3) and the next observation reads again,
    without waiting a second time on an application that has already been asked on this bus connection.
- **Everything else is unchanged.** An application whose tree has content gets no new call. The tree read, the element
  numbering and the settle are as they are.
- **A declared difference from the vendor's behaviour:** cua asks a Chromium application to turn its accessibility on,
  and the vendor's builds did not.

### E2. `launch_app` sets one variable

- **Where.** `src/repl-host/launch-services.mjs`, `launchLinux`: the environment `gio launch` runs with gains
  `ACCESSIBILITY_ENABLED=1`.
- **What it reaches.** An application `gio` itself starts fresh: its bridge starts whatever the session's switch says,
  and on Chromium 86 to 110 nothing else starts it (P: `launch`, `versions`). It does not reach a desktop entry with
  `DBusActivatable=true`, which the session bus starts with its own environment (none of the 9 samples' entries is
  one, P: `facts`), nor an application that is already running, which takes the launch into its running instance.
- **Why a variable and not the flag.** The flag would not start the bridge, would need the Exec line rewritten (`gio
  launch` passes file arguments only), would need Electron told from other applications first (§B: 8 of 10), sets the
  costlier mode, and makes VS Code rewrite its own settings (§D). `--force-renderer-accessibility=basic` sets a
  cheaper mode but locks it: Chromium then refuses every later change, a screen reader's included (S:
  `browser_accessibility_state_impl.cc` 357 to 375).
- **Why every launch.** On this host only Chromium's family reads it: the name is in Chrome's, Electron's and CEF's
  binaries and in none of GTK 3 or 4, Qt 5 or 6, ATK or its bridge, Firefox's `libxul.so` or LibreOffice (P: `facts`).
  A toolkit not on this host was not searched (U). So nothing has to be detected.

### E3. The observation says what it found

The engine adds one field to `get_window_state`'s answer, `tree_unavailable: {reason}`, from outcomes it already tells
apart inside `atspi::associate`. cua's service passes the engine's fields through (`methods.mjs` spreads the state),
and `src/cua-api/bind-linux-app.mjs` renders the field after the tree, as it renders `truncated`. It says what was
observed and offers the remedy; it does not claim to know how the app was started.

- **`no_provider` on a window that says it is Electron's.** Association found no application on the bus for the
  window's process (its existing outcome "AT-SPI provider with process ID ... is unavailable"), and the window's
  `WM_WINDOW_ROLE` is `browser-window`.

  `No accessibility tree: <app>, an Electron app by its window's role, is not on the accessibility bus, which it joins only as it starts; start it again with launch_app to get its elements.`

- **`asked` and still bare** when the wait's bound passed.

  `No accessibility tree yet: <app> was asked to turn its accessibility on and has not shown its elements; observe again.`

- Any other window keeps today's answer. That includes NW.js, which no restart helps (§C), a GTK dialog of an app that
  is on the bus (§I), and a window whose process the bus could not name.
- They replace nothing: the source line and the one-node tree stay as they are, and a state without the field renders
  as today, byte for byte.

### E4. Doctor, and the documents

- `cua doctor`'s `accessibility.enabled` row keeps its check and names Chromium beside Qt 6 in its sentences: with the
  switch off, an Electron or Chrome application the person starts outside a Debian or Ubuntu X session puts no tree on
  the bus. No new row: doctor does not look at running applications.
- `README.md`: the Electron limitation becomes what is left of it, and "Chrome's own window" is corrected (§J).
- `docs/cua-api/linux-engine.md`, the model's document, gains one line: the first observation of an Electron
  application turns its accessibility on and can take longer, a screenshot does not, and an application that answers
  `No accessibility tree: ...` is not on the bus.

### E5. What the person sees

| What cua does | What shows |
|---|---|
| The request to an app on Chromium 138 or later (Electron 37 or later) | In VS Code 1.148, nothing: the window's picture is the same file before and after, and its settings are untouched (P: `vscode`). The app's own `isAccessibilitySupportEnabled()` stays false and no event fires, but `getAccessibilitySupportFeatures()` changes, so an app that asks for it can tell (P: `running`). It does more work when its page changes (§D), for as long as it runs. |
| The request to an app on Chromium 86 to 136 (Electron 11 to 36) | The app's own `isAccessibilitySupportEnabled()` turns true (P: `versions`). An app that changes its interface by it will change, as VS Code does when started with the flag (§D). No sample here both runs an Electron that old and reacts so (U). |
| The request, then a screen reader started later | **The screen reader does not get its full mode in that app until the app restarts.** Chromium looks for Orca only when the mode changes, and Orca's own requests then change nothing: the mode stayed at what cua's request set, without the inline text boxes and the screen-reader flag (P: `running`, `orca-after-request`; S: `browser_accessibility_state_impl_auralinux.cc` 145 to 169). With Orca running first, the same request raised the mode to the full one (P: `kick-with-orca`). |
| The variable on a launch | Nothing. The app's children inherit it, so a Chromium program started from inside it also starts its bridge, which costs nothing measurable. |
| An app not on the bus | The sentence, in the agent's observation. Nothing on the screen. |
| A screenshot | Nothing, and nothing changes in the app. |

## F. Taste calls

**1. Should cua turn accessibility on inside a Chromium app the person started, by asking it?** It changes neither how
the app was launched nor, in the one real app photographed, what it shows. It does change the app, and nothing turns
the change off before the app exits:
- the app works harder on every page change (§D: 63% longer on a page built to be the worst case; nothing idle);
- an app that asks for its accessibility features can see the change, and one on Electron 11 to 36 sees its plain
  "accessibility is on" answer turn true;
- **a screen reader started afterwards is left with the lesser mode in that app** (§E5). A person who has Orca running
  before cua touches the app is not affected; a person who starts it later is, until they restart the app.

Asking only for a tree, and only an app whose tree is bare, is part of the design under every choice below.
- **Recommended: yes, with no setting.** It is the ticket's intent and the only route to an app that is already
  running. The screen-reader case is real and narrow: it takes a person who turns a screen reader on in the middle of
  a session, after cua has read an app that is still open, and a restart of that app ends it. How much worse Orca
  reads in the lesser mode was not measured (U). `README.md` says so in a sentence.
- Behind a setting, off by default: right if the owner will not have cua lessen a screen reader's reading in any case,
  or wants any cost inside a person's apps opted into per device. The ticket's intent is then met only where someone
  turned it on. Nothing the engine can see tells it that a screen reader will start later, so there is no finer rule
  than a setting.
- Only apps cua launched: right if a person's own apps should be left exactly as they are; a running Slack or VS Code
  then stays one node. It is also the hardest to build: `gio launch` returns no process id, and the engine cannot read
  a mark in the launched app's environment (§E).
- Never, and the flag at launch instead: right only if the request itself is unwelcome. It costs more, needs detection
  and an Exec rewrite, does nothing for a running app, and changes VS Code for good (§D).

**2. Should `launch_app` add `ACCESSIBILITY_ENABLED=1` to the environment of every application it starts?** It is a
change to how an app starts, of the kind the ticket allows ("only for apps cua launches, and documented").
- **Recommended: yes.** With it the first success criterion holds for a fresh launch whatever the session's switch
  says, and for Electron 11 to 23 too. On this host only Chromium's family reads it.
- Nothing, and rely on `IsEnabled`: right if the owner wants the launch environment untouched. The criterion then
  holds only where the switch was on before the launch (cua's provisioned devices; a person's own desktop only if they
  turned it on), and never for Electron before 24.
- Pass on the session's own variables instead (`QT_ACCESSIBILITY` and the other two, when cua's own environment has
  them): right if cua should add nothing a person's session did not already give. It helps only where cua was started
  inside such a session.

**3. Which windows does the engine ask?** The request acts on the whole process. One window asked is every window of
that application, and in a browser every tab the person then looks at. Without the flag a Chrome window is as bare as
an Electron one (§D), so the question is real for browsers too.
- **Recommended: only a window that says it is Electron's**, `WM_WINDOW_ROLE` `browser-window`. Electron sets that
  role on every window it makes (S: `native_window_views.cc` 326; P: the fixture and 5 samples), Chrome's are
  `browser` and `pop-up`, and CEF's sample sets none. It is the ticket's scope, it never reaches a browser, and it
  leaves CEF products and other embedders as they are today.
- Everything on Chromium whose window does not carry a browser's role: adds CEF (P: its sample went from 4 nodes to
  207) and embedders not yet seen. Right once a real CEF product matters. A browser that sets neither of Chrome's
  roles would be asked, and Brave, Edge, Vivaldi and Opera were not run (U).
- Everything on Chromium, browsers included: right if the native route should read a person's own Chrome, its toolbar,
  its dialogs and its pages, with no restart. The provisioning wrapper's flag is then no longer needed. The cost lands
  widest here.

**4. How much does the "not on the bus" sentence say, and for which windows?**
- **Recommended: the sentence of §E3, for a window that says it is Electron's.** It names what was observed and the
  remedy, in one sentence, and is silent where the engine cannot tell.
- A plain line for every window whose process is not on the bus (`<app> is not on the accessibility bus`): right if
  the owner wants the one-node tree explained for every toolkit, a Qt 6 app started with the switch off included. It
  changes the observation of every such window, xterm's too.

## G. Tests, and the acceptance

**Unit.**
- Engine (`cargo test`): the rule as a pure function over what the engine knows (a tree was asked for or not; bare or
  not; the toolkit; the window's role; asked before on this bus connection or not; the send failed or not), and the
  wait's end on recorded trees (the frame alone; panels without a document; a document with children; a dialog with
  controls and no document).
- `test/repl-host/linux-launch.test.mjs`: the launched environment's names gain exactly `ACCESSIBILITY_ENABLED`, and
  its value is `1`.
- `test/cua-api/facade.test.mjs`: a state with `tree_unavailable` renders each sentence after the tree, in
  `getAXState` and the combined observation; a state without it renders byte for byte as today; `getScreenshot` sends
  the field that says no tree is wanted.
- The service's test: `tree_unavailable` reaches the WindowState.
- Doctor's test: the row's sentences.

**Live, on a private display**, with the repository's Electron and the fixture. Items 1 and 3 run through the confined
service, as a session runs it, with the application outside the sandbox: a test of the engine alone would pass where
the service cannot see what the test saw.
1. **Launched by cua.** The fixture's desktop entry started through the whole stack's `launch_app`, the session's
   `IsEnabled` off: `get_window_state` has `Fixture button`. This is the ticket's first criterion.
2. **Started by the person, on the bus.** The fixture started by hand with `IsEnabled` on and no flag: the first
   `get_window_state` has the button, within the bound.
3. **Started by the person, off the bus.** The fixture started by hand with both switches off and no variable: the
   observation ends with the first sentence. This is the ticket's second criterion.
4. **Asked, and nothing comes.** The fixture with `--disable-renderer-accessibility`: the second sentence after one
   bound, and no wait at the second observation.
5. **A picture changes nothing.** `getScreenshot` of the bare fixture: no `GetAttributes` on the bus, and the app's
   own record of its mode unchanged.
6. **Never an app that has its tree.** The fixture started with the flag: no `GetAttributes` on the bus.
7. **Nothing for the others.** A bare frame of another toolkit gets one `ToolkitName` read and no request; the
   harness's bus-call counts for gedit, the GTK 4 scene, kate and qtcreator are what they are on main.
8. **A browser is left alone** (under taste call 3's recommended choice). A Chrome of the run's own, its tabbed window
   and a pop-up of it each observed first: no `GetAttributes`.
9. **A slow app.** VS Code from its package, started by hand: the first observation has its page (at least 300 nodes)
   or says "yet", the second has it, and its `argv.json` has no `force-renderer-accessibility` afterwards.
10. **A window with no page.** A dialog of Chromium's own, observed first: answered within the bound it is given, with
    its buttons.

**What would prove it wrong.** A request on a screenshot; a request to an app whose tree had content; any request to a
window outside the chosen set; a second wait on an app already asked; the first sentence on a window whose process is
on the bus.

## H. Size

Six tasks, one engine release (0.4.6 is #580's, so 0.4.7), one pull request series.

1. Engine: the rule and the request; unit tests and the live tests 5 to 8.
2. Engine: the wait, built and measured on the engine's own frame; the live tests 2, 4, 9, 10.
3. Engine: the two reasons; unit tests and the live test 3.
4. JavaScript: the launch variable; the screenshot's field; the facade's sentences; the service's pass-through test;
   doctor's sentences.
5. The acceptance through the confined service on the VM (1, 3), with its evidence.
6. The release and its pin, `README.md` (the limitation, Chrome's paragraph, the screen-reader sentence),
   `docs/cua-api/linux-engine.md`, the #171 spec's limitation line, the close-out.

Nothing needs the Mac mini, a person's display or the owner's hands. §J's item 8, `launch_app`'s 30 s, is a ticket of
its own.

## I. Unverified, and limits

- **NW.js cannot be reached** (§C), and the engine cannot tell it from an app that only needs a restart, so it gets no
  sentence.
- **The wait is not designed here.** §E1 says what it has to do and what was measured; its rule and its bound are the
  task's, from the engine's own reads.
- **In service the engine cannot read `/proc`** for a host process (§E). Everything the design has the engine decide
  comes from the bus and the X server. That was read in the repository, not probed again here.
- **Flatpak and Snap packages (U).** Whether the variable passes through `flatpak run` or `snap run`, and whether
  Flatpak's accessibility-bus proxy still lets the engine match the application to the window's process. None was
  installed here. An Electron window whose process the engine cannot match gets the first sentence, whose remedy may
  then not help.
- **AppImage, and installers that fetch the app (U at run time).** Logseq's AppImage and Discord's launcher were not
  run: the first needs FUSE or unpacking, the second the network. Before launch neither can be told (§B), which the
  design does not need.
- **Other Chromium browsers (U).** Brave, Edge, Vivaldi and Opera were not run. Their window role is expected to be
  Chrome's, from shared code.
- **GTK dialogs of a Chromium app are in no tree.** Signal's first window here was a GTK error box (its native module
  did not load on this host), and Element's a GTK message box, "System unsupported", after which it ended. Chromium
  keeps GTK's own bridge off (S: `atk_util_auralinux_gtk.cc` 13 to 16), so such a dialog has no frame before or after
  the request (P: `apps`, Signal: 1 node). That is so today and stays so. It also bounds §E3: its first sentence is
  for a process with no application on the bus, never for a window with no frame.
- **What the request's mode leaves out.** It has no inline text boxes and no screen-reader flag, and Chromium says a
  tree without that flag may drop nodes that are "not currently relevant" (S: `ax_mode.h`, the comment on
  `kAXModeDefaultForTests`). Seen here: the fixture's tree was the same by both routes; VS Code's was 393 nodes
  against 404, and its editor's text needs VS Code's own screen-reader mode (§D), which an agent can turn on with the
  keys the field names.
- **The mode cannot be turned off again** from outside (S, §A).
- **Electron before 22 was not run.** The source says the request works from Chromium 86 (Electron 11) and that the
  bridge needs a variable until 112 (Electron 24).
- **GitHub Desktop did not show its window here** in 60 s (Electron 32.3.0; its GPU process failed to start on Xvfb).
  It was on the bus as toolkit `Chromium` (P: `apps`). Electron 32.3.0 itself is covered by `versions`.
- **arm64 (U).** Every probe ran on x86-64.
- **Wayland** is outside cua's Linux scope, which is X11.

## J. What the repository says today that these probes correct

1. **"Electron exposes a tree only with `--force-renderer-accessibility`"** (the #171 spec's limitation,
   `README.md`'s, the ticket's title). The flag sets the mode. It does not start the bridge, and the mode has a second
   way in, one request, which works on a running app (§A).
2. **"Chrome itself exposed its tree on the #171 VM without the flag"** (the ticket's known facts). It had the flag:
   `google-chrome` on the VM's PATH is `/usr/local/bin/google-chrome`, the provisioning wrapper (P: `facts`). Without
   it Chrome is 4 nodes (§D).
3. **`README.md`, "Chrome's own window".** It says Chrome joins AT-SPI when toolkit accessibility is on and that web
   content needs the flag. Joined without the flag, Chrome shows no toolbar either, only frames (P: `chrome`); and in
   a Debian or Ubuntu X session it joins whatever the switch says, by `QT_ACCESSIBILITY=1`.
4. **`scripts/linux-engine-diff/families.mjs`**, the Electron family's comment: "neither `ACCESSIBILITY_ENABLED=1` nor
   the bus's `ScreenReaderEnabled` turned it on". True of those two; the request does.
5. **The ticket: "This held even with ... `IsEnabled` already true".** With `IsEnabled` true at its start the fixture
   is on the bus, and cua-engine answers `at_spi` with the frame alone and `truncated: {failed: 1}`; with it false the
   engine answers `x11` (P: `engine`). Both are one node.
6. **`cua doctor`, `accessibility.enabled`.** Its sentences name Qt 6 alone. The same switch decides Chromium's bridge
   for everything `launch_app` starts today (§A).
7. **Electron's documents** mark `app.setAccessibilitySupportEnabled` and its siblings macOS and Windows only. They
   work on Linux (P: `running`).
8. **`launch_app` takes 30 s to return for an app that keeps its output open** (found on the way; not this ticket's).
   `runGioLaunch` runs `gio launch` through `execFile`, which gives gio pipes for its output and settles when they
   close. gio exits in under 20 ms, but the app it started inherits the pipes and holds them: the promise settled
   30,036 ms later, at `execFile`'s own 30 s timeout, with the fixture's window long on the screen (P: `launch`, the
   row through cua's own `runGioLaunch`; an earlier run gave 30,057 ms). An application the session bus starts itself
   (gedit) does not inherit them, which is how this went unseen (U: not probed). The fix is to settle on gio's exit.
   E2 edits the same file, but this deserves its own ticket.

## K. Decision Log

- **2026-11-28, taste call 1 (the owner's; ruling 1261): yes, for Electron only, with no setting.** The engine sends
  `GetAttributes` only when a tree was asked for and the frame's read came back bare, and only to a window whose
  `WM_WINDOW_ROLE` is `browser-window`. The owner accepted the three costs §F names, and the pull request states them:
  - the app does more work on page changes, for as long as it runs;
  - the change is visible to an app that asks for its accessibility features;
  - a screen reader started after cua's request gets the lesser mode in that app until it restarts.
- **2026-11-28, taste call 2 (the owner's; ruling 1261): yes, always.** `launch_app` sets `ACCESSIBILITY_ENABLED=1`
  for every application it starts (§E2).
- **2026-11-28, taste call 3 (the coordinator's; ruling 1251): only `browser-window` windows**, Electron's own role.
  CEF and other embedders stay as they are. If a matrix cell or a user shows a need, it gets its own ticket.
- **2026-11-28, taste call 4 (the coordinator's; ruling 1251): the "not on the bus" sentence is for Electron windows
  only** (§E3). The plain line for every window stays out of scope, and gets its own ticket if a need shows.
- **2026-11-28, delivery (ruling 1261).** §H's six tasks run after #598, or beside it where they share no file. Task 4
  edits `src/repl-host/launch-services.mjs`, which #598 changes, so it waits for #598. The engine change ships as
  linux-engine 0.4.7, with reviewer-high on it, and the release, the pin and the gates as for 0.4.6. The pull request
  corrects §J's texts. The release notes name what a person may notice: cua turns on accessibility in the Electron
  apps it reads, until they exit.
- **2026-11-28, T1 as built (task 179, reviewed clean).**
  - **The rule** is a pure function in `native/linux-engine/src/ask.rs`. It checks a tree wanted, the frame bare and not asked before first, then the toolkit and then the role, so an already-asked application makes no new call.
  - **The input field** is `tree_wanted: false` on `get_window_state`, where absent means true. The engine still reads and returns the tree; only the request is skipped. A combined tree-and-picture read wants the tree.
  - **"Bare"** means the frame has no children in a tree read from the accessibility bus.
  - **Connections.** The `ToolkitName` read and the request run only on the connection that associated the window (`dbus::on_this_connection`), never across a reconnect. A broken connection is dropped, and the next observation associates again.
  - **What is remembered.** Only real `ToolkitName` answers are cached, per application per connection; a timeout or error is not. An error reply to `GetAttributes` counts as a failed send and is not remembered.
  - **Live tests 5 to 8 fail closed.** Each observation is bracketed by `GetAttributes` markers sent to the registry's desktop object, which no application receives. An engine that asks on a screenshot turns test 5 red. §G7 counts every method on the engine's connections against main.
  - **Consequence for the facade:** engine 0.4.6 refuses the unknown `tree_wanted`. `MIN_ENGINE_VERSION` goes to 0.4.7 together with the 0.4.7 pin, because the pin alone doesn't refuse an older installed or override binary.
- **2026-11-28, T4 as built (task 182, reviewed clean).**
  - **The launch variable.** `launchLinux` puts `ACCESSIBILITY_ENABLED=1` in gio's environment, replacing a supervisor's own `0`.
  - **The screenshot.** `getScreenshot` sends `tree_wanted: false`, and no read that wants the tree sends anything new.
  - **The sentences.** `<app>` is the answered window's `app` field, escaped as in the drag notice. The sentence is the last line, after the tree and the truncation line. A reason that isn't one of the two strings renders nothing.
  - **Linux `launch_app` takes exactly `{app: <string>}`.** Any other shape is refused before approval and before the service with `launch_app on Linux takes exactly one input, {app: <application id>}, and nothing else; nothing was launched`. A malformed call can't fall through to the engine's own launcher. T3 also sets the variable there, so every route has it.
  - **The vendor differential.** The first Linux facade scenario is split. Tree reads stay compared to the vendor, and the screenshot is a declared difference whose record, minus `tree_wanted`, must equal the vendor's. The two sentences are a declared difference. Run against the comparator fixture's `@oai/cua`, 250 of 250 pass.
  - **The version.** It ships only with the 0.4.7 pin and `MIN_ENGINE_VERSION` 0.4.7 (T6), because an older engine refuses `tree_wanted`.
- **2026-11-28, §G 10's substitution (T2's review).** §G 10 is proved on an Electron window with no page (role `browser-window`, Chromium-drawn controls), not on CEF's dialog, which ruling 1251 leaves unasked. The ask rule is not widened for the test.
- **2026-11-28, T2 as built (task 180, reviewed clean after two fix waves).**
  - **The bound.** The wait is bounded at 2 s of wall time from the request's reply. Through the engine, the waits measured 27 to 42 ms on the fixture, 39 to 826 ms on VS Code, and 24 to 32 ms on an Electron window with no page. Only an app that never shows content pays the full bound, once per application per connection.
  - **What the bound covers:** the pauses and every accessibility-bus call. A reply or a tree completed after the deadline is rejected, and an unwritten call is dropped without breaking the connection.
  - **What it does not cover:** the X server's own replies, which block without a deadline everywhere in the engine. That is a tracker line, and making X11 deadline-aware is outside #228.
  - **The end of the wait.**
    - A `document web` with children: the page.
    - Content beyond the structural roles (`panel`, `filler`, `redundant object`, `unknown`, `section`), with no failed node and no failed child listing: no page.
    - Anything else is inconclusive and is read again.
  - **Each replacement read is confirmed again** against the window's association within the deadline. A changed association ends the wait with the read before it.
  - **§G 10** is met by substitution, as recorded above.
- **2026-11-28, T3 as built (task 181, reviewed clean after one fix wave).**
  - **`no_provider`.** The answer carries `tree_unavailable: {reason: "no_provider"}` only on a window whose role is `browser-window`, when association found no provider. That also requires the registry's listing to be whole and every listed application's process to be named; otherwise the old fallback answer stands, with no field.
  - **`asked`.** `{reason: "asked"}` only on the observation whose wait ended at the bound with the frame still alone. Panels, a pending document or a failed read get no sentence, and later observations of an app already asked get no field.
  - **Screenshots and other windows.** A screenshot never gets the field. Every other window's answer equals the 0.4.6 engine's key for key; live, 43 answers matched one to one.
  - **The engine's own `launch_app`** sets `ACCESSIBILITY_ENABLED=1`, overriding an inherited value, so every route has it (call 2).
  - **The X11 caveat.** `BOUND`'s doc carries it.

## Outcomes

**What shipped** (the pull request closes #228; each task's as-built entry is in §K).
- **The engine (cua-engine 0.4.7; T1 to T3, and the review's fixes).** When a tree is asked for and the frame of an
  Electron window (`WM_WINDOW_ROLE` `browser-window`) reads bare, the engine sends one `GetAttributes` to the
  application. Only a request that got its reply is followed by the wait: up to 2 s of wall time after the reply, for
  the pauses and the accessibility-bus calls, not the X server's replies. The observation answers with the page when it
  arrives in time. A screenshot never asks. `tree_unavailable` is `no_provider` for an Electron window whose process
  association found, with the registry's listing whole, to have no application on the bus, and `asked` for a wait that ended at the
  bound with the frame still alone (an empty document or panels alone give neither). Every other window's answer is the
  0.4.6 engine's, key for key.
- **The JavaScript (T4).** `launch_app` on Linux starts the application with `ACCESSIBILITY_ENABLED=1`, through both
  routes (the supervisor's `gio launch` and the engine's own launcher). `getScreenshot` sends `tree_wanted: false`.
  The facade renders the two sentences after the tree, and doctor's `accessibility.enabled` row names Chromium beside
  Qt 6.
- **The documents (T6).** `README.md`: the Electron limitation as what is left of it, with the two sentences and the
  costs the owner accepted; "Chrome's own window" corrected (§J 3); the launch variable stated beside `launch_app`.
  `docs/cua-api/linux-engine.md`: one paragraph for the model. The #171 spec's limitation line, corrected in place
  and dated (§J 1; its Decision Log and Surprises entries stay as written). `scripts/linux-engine-diff/families.mjs`'s
  Electron comment (§J 4). `test/cua-api/linux-engine-document.test.mjs` pins the new sentences to the facade's text
  and the launch variable to the code.
- **The release and the pin (T5), pending.** The engine's release, its pin and `MIN_ENGINE_VERSION` 0.4.7 together,
  filled in from T5. At T6's base the pin is 0.4.6 with a minimum of 0.4.5; none of that is T6's.

**The acceptance** (§G's live tests 1 and 3 through the confined service on the VM, T5):

(T5's results, to be filled in.)

**What is left.**
- **The tracker line** (`tech-debt-tracker.md`, T2's review): the engine's X server replies block without a deadline,
  in the association and in the wait's confirmation of it. The wait's 2 s bound covers its pauses and every
  accessibility-bus call, not those. Ruled don't-fix for #228.
- **CEF products and other embedders** stay as they were: taste call 3 (ruling 1251) limits the request to Electron's
  own window role. If a matrix cell or a user shows a need, it gets a ticket of its own.
- **The plain line for every window whose process is not on the bus** (taste call 4, ruling 1251) stays out of scope,
  and gets its own ticket if a need shows. A Qt 6 app started with the switch off still reads as one node with no
  explanation.
- **Not measured** (§I): Flatpak and Snap, AppImage, Chromium browsers other than Chrome, arm64's own probes, and how
  much worse a screen reader reads in the lesser mode.
- §J 8 (`launch_app` taking 30 s for an app that keeps its output open) was not this ticket's; #598 fixed it
  (merged as #605, cua 0.30.2).

**What the work taught.**
- **The flag was never the whole story.** An Electron app's tree needs the bridge and the mode, and the flag gave only
  the mode. Once the two were told apart, one request that cua's engine had never sent turned the mode on in a running
  app, and no change to anyone's command line was needed.
- **A ticket's "known fact" can be a wrapper.** "Chrome exposed its tree without the flag" was the provisioning
  script's `google-chrome`, which adds the flag. Read what a name on `PATH` runs before taking a baseline from it.
- **A guard in front of a call can be a no-op on the route that matters.** The engine's check before the request
  did nothing on the route that matches a window by its title; the review found it, and the fix is a re-association
  made for the ask, on every route.
- **Tests of what must not happen have to fail closed.** The live tests for the screenshot and the browsers bracket
  each observation with markers on the bus, so an engine that asks when it should not turns them red.
