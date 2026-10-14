// What the two drag scenarios share: the task page (the archive benchmark's fixture, which the run's operator starts on
// the device at 127.0.0.1:48731, TASKS.md's address; see the evidence README), the START and query cells, the outcome
// cell and the oracle.
import {rewardFromLogs} from './drag-rules.mjs';
export const BENCH_ORIGIN = 'http://127.0.0.1:48731';
export const taskPage = task => `${BENCH_ORIGIN}/miniwob/miniwob/${task}.html?seed=bench-${task}`;
export const startCells = [
  {label: 'start', code: "await tab.playwright.locator('#sync-task-cover').click();return true;"},
  {label: 'query', code: "globalThis.benchQuery=await tab.playwright.locator('#query').innerText();return benchQuery;"},
];
// The console line can trail the action that ended the episode by an event-loop turn on either service, so the read is
// repeated (bounded, 3 s) until the line appears; an episode with no line by then is not done.
export const outcomeCell = {label: 'outcome', code: `const rewardFromLogs=${rewardFromLogs};
const deadline=Date.now()+3000;let outcome;
for(;;){outcome=rewardFromLogs(await tab.dev.logs({filter:'reward:'}));if(outcome.done||Date.now()>deadline)break;await new Promise(r=>setTimeout(r,100));}
return outcome;`};
export function episodeAssert({results}) {
  const failed = results.find(r => !r.ok);
  if (failed) return {ok: false, reason: `${failed.cell}: ${failed.error?.message ?? 'failed'}`};
  const outcome = results.find(r => r.cell === 'outcome')?.value;
  if (!outcome?.done) return {ok: false, reason: 'episode not done'};
  return outcome.raw === 1 ? {ok: true} : {ok: false, reason: `raw reward ${outcome.raw}`};
}
