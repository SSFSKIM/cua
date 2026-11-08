// #328's gate (b) cells: would the approved confirmation (ruling b1921fc3) answer `scrollUnconfirmed` for a scroll that
// moved? Main's engine (its real `scroll` by coordinates) scrolls a web page's nested scrollers behind a frontmost cover
// app; t328's `confirm` emulates the read-back around it (the hit's container, its bar, its content, a descendant 40%
// across, and the hit element as a candidate), each measure's first move timed; the page's own scroll events, each with
// its Unix ms, are the ground truth.
//   node scripts/probe-328/confirm.mjs --browser safari|chrome|firefox --t328 <bin> --cover <Cover328 bin> --engine <bin>
//     --out <dir> [--reps n] [--cells c1,c2]
// Cells: page (the page itself), div (an overflow div), iframe (a same-origin iframe's scroller), hdiv (a horizontal
// overflow div, scrolled right), raf / mid / late (overflow divs a script scrolls itself on the wheel: at once over
// 300 ms, after 150 ms over 200 ms, after 350 ms over 200 ms), divEnd (the div already at its end: the hit's container
// cannot move; the page may, by scroll chaining), smooth (a page with `scroll-behavior: smooth`).
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('confirm.mjs: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const BROWSER = arg('browser'), T328 = arg('t328'), COVER = arg('cover'), ENGINE = arg('engine'), OUT = arg('out');
const REPS = Number(arg('reps', 3)), PAGES = Number(arg('pages', 0.25));
const ONLY = arg('cells')?.split(',') ?? null;
process.env.P287_BROWSER = BROWSER;
if (BROWSER === 'firefox') process.env.P287_FIREFOX_A11Y = 'force';
const {launchOther, browserVersion, placePid} = await import('../probe-287/browser.mjs');
mkdirSync(OUT, {recursive: true});
const T = process.env.RUNNER_TEMP || OUT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('confirm-328:', ...a);
const sh = (cmd, args, timeout = 30_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = s => sh('osascript', ['-e', s]);
const lastJson = s => { try { return JSON.parse(s.trim().split('\n').pop()); } catch { return {bad: s.slice(-300)}; } };
const t328 = (...a) => lastJson(sh(T328, a.map(String)).out);
const front = () => (sh('lsappinfo', ['info', '-only', 'bundleid', sh('lsappinfo', ['front']).out]).out.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || null;

// ---- the pages ------------------------------------------------------------------------------------------------------------
const rows = (p, n) => Array.from({length: n}, (_, i) => `<div class="r">${p} row ${i}</div>`).join('');
const box = 'width:270px;height:150px;overflow:auto;border:1px solid #888;display:inline-block;vertical-align:top;margin:3px';
const NESTED = `<!doctype html><html><head><meta charset="utf-8"><title>probe328 nested</title><style>body{font:14px sans-serif;margin:8px}.r{height:20px}
.h{white-space:nowrap}.h span{display:inline-block;width:90px}</style></head><body>
${rows('page', 3)}
<div id="div" style="${box}">${rows('div', 60)}</div><iframe id="iframe" style="${box}" srcdoc="<!doctype html><body style='font:14px sans-serif;margin:4px'>${rows('iframe', 60).replace(/"/g, "'")}</body>"></iframe><br>
<div id="raf" style="${box}">${rows('raf', 60)}</div><div id="mid" style="${box}">${rows('mid', 60)}</div><br>
<div id="late" style="${box}">${rows('late', 60)}</div><div id="hdiv" class="h" style="${box};height:60px">${Array.from({length: 40}, (_, i) => `<span>h cell ${i}</span>`).join('')}</div>
${rows('tail', 120)}
<script>history.scrollRestoration='manual';
const send=(id,pos)=>navigator.sendBeacon('/e',JSON.stringify({id,pos,t:Date.now()}));
const $=id=>document.getElementById(id);
for(const id of ['div','raf','mid','late']) $(id).addEventListener('scroll',()=>send(id,$(id).scrollTop));
$('hdiv').addEventListener('scroll',()=>send('hdiv',$('hdiv').scrollLeft));
addEventListener('scroll',()=>send('page',scrollY));
const ifr=()=>$('iframe').contentWindow;
$('iframe').addEventListener('load',()=>ifr().addEventListener('scroll',()=>send('iframe',ifr().scrollY)));
// A script's own scroller: the wheel's default prevented, the scroll animated after a delay over a duration.
const own=(id,delay,dur)=>$(id).addEventListener('wheel',e=>{e.preventDefault();const el=$(id),from=el.scrollTop,by=e.deltaY;
  setTimeout(()=>{const s=performance.now();const step=n=>{const k=Math.min(1,(n-s)/dur);el.scrollTop=from+by*k;if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)},delay)},{passive:false});
own('raf',0,300);own('mid',150,200);own('late',350,200);
const reset=()=>{for(const id of ['div','raf','mid','late']) $(id).scrollTop=0;$('hdiv').scrollLeft=0;try{ifr().scrollTo(0,0)}catch{};scrollTo(0,0)};
const report=()=>{let f=0;try{f=ifr().scrollY}catch{};navigator.sendBeacon('/e',JSON.stringify({id:'report',pos:{page:scrollY,div:$('div').scrollTop,iframe:f,hdiv:$('hdiv').scrollLeft,raf:$('raf').scrollTop,mid:$('mid').scrollTop,late:$('late').scrollTop},t:Date.now()}))};
setInterval(()=>fetch('/cmd',{cache:'no-store'}).then(r=>r.text()).then(t=>{if(t==='report')report();if(t==='reset')reset();if(t.startsWith('end:')){reset();const el=$(t.slice(4));el.scrollTop=el.scrollHeight}if(t==='endpage'){reset();scrollTo(0,document.documentElement.scrollHeight)}
  if(t.startsWith('go:'))location.href=t.slice(3)}).catch(()=>{}),50);
addEventListener('load',()=>{reset();navigator.sendBeacon('/ready')});</script></body></html>`;
const SMOOTH = `<!doctype html><html style="scroll-behavior:smooth"><head><meta charset="utf-8"><title>probe328 smooth</title><style>body{font:14px sans-serif;margin:8px}.r{height:20px}</style></head><body>
${rows('smooth', 300)}<script>history.scrollRestoration='manual';addEventListener('scroll',()=>navigator.sendBeacon('/e',JSON.stringify({id:'smooth',pos:scrollY,t:Date.now()})));
setInterval(()=>fetch('/cmd',{cache:'no-store'}).then(r=>r.text()).then(t=>{if(t==='report')navigator.sendBeacon('/e',JSON.stringify({id:'report',pos:{smooth:scrollY},t:Date.now()}));if(t==='reset'){document.documentElement.style.scrollBehavior='auto';scrollTo(0,0);document.documentElement.style.scrollBehavior='smooth'}
  if(t.startsWith('go:'))location.href=t.slice(3)}).catch(()=>{}),50);addEventListener('load',()=>{scrollTo(0,0);navigator.sendBeacon('/ready')});</script></body></html>`;
let events = [], ready = false, cmd = '';
const server = createServer((req, res) => {
  const page = {'/': NESTED, '/smooth': SMOOTH}[req.url];
  if (req.method === 'GET' && page) { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(page); return; }
  if (req.url === '/cmd') { res.writeHead(200, {'content-type': 'text/plain', 'cache-control': 'no-store'}); res.end(cmd); cmd = ''; return; }
  let body = ''; req.on('data', d => { body += d; }); req.on('end', () => { if (req.url === '/ready') ready = true; if (req.url === '/e') { try { events.push(JSON.parse(body)); } catch {} } res.writeHead(204); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const LOCAL = `http://127.0.0.1:${server.address().port}`;
const send = async (c, wait = 400) => { cmd = c; await sleep(wait); };

// ---- the cover, the browser, the engine ------------------------------------------------------------------------------------
const coverState = join(OUT, 'cover.json'), coverCmd = join(OUT, 'cover.cmd');
writeFileSync(coverCmd, '');
const cover = spawn(COVER, [coverState, coverCmd, 'cover'], {stdio: 'ignore'});
let cn = 0;
const refront = async () => { cn += 1; writeFileSync(coverCmd, `${cn} front\n`); await sleep(250); osa(`tell application "System Events"\nset frontmost of (first process whose unix id is ${cover.pid}) to true\nend tell`); await sleep(300); };
await sleep(1500);
const frame = {x: 400, y: 30, w: 620, h: 700};
let child;
if (BROWSER === 'chrome') {
  child = spawn('/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', [`--user-data-dir=${join(T, 'cft328c')}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--lang=en-US', '--disable-features=Translate', `--window-position=${frame.x},${frame.y}`, `--window-size=${frame.w},${frame.h}`, '--force-renderer-accessibility', `${LOCAL}/`], {stdio: 'ignore'});
} else child = await launchOther(`${LOCAL}/`, join(T, `prof328c-${BROWSER}`), frame);
for (let i = 0; i < 120 && !ready; i++) await sleep(250);
await sleep(BROWSER === 'chrome' ? 20_000 : 2500);
placePid(child.pid, frame);
await refront();

class Wire {
  static connect(p) { return new Promise((res, rej) => { const s = createConnection(p); s.once('connect', () => { s.off('error', rej); res(new Wire(s)); }); s.once('error', rej); }); }
  constructor(s) { this.s = s; this.buf = Buffer.alloc(0); this.pending = new Map(); this.id = 1;
    s.on('data', d => { this.buf = Buffer.concat([this.buf, d]); while (this.buf.length >= 4) { const n = this.buf.readUInt32LE(0); if (this.buf.length < 4 + n) break;
      const m = JSON.parse(this.buf.subarray(4, 4 + n).toString('utf8')); this.buf = this.buf.subarray(4 + n); this.pending.get(m.id)?.(m); this.pending.delete(m.id); } }); s.on('error', () => {}); }
  call(method, params = {}) { const id = this.id++; const b = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params})); const h = Buffer.alloc(4); h.writeUInt32LE(b.length, 0);
    return new Promise((res, rej) => { const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`${method}: no answer`)); }, 60_000); this.pending.set(id, m => { clearTimeout(t); res(m); }); this.s.write(Buffer.concat([h, b])); }); }
  execute(method, args, lineage) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 45_000, ...(lineage ? {lineage} : {})}); }
  close() { this.s.destroy(); }
}
const sockDir = join(T, `c328${Date.now() % 100000}`); mkdirSync(sockDir, {recursive: true, mode: 0o700});
const socket = join(sockDir, 'e.sock');
const engine = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'ignore', 'ignore']});
const connect = async () => { const w = await Wire.connect(socket); const p = await w.call('ping', {clientApiVersion: 'cua-engine-1', desktop: 'shared'}); if (p.error) throw new Error(JSON.stringify(p.error)); return w; };
for (let i = 0; i < 300; i++) { try { (await connect()).close(); break; } catch { await sleep(50); } }

// ---- the cells -------------------------------------------------------------------------------------------------------------
const CELLS = [
  {name: 'page', text: 'page row 1', id: 'page', direction: 'down'},
  {name: 'div', text: 'div row 3', id: 'div', direction: 'down'},
  {name: 'iframe', text: 'iframe row 3', id: 'iframe', direction: 'down'},
  {name: 'hdiv', text: 'h cell 1', id: 'hdiv', direction: 'right', axis: 'h'},
  {name: 'raf', text: 'raf row 3', id: 'raf', direction: 'down'},
  {name: 'mid', text: 'mid row 3', id: 'mid', direction: 'down'},
  {name: 'late', text: 'late row 3', id: 'late', direction: 'down'},
  {name: 'divEnd', text: 'div row 57', id: 'div', direction: 'down', setup: 'end:div'},
  {name: 'pageEnd', text: 'tail row 118', id: 'page', direction: 'down', setup: 'endpage'},
  {name: 'smooth', text: 'smooth row 3', id: 'smooth', direction: 'down', page: '/smooth'},
].filter(c => !ONLY || ONLY.includes(c.name));
const results = [];
const config = {browser: browserVersion(), engine: process.env.P328_MAIN_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, pages: PAGES, reps: REPS};
const save = () => writeFileSync(join(OUT, `confirm-${BROWSER}.json`), JSON.stringify({config, results}, null, 1));
let onPage = '/';
for (let rep = 1; rep <= REPS; rep++) for (const cell of CELLS) {
  const row = {browser: BROWSER, rep, cell: cell.name};
  const w = await connect();
  try {
    const want = cell.page ?? '/';
    if (want !== onPage) { ready = false; await send(`go:${LOCAL}${want}`, 300); for (let i = 0; i < 40 && !ready; i++) await sleep(250); await sleep(1200); onPage = want; }
    await send(cell.setup ?? 'reset', 500);
    if (front() !== 'com.ssfskim.cover328') await refront();
    const f = t328('find', child.pid, cell.text);
    if (!f.found || !Array.isArray(f.frame)) { row.problem = `no ${cell.text}`; results.push(row); continue; }
    const pt = [f.frame[0] + Math.min(f.frame[2] / 2, 40), f.frame[1] + f.frame[3] / 2];
    row.point = pt; row.hitText = f.role;
    const shots = join(T, 'shots328c'); mkdirSync(shots, {recursive: true});
    const o = await w.execute('get_app_state', {pid: child.pid, includeScreenshot: true, outputDirectory: shots});
    rmSync(shots, {recursive: true, force: true});
    if (o.error) { row.problem = `get_app_state ${o.error.errorName ?? o.error.code}`; results.push(row); continue; }
    const wf = o.result.window?.frame, s = o.result.screenshot?.width && wf ? o.result.screenshot.width / wf.width : 1;
    const args = {direction: cell.direction, pages: PAGES, x: Math.round((pt[0] - wf.x) * s), y: Math.round((pt[1] - wf.y) * s)};
    const reportNow = async () => { const n = events.length; await send('report', 150); for (let i = 0; i < 30 && !events.slice(n).some(e => e.id === 'report'); i++) await sleep(50); return events.slice(n).filter(e => e.id === 'report').pop()?.pos ?? null; };
    const before = await reportNow();
    const startPos = before?.[cell.id] ?? 0;
    // The read-back around the engine's own scroll.
    const tc = spawn(T328, ['confirm', JSON.stringify({pid: child.pid, at: pt, axis: cell.axis ?? 'v', direction: cell.direction, route: 'external', observeMs: 1500})], {stdio: ['pipe', 'pipe', 'ignore']});
    let tout = ''; tc.stdout.on('data', d => { tout += d; });
    for (let i = 0; i < 100 && !tout.includes('"ready"'); i++) await sleep(50);
    const exited = new Promise(r => tc.on('exit', r));
    const mark = events.length;
    tc.stdin.write('go\n');
    const tPost = Date.now();
    const a = await w.execute('scroll', {pid: child.pid, ...args}, o.result.lineage);
    row.answerMs = Date.now() - tPost;
    row.answer = a.error ? (a.error.errorName ?? a.error.code) : 'success';
    row.message = a.error ? String(a.error.message ?? '').slice(0, 300) : undefined;
    row.meta = (a.error ? a.error.meta : a.result?.meta) ?? null;
    await Promise.race([exited, sleep(10_000)]);
    await sleep(300);
    row.read = lastJson(tout);
    row.args = args;
    const t0 = row.read.t0Unix ?? tPost;
    const mine = events.slice(mark).filter(e => e.id === cell.id && e.t >= t0 - 5);
    const sign = ['up', 'left'].includes(cell.direction) ? -1 : 1;
    const firstMove = mine.find(e => (e.pos - startPos) * sign > 0.5);
    const after = await reportNow();
    const movedOf = id => (after && before && after[id] != null && before[id] != null ? Math.round((after[id] - before[id]) * 10) / 10 : null);
    row.truth = {moved: movedOf(cell.id) == null ? null : movedOf(cell.id) * sign, firstMs: firstMove ? Math.round((firstMove.t - t0) * 10) / 10 : null, events: mine.length,
      before, after, others: Object.keys(after ?? {}).filter(id => id !== cell.id && Math.abs(movedOf(id) ?? 0) > 0.5)};
  } catch (e) { row.exception = String(e?.stack || e).slice(0, 600); } finally { w.close(); }
  results.push(row); save();
  const r = row.read ?? {};
  log(`${BROWSER} r${rep} ${cell.name}: ${row.answer ?? row.problem ?? row.exception} truth=${JSON.stringify(row.truth)} container=${JSON.stringify(r.container)} first=${JSON.stringify(r.firstMs)} moved=${JSON.stringify(r.moved)} atEnd=${r.atEnd} chain=${JSON.stringify(r.chain)?.slice(0, 200)}`);
}
save();
engine.kill('SIGTERM'); await sleep(400);
if (BROWSER === 'safari') sh('pkill', ['-x', 'Safari']); else if (child.exitCode === null) child.kill('SIGTERM');
cover.kill('SIGTERM');
server.close();
process.exit(0);
