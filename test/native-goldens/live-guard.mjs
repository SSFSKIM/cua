// Ruling (the design session, after M5's placement): the Electron goldens stay as recorded on fixture build
// 23c8b77691d0 (PROVENANCE.md), shown inactive, while every live scene now comes up key (`--cua-fixture-focus`). That
// holds only while no live sitting reads the Electron recording as its expected value, so a live sitting's process
// (scripts/hosted-sittings/run.mjs execStep sets LIVE_SITTING_ENV for every step's controller-side process; the device
// side, reached over ssh, reads no golden) refuses to load one. The unit suites a step runs (accept-native's `npm test`)
// compare the recording with itself, offline, so their environment drops the marker (`unmarked`). A later cell that
// needs the recording live, or a hosted re-record (whose `goldens.mjs check` reads every scene), runs unmarked.
export const LIVE_SITTING_ENV = 'CUA_LIVE_SITTING';
// Each scene whose recording no longer describes the live scene, and why.
export const RECORDED_ONLY_SCENES = Object.freeze({
  electron: 'it was recorded inactive on fixture build 23c8b77691d0 and the live scene comes up key',
});

// Throws when a live sitting's process asks for a golden of a scene whose recording no longer describes the live scene.
export function refuseLiveRecording(scene, env = process.env) {
  if (env[LIVE_SITTING_ENV] && Object.hasOwn(RECORDED_ONLY_SCENES, scene))
    throw new Error(`a live sitting read the ${scene} golden as an expected value: ${RECORDED_ONLY_SCENES[scene]} (test/native-goldens/PROVENANCE.md); re-record it on a hosted run with the cell that needs it`);
}

// An environment without the marker: for a process that reads the recording offline, as the unit suites do.
export const unmarked = env => Object.fromEntries(Object.entries(env).filter(([key]) => key !== LIVE_SITTING_ENV));
