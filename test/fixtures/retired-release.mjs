// The vendor's Linux release tree as an older cua's `cua install` left it (#171 M6b; the pre-flight's §3.1): a few
// placeholder files under runtimes/<release>/cua_node and the install record that install wrote, in its exact shape.
// No vendor code. The archives are written out here, not read from the module under test or the provenance records.
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const RETIRED = {
  x64: {release: '26.928.40906-linux-x64', sha256: '8094004f1cbccf35deefded15961aa42b4db889121a5d952c5f30cf82bd8ad30', length: 474898954},
  arm64: {release: '26.928.40906-linux-arm64', sha256: 'ab3eea138b767555aecb2b69f4aa553d843e6c5ef3037645e544aafc72d0f5cd', length: 453477698},
};
export const INSTALLED_AT = '2026-10-28T09:12:33.123Z';

const FILES = {
  'cua_node/bin/node': '#!/bin/sh\necho placeholder node\n',
  'cua_node/bin/node_repl': '#!/bin/sh\necho placeholder node_repl\n',
  'cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64': '#!/bin/sh\necho placeholder sky_linux\n',
  'cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/service.js': 'export async function handleRpc() {}\n',
  'cua_node/manifest.json': '{"platform":"linux"}\n',
};

// The record install.mjs wrote for `arch`'s release, with `over` merged in (a key set to undefined is dropped).
export function retiredRecord(arch = 'x64', over = {}) {
  const {release, sha256, length} = RETIRED[arch];
  const record = {schema: 1, release, archive: {sha256, length}, source: 'download', installedAt: INSTALLED_AT, ...over};
  for (const [key, value] of Object.entries(record)) if (value === undefined) delete record[key];
  return record;
}

// Plants the release in `home` -> {root, bytes: the sum of its files' sizes, the record's included}. `record` is the
// record's text (a string), or an object, or null for none.
export function plantRetiredRelease(home, {arch = 'x64', record = retiredRecord(arch), name = RETIRED[arch].release} = {}) {
  const root = join(home, 'runtimes', name);
  let bytes = 0;
  for (const [rel, text] of Object.entries(FILES)) {
    mkdirSync(join(root, rel, '..'), {recursive: true});
    writeFileSync(join(root, rel), text, {mode: text.startsWith('#!') ? 0o755 : 0o644});
    bytes += Buffer.byteLength(text);
  }
  if (record !== null) {
    const text = typeof record === 'string' ? record : `${JSON.stringify(record, null, 2)}\n`;
    writeFileSync(join(root, 'install.json'), text, {mode: 0o644});
    bytes += Buffer.byteLength(text);
  }
  return {root, bytes};
}
