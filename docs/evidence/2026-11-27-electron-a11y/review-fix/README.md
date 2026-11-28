# #228: the whole engine change's review fixes, live (session task 185)

The reviewer-high review of #228's engine change (T1 to T3) found six things, all fixed in `6b624db56` (see
`.doperpowers/sde/2026-11-27-electron-a11y-preflight/task-185-report.md` in the workspace). This directory holds the
re-runs of the three tasks' live runners against `cua-engine 0.4.6 (6b624db567ba)`, each with its control, on the #171
VM, 2026-11-28. They ran as before (private displays, buses and homes; third-party apps under `unshare --user --net`),
under `locked.sh t185`.

| Runner | Rows | Exit | What passed |
|---|---|---:|---|
| T1, `../t1-rule/rule.py` | `out/rule.jsonl` | 0 | `fixture-bare`, `fixture-flag`, `others` (§G 7: gedit, the GTK 4 scene, kate and qtcreator equal to main by member; the bare GTK 3 frame exactly one `Properties.Get` more on its first read), `chrome-tabbed`, `chrome-popup` |
| T1's control, an engine that asks on a screenshot | `out/rule-control.jsonl` | 1 | its screenshot checks fail, as before |
| T2, `../t2-wait/wait.py` | `out/wait.jsonl` | 0 | `fixture-started` 5/5, `fixture-disabled` 2/2, `vscode` 3/3, `no-page` 3/3, `panels` 2/2, `twins` 2/2, `cef-dialog` 1/1 |
| T2's controls, T1's engine and the wait before its fix wave 1 | `out/wait-control-no-wait.jsonl`, `out/wait-control-before-wave1.jsonl` | 1, 1 | they fail as before |
| T3, `../t3-reasons/reasons.py`, against T2's engine as the base | `out/reasons.jsonl` | 0 | `off-the-bus` 2/2, `off-the-bus-beside` 1/1, `asked` 2/2, `gedit`, `chrome-on`, `chrome-off`, `nwjs`; every answer, less `tree_unavailable`, equal to the base's |
| T3's control, the base as the candidate | `out/reasons-control.jsonl` | 1 | `state_reads_say_no_provider`, `the_field_is_exactly_the_reason`, `first_says_asked` false |

- **T1's first pass** (`out/rule-first-pass.jsonl`) exited 1, on one check: `first_read_bare`. T1's runner was written
  before the wait existed, and since task 2 the first read is answered with the page the request brought. The check
  is now `first_read_bare_or_its_waits_page`, which accepts the bare read of an engine with no wait, or a read the
  wait ended on the page with `Fixture button` in it. Every other check passed in both passes.
- **The confirmation before the request costs nothing on the vendor's own match**: the fixture, matched by its title,
  makes no new call (§G 7 is still main's count). On cua's own routes (`twins`), the observation that asks now makes
  four associations, against the two of an observation that only reads: the first read's, its confirmation, the
  confirmation right before the request, and the wait's.
- The fix's other cases cannot be made on demand by a real application: a frame whose own `GetChildren` fails, a
  request written and left unanswered, a padded `WM_WINDOW_ROLE`, and a read cut by the element or depth limit beside
  a document. The unit tests prove them. These runs prove that none of the fixes changes what the real windows get.
