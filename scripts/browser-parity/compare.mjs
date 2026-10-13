import {isDeepStrictEqual} from 'node:util';

// A page error's stack names lines and columns inside the service's own evaluated expressions (`<anonymous>:227:31`):
// those positions are each service's layout, not the error. The sentence, the frames and their names still compare.
const anonymousPositions = message => message.replace(/<anonymous>:\d+:\d+/g, '<anonymous>');
const semantic = r => Object.fromEntries(['ok','value','error','assertion','skip'].filter(k => k in r)
  .map(k => [k, k === 'error' && typeof r.error?.message === 'string' ? {...r.error, message: anonymousPositions(r.error.message)} : r[k]]));
const polling = name => name === 'Runtime.callFunctionOn' || name.startsWith('DOM.') || name === 'Page.getLayoutMetrics';
const counts = trace => {
  const out = {};
  for (const row of trace) if (row.cdp) out[row.cdp] = (out[row.cdp] ?? 0) + 1;
  return out;
};
function imageEqual(a,b,tolerance) {
  if (a?.$image && b?.$image) {
    if (a.width !== b.width || a.height !== b.height || a.$image !== b.$image) return false;
    if (!/^[0-9a-f]{16}$/.test(a.hash) || !/^[0-9a-f]{16}$/.test(b.hash)) return false;
    return (BigInt('0x'+a.hash)^BigInt('0x'+b.hash)).toString(2).replaceAll('0','').length <= tolerance;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if(Array.isArray(a)!==Array.isArray(b))return false;
    const keys = Object.keys(a);
    return isDeepStrictEqual(keys.sort(), Object.keys(b).sort()) && keys.every(k => imageEqual(a[k],b[k],tolerance));
  }
  return isDeepStrictEqual(a,b);
}
export function compareRuns(a, b, {expected = []} = {}) {
  const differences = [], accepted = [];
  if (!Array.isArray(expected) || expected.some(e => !e.reason || !Array.isArray(e.cases) || !Array.isArray(e.cells) || !['semantic','trace'].includes(e.kind))) throw new Error('Invalid expected-differences entry');
  const add = d => {
    const allowance = expected.find(e => e.cases.includes(d.case) && e.cells.includes(d.cell) && e.kind === d.kind);
    (allowance ? accepted : differences).push({...d, ...(allowance ? {reason:allowance.reason} : {})});
  };
  function index(rows, side) {
    const out = new Map();
    for (const r of rows) {
      const key = JSON.stringify([r.case, r.cell ?? null]);
      if (typeof r.case !== 'string' || (!r.cell && !r.assertion) || out.has(key)) add({kind:'cardinality', side, case:r.case, cell:r.cell, message:'invalid or duplicate row'});
      if (r.skip !== undefined && (typeof r.skip !== 'string' || !r.skip.trim())) add({kind:'cardinality', side, case:r.case, message:'skip needs a reason'});
      if (r.cell && (typeof r.ok !== 'boolean' || (!r.ok && (!r.error || typeof r.error.message !== 'string')))) add({kind:'configuration',side,case:r.case,cell:r.cell,message:'invalid cell result'});
      if (Object.entries(r.pollingAllowance ?? {}).some(([name,n])=>!polling(name)||!Number.isSafeInteger(n)||n<0)) add({kind:'configuration',side,case:r.case,message:'invalid polling allowance'});
      if (r.screenshotTolerance !== undefined && (!Number.isInteger(r.screenshotTolerance)||r.screenshotTolerance<0||r.screenshotTolerance>64)) add({kind:'configuration',side,case:r.case,message:'invalid screenshot tolerance'});
      if (r.assertion && r.assertion.ok !== true) add({kind:'assertion', side, case:r.case, message:'case assertion failed'});
      out.set(key,r);
    }
    for (const id of new Set(rows.map(r => r.case))) if (!out.has(JSON.stringify([id,null]))) add({kind:'cardinality',side,case:id,message:'missing case assertion'});
    return out;
  }
  const left = index(a,'a'), right = index(b,'b');
  if (!a.length || !b.length) add({kind:'cardinality',message:'empty run'});
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const x = left.get(key), y = right.get(key), row = x ?? y;
    const context = {case:row.case, cell:row.cell};
    if (!x || !y) { add({...context,kind:'cardinality',message:'missing case/cell'}); continue; }
    if (!isDeepStrictEqual(x.pollingAllowance ?? {}, y.pollingAllowance ?? {}) || (x.screenshotTolerance ?? 0) !== (y.screenshotTolerance ?? 0)) add({...context,kind:'configuration',message:'comparison allowances changed'});
    if (!imageEqual(semantic(x),semantic(y),x.screenshotTolerance ?? 0)) add({...context,kind:row.assertion ? 'assertion' : 'semantic',a:semantic(x),b:semantic(y)});
    // Older resident hosts emit no trace. Missing/empty means unavailable, not zero CDP calls.
    if (!x.trace?.length || !y.trace?.length) continue;
    const xc = counts(x.trace), yc = counts(y.trace);
    for (const name of new Set([...Object.keys(xc), ...Object.keys(yc)])) {
      const limit = polling(name) ? (x.pollingAllowance?.[name] ?? (name.startsWith('DOM.') ? x.pollingAllowance?.['DOM.*'] : 0) ?? 0) : 0;
      if (Math.abs((xc[name] ?? 0)-(yc[name] ?? 0)) > limit) add({...context,kind:'trace',method:name,a:xc[name] ?? 0,b:yc[name] ?? 0});
    }
  }
  return {ok:!differences.length, differences, expected:accepted, cases:new Set(a.map(r => r.case)).size, cells:a.filter(r => r.cell).length};
}
