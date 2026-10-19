// The fixture's side-effect counters (the own native engine spec, Decision Log 2026-10-19, U13: what route 3's fake
// activation does to the driven app): the app's did-become-active and did-resign-active, the window's focus and blur,
// the page's (renderer window's) focus and blur, and the text field's focus and blur. Every change rewrites the file
// whole, through a temporary file and a rename, so a reader over the device shell sees one complete count or the one
// before it. The harness reads it before and after each driven action.
const nodeFs = require('node:fs');

const COUNTERS = Object.freeze(['appDidBecomeActive', 'appDidResignActive', 'windowFocus', 'windowBlur', 'pageFocus', 'pageBlur', 'textFocus', 'textBlur']);
// The renderer's names for the counters it reports through the preload bridge.
const PAGE_EVENTS = Object.freeze({'page-focus': 'pageFocus', 'page-blur': 'pageBlur', 'text-focus': 'textFocus', 'text-blur': 'textBlur'});

function createCounters(file, {fs = nodeFs, now = Date.now} = {}) {
  const counts = Object.fromEntries(COUNTERS.map(name => [name, 0]));
  let seq = 0;
  const write = () => {
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({seq, at: now(), counts}) + '\n', {mode: 0o600});
    fs.renameSync(temporary, file);
  };
  write();
  return {
    // -> whether `name` is a counter (anything else is ignored, never written).
    bump(name) {
      if (!COUNTERS.includes(name)) return false;
      counts[name] += 1; seq += 1;
      write();
      return true;
    },
    read: () => ({seq, counts: {...counts}}),
  };
}

module.exports = {COUNTERS, PAGE_EVENTS, createCounters};
