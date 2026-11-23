// Ruling (the design session, after M5's placement): the Electron goldens stay as recorded on fixture build
// 23c8b77691d0 (PROVENANCE.md), shown inactive, while every live scene now comes up key (`--cua-fixture-focus`). That
// holds only while no live sitting reads the Electron recording as its expected value, so a live sitting's process
// (scripts/hosted-sittings/run.mjs execStep sets LIVE_SITTING_ENV for every step) refuses to load one. A later cell
// that needs the recording live takes a hosted re-record with it.
export const LIVE_SITTING_ENV = 'CUA_LIVE_SITTING';
export const RECORDED_ONLY_SCENES = Object.freeze(['electron']);

// Throws when a live sitting's process asks for a golden of a scene whose recording no longer describes the live scene.
export function refuseLiveRecording(scene, env = process.env) {
  if (env[LIVE_SITTING_ENV] && RECORDED_ONLY_SCENES.includes(scene))
    throw new Error(`a live sitting read the ${scene} golden as an expected value: it was recorded inactive on fixture build 23c8b77691d0 and the live scene comes up key (test/native-goldens/PROVENANCE.md); re-record it on a hosted run with the cell that needs it`);
}
