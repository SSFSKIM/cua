import {isDeepStrictEqual} from 'node:util';

// A page error's stack frames name lines and columns inside the service's own evaluated expressions (`<anonymous>:227:31`):
// those positions are each service's layout, not the error. The sentence, the frames and their names still compare.
// Only a stack frame line (`    at <anonymous>:L:C` or `    at name (<anonymous>:L:C)`) is masked.
const anonymousPositions = message => message.replace(/^(\s+at (?:[^\n]* \()?<anonymous>):\d+:\d+(\)?)$/gm, '$1$2');
// The fields a result row compares by (exported for comparators that judge one row the same way).
export const semantic = r => Object.fromEntries(['ok','value','error','assertion','skip','content','isError','structuredContent','meta','vendorDefect','proof'].filter(k => k in r)
  .map(k => [k, k === 'error' && typeof r.error?.message === 'string' ? {...r.error, message: anonymousPositions(r.error.message)} : r[k]]));
const polling = name => name === 'Runtime.callFunctionOn' || name.startsWith('DOM.') || name === 'Page.getLayoutMetrics';
// Comparison-relevant trace union from src/chrome/trace.mjs: requests and notifications, with optional CDP tokens.
// Other fields are diagnostics (timestamps, identifiers, parameter names and outcomes), not method-count inputs.
const traceToken = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
export function validTrace(trace) {
  if (!Array.isArray(trace)) return false;
  for (const row of trace) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !['request', 'notification'].includes(row.kind)
      || (!traceToken(row.method) && row.method !== '<invalid>')) return false;
    if (Object.hasOwn(row, 'cdp') && (!traceToken(row.cdp)
      || !((row.kind === 'request' && row.method === 'executeCdp') || (row.kind === 'notification' && row.method === 'onCDPEvent')))) return false;
  }
  return true;
}
const counts = trace => {
  const out = Object.create(null);
  for (const row of trace) if (row.cdp) out[row.cdp] = (out[row.cdp] ?? 0) + 1;
  return out;
};
function imageEqual(a,b,tolerance,{raw=false,path='',mcpImage=false}={}) {
  const imageSlot=!raw||mcpImage;
  if (imageSlot && (a?.$image === 'sha256' || b?.$image === 'sha256')) return isDeepStrictEqual(a,b);
  if (imageSlot && a?.$image && b?.$image) {
    if (a.width !== b.width || a.height !== b.height || a.$image !== b.$image || a.mimeType !== b.mimeType) return false;
    if (!/^[0-9a-f]{16}$/.test(a.hash) || !/^[0-9a-f]{16}$/.test(b.hash)) return false;
    return (BigInt('0x'+a.hash)^BigInt('0x'+b.hash)).toString(2).replaceAll('0','').length <= tolerance;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if(Array.isArray(a)!==Array.isArray(b))return false;
    const keys = Object.keys(a);
    return isDeepStrictEqual(keys.sort(), Object.keys(b).sort()) && keys.every(k => imageEqual(a[k],b[k],tolerance,{raw,path:path?`${path}.${k}`:k,mcpImage:raw&&/^content\.\d+$/.test(path)&&a.type==='image'&&b.type==='image'&&k==='data'}));
  }
  return isDeepStrictEqual(a,b);
}
export function compareRuns(a, b, {expected = [], raw = false, requireTraceParity = false, recordedAssertionFailures = {a:new Set(),b:new Set()}} = {}) {
  const differences = [], accepted = [], invalidTraces = new Set();
  // A trace allowance may name the CDP `methods` it covers and the largest count change (`maxDelta`) it accepts; when
  // given, a difference outside them is still a difference.
  const traceScope = e => (e.methods === undefined || (Array.isArray(e.methods) && e.methods.length > 0 && e.methods.every(m => typeof m === 'string')))
    && (e.maxDelta === undefined || (Number.isSafeInteger(e.maxDelta) && e.maxDelta >= 0));
  if (!Array.isArray(expected) || expected.some(e => !e.reason || !Array.isArray(e.cases) || !Array.isArray(e.cells) || !['semantic','trace'].includes(e.kind) || !traceScope(e))) throw new Error('Invalid expected-differences entry');
  const strictTrace = requireTraceParity || expected.some(e => e.axis === 'repl-host');
  const covers = (e, d) => e.cases.includes(d.case) && e.cells.includes(d.cell) && e.kind === d.kind
    && (d.kind !== 'trace' || ((e.methods === undefined || e.methods.includes(d.method)) && (e.maxDelta === undefined || Math.abs(d.a - d.b) <= e.maxDelta)));
  const add = d => {
    const allowance = expected.find(e => covers(e, d));
    (allowance ? accepted : differences).push({...d, ...(allowance ? {reason:allowance.reason} : {})});
  };
  function index(rows, side) {
    const out = new Map();
    for (const r of rows) {
      const key = JSON.stringify([r.case, r.cell ?? null]);
      if (typeof r.case !== 'string' || (!r.cell && !r.assertion) || out.has(key)) add({kind:'cardinality', side, case:r.case, cell:r.cell, message:'invalid or duplicate row'});
      if (r.skip !== undefined && (typeof r.skip !== 'string' || !r.skip.trim())) add({kind:'cardinality', side, case:r.case, message:'skip needs a reason'});
      if (Object.hasOwn(r, 'trace') && !validTrace(r.trace)) {
        add({kind:'configuration',side,case:r.case,cell:r.cell,message:'invalid trace evidence'}); invalidTraces.add(r);
      } else if (strictTrace && r.cell && !Object.hasOwn(r, 'trace')) {
        add({kind:'trace-availability',side,case:r.case,cell:r.cell,message:'required cell trace unavailable'}); invalidTraces.add(r);
      }
      if (r.cell && (typeof r.ok !== 'boolean' || (!r.ok && (!r.error || typeof r.error.message !== 'string')))) add({kind:'configuration',side,case:r.case,cell:r.cell,message:'invalid cell result'});
      if (Object.entries(r.pollingAllowance ?? {}).some(([name,n])=>!polling(name)||!Number.isSafeInteger(n)||n<0)) add({kind:'configuration',side,case:r.case,message:'invalid polling allowance'});
      if (r.screenshotTolerance !== undefined && (!Number.isInteger(r.screenshotTolerance)||r.screenshotTolerance<0||r.screenshotTolerance>64)) add({kind:'configuration',side,case:r.case,message:'invalid screenshot tolerance'});
      if (Object.hasOwn(r,'assertion') && r.assertion?.ok !== true && !recordedAssertionFailures[side]?.has(r)) add({kind:'assertion', side, case:r.case, cell:r.cell, message:'case assertion failed'});
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
    if (!imageEqual(semantic(x),semantic(y),x.screenshotTolerance ?? 0,{raw})) add({...context,kind:row.assertion ? 'assertion' : 'semantic',a:semantic(x),b:semantic(y)});
    if (invalidTraces.has(x) || invalidTraces.has(y)) continue;
    // Calibrated cells have nonempty vendor control traces, so both target traces are required even if both vanish.
    // Outside those scopes, host comparisons still reject asymmetric trace availability; legacy services can lack tracing.
    if (!x.trace?.length || !y.trace?.length) {
      const calibrated = expected.some(e => e.axis === 'repl-host' && e.kind === 'trace' && e.cases.includes(row.case) && e.cells.includes(row.cell));
      if (calibrated || (strictTrace && Boolean(x.trace?.length) !== Boolean(y.trace?.length))) {
        for (const [side, r] of [['a', x], ['b', y]]) if (!r.trace?.length) add({...context,kind:'trace-availability',side,message:'required cell trace unavailable'});
      }
      continue;
    }
    const xc = counts(x.trace), yc = counts(y.trace);
    for (const name of new Set([...Object.keys(xc), ...Object.keys(yc)])) {
      const limit = polling(name) ? (x.pollingAllowance?.[name] ?? (name.startsWith('DOM.') ? x.pollingAllowance?.['DOM.*'] : 0) ?? 0) : 0;
      if (Math.abs((xc[name] ?? 0)-(yc[name] ?? 0)) > limit) add({...context,kind:'trace',method:name,a:xc[name] ?? 0,b:yc[name] ?? 0});
    }
  }
  return {ok:!differences.length, differences, expected:accepted, cases:new Set(a.map(r => r.case)).size, cells:a.filter(r => r.cell).length};
}
