// The two Chrome route records (src/chrome/route.mjs), written as their registrations write them, for tests whose
// behaviour follows the home's route. `at` sets the record's mtime (seconds), which decides the route when both exist.
import {mkdirSync, utimesSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {cuaRecordFile, vendorRecordFile} from '../../src/chrome/route.mjs';

function write(path, record, at) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, JSON.stringify(record));
  if (at !== undefined) utimesSync(path, at, at);
}

export const writeVendorRecord = (home, {at} = {}) => write(vendorRecordFile(home), {schema: 1, browsers: {chrome: {manifestPath: '/nm/com.openai.codexextension.json'}}}, at);
export const writeCuaRecord = (home, {at} = {}) => write(cuaRecordFile(home), {schema: 1, route: 'cua', launcher: '/l', backendsDir: '/b', browsers: {chrome: {manifestPath: '/nm/io.github.ssfskim.cua.json', previous: null}}}, at);
