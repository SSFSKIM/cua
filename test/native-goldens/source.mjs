// Where the golden files come from (./source.json; PROVENANCE.md): M0's captures re-keyed (./rekey.mjs), or a live
// recording of scripts/native-matrix/goldens.mjs, whose run directory holds each original golden under goldens/<scene>/.
// The render test guards every installed file against its source (and declared account-home substitution) via fromSource.
import fs from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOURCED, fromSource as fromM0} from './rekey.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '../..');
export const SOURCE_FILE = join(HERE, 'source.json');
export const SOURCE = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
// The golden files a source supplies (PROVENANCE.md, "Files per scene"); cua.txt and cua.diff.txt are the renderer's
// own, pinned by the tests.
export {SOURCED};
// The scenes compared by structure: those whose captures were redacted.
export const STRUCTURAL = new Set(SOURCE.redacted ?? []);

// The content of one golden file as its source gives it.
export function fromSource(scene, name, source = SOURCE) {
  if (source.kind === 'm0') return fromM0(scene, name);
  if (source.kind === 'live') {
    const text = fs.readFileSync(join(ROOT, source.dir, scene, name), 'utf8');
    if (!source.accountHomeReplacement) return text;
    // Keep the original recording immutable. Only its account-home prefix is replaced in installed test fixtures,
    // in both lanes and every before/after snapshot; this is not structural redaction or a comparison exemption.
    const {runDir} = JSON.parse(fs.readFileSync(join(ROOT, source.dir, '..', 'meta.json'), 'utf8'));
    const home = runDir?.match(/^(\/Users\/[^/]+)\/Library\/Caches\/cua-harness\/native-goldens$/)?.[1];
    if (!home) throw new Error('golden recording has no account-home provenance');
    return text.split(home + '/').join(source.accountHomeReplacement + '/');
  }
  throw new Error(`unknown golden source kind ${source.kind}`);
}
