// Every row one full native matrix run must hold (./run.mjs FULL_PLAN), read by the judge (./summary.mjs) and by the
// declared-departures file's checks (./departures.mjs), which may name only a judged row of it.
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {exclusionOf} from './not-judged.mjs';
import {CASES, caseId, SCENE_OF} from './plan.mjs';
import {probeRowsOf} from './probe-run.mjs';
import {FULL_PLAN} from './run.mjs';
import {unicodeRowsOf} from './unicode-plan.mjs';

export const SPEED_OPS = Object.freeze(['getAXState', 'getScreenshot', 'listApps']);

// The method cases of both regimes, the speed ops of every scene (`samples` each), the finding rows of every scene (its
// ten targets, the lines and the ID count), the launch rows, the probe cells' rows and the Unicode matrix's but its
// not-judged rows (./not-judged.mjs). `run` is the run's number (meta.run), the sample of its method, finding and launch
// rows; a method row also names what its case expects (plan.mjs: 'outcome' or 'refusal'). -> [{section, id, sample,
// expect?}].
export function manifestOf({run, samples}, plan = FULL_PLAN) {
  const out = [];
  for (const target of plan.frontmost) for (const c of CASES[target]) out.push({section: 'method', id: caseId(target, 'frontmost', c), sample: run, expect: c.expect});
  for (const {driven, user} of plan.background) for (const c of CASES[driven]) out.push({section: 'method', id: caseId(driven, 'background', c, user), sample: run, expect: c.expect});
  const scenes = [...new Set(plan.frontmost.filter(t => t !== 'openPanel').map(t => SCENE_OF[t]))];
  if (plan.speed) for (const scene of scenes) for (const op of SPEED_OPS) for (let i = 1; i <= samples; i++) out.push({section: 'speed', id: `${scene}/${op}`, sample: (run - 1) * samples + i});
  if (plan.finding) for (const scene of scenes) {
    for (const t of SCENES[scene].targets) out.push({section: 'finding', id: `${scene}/target.${t.id}`, sample: run});
    out.push({section: 'finding', id: `${scene}/lines`, sample: run}, {section: 'finding', id: `${scene}/ids`, sample: run});
  }
  for (const {scene, user} of plan.launch) out.push({section: 'launch', id: `${scene}/background/launch@${user}`, sample: run});
  for (const {section, id} of probeRowsOf(plan)) out.push({section, id, sample: run});
  if (plan.unicode) for (const {id} of unicodeRowsOf(plan.unicode)) if (!exclusionOf({section: 'unicode', id})) out.push({section: 'unicode', id, sample: run});
  return out;
}

// The judged cells (rows by section and id) of a full run, in the manifest's order. -> [{section, id, expect?}].
export function cellsOf(plan = FULL_PLAN) {
  const seen = new Set(), out = [];
  for (const {section, id, expect} of manifestOf({run: 1, samples: 1}, plan)) {
    const key = `${section} ${id}`;
    if (!seen.has(key)) { seen.add(key); out.push({section, id, ...(expect ? {expect} : {})}); }
  }
  return out;
}
