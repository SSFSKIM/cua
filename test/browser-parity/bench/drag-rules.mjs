// The scripted drags of the M5 benchmark check (docs/evidence/2026-10-13-own-browser-service-benchmark/scripted/): a
// fixed rule from the task's query and the live element rects to one tab.cua.drag path, with no judgement in the loop.
// Each function is self-contained, because the scenarios embed its source in a REPL cell.
// Rects are viewport CSS pixels {x, y, width, height}; points are rounded to whole pixels.

// MiniWoB drag-items: "Drag <name> to the top. | to the bottom. | down by one position. | up by one position. |
// to the <n>th position." over a jQuery UI sortable list. The drag starts at the item's centre and ends on the target
// row: in its lower half when moving down, its upper half when moving up, which is where jQuery UI's sortable
// (tolerance "intersect") moves the placeholder past that row.
export function dragItemsPlan(query, items) {
  const match = /^Drag (.+?) (to the top|to the bottom|down by one position|up by one position|to the (\d+)(?:st|nd|rd|th) position)\.$/.exec(String(query).trim());
  if (!match) throw new Error(`Unrecognised drag-items query: ${query}`);
  const [, item, phrase, nth] = match;
  const indexes = items.map((row, i) => (row.text.trim() === item ? i + 1 : 0)).filter(Boolean);
  if (indexes.length !== 1) throw new Error(`Expected exactly one list item named ${item}, found ${indexes.length}`);
  const fromIndex = indexes[0], n = items.length;
  const targetIndex = phrase === 'to the top' ? 1 : phrase === 'to the bottom' ? n
    : phrase === 'down by one position' ? fromIndex + 1 : phrase === 'up by one position' ? fromIndex - 1 : Number(nth);
  if (!(targetIndex >= 1 && targetIndex <= n)) throw new Error(`No list position ${targetIndex} among ${n}`);
  if (targetIndex === fromIndex) throw new Error(`${item} is already at position ${targetIndex}`);
  const source = items[fromIndex - 1], target = items[targetIndex - 1];
  const from = {x: Math.round(source.x + source.width / 2), y: Math.round(source.y + source.height / 2)};
  const to = {x: Math.round(target.x + target.width / 2), y: Math.round(target.y + target.height * (targetIndex > fromIndex ? 0.75 : 0.25))};
  return {item, fromIndex, targetIndex, path: [from, to]};
}

// MiniWoB drag-box: the small box's centre is dropped on the large box's centre, which leaves it wholly inside.
export function dragBoxPlan(query, small, large) {
  if (String(query).trim() !== 'Drag the smaller box so that it is completely inside the larger box.') throw new Error(`Unrecognised drag-box query: ${query}`);
  const centre = r => ({x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)});
  return {path: [centre(small), centre(large)]};
}

// The episode's outcome from tab.dev.logs entries: MiniWoB's core.endEpisode sets WOB_DONE_GLOBAL and then logs
// "reward: <discounted> (raw: <raw>)", so the line's presence is done and its raw value is the raw reward. A fresh tab
// runs one episode, so a second line is an anomaly, refused rather than resolved.
export function rewardFromLogs(entries) {
  const lines = entries.map(e => String(e.message)).filter(m => /^reward: \S+ \(raw: \S+\)$/.test(m));
  if (lines.length > 1) throw new Error(`more than one episode outcome logged: ${lines.join(' | ')}`);
  if (!lines.length) return {done: false, raw: null, reward: null, line: null};
  const [, reward, raw] = /^reward: (\S+) \(raw: (\S+)\)$/.exec(lines[0]);
  return {done: true, raw: Number(raw), reward: Number(reward), line: lines[0]};
}
