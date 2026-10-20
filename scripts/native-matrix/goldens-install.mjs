// The install step of the live goldens recorder (./goldens.mjs): a complete recording's golden files copied byte for
// byte into test/native-goldens/<scene>/ (PROVENANCE.md's layout), test/native-goldens/source.json pointed at the
// recording (so the render test guards each golden file against it, and Finder is compared as full text), and
// PROVENANCE.md's generated sections (between its `<!-- source` and `<!-- sizing` markers) rewritten from the
// recording's meta.json. The recording must sit inside the repository, since the goldens' source is committed with them.
// Nothing here touches expected.json or the pinned renderings: the step after is `goldens.mjs check`.
import * as fs from 'node:fs';
import {isAbsolute, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOURCED} from '../../test/native-goldens/source.mjs';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const GOLDENS_DIR = join(REPO_ROOT, 'test', 'native-goldens');
export const SCENE_ORDER = Object.freeze(['textedit', 'finder', 'chrome', 'electron']);

const replaceSection = (text, name, body) => {
  const pattern = new RegExp(`(<!-- ${name}:[^\\n]*-->\\n)[\\s\\S]*?(<!-- /${name} -->)`);
  if (!pattern.test(text)) throw new Error(`PROVENANCE.md has no <!-- ${name}: … --> … <!-- /${name} --> section to write`);
  return text.replace(pattern, (_, open, close) => `${open}${body.replace(/\n*$/, '\n')}${close}`);
};
const code = value => `\`${value ?? 'unknown'}\``;

// PROVENANCE's source section from a recording's meta. `dir` is the recording's goldens/, relative to the repository.
export function sourceSection(meta, dir) {
  const run = dir.replace(/\/goldens$/, '');
  const e = meta.engine ?? {}, os = meta.os ?? {}, f = meta.fixtures ?? {};
  const frames = SCENE_ORDER.map(scene => {
    const s = meta.scenes?.[scene] ?? {};
    const frame = s.frames?.list?.[0]?.frame;
    return `| ${scene} | ${frame ? `${frame.x}, ${frame.y}, ${frame.width} × ${frame.height}` : 'unknown'} | ${s.frames?.same ? 'the same' : 'moved'} over ${s.frames?.list?.length ?? 0} | ${s.fixedAttempts ?? '?'} |`;
  });
  return `## Source captures

A live recording by \`scripts/native-matrix/goldens.mjs record\` (the own native engine spec, M1b; the Decision Log's
"M1b pre-flight" item 5), committed at ${code(run)} with its \`meta.json\`: both lanes in one sitting and one run
directory, each scene's two lanes on the same fixed state. The fixed state's two captures sit between two of cua's
observations that rendered alike, and every vendor text was read only after cua's engine had checked the same state
(the scene's \`fixedStateProblems\`, the run's process and window).

| | cua lane | vendor lane |
|---|---|---|
| Path | the approved engine's socket, the raw \`Skyshot\` (\`scripts/native-matrix/goldens-device.mjs\`) | \`cua serve\` on the vendor host, the approved vendor runtime (\`prepare.mjs\`'s approved-home path) |
| Build | engine ${code(e.build)}, version ${e.engineVersion ?? 'unknown'}, approved ${e.approvedAt ?? 'unknown'} | Codex Computer Use runtime ${code(meta.vendor?.release)} (\`SkyComputerUseService\`) |

Both lanes share the following:
- the recording, ${meta.started} to ${meta.finished}, on device ${code(meta.device)} (${meta.hardware?.model ?? 'unknown'}), ${os.name ?? 'macOS'} ${os.version ?? ''} (${os.build ?? 'unknown'}), display scale ${meta.display?.scale ?? 'unknown'};
- the harness checkout at ${code(meta.checkout?.commit)}, whose engine build is the approved one, and the run directory ${code(meta.runDir)} on the device;
- Chrome for Testing ${f.chrome?.version ?? 'unknown'} and the Electron fixture ${f.electron?.electronVersion ?? 'unknown'}-${f.electron?.sourceHash ?? 'unknown'}${f.electron?.reused === false ? ' (built for this recording)' : ''}.

Each scene's window frame in points, as cua's observations read it (Finder's one window holds every capture of its
scene, so its frame is the same throughout), and how many attempts the fixed state took:

| scene | frame | over the captures | fixed-state attempts |
|---|---|---|---|
${frames.join('\n')}

## Files per scene

| Golden file | Source (\`${run}/goldens/<scene>/\`, byte for byte) |
|---|---|
| \`skyshot.json\` | cua's full observation of the fixed state, the one taken right after the vendor's text |
| \`vendor.txt\` | the vendor's full text of the same state |
| \`action.before.skyshot.json\` | cua's full observation before the action's click |
| \`action.after.skyshot.json\` | cua's next observation after the click, in the same lineage (the diff's subject) |
| \`action.vendor.before.txt\` | the vendor's full text before its click (the base of its diff) |
| \`action.vendor.diff.txt\` | the vendor's diff after its click |
| \`cua.txt\`, \`cua.diff.txt\` | cua's own rendering and diff, written by \`goldens.mjs check --write\` (or the tests with \`UPDATE_GOLDENS=1\`) and pinned byte for byte |

\`source.json\` names the recording, and the render test checks every file above against it. The engine's
per-observation diagnostics (\`timings\`, such as \`focusRead\`) are in \`meta.json\`, not in the Skyshots. Each lane's
action started from the fixed state: Finder's selection was cleared in the same window between the two actions, and
the other scenes were restarted.

## Finder is full text

Finder's fixed state hides the sidebar, the status bar and the path bar (\`scripts/repl-parity/scenes-mac-finder.mjs\`),
and every Skyshot was checked before it left the device, so Finder's window carries only the run's folder and files
and Finder's own vocabulary. It is compared by full text like the other scenes, with only the loopback page's port
normalized.
`;
}

export function sizingSection(meta) {
  const read = (when, what) => {
    const s = meta.sizingConfig?.[when];
    return `${what}, at ${s?.readAt ?? 'unknown'}:\n\n\`\`\`\n${(s?.lines ?? ['(not read)']).join('\n')}\n\`\`\``;
  };
  return `## Vendor sizing config (Statsig 406601636)

Read on the device in the recording's sitting with \`scripts/native-baseline/read-sizing-config.sh\`, which prints only
that config from the vendor helper's cached Statsig store, one line per cached evaluation. The cache refreshes only
while the vendor helper runs, so the first read shows the last fetch before the sitting and the second what the run's
helper held after the captures. A line whose \`legacy\` is anything but \`absent (false)\` means the legacy downsizing
fit was on, and the vendor's sizes would not follow the rule in the spec's "Screenshot" (U1).

${read('before', 'Before the vendor lane')}

${read('after', 'After its captures, the run\'s helper still running')}
`;
}

// Installs the recording at `out`. -> {files, source}.
export function install(out, {goldensDir = GOLDENS_DIR, repoRoot = REPO_ROOT} = {}) {
  const dir = resolve(out);
  const meta = JSON.parse(fs.readFileSync(join(dir, 'meta.json'), 'utf8'));
  if (meta.complete !== true) throw new Error(`${dir} is not complete (meta.json complete: ${meta.complete}); install takes a complete recording of every scene`);
  const rel = relative(fs.realpathSync(repoRoot), join(fs.realpathSync(dir), 'goldens'));
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${dir} is not under the repository (${repoRoot}): the goldens' source is committed with them; record with --out under the repository`);
  const missing = SCENE_ORDER.flatMap(scene => SOURCED.map(name => `${scene}/${name}`)).filter(path => !fs.existsSync(join(dir, 'goldens', path)));
  if (missing.length) throw new Error(`${dir} lacks ${missing.join(', ')}`);
  for (const scene of SCENE_ORDER) {
    fs.mkdirSync(join(goldensDir, scene), {recursive: true});
    for (const name of SOURCED) fs.copyFileSync(join(dir, 'goldens', scene, name), join(goldensDir, scene, name));
  }
  const previous = JSON.parse(fs.readFileSync(join(goldensDir, 'source.json'), 'utf8'));
  const source = {about: previous.about, kind: 'live', dir: rel.split('\\').join('/'), redacted: []};
  fs.writeFileSync(join(goldensDir, 'source.json'), `${JSON.stringify(source, null, 2)}\n`);
  const provenance = join(goldensDir, 'PROVENANCE.md');
  let text = fs.readFileSync(provenance, 'utf8');
  text = replaceSection(text, 'source', sourceSection(meta, source.dir));
  text = replaceSection(text, 'sizing', sizingSection(meta));
  fs.writeFileSync(provenance, text);
  return {files: SCENE_ORDER.length * SOURCED.length, source};
}
