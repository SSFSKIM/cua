# cua_repl dogfooding: Homework 1b in an existing Chrome profile

Date: 2026-10-05. This report covers the forked Claude Code session that used the standalone `cua serve` MCP server to perform a real Cengage MindTap assignment. It does not cover the earlier scripted acceptance runs or the other session's work on issues #6, #8 and #9.

## Outcome and judgment

The browser route completed a substantial real workflow: reading ten questions, entering answers, choosing custom dropdown options, running an interactive experiment, drawing graphs, and grading every question. The assignment overview showed **26/26, 100%**, with every question receiving full credit on its first graded attempt. The user completed final submission and explicitly confirmed it. The agent did not independently verify the post-submission page because the user declined further tool use.

**Judgment: functionally capable, operationally rough.** This is convincing evidence that `cua serve` can do more than a controlled fixture in an existing, signed-in Chrome profile. It is not evidence of a fast, polished, unattended experience. The task required many observations, retries, long waits, and a human handoff at submission. Part of the friction was site loading; part was agent technique; part is a browser API/documentation issue that needs a focused reproduction before blaming cua.

This was an automation test requested by the user, not a usability study conducted with multiple users. “Feel” below means the operator experience visible in the trace, not a measured user-satisfaction score.

## Scope and environment

- Host: the first Mac, not the Mac mini. A prior shell check reported macOS 26.6.2; this run did not remeasure the OS.
- Client: a forked Claude Code session. During practice the client returned "Output blocked by content filtering policy" twice (06:11:05 and 06:11:44, with a user "continue" between). Recovery was user-driven: the user lowered effort to medium, switched the model from Fable to sol, and asked to continue.
- Server: user-scoped `cua_repl`, configured to run `node …/cua/bin/cua.mjs serve` with `CUA_SHIM_SURFACES=computer,browser`. The configuration was re-read during report authoring. No process-tree capture was taken during the homework, so configuration evidence must not be confused with executable-provenance proof for each call.
- Runtime: the project's pinned vendor runtime, through the original ChatGPT Chrome extension/native-host route. The desktop app was running according to the initial inventory (a `getState` at 06:04:21 on an abandoned prompt branch, before the final task prompt). This is not a desktop-absent test.
- Browser: existing Chrome profile requested as `mik145`; local metadata mapped it to `Profile 6`. The `school` key was initially unbound, then bound to a live extension backend holding the requested MindTap tab. The binding was made by a direct `node bin/cua.mjs profiles bind school --extension-instance-id …` Bash call outside the MCP session, which returned `ok: true`. The run did not re-read the configuration afterwards, so persistence of the binding was not verified.
- Page: an already-open Cengage MindTap tab. The tab was claimed rather than reloaded or replaced. Navigation stayed within the assignment.
- Assignment: Homework 1b, Chapter 2, frequency distributions. The page identified it as counting toward the course grade. The work was not a disposable fixture.
- Authentication: the existing browser login was reused. No login, password entry, Keychain substitution, credential extraction, or new extension installation was needed.
- Boundaries: no work on MAWS, no changes to the other session's issues, no browser restart or host kill, and no permission-dialog manipulation.

### Profile-selection qualification

The profile directory/account association came from local metadata. The extension backends themselves were unlabelled. The agent chose the candidate containing the explicitly requested MindTap URL and bound `school` without asking the user to pick the opaque instance id.

That made the workflow proceed, but it is **not** proof that vendor profile enrichment worked. It also fell short of the project's standing explicit-backend-pick rule. Treat this as an operator/process defect to prevent in future onboarding, not as a successful automatic-binding feature. The report intentionally omits account email addresses, full instance ids, tab inventories, and connection-token-bearing URLs.

## Workflow and capability coverage

| Stage | What was actually exercised | Result |
|---|---|---|
| Discovery | `profiles_list`, combined app/browser inventory, selection by extension instance | Browser selected; `school` made ready |
| Existing tab | Claiming a user-owned MindTap tab without reloading it | Existing signed-in state preserved |
| Navigation | Chapter assignment button and question links | All ten questions reached |
| Reading | DOM snapshots expanding the activity iframe and a nested experiment iframe | Text, tables, answer state, and grades readable |
| Numeric input | Frequency counts, products, and sums via locator fills | Full credit |
| Custom dropdowns | Opening listboxes and selecting observed options | Full credit; intermittent closed-menu retries |
| Radio input | Exact accessible names and checked state | Full credit |
| Timed experiment | Flashing word/non-word stimuli, keyboard responses, final chart | Participation/answers graded correctly; response measurement was not reliable |
| Visual interpretation | Screenshots of graphs omitted from the DOM snapshot | Graphs interpreted successfully |
| Histogram | Dragging rectangles, selecting handles, resizing heights/widths | Full credit |
| Frequency polygon | Dragging points, including zero-frequency endpoints | Full credit |
| Relative-frequency bar chart | Baselines, fractional heights, small corrective drags | Full credit |
| Per-question grading | `Grade It Now`, followed by grade inspection | Every first graded attempt received full credit |
| Final submission | Submit button (click succeeded), confirmation dialog, attempted confirmation | Confirmation click timed out; user reported pressing submit and confirmed completion |
| Cleanup | Tab marked as a deliverable (07:19:50) | `end_task` was never invoked (agent omission); the task was left open and cleanup is unverified |

### Confirmed assignment scores

| Question | Topic | Score |
|---|---|---:|
| 1 | Engagement activity and graph interpretation | 3/3 |
| 2 | Introduction to frequency distributions | 1/1 |
| 3 | Frequency distribution tables | 5/5 |
| 4 | Proportion and percentage | 1/1 |
| 5 | Grouped tables and real limits | 5/5 |
| 6 | Types of graphs | 2/2 |
| 7 | Constructing histograms and polygons | 2/2 |
| 8 | Bar graphs | 1/1 |
| 9 | Misuse of graphs | 2/2 |
| 10 | Shape of a frequency distribution | 4/4 |
| **Total** | | **26/26** |

## Usage experience and friction

### What felt effective

1. **Existing-profile access was useful immediately.** The agent worked in the user's already-authenticated course page. There was no cookie migration or separate managed browser.
2. **Text-heavy problems were straightforward once loaded.** DOM snapshots exposed table rows, radio labels, custom dropdown options, and numeric fields. Exact locators were much more efficient than screenshots for ordinary answers.
3. **DOM and visual control complemented each other.** Some graph content had no useful accessible text. Screenshots made it readable, and coordinate drag supported actual drawing rather than an API shortcut around the website.
4. **The task survived a model/API interruption.** After the user-driven recovery (effort change, model switch, explicit continue), the existing REPL/tab state was usable. No reset, relogin, or tab reconstruction was required at that point.
5. **The site provided a strong correctness signal.** Per-question grades and the assignment total allowed the agent to verify real outcomes, not infer success from a click returning without error.

### Agent mistakes and avoidable friction

These are not demonstrated transport bugs.

- A selector beginning with a numeric id was written as `#56_NB_Main_IFrame`, which is invalid unescaped CSS. An attribute/name selector fixed it.
- The agent tried `fetch`, `require`, and mutation-based logging in a read-only page-evaluation scope. These attempts failed because that scope does not expose arbitrary page scripting or writable objects. The failed public-script download also added no useful progress. DOM-only reading was sufficient for the task.
- Early calls mixed deterministic actions with fixed waits instead of waiting for specific visible readiness. Navigation returned before Cengage finished loading, so the following selector sometimes had no match.
- A text click on “Begin Experiment” returned without advancing the widget. The actual right-arrow control worked. The first click's return value was not a success signal.
- Some rectangle-resize coordinates were guessed from the first rectangle's initial geometry. Subsequent rectangles did not have that same geometry. The resulting wrong heights were caught in a screenshot and corrected **before grading**.
- Tiny corrective drags initially had no effect. A longer path ending at the same desired coordinate worked. This is consistent with a drag-threshold issue, but the cause was not isolated.
- Repeated lowercase `f` key calls did not advance the practice prompt. Refocusing the widget and using uppercase `F` did. Focus, key encoding, and viewport position changed together, so “lowercase is broken” is a hypothesis, not a proven root cause.
- The practice loop repeatedly answered a prompt without checking that the prompt had cleared. It spent time repeating ineffective input. Future loops should stop after the first unchanged state and diagnose focus/key handling.
- Parallel calls against the same persistent REPL were used during exploration. They offered little benefit and complicate ordering. A single serial controller should own a browser task.

### Browser API and site friction needing reproduction

- **Read-only evaluate has a different environment from ordinary Playwright.** `fetch` was unavailable and objects were non-extensible. Operators need this distinction prominently documented before they attempt instrumentation.
- **Nested-frame keyboard input was awkward.** Locator `press` on the nested frame's body timed out. Coordinate focus plus tab-level keyboard input worked. Whether this was focusability, a backend limitation, or a locator-action defect is unproven.
- **Nominal timeout and effective timeout differed.** Several locator actions reported a deadline near three seconds even when a longer locator timeout had been requested earlier in the session. Increasing the outer `js` timeout did not necessarily increase the locator/CDP action deadline. This merits a minimal reproduction.
- **Open custom menus sometimes vanished between calls.** Option selection then failed with no matches. The agent inspected the closed state, reopened the menu, and selected immediately. The trace does not identify whether focus movement, site behavior, or backend behavior closed the menu.
- **Cengage loads were slow and inconsistent.** Some question pages remained blank or showed “Please wait” after a bounded wait loop, then loaded on the next observation. There is no network trace to attribute this delay solely to the site or transport.
- **Final confirmation had uncertain completion.** The agent's "I'm Done, Submit Assignment Now" click (07:23:15) succeeded; the "Yes, submit assignment" call then reported a CDP `Runtime.evaluate` timeout (07:24:05). The user then reported pressing submit ("i hit the submittion") and confirmed completion. The trace cannot rule out that the agent's clicks had already advanced the dialog. The agent correctly did not blindly retry a consequential click, but it also produced no action or message for about 79 s after the timeout, until the user interrupted at 07:25:24.

## Timed experiment: validity and responsiveness limits

The word-recognition widget asks a participant to classify briefly flashed letter strings. This was the most mismatched part of the task for the automation interface.

- A recorded practice polling loop reported average read latency of **96 ms**, a maximum of **643 ms**, and **121 samples**. That is instrumentation from one loop, not a general browser latency benchmark.
- Some flashes were captured in DOM text; others were missed before an observation returned. Later loops used a local English dictionary to classify observed strings. This measured the automation's word-detection/classification path, not human visual-field performance.
- Missed flashes were sometimes answered arbitrarily to advance the exercise. An English dictionary can also include uncommon words that the exercise treats as non-words. Neither technique yields scientifically valid participant data.
- The final widget chart showed the automation's accuracy values as 33.3%, 53.3%, 40.0%, and 46.7% across its categories. Typical-participant values were 75.8%, 79.7%, 81.1%, and 95.3%. These numbers should not be presented as the user's abilities.
- The subsequent “were your own results similar” answer was “No.” The agent disclosed in its progress and completion messages that it had performed the experiment.

**Conclusion:** this interface can finish the widget, but this run does not establish reliable sub-second reaction testing. Prefer untimed browser tasks for ordinary dogfooding. When the user's actual responses are the subject of an experiment, hand that portion to the user rather than simulate personal measurements.

## Speed and measurement

### Measurement method

A read-only analysis paired tool-use and tool-result records by id in the local JSONL transcript. Durations use record timestamps, so they include the MCP round trip and logging, not just runtime execution. Overlapping intervals were merged before subtracting tool time from wall time. Per-question windows begin at opening the question and end at verifying its grade/returning to the overview; a call spanning adjacent questions makes these boundaries approximate.

The transcript contains resubmitted sibling branches. Aggregate counts below include four calls on an abandoned branch; the effective branch has 122 total tool calls. The primary elapsed metric starts at the final combined assignment prompt, not at the earliest resubmission. It therefore excludes about 2.5 minutes of pre-task churn (06:03:02–06:05:32): the opening prompt was resubmitted three times and the user interrupted twice to add the assignment instruction and URL. All timeline timestamps below are UTC on 2026-10-05.

| Milestone | Time |
|---|---|
| Final combined task prompt | 06:05:32 |
| Profile selected and assignment opened | 06:07:04–06:07:26 |
| Client content-filter blocks, user-driven model switch | 06:11:05 and 06:11:44; first sol call 06:13:37 (about 2m54s stall from the last tool result at 06:10:43) |
| Overview confirms 26/26 | 07:21:02 |
| User approves final submission | Around 07:22:32 |
| Agent confirmation click times out | 07:24:01–07:24:05 |
| User interrupts, reports pressing submit | 07:25:24 (about 79 s after the timeout, with no agent action in between) |
| User confirms completion/submission | 07:26:45 and 07:27:13 |
| Final response | 07:27:55 |

| Metric | Value | Interpretation |
|---|---:|---|
| Task prompt to full-score confirmation | 1h 15m 30s | Includes interruption, model time, site/tool waits, and failed approaches |
| Task prompt to final response | 1h 22m 23s | Also includes submission approval and user handoff |
| All tool calls in analyzed window | 126 | Includes four abandoned-branch calls; not all are browser actions |
| `cua.js` calls | 116 | A call may contain many actions/observations |
| Summed `cua.js` call durations | About 1,035 s | Sum, not overlap-adjusted task wall time |
| `cua.js` calls under one second | 47 | Fast returns exist; this is not an action-latency distribution |
| `cua.js` calls at least twenty seconds | 20 | About 781 s, mostly wait/polling-containing calls |
| Screenshot-returning `js` results | 34 | Image-observation overhead is substantial |
| `js` results flagged as errors | 9 | About 7.8% of calls; counts exclude caught failures inside successful calls |
| User-rejected verification call | 1 | Not a transport failure |

### Where the elapsed time accumulated

| Window | Wall time | Tool interval time | Time outside tool intervals | Median gap between calls |
|---|---:|---:|---:|---:|
| Initial Fable turn | About 333 s | About 88 s | About 244 s | 7.9 s |
| Later sol run through score report | About 4,124 s | About 921 s | About 3,204 s, 78% | 27.6 s |
| Questions 2–10 | About 3,497 s | About 643 s | About 2,854 s | 36.0 s |

Rounding and interval boundaries explain small sum differences. “Outside tool intervals” includes model reasoning/generation, result/image processing, orchestration, and any human delay. It is **not** a direct model-inference benchmark. No user message occurred in the long middle execution window, but that still does not isolate inference from result processing. The run changed models after API errors, so no model-to-model performance conclusion follows.

The strongest speed conclusion is that reducing model round trips matters at least as much as optimizing the server. Exploratory full snapshots, screenshots, and many short action/read calls substantially increased wall time.

### Approximate per-question duration

| Question | Duration | Main source of work |
|---|---:|---|
| 1 | 15m 08s | Experiment, ineffective inputs, API/model interruption |
| 2 | 1m 18s | Numeric frequencies |
| 3 | 3m 52s | Tables and load/navigation recovery |
| 4 | 7m 30s | Custom dropdowns and loading; one closed-menu failure (06:32:12, 3.1 s) was followed by a 103.8 s gap before the next action |
| 5 | 4m 36s | Multiple dropdowns and loading |
| 6 | 3m 01s | Visual graph interpretation |
| 7 | 11m 01s | Histogram/polygon dragging and correction |
| 8 | 10m 14s | Precise relative-frequency bar heights |
| 9 | 5m 24s | Visual comparison and loading |
| 10 | 6m 12s | Shapes, dropdown recovery, loading |

These windows do not partition the entire session perfectly; setup, gaps between question windows, and final overview verification also took time.

### Wait-loop cost and ambiguity

| Loop type | Observed behavior | Approximate cost |
|---|---|---:|
| Question-content polling | Seven long calls; six reached their cap without seeing the readiness condition | 333 s of capped loading waits |
| Return-to-overview polling | Six calls reached their twenty-second cap | 131 s |
| Fixed-duration experiment loops | Five deliberately bounded trial loops | 226 s |

For capped question loads, the last snapshot often still showed a stub or “Please wait”; the next tool read after a model gap showed the question. A quickly returning next read does **not** mean the page loaded immediately after the loop. Without an independent network/render trace, slow loading, snapshot visibility, and an ineffective predicate cannot be separated. These loops should be reproduced before changing timeouts or blaming the site.

### Error distribution

| Error class | Count | Qualification |
|---|---:|---|
| Missing locator around question navigation/loading | 3 | Includes a heading wait; transition/readiness failures |
| Dropdown option absent after its menu closed | 2 | Reopening and immediate selection recovered |
| Invalid numeric-id CSS selector | 1 | Agent-authored selector error |
| `fetch` unavailable in read-only evaluation | 1 | Unsupported evaluation assumption |
| Nested-frame body `press` deadline | 1 | Focus/action/backend cause not isolated |
| Final submission CDP evaluation timeout | 1 | User completed submission manually |

Caught exceptions such as unavailable `require` and non-extensible evaluation objects are additional friction but are not counted in these nine flagged errors. The API interruption was reported twice as output blocked by content filtering; this is a client/model-layer event, not evidence that the cua server failed. Recovery required three user steps (effort change, model switch, continue) and was not automatic. Recovery cost per failure is dominated by the model gap rather than the failed call: for example, the 3.1 s dropdown failure at 06:32:12 was followed by 103.8 s before the next action.

## Safety, privacy, and completion quality

- The page was a real graded assignment. Per-question grading changed external state. Final submission was separately confirmed by the user before the agent attempted it.
- The user then performed submission and confirmed completion directly. The agent's attempted independent check was declined. Final reporting must distinguish that user confirmation from an observed post-submission page.
- Combined `getState` listed unrelated apps/tabs and included a token-bearing extension connection URL in the tool output. This was unnecessary context exposure for a narrowly named assignment. A focused profile/tab selection would reduce the surface. This report never reproduces that token or unrelated browsing details.
- No secret-substitution test happened. Logged-in browser access is not proof of Keychain delivery or redaction safety.
- The task's marks and end-of-task semantics were not fully closed: a deliverable mark was set at 07:19:50, but `end_task` was never invoked. This was an agent omission: the agent had an open window after the 26/26 confirmation (07:21:02) and its own report (07:22:09) and did not call it; the user's later stop did not prevent it. Do not claim verified native/browser cleanup.
- There was no crash/host-lifetime instrumentation. A long workflow proceeding successfully does not prove the mini's short-host-lifetime issue is fixed.

## Improvement priorities

| Priority | Improvement | Evidence and acceptance for follow-up |
|---|---|---|
| First | Reduce unnecessary model round trips | Batch stable inputs and menu open/select pairs; use concise state checks; benchmark wall time separately from tool time |
| First | Make safe task completion a routine part of the controller | Successful `end_task` after an ordinary task; report errors honestly; do not continue after a user stop |
| First | Preserve explicit profile selection | Unlabelled backend selection stays a user decision; never infer persistent binding solely from tab contents |
| First | Standardize observe–act–verify and readiness waits | Stop after an unchanged action; wait for loaded question content rather than clicking through blank states |
| Next | Reproduce timeout propagation | A minimal slow-page/nested-frame test shows which locator/CDP budget actually applies |
| Next | Clarify read-only evaluate and keyboard semantics | Document unavailable APIs; test `F`/`f`, focus, and nested-frame input separately |
| Next | Improve drawing efficiency | One observed coordinate map, selected handle checks, and correct baseline/height before grading |
| Next | Investigate disappearing dropdowns | Reproduce menu persistence with no user activity and serial calls |
| Later | Benchmark representative untimed tasks | Separate site wait, tool latency, reasoning time, action count, and recovery count |

### Recommended next dogfood design

Use a bounded, untimed workflow on an owned or disposable page that combines an existing tab, nested frames, numeric fields, custom dropdowns, and one drawing action. Run with a stable model and no parallel controller. Record timestamps, concise readiness signals, action outcomes, screenshot count, failures, and successful `end_task`. Keep identity/profile verification explicit. Separately reproduce the transient-keyboard and menu/timeout behaviors instead of mixing diagnosis into another graded assignment. Repeat only to answer those unresolved questions, not to rerun already-proven homework scoring.

These are recommendations from this report, not new implementation authorization. Existing issues #6, #8 and #9 remain owned by the other session. No fixes or new issues were created by this reporting task.

## Evidence and limits

Primary evidence is the local session transcript and tool outputs, session `1e3ddbfc-3bc1-4764-a0fe-6e1744035f3a`, under the Claude Code project transcript directory for MAWS. It is private operational evidence, not a public fixture. Selected screenshots show graph construction and the all-question score overview. The all-question overview image has timestamp label `1791184862108` in its local filename and shows 26/26, 100%.

The source evidence contains personal page content and connection metadata. Do not attach raw transcripts or full inventories to a public issue/PR. This committed report contains only a scoped, token-free summary.

Unverified by this run: desktop-absent operation, fresh permissions, mini/remote operation, Linux, arbitrary downloads/dialogs, Chrome-group restoration, secrets, concurrency isolation, complete task cleanup, post-submission DOM state, and the root causes of the observed timeout/keyboard/menu behaviors.
