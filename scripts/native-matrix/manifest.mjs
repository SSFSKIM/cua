// Every row one full native matrix run must hold (./run.mjs FULL_PLAN), read by the judge (./summary.mjs) and by the
// declared-departures file's checks (./departures.mjs), which may name only a judged row of it.
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {exclusionOf} from './not-judged.mjs';
import {caseId, casesOf, isPanelTarget, methodTimingId, SCENE_OF, speedExtraCases} from './plan.mjs';
import {probeRowsOf} from './probe-run.mjs';
import {FULL_PLAN, SPEED_OPS} from './run.mjs';
import {unicodeRowsOf} from './unicode-plan.mjs';

export {SPEED_OPS};

// The method cases of both regimes, the speed ops of every scene (`samples` each) and every frontmost case's timing,
// the finding rows of every scene (its
// ten targets, the lines and the ID count), the launch rows, the probe cells' rows and the Unicode matrix's but its
// not-judged rows (./not-judged.mjs). `run` is the run's number (meta.run), the sample of its method, finding and launch
// rows; a method row also names what its case expects (plan.mjs: 'outcome' or 'refusal'). -> [{section, id, sample,
// expect?}].
export function manifestOf({run, samples}, plan = FULL_PLAN) {
  // The speed-extra cell (ruling 1228, F): its ops' timings, `samples` each.
  if (plan.speedExtra) return plan.frontmost.flatMap(t => speedExtraCases(t, 'timed').flatMap(c => Array.from({length: samples}, (_, i) => ({section: 'speed', id: methodTimingId(t, c), sample: i + 1}))));
  const out = [];
  const judged = id => !exclusionOf({section: 'method', id});
  for (const target of plan.frontmost) for (const c of casesOf(target, 'frontmost')) if (judged(caseId(target, 'frontmost', c))) out.push({section: 'method', id: caseId(target, 'frontmost', c), sample: run, expect: c.expect});
  for (const {driven, user} of plan.background) for (const c of casesOf(driven, 'background')) if (judged(caseId(driven, 'background', c, user))) out.push({section: 'method', id: caseId(driven, 'background', c, user), sample: run, expect: c.expect});
  const scenes = [...new Set(plan.frontmost.filter(t => !isPanelTarget(t)).map(t => SCENE_OF[t]))];
  if (plan.speed) for (const scene of scenes) for (const op of SPEED_OPS) for (let i = 1; i <= samples; i++) out.push({section: 'speed', id: `${scene}/${op}`, sample: (run - 1) * samples + i});
  // Each frontmost case's own timing, one per run (./steps.mjs caseRow's `speed`): part 5's "each method cell".
  if (plan.speed) for (const target of plan.frontmost) for (const c of casesOf(target, 'frontmost')) out.push({section: 'speed', id: methodTimingId(target, c), sample: run});
  if (plan.finding) for (const scene of scenes) {
    for (const t of SCENES[scene].targets) out.push({section: 'finding', id: `${scene}/target.${t.id}`, sample: run});
    out.push({section: 'finding', id: `${scene}/lines`, sample: run}, {section: 'finding', id: `${scene}/ids`, sample: run});
  }
  for (const {scene, user} of plan.launch) out.push({section: 'launch', id: `${scene}/background/launch@${user}`, sample: run});
  for (const {section, id} of probeRowsOf(plan)) out.push({section, id, sample: run});
  if (plan.unicode) for (const {id} of unicodeRowsOf(plan.unicode)) if (!exclusionOf({section: 'unicode', id})) out.push({section: 'unicode', id, sample: run});
  // A filtered rerun (ruling 1228, ./run.mjs filteredPlan) expects its listed cells alone.
  return plan.only ? out.filter(r => plan.only.has(`${r.section} ${r.id}`)) : out;
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
