# #228 pre-flight: the probes (task 177, ruling 1245)

Evidence for `docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md`: what turns an Electron application's
AT-SPI tree on under Linux, how to tell such an application, what Chromium's other embedders do, and what each route
costs. On the #171 VM (`dc-linux171-1e68`, x86-64, 8 vCPU, Ubuntu 24.04, at-spi2-core 2.52.0), 2026-11-27 and 28. No
product file changed.

## How the probes ran

- **Private sessions only.** Every probe starts its own `lib.Session` (`probes/lib.py`): an Xvfb display it asks the
  server to number (never `:0`), a `dbus-daemon` session bus whose only activatable services are AT-SPI's launcher and
  dconf, the accessibility bus that launcher starts, Openbox, and a temporary home (HOME, the XDG base directories,
  XDG_RUNTIME_DIR, TMPDIR) under `/tmp/t177-*`. The environment it hands on names nothing of the person's: no session
  bus, no `AT_SPI_BUS_ADDRESS`, no X authority, no session manager.
- **The switches are the session's own.** As found, `IsEnabled` is true in any session on this VM, because cua's
  provisioning made `toolkit-accessibility` a system dconf default (`deploy/cloud-vm/cua-provision.sh`). So each probe
  sets both switches itself through its own launcher, which writes them to the dconf file in its temporary home.
- **Run-owned instances.** The applications are cua's Electron fixture (`scripts/native-matrix/fixtures/electron/`)
  and the probes' own app (`probes/probe-app/`) on the repository's Electron 44.9.0 (Chromium 152.0.7977.167), and
  third-party packages unpacked under the scratch (`/Users/new/.local/share/cua-171/t177/apps/`, never installed),
  each with a profile inside the session's directory. The third-party ones and Chrome ran in a network namespace with
  loopback only (`unshare --user --net`), so none reached its vendor.
- **Chrome.** One Google Chrome of the run's own (`probes/chrome.py`): the installed binary, a profile in the
  session's directory, the session's home, display and bus. No signal was sent to it: it closed on Ctrl+Shift+W, and
  the row records that no process of it was left.
- **The lock.** Each probe ran as `/Users/new/.local/share/cua-171/locked.sh t177 timeout -s TERM -k 60 <N>m python3
  -I probes/<probe>.py out/<name>.jsonl ...`.

## The files

| File | What |
|---|---|
| `probes/lib.py` | the session, and the AT-SPI reads through Gio: the registry's applications, a structural walk (role name, name, children: what cua's engine asks), and the one request that is not a read (`kick`: `Accessible.GetAttributes` or `GetRelationSet`) |
| `probes/probe-app/` | an Electron app that turns nothing on, logs `app.isAccessibilitySupportEnabled()` and `getAccessibilitySupportFeatures()` on every change, takes commands from files, and has a DOM benchmark |
| `probes/matrix.py` → `out/matrix.jsonl`, `out/matrix-recheck.jsonl` | the fixture under each condition set before its start; two of them again at the end, with the window's role in the row |
| `probes/running.py` → `out/running.jsonl` | what changes an app that is already running |
| `probes/cost.py` → `out/cost.jsonl` | startup, the DOM benchmark and idle CPU per mode |
| `probes/engine.py` → `out/engine.jsonl` | cua-engine 0.4.5's own answer for the fixture in each state |
| `probes/others.py` → `out/others.jsonl` | GTK 3, GTK 4, Qt 5, Qt 6 and Electron on one bus while the switches flip |
| `probes/chrome.py` → `out/chrome.jsonl` | Chrome without the flag, before and after the request |
| `probes/apps.py` → `out/apps.jsonl`, `out/apps-nwjs-forced.jsonl`, `out/apps-first-run.jsonl` | real Electron applications, CEF's sample and NW.js: identity, the bus, the request; NW.js again with the variable and the flag; an earlier run of the whole probe, kept for its timings |
| `probes/versions.py` → `out/versions.jsonl` | Electron 22, 32, 36, 37 and 44: the bridge by switch and by variable, the request, the mode after |
| `probes/launch.py` → `out/launch.jsonl` | `gio launch` with cua's environment list, with and without a variable; the same launch through cua's own `runGioLaunch` |
| `probes/switch.py` → `out/switch.jsonl` | what setting each switch over the bus writes to GSettings |
| `probes/vscode.py` → `out/vscode.jsonl`, `out/vscode-*.jpg` | VS Code through cua-engine, by the request and by the flag: tree, pictures, its `argv.json` |
| `probes/detect.py` → `out/detect.jsonl` | Electron told from a package's files, against controls |
| `probes/facts.py` → `out/facts.jsonl` | read from files, with no display: which binaries hold the variables' names and link the bridge library, the session script, the `google-chrome` wrapper, the samples' desktop entries, the engine's source, the person's dconf file's time |
| `probes/sources.py` → `sources.md` | the source lines cited, with each file's SHA-256, and the same two functions at 16 Chromium releases |
| `probes/summarize.py` → `out/summary.md` | every table, written from the rows |

In the rows, `kick` is the request: one `Accessible.GetAttributes` (or `GetRelationSet`) sent by the probe.

## What was run again, and what went wrong

- **Rows replaced.** `apps` and `chrome` were taken twice: the first runs read child processes' command lines in a way
  that found none. Three samples of `apps` (GitHub Desktop, Element, CEF's sample) were taken a third time, after the
  probe learnt to tell a GTK dialog from a window with no class, to record the bus when no window shows, and to accept
  CEF's terms dialog. `launch` was taken again because its first run piped `gio`'s output, which the launched app
  holds open (the pre-flight's §J, item 8, is that same fault in cua's own function). `cost`'s benchmark part was
  taken again after a session label with a `+` in it stopped the session bus from starting. The first `apps` run is
  kept as `out/apps-first-run.jsonl`; the other replaced rows are not in the repository.
- **One display of the run's own was left behind for 43 minutes.** That failed start (23:40 UTC) left its Xvfb
  running, with nothing on it, until it was found and stopped by its process id at 00:23 UTC, after its command line
  and start time were checked against the probe's. `lib.Session` now stops what it started when a start fails, and
  finds what outlives a session by command line and working directory as well as by environment (an Electron main
  process's environment reads empty from `/proc`).
- **Nothing of the person's was written.** The person's dconf file (`~/.config/dconf/user`) kept its time of
  2026-11-02 through every probe; each session's switches went to the dconf file in its own temporary home
  (`out/switch.jsonl`).
- **Samples that did not run here.** GitHub Desktop never showed its window (its GPU process failed on Xvfb), Element
  ended at its "System unsupported" dialog, and Signal showed only its error box (a native module did not load). Their
  rows say so. Discord's launcher and Logseq's AppImage were examined as files only.

## What the scratch held

Fetched 2026-11-27 into `/Users/new/.local/share/cua-171/t177/` (not in the repository): Chromium's files through
`https://chromium.googlesource.com/chromium/src/+/refs/tags/<tag>/<path>?format=TEXT`, Electron by `git clone --depth
1 --branch v44.9.0`, and these packages, each unpacked into a directory of its own:

| Package | From | Bytes | SHA-256 |
|---|---|---:|---|
| VS Code 1.148.0 | `https://update.code.visualstudio.com/latest/linux-deb-x64/stable` | 293,756,210 | `da33c10565e17b83f93508a365222f31bba116ab5c9e7bef7f562783943fd513` |
| Obsidian 1.15.1 | `https://github.com/obsidianmd/obsidian-releases/releases/download/v1.15.1/obsidian_1.15.1_amd64.deb` | 107,976,848 | `f77b6dfc8c040214f2febad2b1b9b051b6a838a47b0f4fb90a31cfcb79b8fcec` |
| Mattermost Desktop 6.4.0 | `https://github.com/mattermost/desktop/releases/download/v6.4.0/mattermost-desktop_6.4.0-1_amd64.deb` | 106,859,748 | `8724b25e13563bc6d952e125ded2a65d809818199627ebb5ef4b1daf83ab5b80` |
| GitHub Desktop 3.4.13 (shiftkey) | `https://github.com/shiftkey/desktop/releases/download/release-3.4.13-linux1/GitHubDesktop-linux-amd64-3.4.13-linux1.deb` | 130,450,912 | `8b5577761c7900cac2896b5fbc1d88f5aea48b6ce771437262be2a66ab38d987` |
| Bitwarden 2026.11.0 | `https://github.com/bitwarden/clients/releases/download/desktop-v2026.11.0/oss-Bitwarden-2026.11.0-amd64.deb` | 129,552,832 | `ab9e0fda0fed3787517c1919966271831f888cfbee711adeaf3e1afb57eb4a8f` |
| Joplin 3.7.24 | `https://github.com/laurent22/joplin/releases/download/v3.7.24/Joplin-3.7.24.deb` | 168,720,160 | `af9cfd13bff5fbec8f9d50482a0b03e461f8ac20f9a9ee846fe10a722bc35705` |
| Discord (the installer package) | `https://discord.com/api/download?platform=linux&format=deb` | 4,621,994 | `d9a091f1b3afbdf18ee341b52b75fbb62db21f1e18a6a87ad68da54fd6ec4a10` |
| Signal Desktop 8.36.0 | `https://updates.signal.org/desktop/apt/pool/s/signal-desktop/signal-desktop_8.36.0_amd64.deb` | 123,016,636 | `45381fe0d4872770fbc68e1fadecff1c77549ec91af6d17cee69b8b5859a4a14` |
| Element Desktop 1.12.13 | `https://packages.element.io/debian/pool/main/e/element-desktop/element-desktop_1.12.13_amd64.deb` | 132,530,080 | `964d6b629a21d503d1da6ca41373c36145f751b8f858fad492a33e8a585a6092` |
| Logseq 2.0.2 (AppImage) | `https://github.com/logseq/logseq/releases/download/2.0.2/Logseq-linux-x86_64-2.0.2.AppImage` | 175,847,888 | `1335725626f6cbfbf3b00b7743a60356d2d7dad123cf00bbf974a9beef556870` |
| CEF 152.0.15, the sample client | `https://cef-builds.spotifycdn.com/cef_binary_152.0.15%2Bgb3d72fb%2Bchromium-152.0.7977.169_linux64_client.tar.bz2` | 321,272,169 | `5b8a48916f4004ba5bc10124bf2d54ac9f2fa2a9f116fa69e228021d3cad59d0` |
| NW.js 0.120.0 | `https://dl.nwjs.io/v0.120.0/nwjs-v0.120.0-linux-x64.tar.gz` | 199,473,586 | `a7502c2489da5731d020f32e0f8cdc4f96b92012de53aa20da05ad82ab8fdbf5` |
| Electron 22.3.27 | `https://github.com/electron/electron/releases/download/v22.3.27/electron-v22.3.27-linux-x64.zip` | 93,427,320 | `631d8eb08098c48ce2b29421e74c69ac0312b1e42f445d8a805414ba1242bf3a` |
| Electron 32.3.0 | `https://github.com/electron/electron/releases/download/v32.3.0/electron-v32.3.0-linux-x64.zip` | 107,439,324 | `8fb72c1d19a51552438eb42fdaae915643c2e310fa3090d8d5293ad6fc94b8c5` |
| Electron 36.0.0 | `https://github.com/electron/electron/releases/download/v36.0.0/electron-v36.0.0-linux-x64.zip` | 111,211,173 | `50a869007264ced70c8d75f794438f7a789d9862e1cbeb4323cdeaac12051a03` |
| Electron 37.0.0 | `https://github.com/electron/electron/releases/download/v37.0.0/electron-v37.0.0-linux-x64.zip` | 114,485,755 | `ea9640d96ef709feeea32c138c7ea52ad63091265fa28468d7b52b4fe6dc4bd4` |

## Reading the result

`out/summary.md` has every table. The pre-flight states each claim with its mark: P (a probe's rows), S (the source
lines in `sources.md`) or U (unverified).
