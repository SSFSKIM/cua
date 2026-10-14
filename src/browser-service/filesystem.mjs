// Ported from readable chatgpt-26.928.40906 BS:77493-77510 (K2, the runtime's filesystem); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
//
// Where the service writes the files a command returns the path of (the content exports, the page asset bundles): under
// this machine's temporary directory (os.tmpdir(), read at each use, so TMPDIR moves it), as the vendor does. Nothing
// else is written by the service.
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';

export const LOCAL_FILESYSTEM = Object.freeze({
  get tmpDir() { return tmpdir(); },
  async mkdir(path, options) { await mkdir(path, options); },
  async rm(path, options) { await rm(path, options); },
  async writeFile(path, data) { await writeFile(path, data); },
});
