import {isDeepStrictEqual} from 'node:util';
// Explicit result oracles, not cross-service equality: broken identical implementations must fail run.
export function expectValues(expected, state = () => true) {
  return ({results,fixtureState}) => {
    if(results.length!==Object.keys(expected).length)return {ok:false,reason:'unexpected cell count'};
    for(const result of results) {
      if(!result.ok)return {ok:false,reason:`${result.cell}: ${result.error?.message}`};
      const oracle=expected[result.cell];
      if(!Object.hasOwn(expected,result.cell)||(typeof oracle==='function'?!oracle(result.value):!isDeepStrictEqual(result.value,oracle)))return {ok:false,reason:`${result.cell}: unexpected fixture result ${JSON.stringify(result.value)}`};
    }
    if(!state(fixtureState))return {ok:false,reason:`fixture side effects differ: ${JSON.stringify(fixtureState)}`};
    return {ok:true};
  };
}
export function expectError(results,label,pattern,codes=['Error']) {
  const result=results.find(r=>r.cell===label);
  return result?.ok===false && codes.includes(result.error?.code) && pattern.test(result.error.message);
}
