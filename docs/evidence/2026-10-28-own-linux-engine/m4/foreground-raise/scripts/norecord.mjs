#!/usr/bin/env node
// The harness's own command line, unmodified, with one change made from outside (task 49's norecord.mjs): every
// Desktop's `begin` gets the record hook its tests use (`startRecord: async () => null`), so a run on a private display
// starts no whole-run RECORD (task 41: RECORD can freeze the X server).
// usage: node norecord.mjs <harness dir> <linux-engine-diff.mjs arguments>
const harness = process.argv[2];
process.argv.splice(2, 1);
const { Desktop } = await import(`${harness}/scripts/linux-engine-diff/scenes.mjs`);
const begin = Desktop.prototype.begin;
Desktop.prototype.begin = function beginWithoutRecord(options = {}) {
  return begin.call(this, { startRecord: async () => null, ...options });
};
await import(`${harness}/scripts/linux-engine-diff.mjs`);
