// Re-keys M0's recorded captures into the renderer's goldens (PROVENANCE.md): the spec's M1a pre-flight entry, item 5,
// "M0's goldens are re-keyed, not re-recorded". Run from the repository root:
//
//   node test/native-goldens/rekey.mjs
//
// It reads docs/doperpowers/research/2026-10-18-own-native-engine/spike/sit2/u9/{vendor,cua}/run-<n>/goldens/ and writes
// test/native-goldens/<scene>/. The change to a cua Skyshot is mechanical:
//   - each node's `index` n becomes `token: "t<n>"`, M1a.1's token format (the lineage's allocation number): the spike
//     engine's index was stable exactly where an M1a token is (same lineage, CFEqual handle at a matched position), so
//     the action pair (before, after-diff), which shares a lineage, keeps the spike's stability;
//   - the index-valued fields become token-valued: `focused`, `selectedElements`, `servesAsTitle`/`servesAsTitleFor`
//     (named `servesAsTitleFor`, as Interfaces names it);
//   - the spike's diagnostic `timings` are dropped (not part of the Interfaces' Skyshot);
//   - Finder's redaction marker for the empty string, `⟨0⟩`, becomes the empty string again (the capture's redaction
//     replaced every string not run-owned by its length; an empty string carries no content, and "⟨0⟩" would read as
//     non-empty to the transformations).
// The vendor's texts are copied byte for byte.
import fs from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '../../docs/doperpowers/research/2026-10-18-own-native-engine/spike/sit2/u9');
// cua's run 2 throughout; the vendor's run on the same fixed state. The vendor lane ran first: its run 1 began with no
// Finder row selected, as cua's run 2 did, while its runs 2 and 3 began with the previous run's clicked row still
// selected (and cua's run 1 with the vendor's run 3's). TextEdit and Electron are identical across the vendor's runs;
// Chrome's differ only by the loopback page's port.
const CUA_RUN = 'run-2';
const VENDOR_RUN = {textedit: 'run-2', finder: 'run-1', chrome: 'run-2', electron: 'run-2'};
export const SCENES = ['textedit', 'finder', 'chrome', 'electron'];

// golden file → [lane, source file]
const FILES = {
  'skyshot.json': ['cua', 'skyshot.json'],
  'vendor.txt': ['vendor', 'text.txt'],
  'action.before.skyshot.json': ['cua', 'action.before.skyshot.json'],
  'action.after.skyshot.json': ['cua', 'action.after-diff.skyshot.json'],
  'action.vendor.before.txt': ['vendor', 'action.before.txt'],
  'action.vendor.diff.txt': ['vendor', 'action.diff.txt'],
};
export const SOURCED = Object.keys(FILES);

export function rekey(shot) {
  const token = index => `t${index}`;
  const unredact = value => (value === '⟨0⟩' ? '' : value);
  const node = ({index, servesAsTitle, servesAsTitleFor, ...rest}) => {
    const out = {token: token(index)};
    for (const [key, value] of Object.entries(rest)) out[key] = unredact(value);
    const titled = servesAsTitleFor ?? servesAsTitle;
    if (Array.isArray(titled)) out.servesAsTitleFor = titled.map(token);
    return out;
  };
  const {timings, ...top} = shot;
  void timings;
  return {
    ...top,
    nodes: shot.nodes.map(node),
    menuBar: (shot.menuBar ?? []).map(node),
    focused: shot.focused == null ? null : token(shot.focused),
    selectedElements: (shot.selectedElements ?? []).map(token),
  };
}

// The content of one golden file as its source capture gives it (the tests guard each file against this).
export function fromSource(scene, name) {
  const [lane, file] = FILES[name];
  const run = lane === 'cua' ? CUA_RUN : VENDOR_RUN[scene];
  const text = fs.readFileSync(join(SOURCE, lane, run, 'goldens', `${scene}.${file}`), 'utf8');
  return name.endsWith('.json') ? `${JSON.stringify(rekey(JSON.parse(text)), null, 1)}\n` : text;
}

function main() {
  for (const scene of SCENES) {
    fs.mkdirSync(join(HERE, scene), {recursive: true});
    for (const name of SOURCED) fs.writeFileSync(join(HERE, scene, name), fromSource(scene, name));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) main();
