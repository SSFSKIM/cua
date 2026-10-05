# Browser-route benchmark: shared task set (identical for both routes)

Fixture: `node /tmp/bench-browser/fixture/serve.mjs` serves http://127.0.0.1:48731/ (start it yourself; stop it at the end). Read `/tmp/bench-browser/fixture/README.md` ONLY for element ids and page names; do NOT read the ground-truth answers section before finishing the tasks (they are for scoring; skip that section, then compare at the end).

Rules: one controller (you), serial calls, no parallel tool use against the browser. Do not reload, close or touch any tab you did not create. Do not sign in anywhere. Untimed: correctness first, but record everything.

Tasks, in order (T0 is setup):
- T0 Setup: attach to the owner's existing Chrome (route-specific). Record the setup steps and any friction. List tabs count before you start (count only).
- T1 Open `http://127.0.0.1:48731/index.html` in a NEW tab. Report the page title and the text of `#bench-id`.
- T2 Read table `#inventory`; report the total of qty × unit price (2 decimals).
- T3 Report which bar (A–F) is tallest in the canvas `#graph` (no DOM text: use a screenshot).
- T4 Wait for `#late` to appear (it appears ~8 s after load; the page is already loaded, so reload is NOT allowed — you may navigate to the page again in your own tab if you missed it) and report its text.
- T5 Draw on canvas `#draw`: drag from canvas point (50,40) to (250,190). Report `#draw-result` (expect ~ `50,40,200,150`; ±3 px tolerance).
- T6 Navigate (click `#to-frame`) to the frame host page. In iframe `#outer`: set `#qty-a`=12, `#qty-b`=7, `#qty-c`=23; open the custom dropdown and choose "Bravo"; select radio `shape=circle`; type "nested keys" into `#phrase`; click `#submit`; report `#result`.
- T7 In the nested iframe `#inner` (inside `#outer`): focus `#deep`, type the characters `f`, `F`, `x` as separate key presses; report `#deep-log` and `#deep-echo`.
- T8 Open https://example.com/ in your tab; report the page's `<h1>` text.
- T9 Cleanup: close only the tab(s) you created; report tabs count after (must equal the count from T0). For cua_repl: call `end_task` and report its outcome.

Measurement (write as you go, do not reconstruct afterwards): `/tmp/bench-browser/<route>/log.jsonl`, one line per tool call: `{"t":"<ISO>","task":"T3","tool":"<name>","kind":"action|observe|wait|other","ok":true|false,"ms":<int>,"note":"<short>"}`; `kind=observe` for snapshots/screenshots/reads. After each task append `{"task":"T3","done":"<ISO>","answer":"...","ok":<bool or null>,"retries":n}`. Finally write `/tmp/bench-browser/<route>/report.md`: setup friction (prose), per-task table (wall time from task start to done, tool calls, observe calls, retries, answer, correct?), failures with the exact error text, what the route made easy or hard, and anything you could not do. Then score T1–T8 against the README's ground-truth section and record the score. Record the model you ran on and the total wall time T0 start → T9 done.

# Block 2: MiniWoB++ (15 tasks, one episode each)

Served by the same server under `http://127.0.0.1:48731/miniwob/miniwob/<task>.html?seed=bench-<task>` (the `seed` query makes both routes get the identical instance; the server also raises the episode limit to 180 s, so set nothing yourself). The fixture README's "MiniWoB++ block" section lists the 15 task URLs and the outcome globals (read it; it hides nothing). For each task, in order: navigate YOUR tab to the task URL with its seed, click the START overlay (`#sync-task-cover`), read the instruction text (`#query`), perform it with real UI actions through the route (click/type/drag/scroll); never set values through JS, never call page functions, never mutate page state through evaluate. Then read the outcome: success = `WOB_DONE_GLOBAL === true && WOB_RAW_REWARD_GLOBAL === 1` (read these BEFORE clicking START again; `WOB_REWARD_GLOBAL` is time-discounted and is only informational; also record `WOB_REWARD_REASON`). One attempt per task; a timeout or wrong answer is a fail, record it and move on. Log per task: success, raw reward, discounted reward, actions, observations, wall time. At the end add a MiniWoB table to `report.md` (task, success, rewards, time, actions, observes, note) and the success count /15.
