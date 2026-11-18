export const passwordLabel = 'PW walk test';
export const controls = [
  {label:'Public control', role:'AXTextField', value:'public-control'},
  {label:'Public notes', role:'AXTextArea', value:'public-textarea'},
];
const mask = /[•●*◦∙▪]/u;
const maskRun = /[•●*◦∙▪]+/gu;
const count = /\b(?:count|length|numberOfCharacters|characters)\s*[:=]?\s*\d+|\b\d+\s+characters\b/i;
const isSecure = n => n.role === 'AXSecureTextField' || n.subrole === 'AXSecureTextField';
const named = (n, label) => [n.title,n.description,n.identifier].includes(label);
export const passwordNodes = reply => (reply?.result?.nodes ?? []).filter(n => isSecure(n) && named(n,passwordLabel));
const nodeLines = text => text.split('\n').filter(l => /^[+~]?\s*\d+ /.test(l));
const passwordLines = text => nodeLines(text).filter(l => l.includes(passwordLabel));
const secureMarker = line => /(?:\bValue: secure text|, secure text)(?=,|$)/.test(line);
const maskLength = value => typeof value === 'string' && value && [...value].every(c=>mask.test(c)) ? value.length : 0;
const maskLengths = text => Array.from(text.matchAll(maskRun), m => m[0].length);
export const syntheticFragments = value => value.length < 7 ? (value ? [value] : [])
  : Array.from({length:value.length-6}, (_,i)=>value.slice(i,i+7));
const hasSynthetic = (text,value) => syntheticFragments(value).some(fragment=>text.includes(fragment));
const diffKind = text => /^(There has been no change|The following is a diff)/.test(text);

export function judgePassword(head, row, value, {changed=false}={}) {
  const failures = [];
  const fail = (ok, why) => {if (!ok) failures.push(why);};
  for (const [name,reply] of [['native',row.native],['repeatNative',row.repeatNative]]) {
    const nodes = passwordNodes(reply), n = nodes[0], result = reply?.result;
    fail(!reply?.error && nodes.length === 1, `${name}: expected one owned secure field`);
    if (!n) continue;
    if (head === 'fix') {
      fail(n.secure === true, `${name}: secure marker missing`);
      fail(n.value == null && n.valueType == null && n.valueMarkdown == null, `${name}: retains value metadata`);
      fail(!('numberOfCharacters' in n) && !('selectedText' in n) && !('selectedTextRange' in n), `${name}: retains a count or selection key`);
      fail(result.selectedText == null, `${name}: retains selected text`);
      fail(!count.test(JSON.stringify(n)) && !mask.test(JSON.stringify(n)), `${name}: secure field contains a count or mask`);
      // A provider may emit an unrelated control count; do not mistake it for a password leak. A mask on another node is not expected in this fixture.
      fail(!(result.nodes ?? []).some(node => [node.value,node.valueMarkdown,node.valueDescription].some(v=>maskLengths(String(v)).some(len=>len>=3))), `${name}: mask appears in tree values`);
    } else {
      fail(value.length ? maskLength(n.value) === value.length : n.value === '', `${name}: main does not expose the expected length via a provider mask`);
      fail(n.numberOfCharacters == null || n.numberOfCharacters === value.length, `${name}: unexpected main count`);
    }
    fail(!hasSynthetic(JSON.stringify(reply),value), `${name}: synthetic value or fragment exposed`);
  }
  for (const [name,text] of [['full',row.text],['transition',row.diff],['repeat',row.repeated]]) {
    fail(typeof text === 'string' && text.length > 0, `${name}: missing rendered reply`);
    if (typeof text !== 'string') continue;
    const lines = passwordLines(text);
    if (head === 'fix') {
      if (name === 'full') fail(lines.length === 1, `${name}: expected one rendered owned field`);
      fail(lines.every(l=>secureMarker(l) && !count.test(l) && !mask.test(l)), `${name}: field lacks marker or discloses a count or mask`);
      fail(!/^Selected text:/m.test(text) && !maskLengths(text).some(len=>len>=3), `${name}: selected text or masks rendered`);
    } else if (value.length && (name === 'full' || (name === 'transition' && changed))) {
      fail(lines.some(l=>maskLengths(l).includes(value.length)), `${name}: main does not render the expected mask`);
    }
    fail(!hasSynthetic(text,value), `${name}: synthetic value or fragment exposed`);
    if (name === 'repeat' || (name === 'transition' && changed)) fail(diffKind(text), `${name}: renderer fell back to full output, not a diff`);
  }
  return failures;
}

export function judgeControls(main, fix) {
  const failures = [];
  for (const {role,label,value} of controls) {
    const lines = [];
    for (const [head,row] of [['main',main],['fix',fix]]) {
      const nodes = (row.native.result?.nodes ?? []).filter(n=>n.role===role && named(n,label));
      if (nodes.length !== 1 || nodes[0].value !== value) failures.push(`${head}: ${label} native node/value missing or wrong`);
      const matched = nodeLines(row.text).filter(l=>l.includes(label) && l.includes(value));
      if (matched.length !== 1) failures.push(`${head}: ${label} rendered node/value missing or ambiguous`);
      lines.push(matched[0]);
    }
    if (lines[0] !== lines[1]) failures.push(`${label}: rendered lines are not byte-identical`);
  }
  return failures;
}

export function pasteDisclosures(reply,value) {
  const found=[];
  function visit(obj, path=[]) {
    if (!obj || typeof obj!=='object') return;
    for (const [key,v] of Object.entries(obj)) {
      const next=[...path,key];
      if ((v!=null && /^(range|selection|selectedText|selectedTextRange|entered|numberOfCharacters|characters|characterCount|length|textLength|valueLength)$/i.test(key)) ||
          (typeof v==='string' && (count.test(v)||hasSynthetic(v,value)||maskLengths(v).some(len=>len>=3)))) found.push(next.join('.'));
      visit(v,next);
    }
  }
  visit(reply);
  return found;
}

export function timingStats(samples) {
  if (!samples.length || samples.some(s=>['wallMs','walkMs'].some(k=>!Number.isFinite(s[k]) || s[k]<0))) throw Error('invalid sample');
  const summarize = key => {
    const sorted = samples.map(s=>s[key]).sort((a,b)=>a-b);
    return [0.5,0.95,1].map(p=>Math.round(sorted[Math.ceil(p*sorted.length)-1]*1000)/1000);
  };
  return {n:samples.length,wallMs:summarize('wallMs'),walkMs:summarize('walkMs')};
}
