// measure.mjs's phases (`--groups`): which cell groups a lane run takes, so the second input sitting runs in phases
// (the own native engine spec, Decision Log 2026-10-19: the revision entry's delegated unknowns U2–U6, U9, U10, U12,
// U13). The groups, in the order a run takes them whatever order the flag names them in:
//   speed    the observation cells: warm.listApps, the fixed and action goldens, the TextEdit getAXState/getScreenshot
//            series and task, the per-scene trees and screenshots, the switches' preflight and series (probe c′) and
//            the read-set equivalence (U9's four-scene triple runs this group on both lanes)
//   ab       probes (a) and (b), the forced routes 1, 2′, 2 and 3 included (U3 on Chrome, U4 on Electron)
//   routes   the route matrix: element click, coordinate click and key under 2′, 3 and forced 2 on every scene, each
//            sample with the activation watcher, the front checks, an outcome read-back and Electron's counters
//            (U12, U10)
//   effects  route 3's driven-side effects: each scene window's activation point and what lies under it, the
//            selection across the activation and a route-3 key, Electron's counters around each (U13)
//   coord    the coordinate click live on TextEdit and its refusals (U2)
//   tap      probe_tap per mode (--tap-modes), then probe (d)'s first checks for every mode that created a tap (U5)
//   d        probe (d) as today: the no-fire check over the task rows, the tap and keystroke rows, and the operator
//            steps with --operator (U6)
//   e        probe (e): Korean and Unicode under both input sources, the keyed bypass (U3 on Chrome)
// Default: speed, ab, d, e, which is everything a run took before the groups existed, in the same order.
export const GROUPS = Object.freeze(['speed', 'ab', 'routes', 'effects', 'coord', 'tap', 'd', 'e']);
export const DEFAULT_GROUPS = Object.freeze(['speed', 'ab', 'd', 'e']);
// The vendor lane takes the observation cells only: every other group forces a route, reads the engine's spike
// answers (probe_spike, probe_tap) or posts through spike arguments the vendor's helper does not have.
export const VENDOR_GROUPS = Object.freeze(['speed']);
export const TAP_MODES = Object.freeze(['listen', 'active']);

// A comma list of names out of `allowed`, in `allowed`'s order. -> [name] | throws with `what` named.
export function parseList(value, allowed, what) {
  const names = String(value ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!names.length || names.some(n => !allowed.includes(n)) || new Set(names).size !== names.length) throw new Error(`${what} is a list of ${allowed.join(', ')}`);
  return allowed.filter(n => names.includes(n));
}
export const parseGroups = value => parseList(value, GROUPS, '--groups');
export const parseTapModes = value => parseList(value, TAP_MODES, '--tap-modes');

// Whether `lane` takes `group`.
export const laneTakes = (lane, group) => lane === 'cua' || VENDOR_GROUPS.includes(group);

// One not-run row per requested group the lane does not take, with the reason.
export function groupNotRunRows(lane, groups) {
  return groups.filter(g => !laneTakes(lane, g)).map(group => ({op: `group.${group}`, group, sample: 1, ok: false,
    notRun: 'the vendor lane takes the observation cells only: this group forces routes or reads the engine\'s spike answers'}));
}
