// The Chrome scene's page (scripts/repl-parity/scenes-mac.mjs; the own native engine spec, Verification system parts 2, 5
// and 6; moved in M1b from scripts/spike/engine/fixtures/, the spike importing it from here): one static document served
// on 127.0.0.1 at an ephemeral port, answering only `/` and the page's load beacon on its exact Host, under a CSP that
// allows its one inline script and no network beyond that beacon to its own origin. Its content is fixed (no per-run marker), so the two engines' texts of the same state
// can be compared in one sitting. The controls are the finding-elements targets of the scene (PAGE_CONTROLS) and the
// textarea is where the Korean and Unicode matrix types. The page never turns accessibility on itself: the engine's
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

const HEADERS = {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-security-policy': CSP};

// Serves the page; `onReady` is called once, on the page's first load beacon. -> {url, port, close()}.
export async function startScenePage({port = 0, onReady = null} = {}) {
  let expectedHost, reported = false;
  const server = createServer((req, res) => {
    if (req.headers.host !== expectedHost) { res.writeHead(421, {'content-type': 'text/plain'}).end('misdirected\n'); return; }
    if (req.method === 'POST' && req.url === READY_PATH) {
      req.resume();
      res.writeHead(204).end();
      if (!reported) { reported = true; onReady?.(); }
      return;
    }
    if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404, {'content-type': 'text/plain'}).end('not found\n'); return; }
    res.writeHead(200, HEADERS).end(PAGE_HTML);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const bound = server.address().port;
  expectedHost = `127.0.0.1:${bound}`;
  return {url: `http://${expectedHost}/`, port: bound,
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); })};
}
