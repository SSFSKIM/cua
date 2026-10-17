// A cell's timing as a scenario judges it: a cell the mini's pause touched (scripts/mini-pause.mjs) has its timing
// dropped by the runner (undefined), so a judgement on it holds vacuously rather than counting a timing a CI job's load
// may have stretched. Every other timing is judged as written.
export const timed = (ms, judge) => ms === undefined || judge(ms);
