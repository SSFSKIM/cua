// Imported first by a test file whose tests resolve a macOS computer session's selection without injecting its engine
// inputs: points HOME at an empty scratch directory for the whole file, so the native engine's selection
// (src/runtime/launch.mjs nativeEngineFor, which reads ~/.config/cua/engine.json and the approved engine under HOME)
// finds neither and takes the default, whatever the account running the suite has set. Children the tests spawn
// inherit it. The ambient CUA_NATIVE_ENGINE is dropped for the same reason (a test that copies process.env into a
// selection would otherwise resolve the account's exported setting). Removed when the process exits.
import {mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export const SCRATCH_HOME = realpathSync(mkdtempSync(join(tmpdir(), 'cua-test-home-')));
process.env.HOME = SCRATCH_HOME;
delete process.env.CUA_NATIVE_ENGINE;
process.on('exit', () => rmSync(SCRATCH_HOME, {recursive: true, force: true}));
