// Task 142 fix wave 4: the re-review's constructed cases judged by 1317cc35's judge (argv[2]) and the working copy's
// (argv[3]); the stored x64 H8 H1 run's meta from argv[4].
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { dropRow } from '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/harness-487/test/linux-engine-diff/drop-rows.mjs';

const [oldJ, newJ] = await Promise.all(process.argv.slice(2, 4).map((p) => import(pathToFileURL(p).href)));
const storedMeta = JSON.parse(gunzipSync(readFileSync(process.argv[4])).toString('utf8').split('\n')[0]);
const V044 = 'cua-engine 0.4.4 (23f342178d94)';
const settle = { second_rest: 'needless', settled: true, rest_ms: 30 };
const read = (x = {}) => ({ steps: [], accepted: true, error: null, ...x });
const row = (i, count, cursor = read({ settle })) => ({ ...dropRow({ family: 'electron', lane: 'cua', i }), settle_count: count, drop_cursor: cursor });
const fails = (J, rows, meta) => J.electronDropVerdict(rows, { specs: [{ lane: 'cua', cell: 'plain', n: rows.length }], plan: 't17-fix3', meta }).failed.filter((f) => /#487/.test(f)).length;
const good = { before: 3, after: 4, entered: 1, before_from: 7, after_from: 9, requests: { first: 9, last: 9 } };

const one = [row(0, good), row(1, { before: 19, after: 19, entered: 0, before_from: 12, after_from: 12 }, read())];
console.log(`P2 1, {19,19,0,12,12} with the settle removed: #487 fails at 1317cc35 ${fails(oldJ, one, { kind: 'meta', gate: false, cua_version: V044 })}, now ${fails(newJ, one, { kind: 'meta', gate: false, cua_version: V044 })}`);

const without = { ...storedMeta, candidate: { ...storedMeta.candidate } };
delete without.candidate.attestation;
const rows43 = [row(0, null, read({ settle: { settled: true } }))];
console.log(`P2 2, x64 H8 H1's meta (0.4.3) with its attestation removed: #487 fails at 1317cc35 ${fails(oldJ, rows43, without)}, now ${fails(newJ, rows43, without)}; as stored: at 1317cc35 ${fails(oldJ, rows43, storedMeta)}, now ${fails(newJ, rows43, storedMeta)}`);

const named = { ...dropRow({ family: 'electron', lane: 'cua:named-gtk4', i: 0 }), route: 'foreground', drag_pacing: { family: 'GTK 4', rest_ms: 0 }, drop_cursor: read({ settle }), settle_count: { before: 0, after: 1, entered: 1, before_from: 'fresh', after_from: 1, requests: { first: 1, last: 1 } }, named: { aim: { inside: true, park: { ok: true } } } };
console.log(`P2 3, a named drop whose aim is {inside: true, park: {ok: true}} alone: unproven at 1317cc35 ${JSON.stringify(oldJ.namedSourceUnproven(named))}, now ${JSON.stringify(newJ.namedSourceUnproven(named, { electronWindow: 5 }))}`);
