# Probe 453: can a click on an app's own overlay window be delivered to that window?

Hosted measurement kit for #453, on #337's (`scripts/probe-337/`, the omnibox popup opened with ⌘L and typed text) and
#458's (`scripts/probe-458/tool.swift` on `probe/458-qual`: the kit's own click and the key-window watch). It is
disposable and not a ci-kit gate. Workflow: `.github/workflows/probe-453.yml`, dispatched with an exact engine SHA; the
engine is built unmodified from it. The engine observes and opens the overlay; the kit delivers the click itself.

Each row, on stable Google Chrome at (400, 30, 620×720) or TextEdit at the same frame:
1. A re-set: Escape twice, the page reloaded, the web area focused; the app made frontmost, or a cover raised at
   (0, 40, 380×300) so the app sits behind it, uncovered (TextEdit for Chrome, Finder for TextEdit).
2. One observation; the overlay opened (omnibox: ⌘L and `type_text` of `http://127.0.0.1:<port>/results-` through the
   engine, with `/results-alpha` and `/results-beta` typed into the profile's history at launch; datalist: the field
   focused and `ap` typed; permission: a geolocation prompt on a fresh origin; popover: AXPress on TextEdit's colour well).
3. A re-observation (the screenshot the click is placed in), then the overlay's AX surfaces read (`rows`, `omnibox`).
4. The overlay sampled until the click, 1, 2 or 3 s after the re-observation (`life`: its window and its AX rows).
5. The hit at the point read just before the click (`identify`), then one delivery, with the window list and the
   person's key and main window (the cover's; Chrome's own when frontmost) watched through it.

Deliveries (`deliver.mjs`'s header has the detail): `engine` (the engine's own click, the baseline), `post` (the
engine's mouse recipe stamped with the overlay's window number and a point local to it), `postAct` (the same inside
route 3's subtype 1 and 2), `postMove` (a stamped mouse-moved first), `axpress` and `axpick` (the AX action on the hit's
first ancestor listing it), `hid` (a person's click, frontmost only). Timing cells `idle` and `type` sample the omnibox
popup for 3 s after the observation, `type` typing one more character through the engine at 1 s.

Reader: `node scripts/probe-453/summary.mjs <results.json>`.
