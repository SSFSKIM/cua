#!/usr/bin/env node
// Task 49 part 1 (#171 M4): the harness's own command line (live-43's scripts/linux-engine-diff.mjs, unmodified), with
// one change made from outside: every Desktop's `begin` gets the record hook its tests use (`startRecord: async () =>
// null`), so a run on a private display starts no whole-run RECORD (part 1 runs none, by the design session's GO).
// Everything else of the run is the harness's: its watchdog, its private session bus, its trace, its Chrome, its stop.
// The record's absence shows in each run's end row as `record: {skipped: …}`.
// usage: node norecord.mjs <linux-engine-diff.mjs arguments>

const LIVE = '/Users/new/.local/share/cua-171/live-43/scripts';
const { Desktop } = await import(`${LIVE}/linux-engine-diff/scenes.mjs`);
const begin = Desktop.prototype.begin;
Desktop.prototype.begin = function beginWithoutRecord(options = {}) {
  return begin.call(this, { startRecord: async () => null, ...options });
};
await import(`${LIVE}/linux-engine-diff.mjs`);
