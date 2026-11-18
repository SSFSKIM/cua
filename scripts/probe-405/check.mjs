export const passwordLabel = 'PW walk test';
export const controls = [
  {label:'Public control', role:'AXTextField', value:'public-control'},
  {label:'Public notes', role:'AXTextArea', value:'public-textarea'},
];
const mask = /[•●*◦∙▪]/u;
const maskRun = /[•●*◦∙▪]+/gu;
const count = /\b(?:count|length|number[ _-]*of[ _-]*characters|characters|character[ _-]*count|(?:text|value|selection)[ _-]*length)\s*[:=]?\s*\d+|\b\d+\s+characters\b/i;
const selection = /\b(?:selection(?:[ _-]*range)?|(?:selected[ _-]*text|visible[ _-]*character|text)[ _-]*range|selected[ _-]*text|range)\s*[:=]/i;
const countOrSelectionKey = /^(?:AX)?(?:count|number[ _-]*of[ _-]*characters|characters|character[ _-]*count|(?:text|value|selection)?[ _-]*length|range|selection(?:[ _-]*range)?|selected[ _-]*text|(?:selected[ _-]*text|visible[ _-]*character|text)[ _-]*range)$/i;
const isSecure = n => n.role === 'AXSecureTextField' || n.subrole === 'AXSecureTextField';
const named = (n, label) => [n.title,n.description,n.identifier].includes(label);
export const passwordNodes = reply => (reply?.result?.nodes ?? []).filter(n => isSecure(n) && named(n,passwordLabel));

const focusPrefix = 'The focused UI element is ';
const nodeLine = /^([+~-]?)\s*(\d+) (.+)$/;
const secureRole = /^(?:secure text field|password(?: text)? field|protected text field|AXSecureTextField)\b/i;
const secureValue = 'Value: secure text';
const isOwned = line => line.includes(passwordLabel);
const looksSecure = line => isOwned(line) || secureRole.test(line) || line.split(', ').includes(secureValue);
const secureMarker = line => {
  // The renderer labels Value when there are other parts (one of them is the owned fixture label).
  // An unnamed secure element can have a bare `secure text` as its sole part instead.
  const parts = line.replace(/^([^(,]+?)\s*\([^)]*\) /, '$1 ').split(', ');
  const first = parts[0].replace(secureRole, '').trimStart();
  const values = [first,...parts.slice(1)].filter(part => part.startsWith('Value: '));
  return values.length ? values.length === 1 && values[0] === secureValue
    : !isOwned(line) && first === 'secure text' && parts.length === 1;
};
const safeSecureLine = line => secureMarker(line) && !count.test(line) && !selection.test(line) && !mask.test(line);

// The numeric lines inside a Selected: trailer are not part of the tree, nor is the focus trailer.
const treeLines = text => text.split(/\n(?=Selected(?::| text:)|The focused UI element is )/,1)[0].split('\n');
const nodeLines = text => treeLines(text).filter(line => /^[+~]?\s*\d+ /.test(line));
const ownedEntries = entries => [...entries].filter(([,line])=>isOwned(line));
const fullTree = text => treeLines(text).flatMap(line => {
  const m = nodeLine.exec(line);
  return m && !m[1] ? [[Number(m[2]),m[3]]] : [];
});
const diffKind = text => /^(There has been no change in the accessibility tree|The following is a diff from the previous accessibility tree)/.test(text);

function checkDiff(fail, name, text, previous, current) {
  if (typeof previous !== 'string') {
    fail(false, `${name}: missing numbered full-render baseline`);
    return [];
  }
  const baseline = fullTree(previous), before = ownedEntries(baseline), entries = new Map(baseline);
  fail(before.length === 1 && safeSecureLine(before[0][1]), `${name}: baseline lacks one secure owned field`);
  const lines = treeLines(text);
  for (const line of lines) {
    if (!line.startsWith('Removed element IDs:')) continue;
    // Test the range against known indexes without expanding it.
    for (const range of line.slice('Removed element IDs:'.length).split(',')) {
      const m = /^(\d+)(?:-(\d+))?$/.exec(range.trim());
      if (!m || Number(m[1]) > Number(m[2] ?? m[1])) {
        fail(false, `${name}: malformed removed element IDs`);
        continue;
      }
      for (const id of entries.keys()) if (id >= Number(m[1]) && id <= Number(m[2] ?? m[1])) entries.delete(id);
    }
  }
  for (const line of lines) {
    const m = nodeLine.exec(line);
    if (!m || !m[1]) continue;
    const id = Number(m[2]);
    if (m[1] === '-') entries.delete(id);
    else entries.set(id,m[3]);
  }
  const after = ownedEntries(entries);
  const expected = typeof current === 'string' ? ownedEntries(fullTree(current)) : after;
  fail(after.length === 1 && safeSecureLine(after[0][1]) && expected.length === 1
    && after[0][0] === expected[0][0] && after[0][1] === expected[0][1], `${name}: diff does not leave the expected secure owned field`);
  return after;
}

const maskLength = value => typeof value === 'string' && value && [...value].every(c=>mask.test(c)) ? value.length : 0;
const maskLengths = text => Array.from(text.matchAll(maskRun), m => m[0].length);
const renderedSelection = text => {
  const first = /^Selected text:/m.exec(text);
  return first ? /^Selected text: ```\n([^\n]*)\n```(?:\n|$)/.exec(text.slice(first.index))?.[1] ?? '' : null;
};
const matchesSelection = (selected, length) => length === 0 ? selected == null : maskLength(selected) === length;
export const syntheticFragments = value => value.length < 7 ? (value ? [value] : [])
  : Array.from({length:value.length-6}, (_,i)=>value.slice(i,i+7));
const hasSynthetic = (text,value) => syntheticFragments(value).some(fragment=>text.includes(fragment));
export function containsSynthetic(text, knownValues) {
  if (typeof text !== 'string') return false;
  for (const value of knownValues) if (hasSynthetic(text,value)) return true;
  return false;
}

export function judgePassword(head, row, value, {changed=false,requireFocus=false,selectedMaskLength,knownValues=[]}={}) {
  const failures = [];
  const fail = (ok, why) => {if (!ok) failures.push(why);};
  const values = new Set([value,...knownValues]);
  const native = [['native',row.native],['repeatNative',row.repeatNative]];
  if ('fullNative' in row) native.push(['fullNative',row.fullNative]);
  for (const [name,reply] of native) {
    const nodes = passwordNodes(reply), n = nodes[0], result = reply?.result;
    fail(!reply?.error && nodes.length === 1, `${name}: expected one owned secure field`);
    fail(!containsSynthetic(JSON.stringify(reply),values), `${name}: synthetic value or fragment exposed`);
    if (requireFocus) fail(n?.token && result.focused === n.token, `${name}: owned secure field is not AX focused`);
    if (!result) continue;
    if (head === 'fix') {
      fail(result.selectedText == null, `${name}: retains selected text`);
      fail(!Object.keys(result).some(key=>key !== 'selectedText' && countOrSelectionKey.test(key)), `${name}: observation retains a count or selection key`);
      const tree = [...(result.nodes ?? []),...(result.menuBar ?? [])];
      for (const node of tree.filter(node=>isSecure(node) || node.secure === true)) {
        fail(node.secure === true, `${name}: secure marker missing`);
        fail(node.value == null && node.valueType == null && node.valueMarkdown == null && node.valueDescription == null, `${name}: retains value metadata`);
        fail(!Object.keys(node).some(key=>countOrSelectionKey.test(key)), `${name}: secure field retains a count or selection key`);
        const data = JSON.stringify(node);
        fail(!count.test(data) && !selection.test(data) && !mask.test(data), `${name}: secure field contains a count, selection or mask`);
      }
      // Ordinary controls can emit their own counts. Mask runs in other node values are unexpected in this fixture.
      fail(!tree.some(node => [node.value,node.valueMarkdown,node.valueDescription].some(v=>maskLengths(String(v)).some(len=>len>=3))), `${name}: mask appears in tree values`);
    } else {
      if (n) {
        fail(value.length ? maskLength(n.value) === value.length : n.value === '', `${name}: main does not expose the expected length via a provider mask`);
        fail(n.numberOfCharacters == null || n.numberOfCharacters === value.length, `${name}: unexpected main count`);
      }
      if (selectedMaskLength != null) fail(matchesSelection(result.selectedText,selectedMaskLength), `${name}: main does not expose the expected selected text mask`);
    }
  }
  const sequenced = row.sequencedText ?? row.text;
  const rendered = [['full',row.text],['transition',row.diff],['repeat',row.repeated]];
  if (row.sequencedText != null) rendered.push(['sequenced full',row.sequencedText]);
  for (const [name,text] of rendered) {
    fail(typeof text === 'string' && text.length > 0, `${name}: missing rendered reply`);
    if (typeof text !== 'string') continue;
    const isDiff = diffKind(text);
    if (name === 'repeat' || (name === 'transition' && changed)) fail(isDiff, `${name}: renderer fell back to full output, not a diff`);
    const lines = nodeLines(text).filter(isOwned);
    if (head === 'fix') {
      const owned = isDiff
        ? checkDiff(fail,name,text,name === 'repeat' ? sequenced : row.previousText,name === 'transition' ? sequenced : null)
        : ownedEntries(fullTree(text));
      if (!isDiff) fail(owned.length === 1, `${name}: expected one rendered owned field`);
      for (const raw of text.split('\n')) {
        const focus = raw.startsWith(focusPrefix);
        const m = nodeLine.exec(focus ? raw.slice(focusPrefix.length) : raw);
        if (!m) continue;
        const ownedFocus = focus && owned.some(([id])=>id === Number(m[2]));
        if (ownedFocus || looksSecure(m[3])) fail(safeSecureLine(m[3]) && (!ownedFocus || isOwned(m[3])),
          `${name}: secure field lacks its label or marker, or discloses a count, selection or mask`);
      }
      fail(!/^Selected text:/m.test(text) && !maskLengths(text).some(len=>len>=3), `${name}: selected text or masks rendered`);
    } else {
      if (value.length && (!isDiff || (name === 'transition' && changed))) {
        fail(lines.some(l=>maskLengths(l).includes(value.length)), `${name}: main does not render the expected mask`);
      }
      if (selectedMaskLength != null) fail(matchesSelection(renderedSelection(text),selectedMaskLength), `${name}: main does not render the expected selected text mask`);
    }
    fail(!containsSynthetic(text,values), `${name}: synthetic value or fragment exposed`);
  }
  return failures;
}

export function judgeControls(main, fix) {
  const failures = [];
  for (const {role,label,value} of controls) {
    const lines = [];
    for (const [head,row] of [['main',main],['fix',fix]]) {
      const surfaces = [['native',row.native]];
      if ('fullNative' in row) surfaces.push(['fullNative',row.fullNative]);
      for (const [surface,reply] of surfaces) {
        const nodes = (reply?.result?.nodes ?? []).filter(n=>n.role===role && named(n,label));
        if (nodes.length !== 1 || nodes[0].value !== value) failures.push(`${head}: ${label} ${surface} node/value missing or wrong`);
      }
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
