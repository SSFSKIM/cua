import {isDeepStrictEqual} from 'node:util';
// Explicit result oracles, not cross-service equality: broken identical implementations must fail run.
export function expectValues(expected, state = () => true) {
  return ({results,fixtureState}) => ({
    ok: results.length === Object.keys(expected).length && results.every(r => r.ok && Object.hasOwn(expected,r.cell) && (typeof expected[r.cell] === 'function' ? expected[r.cell](r.value) : isDeepStrictEqual(r.value,expected[r.cell]))) && state(fixtureState),
    reason: results.filter(r=>!r.ok).map(r=>`${r.cell}: ${r.error?.message}`).join('; ') || undefined,
  });
}
export function expectError(results,label,pattern,codes=['Error']) {
  const result=results.find(r=>r.cell===label);
  return result?.ok===false && codes.includes(result.error?.code) && pattern.test(result.error.message);
}
