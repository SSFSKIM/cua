#!/usr/bin/env node
// Task 77, L3a's reproduction (not counted; the controller's approval, 2026-11-14): beside a settle experiment's run on
// its own private display, the run's Chrome application's AT-SPI children (copy.rs `context_menu_item` looks for a new
// one with a menu item after its showMenu action) polled every 100 ms, each change logged with the wall clock: per child
// its path, role, child count, states (showing, visible) and how many menu items its subtree holds (to depth 6). Reads
// only, on the run's own accessibility bus; it never touches `:0`.
// (frames, the browser's windows, are not walked for menu items: their pages are large and a poll must stay short)
// usage: node probe-menus.mjs <harness checkout> <the experiment's out directory> <log file>
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [harness, out, log] = process.argv.slice(2);
const { connectBus } = await import(join(harness, 'scripts/linux-engine-diff/bus-client.mjs'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const write = (o) => appendFileSync(log, JSON.stringify({ wall: Date.now(), ...o }) + '\n');
const results = join(out, 'results.jsonl');
const rows = () => (existsSync(results) ? readFileSync(results, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

let display = null;
for (let i = 0; i < 600 && !display; i++) {
  display = rows().find((r) => r.kind === 'settle-display')?.display ?? null;
  if (!display) await sleep(500);
}
if (!display) throw new Error('no settle-display row');
let address = null;
for (let i = 0; i < 600 && !address; i++) {
  try {
    const text = execFileSync('xprop', ['-display', display, '-root', 'AT_SPI_BUS'], { encoding: 'utf8', timeout: 5000 });
    address = text.match(/"(.*)"/)?.[1] ?? null;
  } catch {
    // not yet
  }
  if (!address) await sleep(500);
}
write({ display, address: address ? 'found' : null });
const bus = await connectBus(address);
const A = 'org.a11y.atspi.Accessible';
const prop = async (dest, path, name) => (await bus.call(dest, path, 'org.freedesktop.DBus.Properties', 'Get', 'ss', [A, name]))[0][1];
const children = async (dest, path) => (await bus.call(dest, path, A, 'GetChildren'))[0];
const role = async (dest, path) => (await bus.call(dest, path, A, 'GetRoleName'))[0];
// state bits: SHOWING 25, VISIBLE 30 (atspi-constants.h)
const states = async (dest, path) => {
  const [w0] = (await bus.call(dest, path, A, 'GetState'))[0];
  return { showing: Boolean(w0 & (1 << 25)), visible: Boolean(w0 & (1 << 30)) };
};
async function menuItems(dest, path, depth = 0) {
  if (depth > 6) return 0;
  let n = 0;
  for (const [d, p] of await children(dest, path)) {
    const r = await role(d, p).catch(() => null);
    if (r === 'menu item') n++;
    else n += await menuItems(d, p, depth + 1).catch(() => 0);
  }
  return n;
}
let chrome = null;
let last = '';
let polls = 0;
for (;;) {
  const done = rows().some((r) => r.kind === 'settle-verdict' || r.kind === 'experiment-summary');
  try {
    if (!chrome) {
      for (const [d, p] of await children('org.a11y.atspi.Registry', '/org/a11y/atspi/accessible/root')) {
        const name = await prop(d, p, 'Name').catch(() => '');
        if (/chrom/i.test(String(name))) chrome = { dest: d, path: p, name: String(name) };
      }
      if (chrome) write({ chrome: chrome.name });
    }
    if (chrome) {
      const kids = [];
      for (const [d, p] of await children(chrome.dest, chrome.path)) {
        kids.push({ path: p, role: await role(d, p).catch(() => null), count: await prop(d, p, 'ChildCount').catch(() => null), ...(await states(d, p).catch(() => ({}))), menu_items: kids.length >= 0 && (await role(d, p).catch(() => null)) !== 'frame' ? await menuItems(d, p).catch(() => null) : null });
      }
      const sig = JSON.stringify(kids);
      if (sig !== last) {
        write({ poll: polls, children: kids });
        last = sig;
      }
    }
  } catch (e) {
    write({ poll: polls, error: String(e.message).slice(0, 200) });
    chrome = null;
  }
  polls++;
  if (done) break;
  await sleep(100);
}
write({ end: true, polls });
bus.close();
