import {readFileSync} from 'node:fs';
export const inventory=JSON.parse(readFileSync(new URL('../../test/repl-parity/inventory.json',import.meta.url),'utf8'));
export const milestones=['M0','M1','M2','M3','M4','M5'];
export function caseSchedule(rows=inventory) {
  const cases=new Map();
  for(const row of rows) for(const id of row.cases) {
    let entry=cases.get(id);
    if(!entry)cases.set(id,entry={id,milestone:id.startsWith('api/')?'M3':id.startsWith('native/')?'M4':row.milestone,platforms:[],contracts:[]});
    // Types inherit their latest consumer; they cannot delay an earlier case. Each case keeps its earliest obligation.
    if(!id.startsWith('api/')&&!id.startsWith('native/')&&row.milestone<entry.milestone)entry.milestone=row.milestone;
    entry.contracts.push(row.id);
    for(const platform of (id.startsWith('native/')?['linux']:row.platforms))if(!entry.platforms.includes(platform))entry.platforms.push(platform);
  }
  return [...cases.values()];
}
export function validateRegistry(scenarios,rows=inventory) {
  const plan=new Map(caseSchedule(rows).map(c=>[c.id,c])),seen=new Set();
  for(const s of scenarios) {
    if(seen.has(s.id))throw new Error(`duplicate scenario ${s.id}`);seen.add(s.id);
    const due=plan.get(s.id);if(!due)throw new Error(`unknown case ${s.id}`);
    if(s.milestone!==due.milestone)throw new Error(`${s.id}: wrong due milestone`);
    if(!Array.isArray(s.contracts)||!s.contracts.length||s.contracts.some(id=>!due.contracts.includes(id)))throw new Error(`${s.id}: invalid contract linkage`);
    if(!Array.isArray(s.platforms)||!s.platforms.length||s.platforms.some(p=>!due.platforms.includes(p)))throw new Error(`${s.id}: invalid platforms`);
    if(!['host-boundary','no-services','fixture-services','capability-host','chrome','binder-double','native','secret-double'].includes(s.backend))throw new Error(`${s.id}: invalid backend`);
    if(s.imageMode!==undefined&&!['exact','live'].includes(s.imageMode))throw new Error(`${s.id}: invalid image mode`);
    if(s.screenshotTolerance!==undefined&&(s.imageMode!=='live'||!Number.isInteger(s.screenshotTolerance)||s.screenshotTolerance<0||s.screenshotTolerance>64))throw new Error(`${s.id}: screenshot tolerance only applies to live images`);
    if(typeof s.assert!=='function')throw new Error(`${s.id}: missing independent assert`);
    if(!Array.isArray(s.cells)||!s.cells.length||new Set(s.cells.map(c=>c.label)).size!==s.cells.length)throw new Error(`${s.id}: invalid cells`);
    for(const c of s.cells)if(!c.label||(!c.op&&typeof c.code!=='string'))throw new Error(`${s.id}: invalid cell`);
  }
  return scenarios;
}
export function inSuite(id,suite) {
  if(suite==='all')return true;
  if(suite==='cells')return id.startsWith('cells/')&&!/^cells\/(facade|documentation|profiles)\//.test(id);
  if(suite==='docs-profiles')return /^cells\/(documentation|profiles)\//.test(id);
  if(suite==='api')return !inSuite(id,'cells')&&!inSuite(id,'docs-profiles');
  throw new Error('Invalid suite');
}
export function selectScenarios(scenarios,rows=inventory,{suite='cells',through,platform='darwin'}={}) {
  validateRegistry(scenarios,rows);
  if(through!==undefined&&!milestones.includes(through))throw new Error('Invalid through milestone');
  const applicable=caseSchedule(rows).filter(c=>inSuite(c.id,suite)&&c.platforms.includes(platform));
  const selected=scenarios.filter(s=>inSuite(s.id,suite)&&s.platforms.includes(platform)&&(!through||s.milestone<=through));
  // An unqualified M0 baseline records runnable cases, with every future/missing case explicitly pending.
  // An explicit stage is a completeness gate, not permission to silently skip an unimplemented case.
  const missing=applicable.filter(c=>(!through||c.milestone<=through)&&!selected.some(s=>s.id===c.id));
  if(through&&missing.length)throw new Error(`missing executable cases through ${through}: ${missing.map(c=>c.id).join(', ')}`);
  return {scenarios:selected,pending:applicable.filter(c=>!selected.some(s=>s.id===c.id))};
}
