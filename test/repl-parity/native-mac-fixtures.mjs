// The native-mac suite's test material: each lane's texts on the four scenes, taken from the renderer's goldens
// (test/native-goldens/, recorded live in one sitting on the mini), and run directories in the layout the suite's runner
// writes (scripts/repl-parity/native-mac.mjs): meta.json, results.jsonl and texts/<scene>/<kind>.txt.
import * as fs from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {advanceNumbering, render} from '../../src/services/engine/render.mjs';
import {SCENE_IDS} from '../../scripts/repl-parity/scenes-mac.mjs';

const GOLDENS = new URL('../native-goldens/', import.meta.url);
const read = (scene, name) => fs.readFileSync(new URL(`${scene}/${name}`, GOLDENS), 'utf8');
const rendered = (scene, name) => { const shot = JSON.parse(read(scene, name)); return render(shot, advanceNumbering(null, shot)); };
export const sha = text => createHash('sha256').update(text).digest('hex');
const noChange = full => `There has been no change in the accessibility tree for ${/^(Window: "[^"]*")/.exec(full)[1]}.`;
// The no-change answer an observation of `after`'s scene gives when nothing moved: the sentence, then `after`'s trailer
// (the renderer appends the current selection or focus to it, src/services/engine/diff.mjs).
export function settledAfter(after, full) {
  const lines = after.split('\n'), at = lines.findIndex(line => /^(The focused UI element is |Selected:$|Selected text: ```$)/.test(line));
  return `${noChange(full)}${at < 0 ? '' : `\n${lines.slice(at).join('\n')}`}`;
}

// Per scene {full, before, diff, later}: the vendor's recorded texts, or cua's renderings of its recorded Skyshots; the
// observation two seconds after the action is the no-change answer with the diff's trailer on both (a settled scene).
export function laneTexts(engine) {
  return Object.fromEntries(SCENE_IDS.map(scene => {
    const full = engine === 'vendor' ? read(scene, 'vendor.txt') : read(scene, 'cua.txt');
    const before = engine === 'vendor' ? read(scene, 'action.vendor.before.txt') : rendered(scene, 'action.before.skyshot.json');
    const diff = engine === 'vendor' ? read(scene, 'action.vendor.diff.txt') : read(scene, 'cua.diff.txt');
    return [scene, {full, before, diff, later: settledAfter(diff, full)}];
  }));
}

// Each scene's window frame as both lanes' side reads saw it (the Chrome and Electron scenes' are their placements).
export const FRAMES = Object.freeze({textedit: {x: 60, y: 40, width: 640, height: 720}, finder: {x: 100, y: 80, width: 920, height: 640},
  chrome: {x: 80, y: 60, width: 1000, height: 760}, electron: {x: 140, y: 100, width: 720, height: 560}});
export const APPROVED = {build: 'b'.repeat(64), engineVersion: '0.1.0', signature: {kind: 'identity', identityMatches: true}};
export const lanesMeta = engine => ({schema: 'native-mac-1', suite: 'native-mac', device: 'mini', platform: 'darwin', host: engine, engine, sitting: 'hold-2b',
  commit: 'c'.repeat(40), harness: {commit: 'd'.repeat(40), dirty: false}, runtimeRelease: '26.928.40906-darwin-arm64', approved: APPROVED, checkoutBuild: APPROVED.build,
  scenes: Object.fromEntries(SCENE_IDS.map(scene => [scene, {recorded: true, frame: FRAMES[scene]}])), plan: {scenes: [...SCENE_IDS]}, problems: [], complete: true});

// A run directory as the runner writes it. `texts` per scene (missing kinds are cells that did not answer), `rows`
// overrides per scene and cell, `meta` merged into the lane's meta.
export function writeRun(dir, {engine, texts = laneTexts(engine), rows = {}, meta = {}}) {
  fs.mkdirSync(dir, {recursive: true});
  const out = [];
  const file = (scene, kind) => {
    const text = texts[scene]?.[kind];
    if (typeof text !== 'string') return null;
    const path = join('texts', scene, `${kind}.txt`);
    fs.mkdirSync(join(dir, 'texts', scene), {recursive: true});
    fs.writeFileSync(join(dir, path), text);
    return {file: path, sha256: sha(text), bytes: Buffer.byteLength(text)};
  };
  for (const scene of SCENE_IDS) {
    const full = file(scene, 'full'), before = file(scene, 'before'), diff = file(scene, 'diff'), later = file(scene, 'later');
    const row = (cell, value) => out.push(rows[scene]?.[cell] === null ? null : {scene, cell, ...value, ...rows[scene]?.[cell]});
    row('bind', {ok: true});
    row('fixed', full ? {ok: true, reads: 2, texts: {full}} : {ok: false, error: 'the scene window was not the app\'s front window; nothing was written'});
    row('action', before && diff && later ? {ok: true, index: 2, texts: {before, diff, later}} : {ok: false, error: 'the engine refused the click'});
    if (later) row('settle', {ok: true, settled: /^There has been no change/.test(texts[scene].later)});
  }
  fs.writeFileSync(join(dir, 'results.jsonl'), out.filter(Boolean).map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(join(dir, 'meta.json'), JSON.stringify({...lanesMeta(engine), ...meta}, null, 2) + '\n');
  return dir;
}
