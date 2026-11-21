// The documents that teach a Linux computer surface quote what it answers: cua's Linux document
// (docs/cua-api/linux-engine.md, read by the model after core.md; the #171 spec's Decision Log, M5 pre-flight, F4) and
// the README's Linux part, for a person. Every sentence they quote is the engine's, the service's or the facade's own
// text, so a reworded answer fails here instead of leaving a document that names a sentence nobody sends. The README's
// Chromium menu line is the engine README's, word for word. The Linux document is served under either engine, so it
// describes answers, never which engine gives them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
// Prose wraps where it likes: compare with every run of whitespace as one space.
const flat = text => text.replace(/\s+/g, ' ');
// A Rust string's line continuation (a backslash ending the line, and the next line's indentation) is no text.
const source = path => flat(file(path).replace(/\\\n\s*/g, ''));

const LINUX_DOCUMENT = 'docs/cua-api/linux-engine.md';
const README = 'README.md';

// [the text as the documents quote it, which documents, the file that answers it, the text there]
const QUOTED = [
  ['<App> does not accept background input; use a dedicated desktop or activate the window first', [LINUX_DOCUMENT, README],
    'native/linux-engine/src/engine/way.rs', '{app} does not accept background input; use a dedicated desktop or activate the window first'],
  ['Window <id> is minimized; activate it first', [LINUX_DOCUMENT, README], 'native/linux-engine/src/engine.rs', 'Window {window} is minimized; activate it first'],
  ['Screenshot unavailable for window <id>.', [LINUX_DOCUMENT], 'src/cua-api/bind-linux-app.mjs', 'Screenshot unavailable for window ${window.id}.'],
  ['Window <id> matches several accessibility windows; close or retitle the duplicates', [LINUX_DOCUMENT, README],
    'native/linux-engine/src/identity.rs', 'Window {window} matches several accessibility windows; close or retitle the duplicates'],
  ['Paste was sent once and could not be confirmed; read the field before retrying', [LINUX_DOCUMENT],
    'native/linux-engine/src/paste.rs', 'Paste was sent once and could not be confirmed; read the field before retrying'],
  ['nothing was sent', [LINUX_DOCUMENT], 'native/linux-engine/src/paste.rs', 'requested field or selection changed before dispatch; nothing was sent'],
  ['a focusing click already reached the window', [LINUX_DOCUMENT], 'native/linux-engine/src/paste.rs',
    'no paste was dispatched, but a focusing click already reached the window, so read the window before retrying'],
  // The engine's own test spells the wait out (`copy::MENU_WAIT`, 1 s), as the answer renders it.
  ['showContextMenu was sent and no menu was seen within 1 s; the application may have shown its own menu or ignored the request; read the window before retrying',
    [LINUX_DOCUMENT, README], 'native/linux-engine/src/engine/elements.rs',
    'showContextMenu was sent and no menu was seen within 1 s; the application may have shown its own menu or ignored the request; read the window before retrying'],
  ['<App> began a drag and drop, which changes the desktop', [LINUX_DOCUMENT], 'native/linux-engine/src/dnd.rs',
    '{app} began a drag and drop, which changes the desktop; it was cancelled before the drop, so nothing was dropped.'],
  ['Pending from your last drag,', [LINUX_DOCUMENT], 'native/linux-engine/src/dnd.rs',
    'Pending from your last drag, {}. Read the window before sending input again: your next input request will not be run'],
  // The cause a late take answers (the after-release watch, 700 ms since 0.4.2; #171 M5, ruling 888.3).
  ['a late drag and drop:', [LINUX_DOCUMENT], 'native/linux-engine/src/dnd.rs',
    'a late drag and drop: {app} started a drag and drop after your drag into it ended, so the drag did not end as it answered'],
  // An Electron drop whose application did not answer the engine's syncs before the release (#171 M5, ruling 827).
  ['did not answer in time for its drop to be confirmed', [LINUX_DOCUMENT], 'native/linux-engine/src/dnd.rs',
    'an unconfirmed drop: your drag into {app} began a drag and drop, and {app} did not answer in time for its drop to be confirmed, so the drop may not have landed as the drag answered'],
  // The notice a Chrome or Chromium drag answers when its hold, extended for a busy browser, saw no drag and drop start
  // (#171 M5, rulings 897 and 900).
  ['the page may have started a drag that did not complete', [LINUX_DOCUMENT, README], 'native/linux-engine/src/adaptive_hold.rs',
    'pub const NOTICE: &str = "the page may have started a drag that did not complete";'],
  ['Accessibility tree truncated: at least <n> elements not shown (<reason>)', [LINUX_DOCUMENT, README], 'src/cua-api/bind-linux-app.mjs',
    'Accessibility tree truncated: at least ${total} elements not shown (${reason})'],
  ['clipboard update timed out', [README], 'native/linux-engine/src/copy.rs', 'CopyRoute::Text => "clipboard update timed out",'],
  ['cua-engine <found> is older than 0.4.2, which this cua needs; run cua install --engine', [README], 'src/services/engine/linux/client.mjs',
    'cua-engine ${found} is older than ${MIN_ENGINE_VERSION}, which this cua needs; ${REMEDY}'],
];

test('every answer the Linux documents quote is the text that answers it', () => {
  for (const [quoted, documents, path, said] of QUOTED) {
    assert.ok(source(path).includes(flat(said)), `${path} no longer says: ${said}`);
    for (const document of documents) assert.ok(flat(file(document)).includes(flat(quoted)), `${document} does not quote: ${quoted}`);
  }
  // The version the README names is the one the service requires.
  assert.match(file('src/services/engine/linux/client.mjs'), /export const MIN_ENGINE_VERSION = '0\.4\.2'/);
});

// The behaviour the documents narrow their promises to, where the engine decides it (the T8 review's fix wave 1):
// [the claim, which documents make it (a phrase they must carry), the file, the code that makes it true].
const CLAIMS = [
  ['only an element\'s showContextMenu action checks for a menu', [[LINUX_DOCUMENT, 'Only a request that runs an element\'s `showContextMenu` action checks for the menu'],
    [README, 'Only an element\'s `showContextMenu` accessibility action checks for the menu']],
  'native/linux-engine/src/engine/elements.rs', 'if !name.eq_ignore_ascii_case("showcontextmenu") { return act(t)?.map_err(anyhow::Error::msg); }'],
  ['a right click with no visible point falls back to showContextMenu', [[LINUX_DOCUMENT, 'a right click on an element with no visible point runs it'],
    [README, 'the fallback of a right click on an element with no visible point']],
  'native/linux-engine/src/engine/elements.rs', 'Err(RightClick::Point(error)) => { // The fallback: exactly one action named showContextMenu'],
  ['a right click at a visible point is button 3, unchecked', [[LINUX_DOCUMENT, 'a right click at an element\'s visible point answers once it is sent'],
    [README, 'a button-3 click that answers once it is released, with no menu check']],
  'native/linux-engine/src/engine/elements.rs', 'route.press(x, 3, pressing)?; std::thread::sleep(CLICK_HOLD); route.release_button(x, 3)'],
  ['the drop guard: shared mode, a family whose drop changes the desktop, unless in front', [[README, 'unless the window is already active, focused and fully unobscured']],
    'native/linux-engine/src/engine/pointer.rs',
    'if self.cfg.desktop == DesktopMode::Shared && self.family_of(window).is_some_and(|f| f.drop_changes_desktop) => { let standing = self.x.standing(window); let in_front = standing.active && standing.focused && self.x.unobscured(window);'],
  ['Qt ignores the background wheel always', [[README, 'Qt** ignores synthetic wheel events in the background']], 'native/linux-engine/src/families.rs',
    'name: "Qt", toolkit: Some("Qt"), toolkit_major: None, classes: &[], drag: DragPacing::NONE, paste: DEFAULT_PASTE, ignores: &[Ignored { kind: Kind::Scroll, when: When::Always, }],'],
];

test('every behaviour the Linux documents narrow a promise to is the engine\'s', () => {
  for (const [claim, documents, path, code] of CLAIMS) {
    assert.ok(source(path).includes(flat(code)), `${path} no longer does it: ${claim}`);
    for (const [document, phrase] of documents) assert.ok(flat(file(document)).includes(flat(phrase)), `${document} does not say: ${phrase}`);
  }
  // Chrome is the one family whose drop changes the desktop, so Electron's and Firefox's drags are never guarded.
  assert.equal(file('native/linux-engine/src/families.rs').match(/drop_changes_desktop: true/g).length, 1);
  assert.match(flat(file('native/linux-engine/src/families.rs')), /name: "Chrome",(?:(?!name: ")[^])*drop_changes_desktop: true/, 'and it is Chrome\'s entry');
});

// How long a Chromium-family source's drag holds its button for the page's drag and drop (#171 M5, ruling 888.1): B,
// the engine's one line, which the design session sets, counted from the press; and how long after the release the
// engine watches for a late drag and drop (ruling 888.3). The documents name both in milliseconds.
test('the documents name the hold of a drag from a Chromium window and its late-take watch as the engine\'s bounds', () => {
  const dnd = file('native/linux-engine/src/dnd.rs');
  const bound = /pub const TAKE_HOLD_AFTER_PRESS: Duration = Duration::from_millis\((\d+)\);/.exec(dnd);
  assert.ok(bound, 'dnd.rs names TAKE_HOLD_AFTER_PRESS in milliseconds');
  const watch = /pub const LATE_TAKE_WATCH: Duration = Duration::from_millis\((\d+)\);/.exec(dnd);
  assert.ok(watch, 'dnd.rs names LATE_TAKE_WATCH in milliseconds');
  // the extended hold for a busy Chrome or Chromium browser (adaptive_hold.rs; rulings 897 and 900)
  const extended = /pub const EXTENDED_HOLD_AFTER_PRESS: Duration = Duration::from_millis\((\d+)\);/.exec(file('native/linux-engine/src/adaptive_hold.rs'));
  assert.ok(extended, 'adaptive_hold.rs names EXTENDED_HOLD_AFTER_PRESS in milliseconds');
  for (const [document, phrase] of [
    [LINUX_DOCUMENT, `the mouse button is not released until ${bound[1]} ms after its press, however short the path`],
    [LINUX_DOCUMENT, `So a short drag there takes about ${bound[1]} ms.`],
    [LINUX_DOCUMENT, `If Chrome or Chromium is still busy at ${bound[1]} ms`],
    [LINUX_DOCUMENT, `the button stays down for up to ${extended[1]} ms after the press`],
    [LINUX_DOCUMENT, `takes longer than about ${bound[1]} ms to start its drag can still lose it`],
    [LINUX_DOCUMENT, `while it still watches, for ${watch[1]} ms after the release`],
    [README, `keeps its button down until ${bound[1]} ms after its press, however short its path`],
    [README, `up to ${extended[1]} ms after the press`],
    [README, `takes longer than about ${bound[1]} ms to start its drag can still lose it`],
    [README, `within ${watch[1]} ms after the drag's release`],
  ]) assert.ok(flat(file(document)).includes(flat(phrase)), `${document} does not say: ${phrase}`);
});

// The tail of a Chrome drop whose path outlasts the floor after its take (#171 M5, #459; rulings 995 and 997): the floor,
// the tail's rest and its visits are the engine's constants, and the documents name them, with the rest's sum as its
// cost.
test('the documents name the tail of a long Chrome drag and drop by the engine\'s constants', () => {
  const floor = /pub const RELEASE_AFTER_TAKE: Duration = Duration::from_millis\((\d+)\);/.exec(file('native/linux-engine/src/dnd.rs'));
  assert.ok(floor, 'dnd.rs names RELEASE_AFTER_TAKE in milliseconds');
  const sync = file('native/linux-engine/src/release_sync.rs');
  const rest = /pub const TAIL_REST: Duration = Duration::from_millis\((\d+)\);/.exec(sync);
  assert.ok(rest, 'release_sync.rs names TAIL_REST in milliseconds');
  assert.match(sync, /pub const TAIL_VISITS: u32 = 2;/, 'the documents say "twice more"');
  // the rests before each visit and before the release: about 25 ms in all
  assert.equal(Number(rest[1]) * 3, 24);
  assert.match(sync, /pub const UNCONFIRM_OUTLASTED: bool = false;/, 'option (c) is off as it ships (ruling 997), so no document promises its notice');
  for (const [document, phrase] of [
    [LINUX_DOCUMENT, `whose path goes on for more than about ${floor[1]} ms after the page starts it ends with a short rest`],
    [LINUX_DOCUMENT, `is moved there twice more, ${rest[1]} ms apart, before the button goes up, which makes such a drag about 25 ms longer`],
    [LINUX_DOCUMENT, 'The rest makes that rare, not impossible: when it matters where a long drag dropped, read the page after it.'],
    [README, `whose path goes on past ${floor[1]} ms after its take ends with a rest of about 25 ms on its last point, moved there twice more`],
  ]) assert.ok(flat(file(document)).includes(flat(phrase)), `${document} does not say: ${phrase}`);
});

test('the README\'s Chromium menu line is the engine README\'s, word for word', () => {
  const engine = flat(file('native/linux-engine/README.md'));
  const start = engine.indexOf('In Chromium, a context menu requested on a window that is not focused');
  const end = engine.indexOf('for copy and paste.', start) + 'for copy and paste.'.length;
  assert.ok(start >= 0 && end > start, 'the engine README still has its Chromium menu line');
  assert.ok(flat(file(README)).includes(engine.slice(start, end)), engine.slice(start, end));
});

test('the Linux document describes answers, not which engine gives them', () => {
  const text = file(LINUX_DOCUMENT);
  assert.doesNotMatch(text, /cua-engine|sky_linux|\bvendor\b|cua's (own )?engine|\bSky\b/i);
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), 'one final newline, as the other documents');
});
