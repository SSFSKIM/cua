// The two Chrome registration records (src/chrome/route.mjs), written as their registrations wrote them: cua's own, and
// the one the removed ChatGPT extension route left (#79), which only chromeMigration reads. `at` sets the record's mtime
// (seconds), which chromeMigration compares when both exist.
import {mkdirSync, utimesSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {cuaRecordFile, vendorRecordFile} from '../../src/chrome/route.mjs';

function write(path, record, at) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, JSON.stringify(record));
  if (at !== undefined) utimesSync(path, at, at);
}

export const writeVendorRecord = (home, {at} = {}) => write(vendorRecordFile(home), {schema: 1, browsers: {chrome: {manifest: '/nm/com.openai.codexextension.json', replaced: false}}}, at);
export const writeCuaRecord = (home, {at} = {}) => write(cuaRecordFile(home), {schema: 1, route: 'cua', launcher: '/l', backendsDir: '/b', browsers: {chrome: {manifestPath: '/nm/io.github.ssfskim.cua.json', previous: null}}}, at);
