import {isDeepStrictEqual} from 'node:util';
// Explicit result oracles, not cross-service equality: broken identical implementations must fail run.
export function expectValues(expected, state = () => true) {
  const check=({results,fixtureState},pendingCells=[]) => {
    if(pendingCells.some(cell=>!Object.hasOwn(expected,cell)))throw Error('Unknown pending assertion cell');
    if(results.length!==Object.keys(expected).length)return {ok:false,reason:'unexpected cell count'};
    for(const result of results) {
      if(pendingCells.includes(result.cell))continue;
      if(!result.ok)return {ok:false,reason:`${result.cell}: ${result.error?.message}`};
      const oracle=expected[result.cell];
      if(!Object.hasOwn(expected,result.cell)||(typeof oracle==='function'?!oracle(result.value):!isDeepStrictEqual(result.value,oracle)))return {ok:false,reason:`${result.cell}: unexpected fixture result ${JSON.stringify(result.value)}`};
    }
    if(!state(fixtureState))return {ok:false,reason:`fixture side effects differ: ${JSON.stringify(fixtureState)}`};
    return {ok:true};
  };
  const assertion=input=>check(input);
  assertion.withPendingCells=(input,cells)=>check(input,cells);
  return assertion;
}
export function expectError(results,label,pattern,codes=['Error']) {
  const result=results.find(r=>r.cell===label);
  return result?.ok===false && codes.includes(result.error?.code) && pattern.test(result.error.message);
}
