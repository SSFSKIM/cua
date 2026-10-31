// The attended sitting's scripted items (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md, Acceptance
// 1–7, 9–11; the runbook docs/evidence/2026-10-30-macos-agent-cursor/README.md says who does what): each item a list
// of steps that ./runner.mjs executes. The agent's part is cells on the harness scenes (./cells.mjs); the owner's part
// is a spoken, timed cue (`cue`: the owner acts while the step waits), or an instruction the operator confirms once the
// owner says it is done (`owner`: the step waits for the go file); what the owner should see is a `watch` row, whose
// verdict the operator records afterwards (`cursor-sitting.mjs verdict`). Steps:
//   {open, scenes, env?, engine?}   a session (./session.mjs) bound to those scenes; `env` its cursor variables
//   {run, cell, label, keys?}       a cell on session `run`; `cell` may be a function of the results so far; `keys`
//                                   names the scene whose process must be frontmost (#162's key guard)
//   {together: [run steps]}         cells sent at once, on different sessions
//   {endTask}, {close}              end_task on a session; close it (end_task, then the serve's exit)
//   {cue, ms}, {owner}, {watch, id}, {wait}, {say}
//   {task, args?}                   activate <scene> | engine-stop | engine-status | engine-json-off | engine-json-restore
//                                   | watch-start | watch-stop | focus <label> <scene> [<label to equal>]
//                                   | record-start <clip> <scene> <scene> | record-stop
// A run step's `orderTarget` marks item 1's two clicks, whose order against the cursor's arrival its recording decides
// (./clip.mjs); the runner keeps it on the cell's row.
import {ALIGN_CLICK, ALIGN_TOGGLE, ALIGNMENT, CLICK_AT, CLICK_CONTROL, CLICK_CONTROL_TIMED, CONTROL_VALUE, DRAG, INTERVENTION_PROBE, KEY_AFTER_INPUT, OBSERVE, OPEN_MENU, PRESSED,
  PRESS_KEYS, SCROLL_AT, SHOT, TYPE_RUN} from './cells.mjs';

// What the owner sees when a person's input is attributed to the app: the engine refuses the next action for 5 s
// ("still interacting") and then until a get_app_state ("user changed"), so after the owner's own click or keys in a
// driven app the session waits out the 5 s and observes before it acts again.
const reobserve = (session, scene) => [{wait: 5500}, {run: session, cell: OBSERVE(scene), label: 'observe after the owner\'s input'}];

// The scripted moves of Acceptance 11's side-by-side and of Acceptance 9 (Reduce Motion), on the TextEdit document
// (fractions of its window, inside the text area: a click there only moves the insertion point).
export const MOVES = Object.freeze([
  {what: 'first click: fades in at the target', cell: CLICK_AT('textedit', [0.25, 0.45])},
  {what: 'a short move (the scoot)', cell: CLICK_AT('textedit', [0.32, 0.5])},
  {what: 'a long move (a curved path)', cell: CLICK_AT('textedit', [0.85, 0.85])},
  {what: 'backward', cell: CLICK_AT('textedit', [0.15, 0.4])},
  {what: 'to the window\'s right edge', cell: CLICK_AT('textedit', [0.97, 0.5])},
  {what: 'a drag (selects text)', cell: DRAG('textedit', [0.3, 0.6], [0.7, 0.7])},
  {what: 'a scroll (a glide, no dip)', cell: SCROLL_AT('textedit', [0.5, 0.6])},
  {what: 'three targets in quick succession (retargeting)', cell: [CLICK_AT('textedit', [0.2, 0.35]), CLICK_AT('textedit', [0.8, 0.35]), CLICK_AT('textedit', [0.5, 0.8])]},
]);
// Each move starts from a fresh observation: after a click or drag changed the document, the engine refuses the next
// action until the state is re-read (seen live 2026-10-30).
const moveSteps = session => MOVES.flatMap((move, i) => [{say: `move ${i + 1}: ${move.what}`},
  {run: session, cell: OBSERVE('textedit'), label: 'observe before the move'},
  ...[move.cell].flat().map(cell => ({run: session, cell, label: move.what})), {wait: 1500}]);

// Acceptance 11's side-by-side: the same moves through the engine `engine` (vendor, then cua).
export const sideBySide = engine => [
  {say: `Acceptance 11, the ${engine} engine: the same scripted moves in the TextEdit document, 1.5 s apart`},
  // In front of whatever could cover it (System Settings after item 9, the terminal), so the whole motion is seen.
  {task: 'activate', args: ['textedit']},
  {open: 'a', engine, scenes: ['textedit']},
  ...moveSteps('a'),
  {watch: `the ${engine} cursor's motion through the moves (judged against the other engine's run)`, id: `motion-${engine}`},
  {wait: 6000},
  {close: 'a'},
];

// What the owner does before item 1's recording, and before its check: the rectangle the two windows fill is what the
// kit records (./recording.mjs recordingPlan).
const PLACE_FOR_RECORDING = 'Place the TextEdit and Chrome for Testing windows side by side, touching, with their top and bottom edges level, so that together they fill a rectangle with nothing else in it. Then click the operator\'s terminal so neither is in front; its window must not overlap them. Say done.';
export const RECORDING_CHECK_MS = 3000;

export const PLANS = Object.freeze({
  // Recorded (./recording.mjs): the clip of the two windows' rectangle starts once the owner has placed them and runs
  // until the session has closed. Each click is its cell's last call, so its reply's meta (receipt, round trip) is the
  // click's; its control is read back by the next cell.
  1: ({clip = null} = {}) => [
    {say: 'Acceptance 1: TextEdit and Chrome for Testing both in the background (another app in front), recorded'},
    {owner: PLACE_FOR_RECORDING},
    {task: 'record-start', args: [clip, 'textedit', 'chrome'], required: true},
    {open: 'a', scenes: ['textedit', 'chrome']},
    {run: 'a', cell: ALIGN_CLICK, label: 'TextEdit: the format bar\'s alignment', orderTarget: 'first-target'},
    {run: 'a', cell: ALIGNMENT, label: 'TextEdit: the alignment read back'},
    {watch: 'the cursor fades in at TextEdit\'s alignment button and dips as the click lands; the button changes before or while the cursor arrives', id: 'first-target'},
    {wait: 1500},
    {run: 'a', cell: CLICK_CONTROL_TIMED('sceneOption'), label: 'Chrome for Testing: the page\'s "Scene option" checkbox', orderTarget: 'second-target'},
    {run: 'a', cell: CONTROL_VALUE('sceneOption'), label: 'Chrome for Testing: the checkbox read back'},
    {watch: 'the cursor glides along a curve to the page\'s checkbox and dips; the box checks before or while it arrives', id: 'second-target'},
    {watch: 'from the recording\'s frames: TextEdit\'s alignment changes before or while the cursor shows at it (cursor-sitting.mjs clip order)', id: 'order-first-target'},
    {watch: 'from the recording\'s frames: the checkbox changes before or while the arrow\'s tip reaches it (cursor-sitting.mjs clip order)', id: 'order-second-target'},
    {wait: 6000},
    {close: 'a'},
    {task: 'record-stop'},
  ],
  // The recorder's proof before item 1: a few seconds of the same rectangle, recorded and stopped as item 1 does, with
  // no session and nothing driven, so a recorder that cannot record or does not write its movie is found before item 1
  // relies on it. The operator checks the clip's frames and deletes it (the runbook's step 3).
  '1-check': ({clip = null} = {}) => [
    {say: 'Before item 1: a few seconds\' recording of the harness windows, to prove the recorder'},
    {owner: PLACE_FOR_RECORDING},
    {task: 'record-start', args: [clip, 'textedit', 'chrome'], required: true},
    {wait: RECORDING_CHECK_MS},
    {task: 'record-stop'},
  ],
  2: ({otherSession = null} = {}) => [
    {say: 'Acceptance 2: two sessions acting at once'},
    {open: 'a', scenes: ['textedit', 'chrome']},
    // b: another Claude session's id, for its sminos name; else no session id and no project directory, so its label
    // is this folder's name (the third source).
    {open: 'b', scenes: ['textedit', 'chrome'], env: otherSession ? {CLAUDE_CODE_SESSION_ID: otherSession} : {CLAUDE_CODE_SESSION_ID: null, CLAUDE_PROJECT_DIR: null}},
    {together: [{run: 'a', cell: ALIGN_TOGGLE, label: 'a: TextEdit alignment'}, {run: 'b', cell: CLICK_CONTROL('sceneOption'), label: 'b: the page\'s checkbox'}]},
    {wait: 1200},
    {together: [{run: 'a', cell: CLICK_CONTROL('sceneOption'), label: 'a: the page\'s checkbox'}, {run: 'b', cell: CLICK_AT('textedit', [0.6, 0.7]), label: 'b: TextEdit text'}]},
    {watch: `two cursors, each in its own colour; a's pill reads this session's sminos name, b's ${otherSession ? 'the other session\'s sminos name' : 'the project folder\'s name'}`, id: 'two-cursors'},
    {wait: 6000},
    {close: 'b'},
    {open: 'c', scenes: ['textedit', 'chrome'], env: {CUA_CURSOR_LABEL: 'Research', CUA_CURSOR_COLOR: '#2f6feb'}},
    {together: [{run: 'a', cell: ALIGN_TOGGLE, label: 'a: TextEdit alignment'}, {run: 'c', cell: CLICK_CONTROL('sceneOption'), label: 'c: the page\'s checkbox'}]},
    {watch: 'c\'s pill reads "Research" in blue (#2f6feb); a\'s is unchanged', id: 'maws-label'},
    {wait: 6000},
    {close: 'c'}, {close: 'a'},
  ],
  3: () => [
    {say: 'Acceptance 3: states and timing, in TextEdit (in the background)'},
    {open: 'a', scenes: ['textedit']},
    {run: 'a', cell: ALIGN_TOGGLE, label: 'a click'},
    {watch: 'once it settles the arrow rocks gently (thinking)', id: 'thinking'},
    {wait: 2500},
    {watch: 'about 5 s after the click it fades out over about 0.44 s', id: 'fade'},
    {wait: 4500},
    {run: 'a', cell: ALIGN_TOGGLE, label: 'the next action'},
    {watch: 'it fades back in at the new target (no glide in from where it faded)', id: 'fade-in'},
    {wait: 800},
    {cue: 'Now click once in the TextEdit document text, away from the cursor.', ms: 2500},
    {watch: 'from your click the cursor is half-transparent and still, until it fades at 5 s', id: 'taken-over'},
    ...reobserve('a', 'textedit'),
    {run: 'a', cell: ALIGN_TOGGLE, label: 'the agent acts again'},
    {watch: 'the agent\'s next action shows it at full opacity again', id: 'taken-over-cleared'},
    {wait: 1200},
    {run: 'a', cell: CLICK_AT('textedit', [0.5, 0.7]), label: 'a click, then end_task at once'},
    {endTask: 'a'},
    {watch: 'end_task fades it at once (not 5 s later)', id: 'end-task'},
    {wait: 2000},
    {close: 'a'},
  ],
  4: () => [
    {say: 'Acceptance 4: covered and front'},
    {owner: 'Drag the Chrome for Testing window so that it covers the right half of the TextEdit window, Chrome in front, then say done.'},
    {open: 'a', scenes: ['textedit']},
    // Scrolls, not clicks: a background click on TextEdit's text goes by route 3, which raises TextEdit's window above
    // the covering one (seen live 2026-10-30, with the cursor off too), so a click would uncover what it tests.
    {run: 'a', cell: SCROLL_AT('textedit', [0.1, 0.55]), label: 'left, uncovered (a scroll)'},
    {wait: 1200},
    {run: 'a', cell: SCROLL_AT('textedit', [0.95, 0.6]), label: 'right, under Chrome (a scroll)'},
    {wait: 1200},
    {run: 'a', cell: SCROLL_AT('textedit', [0.1, 0.75]), label: 'back left (a scroll)'},
    {watch: 'wherever the cursor passes under the Chrome window, Chrome\'s window covers it', id: 'covered'},
    {wait: 6000},
    // Neither engine opens a menu from a menu-bar click (MenuRecord.swift), so the person opens it while the cursor shows.
    {task: 'activate', args: ['textedit']},
    {run: 'a', cell: SCROLL_AT('textedit', [0.08, 0.12]), label: 'TextEdit frontmost: the cursor shown at the document\'s top-left, near the menu bar'},
    {cue: 'Now open TextEdit\'s Format menu in the menu bar, and keep it open.', ms: 3000},
    {watch: 'with TextEdit frontmost and its menu open, the cursor shows above the menu', id: 'front-menu'},
    {cue: 'Press Escape to close the menu.', ms: 2500},
    {wait: 4000},
    {close: 'a'},
  ],
  5: () => [
    {say: 'Acceptance 5: never in the way, over the Electron fixture (frontmost, so your click is the only thing that could move the focus)'},
    {task: 'activate', args: ['electron']},
    {wait: 1500},  // the activation settles; each focus reading also waits for the fixture's accessibility (./focus.mjs)
    {task: 'watch-start'},
    {open: 'a', scenes: ['electron']},
    // The focus proof, with no input but the agent's: the system's focused app, its focused window and the focused
    // element (its value's hash, read in the fixture's window) before and after the cursor appears, glides and rests
    // over the fixture, recorded and required equal. The owner's own click comes after, apart from it.
    {task: 'focus', args: ['before the cursor', 'electron']},
    {run: 'a', cell: SCROLL_AT('electron', [0.5, 0.5]), label: 'the cursor appears over the fixture (a scroll: no focus of its own)'},
    {wait: 1500},
    {run: 'a', cell: SCROLL_AT('electron', [0.25, 0.75]), label: 'it glides and rests'},
    {wait: 1500},
    {task: 'focus', args: ['with the cursor shown', 'electron', 'before the cursor']},
    {run: 'a', cell: PRESSED, label: 'the fixture\'s count before'},
    {owner: 'Next the agent presses the fixture\'s button, and you then click the arrow\'s tip where it rests on the button. Keep the pointer off the fixture until the cue, and say go when ready.'},
    {run: 'a', cell: OBSERVE('electron'), label: 'observe before the press'},
    {run: 'a', cell: CLICK_CONTROL_TIMED('fixtureButton'), label: 'the agent presses the button'},
    {cue: 'Click the arrow\'s tip now.', ms: 3000},
    {watch: 'when you clicked, the cursor turned half-transparent', id: 'taken-over'},
    {run: 'a', cell: INTERVENTION_PROBE('electron', [0.5, 0.9]), label: 'the next action, with no observation first (refused when the ledger saw your click on the fixture)'},
    {wait: 5500},
    {run: 'a', cell: PRESSED, label: 'the fixture\'s count after (the agent\'s press and yours)'},
    {wait: 3000},
    {run: 'a', cell: OBSERVE('electron'), label: 'observe before the scroll'},
    {run: 'a', cell: SCROLL_AT('electron', [0.5, 0.5]), label: 'a scroll, so the cursor shows over the fixture'},
    {run: 'a', cell: SHOT('electron'), label: 'the agent\'s screenshot while the cursor shows'},
    {watch: 'the cursor is on screen over the fixture now, and the saved screenshot (the item\'s image file) has no cursor in it', id: 'screenshot'},
    {watch: 'the cursor appears in a screen recording: item 1\'s clip (screencapture -v), seen in its frames', id: 'recording'},
    {task: 'watch-stop'},
    {wait: 5000},
    {close: 'a'},
  ],
  6: () => [
    {say: 'Acceptance 6: attached between actions'},
    {task: 'activate', args: ['textedit']},
    {open: 'a', scenes: ['textedit']},
    {run: 'a', cell: CLICK_AT('textedit', [0.8, 0.5]), label: 'TextEdit frontmost, a point Chrome\'s window covers once it is in front'},
    {cue: 'Click the Chrome for Testing window now.', ms: 2500},
    {watch: 'the cursor drops below Chrome\'s window at once (it does not stay above it until it fades)', id: 'switch-app'},
    {wait: 4000},
    {run: 'a', cell: CLICK_AT('textedit', [0.5, 0.55]), label: 'before the Space switch'},
    {cue: 'Switch to your second Space now.', ms: 1800},
    {watch: 'on the other Space there is no cursor', id: 'space-away'},
    {cue: 'Switch back now.', ms: 1800},
    {watch: 'back on TextEdit\'s Space the cursor shows again (if it had not faded yet)', id: 'space-back'},
    {wait: 4000},
    {run: 'a', cell: CLICK_AT('textedit', [0.45, 0.6]), label: 'before the minimise'},
    {cue: 'Minimise the TextEdit window now, with its yellow button.', ms: 2500},
    {watch: 'the cursor hides within about a quarter second of the window minimising', id: 'minimise'},
    {owner: 'Bring the TextEdit window back from the Dock, then say done.'},
    ...reobserve('a', 'textedit'),
    {run: 'a', cell: CLICK_AT('textedit', [0.5, 0.5]), label: 'before the lock'},
    {owner: 'Lock the screen (Control-Command-Q), unlock it, and say done.'},
    {watch: 'locking hid the cursor, and it did not come back on unlocking', id: 'lock'},
    ...reobserve('a', 'textedit'),
    {run: 'a', cell: CLICK_AT('textedit', [0.55, 0.5]), label: 'after the unlock'},
    {watch: 'the next action shows it again', id: 'after-lock'},
    {wait: 6000},
    {run: 'a', cell: OPEN_MENU('textedit', 'Help'), label: 'TextEdit\'s Help menu, its menu-bar item nearest the camera housing'},
    {watch: 'the cursor is drawn in the menu bar\'s row, at the Help menu (the engine records the click and opens no menu)', id: 'menu-bar-row'},
    // The recorded menu roots every later observation of this connection at the menu (MenuRecord.swift): a new session.
    {close: 'a'},
    {open: 'a', scenes: ['textedit']},
    {owner: 'Put the TextEdit document into full screen with its green button, then say done.'},
    ...reobserve('a', 'textedit'),
    {run: 'a', cell: CLICK_AT('textedit', [0.5, 0.5]), label: 'in full screen'},
    {watch: 'the cursor is drawn over TextEdit\'s full-screen Space', id: 'full-screen'},
    {wait: 6000},
    {owner: 'Leave full screen, then say done.'},
    {close: 'a'},
  ],
  7: () => [
    {say: 'Acceptance 7: typing keeps it alive (TextEdit frontmost)'},
    {task: 'activate', args: ['textedit']},
    {open: 'a', scenes: ['textedit']},
    {run: 'a', cell: CLICK_AT('textedit', [0.5, 0.85]), label: 'the insertion point'},
    {run: 'a', cell: TYPE_RUN('textedit', 300), label: 'the typing rate', keys: 'textedit'},
    {run: 'a', cell: OBSERVE('textedit'), label: 'observe (the engine asks for a fresh state after the document changed)'},
    // A single type_text long enough to run about 7 s at the rate just measured.
    {run: 'a', cell: results => TYPE_RUN('textedit', longTyping(results['the typing rate'])), label: 'one type_text of about 7 s', keys: 'textedit'},
    {watch: 'the cursor stayed visible for the whole typing, past 5 s, and faded only after it ended', id: 'long-typing'},
    {wait: 7000},
    {run: 'a', cell: OBSERVE('textedit'), label: 'observe (the engine asks for a fresh state after the document changed)'},
    {run: 'a', cell: PRESS_KEYS('textedit', 'Right', 1), label: 'press_key after the fade', keys: 'textedit'},
    {watch: 'the press_key brought the cursor back at its last point in TextEdit', id: 'key-after-fade'},
    {wait: 1500},
    {run: 'a', cell: OBSERVE('textedit'), label: 'observe (the engine asks for a fresh state after the document changed)'},
    {run: 'a', cell: CLICK_AT('textedit', [0.5, 0.6]), label: 'a click before the owner takes over'},
    {cue: 'Now click once in the TextEdit document, away from the cursor.', ms: 2000},
    {watch: 'the cursor is half-transparent', id: 'taken-over'},
    {run: 'a', cell: KEY_AFTER_INPUT('textedit', 'Right'), label: 'press_key after the owner took over (the engine may refuse it as still interacting; it still counts)', keys: 'textedit'},
    {watch: 'the press_key cleared the half-transparent state', id: 'key-clears'},
    {wait: 6000},
    {close: 'a'},
  ],
  9: () => [
    {say: 'Acceptance 9: Reduce Motion'},
    {owner: 'Turn Reduce motion on (System Settings, Accessibility, Display), then say done.'},
    {task: 'activate', args: ['textedit']},
    {open: 'a', scenes: ['textedit']},
    ...moveSteps('a'),
    {watch: 'every move is a short straight ease (about 0.15 s) with no squash, tilt, swell or rocking; a click\'s dip is an opacity dip', id: 'reduce-motion'},
    {wait: 6000},
    {close: 'a'},
    {owner: 'Turn Reduce motion off again, then say done.'},
  ],
  10: () => [
    {say: 'Acceptance 10: the off switches'},
    {task: 'engine-json-off'},
    {task: 'engine-stop'},
    {open: 'a', scenes: ['textedit']},
    {run: 'a', cell: ALIGN_TOGGLE, label: 'with "cursor": false in engine.json'},
    {watch: 'no cursor appears', id: 'device-off'},
    {task: 'engine-status', args: ['off']},
    {close: 'a'},
    {task: 'engine-json-restore'},
    {task: 'engine-stop'},
    {open: 'a', scenes: ['textedit']},
    {open: 'b', scenes: ['textedit'], env: {CUA_CURSOR: '0'}},
    {run: 'b', cell: ALIGN_TOGGLE, label: 'b, with CUA_CURSOR=0'},
    {wait: 1500},
    {run: 'a', cell: CLICK_AT('textedit', [0.6, 0.7]), label: 'a, the default'},
    {watch: 'only a\'s cursor appeared; b acted with none', id: 'session-off'},
    {task: 'engine-status', args: ['on']},
    {wait: 6000},
    {close: 'b'}, {close: 'a'},
  ],
  11: ({engine = 'cua'} = {}) => sideBySide(engine),
});

// Characters for a type_text of about 7 s at the rate of `sample` ({ms, chars}), within 1,000–20,000.
export function longTyping(sample) {
  const perChar = sample?.ok !== false && sample?.value?.ms > 0 ? sample.value.ms / sample.value.chars : 1;
  return Math.max(1000, Math.min(20_000, Math.ceil(7000 / perChar)));
}
