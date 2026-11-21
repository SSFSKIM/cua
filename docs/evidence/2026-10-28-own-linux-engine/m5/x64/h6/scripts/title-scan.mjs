#!/usr/bin/env node
// Task 123: the structural title scan (the controller's word, in place of the live title half: x64's :0 is the
// owner's display, and its titles are not read). Over every file under the given dirs (gzipped too):
//  1. JSON: every string under a key that can carry a window's title, name, class or application (title, name,
//     label, app, application, window, owner, class, wm_class, by, source, icon_name and the like), and every quoted
//     string inside a string under any key that can name a window in a sentence (error, why, cause, evidence,
//     reason, notice, foreign and the like: `"…"`).
//  2. Plain text (.md, .txt, .log, .out, stderr/stdout): every quoted string on a line that names a window (window,
//     title, foreign, active, class).
// Each value is the harness's own when it matches what the harness sets itself (OWN below: its run- and scene-titled
// windows `cua171-…`, its scene pages' element names, the engines' own app names and classes of the run's own
// instances, its own sentences). It prints the counts: fields and values seen, distinct values, own and not own.
// A value not the harness's own is printed redacted (its length and its file and line only), never its text.
// Exit 1 when any value is not the harness's own.
// usage: node title-scan.mjs <dir>...
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const TITLE_KEY = /^(title|name|label|app|application|window|owner|class|wm_class|wm_name|net_wm_name|icon_name|by|source|toolkit|front|holder)$/i;
const SENTENCE_KEY = /error|why|cause|evidence|reason|notice|foreign|finding|line|text|message|what/i;
// what the harness sets or names itself
const OWN = [
  /^cua171[-_ ]/i, // its run- and scene-titled windows and pages (cua171-diff-<run>-<scene>…)
  /^cua-engine[-\s]/, /^linux-engine-v/, // its release assets and engines
  /^(Busy press|Slow dragstart|Plain|Nested|Slider|Image|Link|Canvas|Drop|Drag|Zone|Move|Select|Range|Scroll)\b/, // scene page elements
  /^(Google-chrome|google-chrome|Google Chrome|Chromium|chrome|Firefox|firefox|Navigator|Gedit|gedit|org\.gnome\.\w+|kate|Kate|xterm|XTerm|Xterm|Electron|electron|Openbox|openbox|gtk3-demo|gtk4-demo|Gtk4-demo|paste-target|recorder|minimized-recorder|Mozilla Firefox)$/, // the run's own app instances, by class or app name
  /^(browser|pop-up|browser-window|normal|dialog)$/, // window roles and types
  /^(GTK|Qt|GTK 3|GTK 4|gtk|qt|Gecko|Chromium)( \d)?$/, // toolkits
  /^(Google-chrome, role browser, application "Google Chrome", executable chrome)$/, // identification's own sentence
  /^0x[0-9a-f]+$/i, /^\d+$/, // window ids
  /^(cua|pinned|newest|cua:\w+|stub-activating|desktop|handle|harness|foreign|none|null|unknown|true|false)$/i,
  /^(Unnamed|identity-windows\.py|cua171-electron-page|at_spi|tree|oracle|pass|faster|View|abs src|acceptance on the pinned release|false positives, indeterminates counted)$/, // the identity scene's own apps, the harness's own labels and page classes
  /^Google-chrome, role browser, application "Google Chrome"/, // identification's own sentence, with or without the executable
  /^$/,
];
const isOwn = (s) => OWN.some((r) => r.test(s));
const files = [];
const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); const s = statSync(p); if (s.isDirectory()) walk(p); else if (s.isFile()) files.push(p); } };
for (const d of process.argv.slice(2)) walk(d);
const counts = { files: 0, json_fields: 0, sentence_quotes: 0, text_quotes: 0, own: 0, not_own: 0 };
const distinct = new Set();
const others = [];
const judge = (s, where) => {
  distinct.add(s);
  if (isOwn(s)) counts.own++;
  else { counts.not_own++; if (others.length < 50) others.push(`${where}: a value of ${s.length} characters`); }
};
// double quotes only: an apostrophe (the harness's, Chrome's) pairs with the next one across prose
const QUOTED = /"([^"\\]{1,200})"/g;
const visit = (v, key, where) => {
  if (Array.isArray(v)) { for (const x of v) visit(x, key, where); return; }
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) visit(x, k, where); return; }
  if (typeof v !== 'string' || key == null) return;
  if (TITLE_KEY.test(key)) { counts.json_fields++; judge(v, where); return; }
  if (SENTENCE_KEY.test(key)) for (const m of v.matchAll(QUOTED)) { counts.sentence_quotes++; judge(m[1] ?? m[2], where); }
};
for (const f of files) {
  let text;
  try { const b = readFileSync(f); text = (f.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8'); } catch { continue; }
  counts.files++;
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    const where = `${f}:${i + 1}`;
    if (t.startsWith('{') || t.startsWith('[')) { try { visit(JSON.parse(t), null, where); return; } catch {} }
    if (/\.json(\.gz)?$/.test(f)) return; // a whole-file JSON document is judged by its keys below
    if (/window|title|foreign|active|class/i.test(t) && !/^[{[]/.test(t)) for (const m of t.matchAll(QUOTED)) { counts.text_quotes++; judge(m[1] ?? m[2], where); }
  });
  if (/\.json$/.test(f)) { try { visit(JSON.parse(text), null, `${f}:whole`); } catch {} }
}
console.log(JSON.stringify({ ...counts, distinct: distinct.size }));
for (const o of others) console.log(`not the harness's own: ${o}`);
process.exit(counts.not_own ? 1 : 0);
