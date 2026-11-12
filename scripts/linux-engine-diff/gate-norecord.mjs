#!/usr/bin/env node
// A harness script, unmodified, with one change made from outside (task 49's norecord.mjs, generalized for the gate's
// private steps): every Desktop's `begin` gets the record hook the tests use, so a step on a private display starts no
// whole-run RECORD (task 41: RECORD can freeze the X server).
// usage: node gate-norecord.mjs <harness script> <its arguments>
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Desktop } from './scenes.mjs';

const script = resolve(process.argv[2]);
const begin = Desktop.prototype.begin;
Desktop.prototype.begin = function beginWithoutRecord(options = {}) {
  return begin.call(this, { startRecord: async () => null, ...options });
};
// the script reads its arguments as if run directly
process.argv.splice(1, 2, script);
await import(pathToFileURL(script).href);
