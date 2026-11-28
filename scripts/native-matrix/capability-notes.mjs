// Known capability differences no matrix cell exercises (./expected/capability-notes.json), for the report's "What
// changes for a user" section alone (./summary.mjs renderSummary). Report text, never a declaration: the judge does not
// read them, so none reaches a verdict, a list or a rejudge comparison. A difference a cell exercises is a departure
// (./departures.mjs) instead.
import * as fs from 'node:fs';

export const CAPABILITY_NOTES_FILE = new URL('./expected/capability-notes.json', import.meta.url);

// -> [{ticket, priority, status, ruling, text}].
export function readCapabilityNotes(file = CAPABILITY_NOTES_FILE) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(json?.notes)) throw new Error(`${file.pathname ?? file}: no notes list`);
  return json.notes;
}

// One note as the report prints it.
export const noteLine = n => `- ${n.text} (${n.ticket}, ${n.priority}, ${n.status}; ruling ${n.ruling}). No matrix cell exercises it: report text, never judged.`;
