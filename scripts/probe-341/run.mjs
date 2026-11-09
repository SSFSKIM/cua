// #341's hosted probe: a click into a scrolled textarea of a background browser page behind a frontmost TextEdit, the
// caret's offset against the offset the unfocused character boxes put under the screenshot's point, the textarea's
// scrollTop through the focus and the caret's write, and where a typed marker lands; per candidate direction of the fix
// (read the boxes before focus; compute from the scroll's Δ; restore the scroll), its offset and cost.
//
// The page: six textareas of 40-character lines (`line NNN abc…`, 41 characters a line with its break), each three lines
// high: top (75 lines, not scrolled), mid (75, scrolled by script to line 32, overflow hidden as #290's), mida (the same
// with overflow auto), end (75, scrolled to the bottom), huge (500 lines, 20,499 characters, scrolled to line 230: the
// point inside the 10,000 characters Chromium's AXValue gives) and wheel (75, overflow auto, scrolled by a scroll-wheel
// CGEvent the kit posts over it). Each field's target point is the third fully shown line at column 14.3; its expected
// offset is that line's start + 14. Beacons carry every scroll of every field (with its time), focus changes, selection
// changes, each field's selection, scrollTop and where the marker is.
//
// Kinds (each a fresh browser per session; a late session runs its kind on every field in turn, a fresh one on one
// field 0.1 s after the first observation):
//   engine        main's engine's coordinate click (`click {pid, x, y}`), then type_text of the marker
//   token         Safari: main's engine's element click by token on the field (#313's caret write), then the marker
//   focusFirst    raw: boxes read before focus (candidate 1), the reference box, AXFocused, the poll, the boxes after
//                 focus (the engine's present answer), Δ (candidate 2), AXSelectedTextRange {pre, 0}; then the marker
//   selectFirst   raw: AXSelectedTextRange {pre, 0} before any focus, then AXFocused; then the marker
//   restore       raw: AXFocused, then AXSelectedTextRange at the first character shown before focus, AXScrollToVisible,
//                 then {pre, 0} (candidate 3's means); then the marker
//   visibleFirst  raw: AXSelectedTextRange at the first shown character before focus, AXFocused, the boxes after focus,
//                 {post, 0}; then the marker
//   press         raw (Safari, Firefox): AXPress, the poll, the boxes after, {pre, 0}; then the marker
//
//   node scripts/probe-341/run.mjs --browser chrome|safari|firefox --timing late|fresh --engine <bin> --ax <bin> --out <dir>
//        [--kinds a,b] [--fields a,b] [--repeat N] [--label main|branch]   (#341 A/B: the engine's side, logged and in config)
//
// Runs only on a GitHub-hosted runner: it launches and kills its own browser and TextEdit and moves TextEdit's window.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-341: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), AX = arg('ax'), BROWSER = arg('browser') ?? 'chrome', TIMING = arg('timing') ?? 'late';
if (!OUT || !ENGINE || !AX) { console.error('usage: run.mjs --browser <b> --timing <late|fresh> --engine <bin> --ax <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const REP = Number(process.env.P341_REP ?? 1);
const REPEAT = Math.max(1, Number(arg('repeat') ?? 3));
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const FIREFOX = '/Applications/Firefox.app/Contents/MacOS/firefox';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-341:', ...a);
const MARK = 'QZ';
const FRAME = {x: 400, y: 25, w: 620, h: 735};

const DEFAULT_KINDS = {chrome: ['engine', 'focusFirst', 'selectFirst', 'restore', 'visibleFirst'], safari: ['engine', 'token', 'focusFirst', 'selectFirst', 'press'],
  firefox: ['engine', 'press', 'selectFirst', 'focusFirst']};
const KINDS = arg('kinds') ? arg('kinds').split(',') : TIMING === 'fresh' ? ['engine', 'focusFirst', 'selectFirst'] : DEFAULT_KINDS[BROWSER];
const ALL_FIELDS = ['top', 'mid', 'mida', 'end', 'huge', 'wheel'];
const FIELDS = arg('fields') ? arg('fields').split(',') : ALL_FIELDS;

const longLine = i => (`line ${String(i).padStart(3, '0')} ` + 'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(2)).slice(0, 40);
const text = n => Array.from({length: n}, (_, i) => longLine(i)).join('\n');
const SPEC = {top: {n: 75, s: 0, ov: 'hidden'}, mid: {n: 75, s: 640, ov: 'hidden'}, mida: {n: 75, s: 640, ov: 'auto'},
  end: {n: 75, s: 1e6, ov: 'hidden'}, huge: {n: 500, s: 4600, ov: 'hidden'}, wheel: {n: 75, s: 0, ov: 'auto'}};
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe341 page</title>
<style>body{margin:2px;font:10px sans-serif}p{margin:0}textarea{font:16px/20px Menlo,monospace;padding:4px 6px;border:1px solid #888;margin:3px 0;display:block;letter-spacing:0;width:460px;height:60px;resize:none;white-space:pre}</style></head>
<body><p><b>probe341 page</b></p>
${ALL_FIELDS.map(f => `<textarea id="ta-${f}" aria-label="Probe ${f} notes" spellcheck="false" wrap="off" style="overflow:${SPEC[f].ov}">${text(SPEC[f].n)}</textarea>`).join('\n')}
<script>(() => {
const FIELDS = ${JSON.stringify(ALL_FIELDS)}, INIT = ${JSON.stringify(Object.fromEntries(ALL_FIELDS.map(f => [f, SPEC[f].s])))};
const load = Math.random().toString(36).slice(2, 10);
const T = Object.fromEntries(FIELDS.map(f => [f, document.getElementById('ta-' + f)]));
const c = {pointerdown: 0, mousedown: 0, click: 0, keydown: 0, input: 0, focusin: 0, selectionchange: 0, scroll: 0};
let seq = 0;
const fieldOf = el => el && el.id && el.id.startsWith('ta-') ? el.id.slice(3) : null;
const state = (ev, extra) => ({load, seq: ++seq, t: Date.now(), ev, ...extra, counts: {...c},
  active: fieldOf(document.activeElement) || (document.activeElement ? document.activeElement.tagName : null), hasFocus: document.hasFocus(),
  sel: Object.fromEntries(FIELDS.map(f => [f, [T[f].selectionStart, T[f].selectionEnd]])),
  scroll: Object.fromEntries(FIELDS.map(f => [f, T[f].scrollTop])), scrollY,
  mark: Object.fromEntries(FIELDS.map(f => [f, T[f].value.indexOf('QZ')])),
  lengths: Object.fromEntries(FIELDS.map(f => [f, T[f].value.length]))});
const send = (ev, extra) => navigator.sendBeacon('/b', JSON.stringify(state(ev, extra)));
const layout = () => {
  const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '16px Menlo, monospace';
  const cw = ctx.measureText('MMMMMMMMMM').width / 10;
  const fields = {};
  for (const f of FIELDS) {
    const el = T[f], s = getComputedStyle(el), r = el.getBoundingClientRect();
    const bl = parseFloat(s.borderLeftWidth), bt = parseFloat(s.borderTopWidth), pl = parseFloat(s.paddingLeft), pt = parseFloat(s.paddingTop), lh = parseFloat(s.lineHeight);
    const st = el.scrollTop;
    // The content's top at scroll 0 is the padding's inner edge; line k's top is that + k*lh - scrollTop.
    const top0 = r.top + bt + pt;
    const firstFull = Math.ceil((st - pt) / lh) < 0 ? 0 : Math.ceil(Math.max(0, st - pt) / lh);
    const line = firstFull + 2;
    const y = top0 + line * lh - st + lh / 2, x = r.left + bl + pl + 14.3 * cw;
    fields[f] = {rect: {x: r.left, y: r.top, w: r.width, h: r.height}, scrollTop: st, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      line, p: {x, y}, expect: el.value.split('\\n').slice(0, line).reduce((a, l) => a + l.length + 1, 0) + 14, length: el.value.length};
  }
  return {t: Date.now(), scrollY, cw, screenX, screenY, outerWidth, outerHeight, innerWidth, innerHeight, dpr: devicePixelRatio, fields};
};
const sendLayout = () => navigator.sendBeacon('/layout', JSON.stringify(layout()));
let layoutTimer = null;
for (const f of FIELDS) T[f].addEventListener('scroll', () => { c.scroll += 1; send('scroll', {field: f, top: T[f].scrollTop}); clearTimeout(layoutTimer); layoutTimer = setTimeout(sendLayout, 120); });
// The page itself fits the viewport and should never scroll; if it does, the layout is sent again.
addEventListener('scroll', () => { send('docscroll', {top: scrollY}); clearTimeout(layoutTimer); layoutTimer = setTimeout(sendLayout, 120); });
for (const k of ['pointerdown', 'mousedown', 'click', 'keydown', 'input'])
  document.addEventListener(k, e => { c[k] += 1; send(k, {trusted: e.isTrusted, target: fieldOf(e.target) || e.target.tagName}); }, true);
document.addEventListener('focusin', e => { c.focusin += 1; send('focusin', {target: fieldOf(e.target) || e.target.tagName}); }, true);
document.addEventListener('selectionchange', () => { c.selectionchange += 1; send('selectionchange'); }, true);
addEventListener('load', () => {
  for (const f of FIELDS) T[f].scrollTop = INIT[f];
  document.fonts.ready.then(() => { sendLayout(); send('load'); });
  setInterval(() => send('tick'), 250);
  // A scroll the scroll event misses (none expected): every 4 ms, each field's scrollTop against the last seen.
  const seen = Object.fromEntries(FIELDS.map(f => [f, T[f].scrollTop]));
  setInterval(() => { for (const f of FIELDS) if (T[f].scrollTop !== seen[f]) { seen[f] = T[f].scrollTop; send('scrollpoll', {field: f, top: seen[f]}); } }, 4);
}); })();</script></body></html>`;

let beacons = [], layoutData = null, layoutAt = 0;
const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 262144) req.destroy(); });
  req.on('end', () => {
    const arrive = Date.now();
    try {
      if (req.url === '/layout') { layoutData = JSON.parse(body); layoutAt = arrive; }
      if (req.url === '/b') beacons.push({arrive, ...JSON.parse(body)});
    } catch {}
    res.writeHead(204); res.end();
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

class Wire {
  static connect(path) {
    return new Promise((resolve, reject) => {
      const s = createConnection(path);
      s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); });
      s.once('error', reject);
    });
  }
  constructor(s) {
    this.s = s; this.buf = Buffer.alloc(0); this.pending = new Map(); this.id = 1;
    s.on('data', d => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.buf.length >= 4) {
        const n = this.buf.readUInt32LE(0);
        if (this.buf.length < 4 + n) break;
        const msg = JSON.parse(this.buf.subarray(4, 4 + n).toString('utf8'));
        this.buf = this.buf.subarray(4 + n);
        this.pending.get(msg.id)?.(msg); this.pending.delete(msg.id);
      }
    });
    s.on('error', () => {});
  }
  call(method, params = {}, timeout = 90_000) {
    const id = this.id++;
    const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params}), 'utf8');
    const head = Buffer.alloc(4); head.writeUInt32LE(bytes.length, 0);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer in ${timeout} ms`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(Buffer.concat([head, bytes]));
    });
  }
  execute(method, args, extra = {}) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 80_000, ...extra}); }
  close() { this.s.destroy(); }
}

const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const ax = args => new Promise(resolve => {
  const child = spawn(AX, args, {stdio: ['ignore', 'pipe', 'pipe']});
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err += d; });
  child.on('close', code => { try { resolve(JSON.parse(out)); } catch { resolve({status: code, out: out.slice(0, 500), err: err.slice(0, 500)}); } });
});
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  const info = sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out;
  return (info.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || info || null;
};
const lean = response => JSON.parse(JSON.stringify(response, (k, v) => (k === 'nodes' || k === 'menuBar' ? `[${Array.isArray(v) ? v.length : '?'} omitted]` : v)));
const latest = () => beacons[beacons.length - 1] ?? null;
const fileName = label => label.replace(/[^a-z0-9-]+/gi, '_');
const alive = pid => sh('kill', ['-0', String(pid)]).status === 0;

const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each click.\n');

function firefoxProfile(dir) {
  mkdirSync(dir, {recursive: true});
  const prefs = {
    'browser.shell.checkDefaultBrowser': false, 'browser.aboutwelcome.enabled': false, 'browser.startup.homepage_override.mstone': 'ignore',
    'startup.homepage_welcome_url': '', 'startup.homepage_welcome_url.additional': '', 'browser.startup.firstrunSkipsHomepage': true,
    'datareporting.policy.dataSubmissionEnabled': false, 'datareporting.policy.firstRunURL': '', 'toolkit.telemetry.reportingpolicy.firstRun': false,
    'app.update.disabledForTesting': true, 'app.update.auto': false, 'browser.sessionstore.resume_from_crash': false, 'browser.tabs.warnOnClose': false,
    'browser.warnOnQuit': false, 'browser.translations.automaticallyPopup': false, 'browser.translations.enable': false,
    'browser.newtabpage.enabled': false, 'extensions.autoDisableScopes': 15, 'browser.discovery.enabled': false,
    'browser.uitour.enabled': false, 'browser.messaging-system.whatsNewPanel.enabled': false, 'browser.vpn_promo.enabled': false,
    'toolkit.startup.max_resumed_crashes': -1, 'browser.toolbars.bookmarks.visibility': 'never',
    'browser.startup.upgradeDialog.enabled': false, 'browser.startup.page': 0, 'browser.startup.homepage': 'about:blank',
    'trailhead.firstrun.didSeeAboutWelcome': true, 'browser.privacySegmentation.preferences.show': false, 'browser.rights.3.shown': true,
    'browser.contentblocking.introCount': 99, 'browser.download.panel.shown': true, 'browser.migrate.content-modal.enabled': false,
    'browser.tabs.firefox-view': false, 'sidebar.revamp': false, 'browser.ml.chat.enabled': false, 'browser.urlbar.quicksuggest.enabled': false,
    'browser.preonboarding.enabled': false, 'termsofuse.bypassNotification': true, 'termsofuse.acceptedVersion': 999,
    'termsofuse.acceptedDate': String(Date.now()), 'datareporting.policy.dataSubmissionPolicyBypassNotification': true,
    'datareporting.policy.dataSubmissionPolicyAcceptedVersion': 999, 'datareporting.policy.dataSubmissionPolicyNotifiedTime': String(Date.now()),
  };
  writeFileSync(join(dir, 'user.js'), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n') + '\n');
}
const placePid = (pid, {x, y, w, h}) => osa(`tell application "System Events"\ntell (first process whose unix id is ${pid})\nset position of window 1 to {${x}, ${y}}\nset size of window 1 to {${w}, ${h}}\nend tell\nend tell`).status;

// The browser at the page, its window at FRAME; answers a child-like {pid, exitCode, kill, launchedAt}.
async function launchBrowser(label) {
  beacons = []; layoutData = null;
  let child;
  if (BROWSER === 'chrome') {
    child = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',
      '--disable-search-engine-choice-screen', `--window-position=${FRAME.x},${FRAME.y}`, `--window-size=${FRAME.w},${FRAME.h}`, URL_], {stdio: 'ignore'});
    child.launchedAt = Date.now();
  } else if (BROWSER === 'safari') {
    sh('pkill', ['-x', 'Safari']);
    for (let i = 0; i < 20 && sh('pgrep', ['-x', 'Safari']).status === 0; i++) await sleep(250);
    const launchedAt = Date.now();
    sh('open', ['-a', 'Safari', URL_]);
    let pid = null;
    for (let i = 0; i < 80 && !pid; i++) { await sleep(250); pid = Number(sh('pgrep', ['-x', 'Safari']).out.split('\n')[0]) || null; }
    if (!pid) throw new Error('Safari did not start');
    for (let i = 0; i < 20 && placePid(pid, FRAME) !== 0; i++) await sleep(250);
    child = {pid, launchedAt, kill: () => { sh('pkill', ['-x', 'Safari']); }};
    Object.defineProperty(child, 'exitCode', {get: () => (alive(pid) ? null : 0)});
  } else {
    const dir = join(OUT, `ff-${fileName(label)}`);
    firefoxProfile(dir);
    child = spawn(FIREFOX, ['-profile', dir, '-no-remote', '-new-instance', URL_], {stdio: 'ignore'});
    child.launchedAt = Date.now();
    for (let i = 0; i < 80; i++) { await sleep(250); if (placePid(child.pid, FRAME) === 0) break; }
  }
  for (let i = 0; i < 160 && !(layoutData && beacons.some(b => b.ev === 'load')); i++) await sleep(250);
  if (!layoutData) throw Object.assign(new Error(`${BROWSER} did not load the page in 40 s`), {child});
  return child;
}
async function frontTextEdit() {
  for (let i = 0; i < 4; i++) {
    sh('open', ['-a', 'TextEdit', TEXT_DOC]);
    await sleep(1200);
    if (frontmost() === 'com.apple.TextEdit') break;
  }
  const place = osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  await sleep(400);
  return {front: frontmost(), placeStatus: place.status};
}
let sockN = 0;
async function startEngine() {
  const dir = join(OUT, 'sock');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `s${++sockN}.sock`);
  const child = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  child.stdout.on('data', () => {});
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try { return {child, wire: await Wire.connect(socket), stderr: () => stderr}; } catch { await sleep(50); }
  }
  throw new Error(`engine did not listen: ${stderr.slice(0, 2000)}`);
}
async function stopEngine(engine) {
  if (!engine) return '';
  try { await engine.wire.call('shutdown', {}, 5000); } catch {}
  engine.wire.close();
  for (let i = 0; i < 40 && engine.child.exitCode === null; i++) await sleep(50);
  if (engine.child.exitCode === null) engine.child.kill('SIGKILL');
  return engine.stderr().slice(-2000);
}

// The wheel field scrolled by a user's wheel: the cursor over it (its screen point from the page's window geometry),
// scroll-wheel events posted, the field's scrollTop read back from the layout the scroll's beacons send.
async function wheelScroll() {
  const L = layoutData, f = L.fields.wheel;
  const chromeX = (L.outerWidth - L.innerWidth) / 2, chromeY = L.outerHeight - L.innerHeight;
  const p = {x: L.screenX + chromeX + f.rect.x + f.rect.w / 2, y: L.screenY + chromeY + f.rect.y + f.rect.h / 2};
  const tries = [];
  for (let i = 0; i < 3; i++) {
    const r = await ax(['wheel', String(p.x), String(p.y), String(-(650 + 40 * i)), '5']);
    await sleep(900);
    const top = layoutData.fields.wheel.scrollTop;
    tries.push({p, posted: r, scrollTop: top});
    if (top > 300) break;
  }
  return tries;
}

// The screen point of a field's target from an observation: the web area's frame (the viewport) plus the page's client
// point; where the web area answers a zero frame (Firefox's first observation), the field's own node's frame less its
// client rect. Then the screenshot pixel the engine takes, and the screen point that pixel maps back to.
function pointFor(sky, field, client) {
  const wf = sky.window.frame, scale = sky.screenshot.width / wf.width;
  const webArea = sky.nodes.find(n => n.role === 'AXWebArea' && /probe341/.test(`${n.title ?? ''} ${n.description ?? ''}`)) ?? sky.nodes.find(n => n.role === 'AXWebArea');
  const node = sky.nodes.find(n => n.role === 'AXTextArea' && new RegExp(`Probe ${field} notes`).test(`${n.title ?? ''} ${n.description ?? ''} ${n.help ?? ''}`));
  const rect = layoutData.fields[field].rect;
  const viaWebArea = webArea?.frame && webArea.frame.width > 0 ? {x: webArea.frame.x, y: webArea.frame.y} : null;
  const viaNode = node?.frame && node.frame.width > 0 ? {x: node.frame.x - rect.x, y: node.frame.y - rect.y} : null;
  const origin = viaWebArea ?? viaNode;
  if (!origin) return {problem: 'no web area or field node with a frame'};
  const screen = {x: origin.x + client.x, y: origin.y + client.y};
  const x = Math.round((screen.x - wf.x) * scale), y = Math.round((screen.y - wf.y) * scale);
  return {screen, screenshotPixel: {x, y}, scale, window: wf, viaWebArea, viaNode, source: viaWebArea ? 'webArea' : 'node',
    clickScreen: {x: wf.x + x / scale, y: wf.y + y / scale}, node: node ? {token: node.token, frame: node.frame, role: node.role} : null};
}

// The ops of each raw kind (ax.swift seq).
const WAIT = TIMING === 'fresh' ? 8000 : 0;
const RAW = {
  focusFirst: [{op: 'pre'}, {op: 'waitBoxes', maxMs: WAIT}, {op: 'scan', tag: 'pre'}, {op: 'ref', tag: 'pre'}, {op: 'firstVisible'},
    {op: 'focus', pollMs: 800}, {op: 'scan', tag: 'post'}, {op: 'delta'}, {op: 'select', loc: 'pre', pollMs: 600}, {op: 'state', tag: 'end'}],
  selectFirst: [{op: 'pre'}, {op: 'waitBoxes', maxMs: WAIT}, {op: 'scan', tag: 'pre'}, {op: 'ref', tag: 'pre'},
    {op: 'select', loc: 'pre', pollMs: 800}, {op: 'focus', pollMs: 800}, {op: 'scan', tag: 'post'}, {op: 'state', tag: 'end'}],
  restore: [{op: 'pre'}, {op: 'waitBoxes', maxMs: WAIT}, {op: 'scan', tag: 'pre'}, {op: 'ref', tag: 'pre'}, {op: 'firstVisible'},
    {op: 'focus', pollMs: 800}, {op: 'select', loc: 'firstVisible', pollMs: 600}, {op: 'scrollToVisible', pollMs: 600}, {op: 'scan', tag: 'post'},
    {op: 'select', loc: 'pre', pollMs: 600}, {op: 'state', tag: 'end'}],
  visibleFirst: [{op: 'pre'}, {op: 'waitBoxes', maxMs: WAIT}, {op: 'scan', tag: 'pre'}, {op: 'ref', tag: 'pre'}, {op: 'firstVisible'},
    {op: 'select', loc: 'firstVisible', pollMs: 800}, {op: 'focus', pollMs: 800}, {op: 'scan', tag: 'post'}, {op: 'select', loc: 'post', pollMs: 600},
    {op: 'state', tag: 'end'}],
  press: [{op: 'pre'}, {op: 'scan', tag: 'pre'}, {op: 'ref', tag: 'pre'}, {op: 'firstVisible'}, {op: 'press', pollMs: 800}, {op: 'scan', tag: 'post'},
    {op: 'delta'}, {op: 'select', loc: 'pre', pollMs: 600}, {op: 'state', tag: 'end'}],
};
const READ_ONLY = [{op: 'pre'}, {op: 'scan', tag: 'pre'}];

const pageView = (b, field) => b ? {t: b.t, scrollY: b.scrollY, active: b.active, hasFocus: b.hasFocus, sel: b.sel?.[field], scroll: b.scroll?.[field], mark: b.mark?.[field],
  length: b.lengths?.[field], otherMarks: Object.entries(b.mark ?? {}).filter(([k, v]) => k !== field && v >= 0).map(([k]) => k)} : null;
const answer = r => {
  if (!r) return null;
  const meta = r.error ? r.error.meta : r.result?.meta;
  return {answer: r.error ? (r.error.errorName ?? `code ${r.error.code}`) : 'success', message: r.error?.message?.slice(0, 400) ?? null,
    route: meta?.inputRoute ?? null, elementClick: meta?.elementClick ?? null, stalePoint: meta?.stalePoint ?? null,
    activationClickKind: meta?.activationClickKind ?? null, note: r.result?.note ?? null};
};

// One field's action in a session whose browser, engine and observation are up.
async function act(ctx, kind, field, fresh) {
  const row = {kind, field, timing: fresh ? 'fresh' : 'late', browser: BROWSER, rep: REP, session: ctx.label};
  const {w, pid} = ctx;
  try {
    if (!fresh) row.textEdit = await frontTextEdit();
    const shots = join(OUT, `shots-${fileName(ctx.label)}`);
    mkdirSync(shots, {recursive: true});
    const observedFrom = Date.now();
    let state = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
    if (BROWSER === 'firefox' && !ctx.observed) {
      // Gecko's first observation turns its accessibility on and may answer the web area a zero frame (#287).
      await sleep(1000);
      state = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
    }
    ctx.observed = true;
    const observedAt = Date.now();
    row.observationMs = observedAt - observedFrom;
    if (state.error) { row.problem = {getAppState: state.error}; return row; }
    const sky = state.result;
    row.observation = {enablementPrior: sky.timings?.enablementPrior ?? null, enablementWrite: sky.timings?.enablementWrite ?? null};
    const L = layoutData.fields[field];
    row.layout = {scrollTop: L.scrollTop, line: L.line, expect: L.expect, client: L.p, rect: L.rect, scrollHeight: L.scrollHeight, clientHeight: L.clientHeight, length: L.length, layoutAt,
      docScrollY: layoutData.scrollY, innerHeight: layoutData.innerHeight, pageBottom: Math.max(...Object.values(layoutData.fields).map(x => x.rect.y + x.rect.h))};
    row.point = pointFor(sky, field, L.p);
    if (row.point.problem) { row.problem = row.point.problem; return row; }
    const P = row.point.clickScreen;
    const before = latest();
    row.before = pageView(before, field);
    const wait = observedAt + (fresh ? 100 : 3000) - Date.now();
    if (wait > 0) await sleep(wait);
    if (!fresh && (kind === 'engine' || kind === 'token')) {
      // The unfocused boxes' offset under the point the engine takes (for token, the field's frame centre).
      const q = kind === 'token' && row.point.node ? {x: row.point.node.frame.x + row.point.node.frame.width / 2, y: row.point.node.frame.y + row.point.node.frame.height / 2} : P;
      row.tokenPoint = kind === 'token' ? q : undefined;
      row.dump = await ax(['seq', String(pid), String(q.x), String(q.y), JSON.stringify({expect: L.expect, ops: READ_ONLY})]);
    }
    row.frontBefore = frontmost();
    row.windowsBefore = await ax(['windows']);
    const actAt = Date.now();
    row.actAt = actAt;
    row.actAfterObservationMs = actAt - observedAt;
    if (kind === 'engine') {
      row.click = lean(await w.execute('click', {pid, x: row.point.screenshotPixel.x, y: row.point.screenshotPixel.y}));
    } else if (kind === 'token') {
      if (!row.point.node?.token) { row.problem = 'no field node token'; return row; }
      row.click = lean(await w.execute('click', {pid, element: row.point.node.token}, {lineage: sky.lineage}));
    } else {
      row.ax = await ax(['seq', String(pid), String(P.x), String(P.y), JSON.stringify({expect: L.expect, ops: RAW[kind]})]);
    }
    row.actMs = Date.now() - actAt;
    row.windowsJustAfter = await ax(['windows']);
    row.answer = answer(row.click);
    await sleep(800);
    row.frontAfter = frontmost();
    row.windowsAfter = await ax(['windows']);
    row.after = pageView(latest(), field);
    const typeAt = Date.now();
    row.typeAt = typeAt;
    row.type = answer(await w.execute('type_text', {pid, text: MARK}));
    await sleep(1500);
    row.afterType = pageView(latest(), field);
    row.events = beacons.filter(b => b.ev !== 'tick' && b.t >= actAt - 5)
      .map(b => ({dt: b.t - actAt, ev: b.ev, field: b.field, top: b.top, target: b.target, active: b.active, sel: b.sel?.[field], scroll: b.scroll?.[field]}));
    const landed = row.afterType?.mark;
    row.verdict = {expect: L.expect, dump: row.dump?.offsets?.pre ?? null, pre: row.ax?.offsets?.pre ?? null, post: row.ax?.offsets?.post ?? null,
      delta: row.ax?.offsets?.delta ?? null, caretAfter: row.after?.sel ?? null, marker: landed, markerAtExpect: landed === L.expect,
      claim: row.answer ? `${row.answer.answer}/${row.answer.elementClick?.reason ?? '-'}/${row.answer.elementClick?.caret ?? '-'}` : null,
      scrollBefore: row.before?.scroll, scrollAfter: row.after?.scroll, scrollAfterType: row.afterType?.scroll};
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  }
  return row;
}

async function session(label, kind, fields, fresh) {
  const rows = [];
  let browser, engine;
  const meta = {label, kind, fields, fresh};
  try {
    try { browser = await launchBrowser(label); } catch (e) { browser = e.child; throw e; }
    meta.loadedAfterMs = Date.now() - browser.launchedAt;
    meta.wheel = await wheelScroll();
    // Chrome for Testing re-lays out its toolbar 18–20 s after launch: the observation waits it out.
    const settle = browser.launchedAt + (BROWSER === 'chrome' ? 28_000 : 4000) - Date.now();
    if (settle > 0) await sleep(settle);
    meta.textEdit = await frontTextEdit();
    engine = await startEngine();
    const w = engine.wire;
    meta.ping = (await w.call('ping', {clientApiVersion: 'cua-engine-1'})).result ?? null;
    const ctx = {label, w, pid: browser.pid, observed: false};
    for (const field of fields) {
      const row = await act(ctx, kind, field, fresh && field === fields[0]);
      rows.push(row);
      const v = row.verdict;
      if (row.exception || row.problem) log(`${label} ${field}: PROBLEM ${JSON.stringify(row.problem ?? '')} ${row.exception ?? ''}`);
      else log(`${arg('label') ?? ''} ${label} ${kind}/${row.timing}/${field}: expect=${v.expect} dump=${v.dump} pre=${v.pre} post=${v.post} delta=${v.delta} claim=${v.claim} caret=${JSON.stringify(v.caretAfter)} marker=${v.marker} scroll ${v.scrollBefore}->${v.scrollAfter}->${v.scrollAfterType} shift=${row.answer?.elementClick?.caretMarkShift ?? '-'} step=${row.answer?.elementClick?.focusStep ?? '-'} front=${row.frontBefore}/${row.frontAfter} order=${(row.windowsBefore?.windows ?? []).slice(0, 3).map(w => w.owner).join('>')}/${(row.windowsAfter?.windows ?? []).slice(0, 3).map(w => w.owner).join('>')} +${row.actAfterObservationMs}ms ${row.actMs}ms`);
    }
  } catch (e) {
    meta.exception = String(e?.stack || e).slice(0, 3000);
    log(`${label}: SESSION PROBLEM ${meta.exception}`);
  } finally {
    meta.engineStderr = await stopEngine(engine);
    if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await sleep(2000); if (browser.exitCode === null) browser.kill('SIGKILL'); }
    await sleep(1000);
  }
  return {meta, rows};
}

const config = {imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), browser: BROWSER, timing: TIMING, kinds: KINDS, fields: FIELDS, repeat: REPEAT, rep: REP,
  browserVersion: BROWSER === 'chrome' ? sh(CFT, ['--version']).out : BROWSER === 'firefox' ? sh(FIREFOX, ['--version']).out
    : `Safari ${sh('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString']).out}`,
  engine: ENGINE, engineLabel: arg('label') ?? null, engineCommit: process.env.P341_ENGINE_COMMIT ?? null,
  mainCommit: process.env.P341_MAIN_COMMIT ?? null, kit: process.env.GITHUB_SHA ?? null};
log('config', JSON.stringify(config));
const sessions = [];
const rotate = (a, k) => a.map((_, i) => a[(i + k) % a.length]);
let n = 0;
for (let r = 1; r <= REPEAT; r++) {
  for (const kind of KINDS) {
    if (TIMING === 'fresh') {
      for (const field of FIELDS) sessions.push(await session(`${BROWSER}-${kind}-fresh-${field}-r${r}`, kind, [field], true));
    } else {
      sessions.push(await session(`${BROWSER}-${kind}-late-r${r}`, kind, rotate(FIELDS, (REP + n++) % FIELDS.length), false));
    }
    writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, sessions}, null, 1));
  }
}
server.close();
process.exit(0);
