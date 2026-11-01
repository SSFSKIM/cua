// The Chrome scene's page (scripts/repl-parity/scenes-mac.mjs; the own native engine spec, Verification system parts 2, 5
// and 6; moved in M1b from scripts/spike/engine/fixtures/, the spike importing it from here): one static document served
// on 127.0.0.1 at an ephemeral port, answering only `/` and the page's load beacon on its exact Host, under a CSP that
// allows its one inline script and no network beyond that beacon to its own origin. Its content is fixed (no per-run marker), so the two engines' texts of the same state
// can be compared in one sitting. The controls are the finding-elements targets of the scene (PAGE_CONTROLS) and the
// textarea is where the Korean and Unicode matrix types. A counters variant of the page (COUNTERS_PAGE_HTML, below) adds
// one script and its hash, for #187's live slot. The page never turns accessibility on itself: the engine's
// AXManualAccessibility is what the scene proves. It declares itself untranslatable (`translate="no"` and Google's
// notranslate meta), so Chrome never offers to translate it on a Mac whose language is not English.
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';

export const PAGE_TITLE = 'cua scene page';
// Every control the page puts on screen, as the scene's targets name them: the AX role Chromium gives it and its name.
export const PAGE_CONTROLS = Object.freeze([
  {id: 'heading', role: 'AXHeading', name: PAGE_TITLE},
  {id: 'notes', role: 'AXTextArea', name: 'Scene notes'},
  {id: 'name', role: 'AXTextField', name: 'Scene name'},
  {id: 'apply', role: 'AXButton', name: 'Apply'},
  {id: 'option', role: 'AXCheckBox', name: 'Scene option'},
  {id: 'modeA', role: 'AXRadioButton', name: 'Mode A'},
  {id: 'modeB', role: 'AXRadioButton', name: 'Mode B'},
  {id: 'choice', role: 'AXPopUpButton', name: 'Scene choice'},
  {id: 'section', role: 'AXLink', name: 'Scene section'},
  {id: 'status', role: 'AXGroup', name: 'Scene status'},
].map(Object.freeze));
// The fixed state's values, which the method matrix reads back against.
export const PAGE_INITIAL = Object.freeze({notes: '', name: '', option: false, mode: 'A', choice: 'One', status: 'Ready'});

// Apply writes what it saw into the status line, so a click's outcome is readable from the tree. Once the document has
// loaded (its script has run, so everything the page sets up is in place), the page posts one beacon to its own server
// (READY_PATH), which is how `scenes-mac.mjs up chrome` learns the page is there without a DevTools port: a CDP port
// would be one more endpoint any local process could drive Chrome through, the beacon reaches only the run's own
// loopback server.
export const READY_PATH = '/ready';
export const SCRIPT = "document.getElementById('apply').addEventListener('click', () => { document.getElementById('status').textContent = 'Applied: ' + document.getElementById('name').value; });"
  + ` addEventListener('load', () => navigator.sendBeacon('${READY_PATH}'));`;
const SCRIPT_HASH = createHash('sha256').update(SCRIPT).digest('base64');
export const CSP = `default-src 'none'; script-src 'sha256-${SCRIPT_HASH}'; style-src 'none'; img-src 'none'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`;

export const PAGE_HTML = `<!doctype html>
<html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>${PAGE_TITLE}</title></head>
<body><main>
<h1>${PAGE_TITLE}</h1>
<p><textarea id="notes" aria-label="Scene notes" rows="8" cols="60" autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea></p>
<p><input id="name" type="text" aria-label="Scene name" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
<button id="apply" type="button">Apply</button></p>
<p><label><input id="option" type="checkbox"> Scene option</label></p>
<fieldset><legend>Mode</legend>
<label><input id="modeA" type="radio" name="mode" value="A" checked> Mode A</label>
<label><input id="modeB" type="radio" name="mode" value="B"> Mode B</label></fieldset>
<p><select id="choice" aria-label="Scene choice"><option>One</option><option>Two</option><option>Three</option></select></p>
<p><a id="section-link" href="#section">Scene section</a></p>
<p id="status" role="status" aria-label="Scene status">${PAGE_INITIAL.status}</p>
<section id="section"><h2>Section</h2></section>
</main><script>${SCRIPT}</script></body></html>
`;

const headersFor = csp => ({'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-security-policy': csp});

// The counters page (#187's live slot, `scenes-mac.mjs up chrome --page counters`): the shared page's DOM unchanged,
// plus a second script that counts the window's focus and blur (its own, not an element's reaching it), the textarea's
// focus and blur, and document-level mousedown and click in the capture phase (a click the page takes from an
// activation click outside the window's frame shows here, whatever stops it later), and beacons those counts with the
// textarea's LENGTH, never its value, and the document's hasFocus() (the re-slot's key-window reading: every change of
// it comes with a window focus or blur, which beacons, so the latest beacon's is the page's now), to its own server's
// COUNTERS_PATH, at every counted event and every input. Its CSP
// is the shared one with only this script's hash added. The shared page stays byte-identical: every record so far was
// taken on it.
export const PAGE_VARIANTS = Object.freeze(['shared', 'counters']);
export const COUNTERS_PATH = '/counters';
export const COUNTER_NAMES = Object.freeze(['windowFocus', 'windowBlur', 'textFocus', 'textBlur', 'mousedown', 'click']);
export const COUNTERS_SCRIPT = "(() => { const c = {windowFocus: 0, windowBlur: 0, textFocus: 0, textBlur: 0, mousedown: 0, click: 0}; let seq = 0;"
  + " const notes = document.getElementById('notes');"
  + ` const send = () => { seq += 1; navigator.sendBeacon('${COUNTERS_PATH}', JSON.stringify({seq, counts: c, length: notes.value.length, focused: document.hasFocus()})); };`
  + " const count = name => () => { c[name] += 1; send(); };"
  + " window.addEventListener('focus', e => { if (e.target === window) count('windowFocus')(); });"
  + " window.addEventListener('blur', e => { if (e.target === window) count('windowBlur')(); });"
  + " notes.addEventListener('focus', count('textFocus')); notes.addEventListener('blur', count('textBlur'));"
  + " document.addEventListener('mousedown', count('mousedown'), true); document.addEventListener('click', count('click'), true);"
  + " notes.addEventListener('input', send); window.addEventListener('load', send); })();";
const COUNTERS_HASH = createHash('sha256').update(COUNTERS_SCRIPT).digest('base64');
export const COUNTERS_CSP = CSP.replace(`script-src 'sha256-${SCRIPT_HASH}'`, `script-src 'sha256-${SCRIPT_HASH}' 'sha256-${COUNTERS_HASH}'`);
export const COUNTERS_PAGE_HTML = PAGE_HTML.replace(`<script>${SCRIPT}</script>`, `<script>${SCRIPT}</script><script>${COUNTERS_SCRIPT}</script>`);
// The largest beacon body the server reads; the page's is under 200 bytes.
const COUNTERS_BODY_MAX = 4096;

// What the server keeps of a counters beacon: its sequence, the textarea's length and each count, every one a
// non-negative whole number, and whether the document had the focus (a boolean); anything else in the body is dropped.
// -> {seq, length, counts, focused} or null.
export function countersRecord(text) {
  let body;
  try { body = JSON.parse(text); } catch { return null; }
  const whole = v => (Number.isSafeInteger(v) && v >= 0 ? v : null);
  const seq = whole(body?.seq), length = whole(body?.length), focused = typeof body?.focused === 'boolean' ? body.focused : null;
  const counts = Object.fromEntries(COUNTER_NAMES.map(name => [name, whole(body?.counts?.[name])]));
  if (seq === null || length === null || focused === null || Object.values(counts).includes(null)) return null;
  return {seq, length, counts, focused};
}

// Serves the page (`page`: one of PAGE_VARIANTS); `onReady` is called once, on the page's first load beacon, and
// `onCounters` with each counters beacon's record (the counters page only). -> {url, port, close()}.
export async function startScenePage({port = 0, onReady = null, page = 'shared', onCounters = null} = {}) {
  if (!PAGE_VARIANTS.includes(page)) throw new Error(`the page variant is ${PAGE_VARIANTS.join(' or ')}, not ${page}`);
  const counters = page === 'counters', html = counters ? COUNTERS_PAGE_HTML : PAGE_HTML, headers = headersFor(counters ? COUNTERS_CSP : CSP);
  let expectedHost, reported = false;
  const server = createServer((req, res) => {
    if (req.headers.host !== expectedHost) { res.writeHead(421, {'content-type': 'text/plain'}).end('misdirected\n'); return; }
    if (req.method === 'POST' && req.url === READY_PATH) {
      req.resume();
      res.writeHead(204).end();
      if (!reported) { reported = true; onReady?.(); }
      return;
    }
    if (counters && req.method === 'POST' && req.url === COUNTERS_PATH) {
      let text = '', over = false;
      req.setEncoding('utf8');
      req.on('data', chunk => { if (over) return; text += chunk; if (text.length > COUNTERS_BODY_MAX) { over = true; text = ''; } });
      req.on('end', () => {
        res.writeHead(204).end();
        const record = over ? null : countersRecord(text);
        if (record) onCounters?.(record);
      });
      return;
    }
    if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404, {'content-type': 'text/plain'}).end('not found\n'); return; }
    res.writeHead(200, headers).end(html);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const bound = server.address().port;
  expectedHost = `127.0.0.1:${bound}`;
  return {url: `http://${expectedHost}/`, port: bound,
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); })};
}
