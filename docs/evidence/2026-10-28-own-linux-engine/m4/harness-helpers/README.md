# T18: the remaining runners on the shared harness helpers (task 74, worker 3)

The design session (2026-11-10; Decision Log, T16, "Shared harness helpers") made two helpers: `park.mjs`, which parks
the real pointer and verifies the park through `QueryPointer`'s chain, and `app-identity.mjs`, which checks the
application under test before a cell counts. T16's runners used both. T18 moves the rest. Every run here was made on a
private Xvfb with Openbox and no RECORD. The candidate was the musl build 83dd7e5b (0.3.0), unless noted. Each harness
is a `git archive` of the commit named, so the rows' `commit` is null.

## The identities, read live

- `ident-1/` (harness 292b6509, `--experiment writer-drag --plan identity`): each family through `openFamily`, read
  against an `APP_IDENTITY` that then had only LibreOffice's entries and the GTK 3 point scene.
- `pilot-id-3/` and `pilot-id-5/` are **pilots**: 292b6509 with its identity plan patched out of tree to read
  everything (`app-identity-pilot` rows). They read every window's application, toolkit, toolkit version and
  `WM_CLASS`, for the Qt families and for the differential run's scenes that no family opens (`scene:<name>`). Their
  findings:
  - Qt 5 (5.15.13) and Qt 6 (6.4.2) both report the toolkit as `Qt`, and the Qt fixtures share a script. Only the
    version's major tells qt5-* from qt6-*. kate is Qt 5 and Qt Creator is Qt 6.
  - GTK 4's Python fixtures (gtk4-button, gtk4-input, atspi-gtk4, identity-gtk4) all show the application `Unnamed`,
    with toolkit `GTK`, as read.
  - xterm, the minimized cases' recorder (`xprobe record`) and Writer on its gen plugin (writer-gen) put no tree on the
    bus. Their `WM_CLASS` is `xterm / XTerm`, `cua171-recorder / Cua171-recorder` and
    `libreoffice / libreoffice-writer`.
  - identity-gtk4's three windows share one title, so the engine refuses to read their states apart ("matches several
    accessibility windows"). Their process has one application on the bus, which answers the same reads.
  - Chrome's bridge reports its version as `1.0`, and Firefox reports 159, so a browser declares no major.

The entries that came from these reads are in `scripts/linux-engine-diff/app-identity.mjs` `APP_IDENTITY`. The test
`test/linux-engine-diff/identity-coverage.test.mjs` holds two things: every family has an entry, and every
differential-run scene maps to one (run.mjs `SCENE_FAMILY`).

## The runners, live (harness fcc88055 unless noted)

| run | runner | what it shows |
|---|---|---|
| `a-scenes-1/` (86c8fd8f) | run.mjs | 16 scenes, among them identity, identity-gtk3, identity-gtk4, identity-kate, calc and gtk-table. Every window was opened through `openScene` and verified (the run stops at an `IdentityRefused`). 1170 samples, 0 witness reds. Cut by the step's 45-minute bound during the top-ups, so the run is not complete |
| `a-device-1/` | run.mjs, device.mjs | 9 device and minimized scenes, each window's verified identity a `scene-identity` row, xterm and the recorder by `WM_CLASS`. The case parks (Firefox's pointer out on the front window, its pointer in the scene, Chrome's inside) and their back-moves are verified (park.mjs `parkAt`, `restorePointer`). Valid, 10 of 10 verdicts PASS |
| `a-events-1/` | events.mjs | `POINTER_START` parked on the experiment's own server and verified on the bare root (`parkAtStart`) before every scenario, block and motion-listener round. Complete, the listener listening |
| `a-dnd-1/` | dnd.mjs | `--dnd-cold --park-pointer 1170,715`: the park verified over the front window (`parkAt`), and each Chrome window verified. Complete |
| `a-drops-1/` | drop-signals.mjs | `--plan pilot`: the scene's Chrome window verified. Complete |
| `a-settle-2/` (engine 0.4.0, worker 5's cc18a6f7 build) | action-settle.mjs | `move_relative`'s pre-move parked on the scene window and verified, and each family verified. Chrome and Electron landed 3 of 3 each, with no miss. The run says "incomplete" only because a development series is 3 runs, not the rule's 30. An earlier run on 0.3.0 is not kept: cua's service refuses that engine (it needs 0.4.0) |
