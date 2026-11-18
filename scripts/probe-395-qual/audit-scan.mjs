// Pure privacy scanner for the #395 qualification: finds synthetic values, lengths, marker content and non-allowlisted
// type-readback fields on any surface (raw engine reply, rendered result, thrown wrapper error, merged meta, engine stderr),
// and returns a SANITIZED COPY in which every violation is replaced by "[redacted:<code>]". A scan never throws and never
// echoes a violating value: findings carry a fixed code, a surface label and a path of key names only.
// Lanes: 'plain' (ordinary literal type_text: its own quote fields are legitimate and stay out of rows), 'secret' (a
// concealed type_text: #354's rule, nothing of the value, its length or a count of anything it implies on any surface), and
// 'secure' (a password field: the secret rule, and the type-readback holds nothing beyond confirmation, a reason and secure:true).
import {createHash} from 'node:crypto';
const LANES=Object.freeze(['plain','secret','secure']);
export const FORBIDDEN_SECRET_KEY=/^(before|after|actual|expected|value|selectedText|selection|range|caret|.*excerpt|(?:cua\/)?entered|(?:cua\/)?checkpoints|pollMs|reads|settleReads|settleCapped|placeholderLine|placeholderCaretUnread|expectedLength|actualLength|beforeLength|afterLength|textLength|valueLength|(?:before|actual|expected|value|text)Length)$/i;
// Keys that are not values but numbers about time; a number equal to a secret's length there is a coincidence, not a leak.
export const TIMING_KEY=/(Ms|Us|Ns|At|Time|Timestamp|Elapsed|Duration|Delay)$/i;
const LENGTH_KEY=/(^|[^a-z])(len|length|count|size|bytes?|chars?|characters?|units?|utf-?(8|16)|total|limit|cap|width)([^a-z]|$)|(Length|Count|Size|Bytes|Chars|Units)$/;
const LENGTH_LABEL_KEYS=/^(name|kind|label|field|attribute|type|what|unit|metric)$/i;
const LENGTH_WORD=/\b(len|length|count|size|bytes?|chars?|characters?|code ?units?|utf-?(8|16)|units?)\b/i;
const MARKER_KEY=/marker/i;
const MARKER_CONTENT_KEY=/marker.*(content|offset|index|byte|data|value|text|string|hash|ptr|pointer|bits|base64|hex|length|range|position|raw|decoded|identifier)|(content|offset|index|bytes?|data|value|text|hash|raw|decoded|pointer).*marker/i;
const MARKER_DESCRIPTION=/AXTextMarker|AXUIElement|<AX[A-Za-z]+\s|CFData|CFTypeRef|\b0x[0-9a-f]{8,}\b|<[0-9a-f]{8}( [0-9a-f]{8}){1,}>/;
const TOKEN=/^[A-Za-z][A-Za-z0-9_./:-]{0,63}$/;
const PROSE=/^[A-Za-z][A-Za-z ,.'()/:;-]{0,199}$/;
// Reasons are fixed camelCase words: letters only, so a reason cannot carry a count, offset or encoded byte.
export const REASON=/^[a-z][A-Za-z]{2,40}$/;
export const SECRET_READBACK_KEYS=Object.freeze({confirmed:'boolean',reason:'reason',snapshotMs:'number',concealed:'true',keysUnconfirmed:'true',stoppedBeforeKey:'true'});
export const SECURE_READBACK_KEYS=Object.freeze({confirmed:'boolean',reason:'reason',snapshotMs:'number',concealed:'true',secure:'true'});
export const PLAIN_READBACK_KEYS=Object.freeze(['confirmed','reason','snapshotMs','pollMs','reads','checkpoints','keysUnconfirmed','expectedLength','actualLength','start','expected','actual','stoppedBeforeKey','placeholderLine','placeholderCaretUnread','settleReads','settleCapped']);
const PLAIN_QUOTE_KEYS=/^(before|actual|expected|value|text|.*excerpt)$/i;
const safeKey=k=>/^[A-Za-z0-9_./@-]{1,48}$/.test(k)?k:'(key)';
const b64=buf=>buf.toString('base64');
export function createScanner({extraSecretReadbackKeys=[]}={}){
 const registry=new Map(); // lowercase 8-character window -> 'secret' | 'plain'
 const encodings=[];      // {kind, needle}
 const secretValues=[],windowLengths=new Set();
 function windowsOf(value){const out=new Set();const w=Math.min(8,value.length);if(w<6)return out;for(let i=0;i+w<=value.length;i++){const s=value.slice(i,i+w);if(/[^0-9]/.test(s))out.add(s.toLowerCase())}return out}
 function register(value,kind='secret'){
  if(typeof value!=='string'||value.length<6)return;
  const k=kind==='secret'?'secret':'plain';
  for(const w of windowsOf(value)){windowLengths.add(w.length);if(registry.get(w)!=='secret')registry.set(w,k)}
  const bytes=Buffer.from(value,'utf8');
  encodings.push({kind:k,needle:bytes.toString('hex')});
  for(let off=0;off<3;off++){const e=b64(Buffer.concat([Buffer.alloc(off),bytes])),skip=Math.ceil(off*4/3)+1,core=e.replace(/=+$/,'').slice(skip,-2);if(core.length>=8)encodings.push({kind:k,needle:core})}
  if(k==='secret')secretValues.push(value);
 }
 // Which kinds of registered value a string carries: raw windows (case-insensitive) and encoded forms.
 function carries(s){
  const kinds=new Set();if(typeof s!=='string'||s.length<6)return kinds;
  const low=s.toLowerCase();
  for(const w of windowLengths){
   for(let i=0;i+w<=low.length;i++){const k=registry.get(low.slice(i,i+w));if(k){kinds.add(k);if(k==='secret')break}}
   if(kinds.has('secret'))break;
  }
  for(const e of encodings)if(!kinds.has(e.kind)&&low.includes(e.needle.toLowerCase()))kinds.add(e.kind);
  return kinds;
 }
 const bytesRun=a=>Array.isArray(a)&&a.length>=8&&a.every(x=>Number.isInteger(x)&&x>=0&&x<=255);
 function charCodeRunCarries(a){ // an array of char codes spelling a registered value
  if(!bytesRun(a))return false;const s=String.fromCharCode(...a);return carries(s).has('secret')
 }
 function lengthCandidates(ctx){return ctx.lengths}
 function ctxOf(lane,lengths=[]){if(!LANES.includes(lane))throw Error('invalid lane');return {lane,lengths:new Set(lengths.filter(n=>Number.isSafeInteger(n)&&n>0))}}
 // ---- scan -------------------------------------------------------------------------------------------------------
 function scan(value,{lane,lengths=[],surface='surface'}){
  const ctx=ctxOf(lane,lengths),findings=[],stats={withheld:0,plainQuotes:0,novelKeys:[]};
  const strict=lane!=='plain';
  const flag=(code,path)=>{findings.push({code,surface,path:path.map(safeKey).join('.')});return '[redacted:'+code+']'};
  const seen=new WeakSet();
  const readbackKeys=lane==='secure'?{...SECURE_READBACK_KEYS}:{...SECRET_READBACK_KEYS};
  for(const k of extraSecretReadbackKeys)readbackKeys[k]='scalar';
  function str(s,key,path,siblingLabels){
   const k=carries(s);
   if(k.has('secret'))return flag('secret-fragment',path);
   if(k.has('plain')){if(strict)return flag('plain-value-in-secret-lane',path);stats.plainQuotes++;return '[plain quote withheld]'}
   if(MARKER_DESCRIPTION.test(s))return flag('marker-value',path);
   if(key!==null&&MARKER_KEY.test(key)&&!TOKEN.test(s))return flag('marker-value',path);
   if(strict&&candidateContext(s,ctx))return flag('length-context',path);
   const compact=/^[A-Za-z0-9+/=]+$/.test(s)&&!s.startsWith('/');
   if(compact&&((/^[0-9a-f]{16,}$/i.test(s))||(s.length>=24&&/[0-9]/.test(s)&&/[A-Za-z]/.test(s))))return flag('opaque-blob',path);
   if(key==='reason'||(key!==null&&TOKEN.test(s)&&s.length<=64))return TOKEN.test(s)?s:withhold();
   if(PROSE.test(s))return s;
   return withhold();
  }
  function withhold(){stats.withheld++;return '[string withheld]'}
  function candidateContext(s,c){
   if(!c.lengths.size)return false;
   for(const m of s.matchAll(/(\d{1,6})\s*(characters?|chars?|code ?units?|utf-?(?:8|16)|bytes?|units?|long)\b/gi))if(c.lengths.has(Number(m[1])))return true;
   for(const m of s.matchAll(/\b(?:length|len|size|count)\b\s*(?:is|of|=|:)?\s*(\d{1,6})/gi))if(c.lengths.has(Number(m[1])))return true;
   return false;
  }
  function num(n,key,path,labels){
   if(!Number.isFinite(n))return null;
   if(key!==null&&TIMING_KEY.test(key))return n;
   if(key!==null&&FORBIDDEN_SECRET_KEY.test(key)&&strict)return flag('forbidden-key',path);
   if(strict&&key!==null&&LENGTH_KEY.test(key)&&(lane==='secure'||ctx.lengths.has(n)))return flag('length-key',path);
   if(strict&&ctx.lengths.has(n)&&labels.some(l=>LENGTH_WORD.test(l)))return flag('length-context',path);
   if(strict&&key!==null&&MARKER_CONTENT_KEY.test(key))return flag('marker-key',path);
   return n;
  }
  function walk(v,path,key,parent,inReadback){
   if(v===null||v===undefined)return v===undefined?null:null;
   if(typeof v==='boolean')return v;
   const labels=parent?Object.entries(parent).filter(([k,x])=>typeof x==='string'&&(LENGTH_LABEL_KEYS.test(k)||LENGTH_WORD.test(k))).map(([,x])=>x):[];
   if(parent&&key!==null&&LENGTH_WORD.test(key))labels.push(key);
   if(typeof v==='number')return num(v,key,path,labels);
   if(typeof v==='bigint')return flag('binary-value',path);
   if(typeof v==='string')return str(v,key,path,labels);
   if(typeof v==='function'||typeof v==='symbol')return null;
   if(v instanceof ArrayBuffer||ArrayBuffer.isView(v)||Buffer.isBuffer(v))return strict?flag('binary-value',path):(stats.withheld++,'[binary withheld]');
   if(seen.has(v))return '[cycle]';
   if(path.length>12)return strict?flag('depth-exceeded',path):null;
   seen.add(v);
   let out;
   if(Array.isArray(v)){
    if(bytesRun(v))out=flag(charCodeRunCarries(v)?'secret-fragment':'marker-bytes',path);
    else out=v.slice(0,64).map((x,i)=>walk(x,[...path,String(i)],key,{[key??'']:x},inReadback));
   }else{
    if(v instanceof Error)v=errorObject(v);
    out={};
    for(const [k,x] of Object.entries(v).slice(0,64)){
     const p=[...path,k];
     if(!/^[A-Za-z0-9_./@ -]{1,64}$/.test(k)){out['(key)']=flag('novel-key',p);continue}
     if(MARKER_CONTENT_KEY.test(k)&&x!==null&&typeof x!=='boolean'&&!(typeof x==='string'&&REASON.test(x))){out[k]=flag('marker-key',p);continue}
     if(MARKER_KEY.test(k)&&x!==null&&typeof x==='object'){out[k]=flag('marker-key',p);continue}
     if(k==='typeReadback'||k==='cua/typeReadback'){out[k]=readback(x,p);continue}
     if(strict&&FORBIDDEN_SECRET_KEY.test(k)&&x!==null&&x!==undefined&&!(k==='keysUnconfirmed'&&typeof x==='boolean')){out[k]=flag('forbidden-key',p);continue}
     if(k==='message'&&typeof x==='string'){out[k]=str(x,k,p,[]);continue}
     out[k]=walk(x,p,k,v,inReadback);
    }
   }
   seen.delete(v);
   return out;
  }
  function errorObject(e){return {...Object.fromEntries(Object.getOwnPropertyNames(e).filter(k=>k!=='stack').map(k=>[k,e[k]])),name:e.name,message:e.message}}
  // A type-readback record: the lane's allowlist decides what may stay. Everything kept is a scalar that passed the string checks.
  function readback(rec,path){
   if(rec===null||rec===undefined)return null;
   if(typeof rec!=='object'||Array.isArray(rec))return flag('novel-key',path);
   const out={};
   for(const [k,x] of Object.entries(rec)){
    const p=[...path,k];
    if(!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k)){out['(key)']=flag('novel-key',p);continue}
    if(strict){
     const rule=readbackKeys[k];
     if(!rule){out[k]=flag(FORBIDDEN_SECRET_KEY.test(k)||MARKER_CONTENT_KEY.test(k)?'forbidden-key':'novel-key',p);continue}
     const ok=rule==='boolean'?typeof x==='boolean'
      :rule==='true'?x===true
      :rule==='number'?typeof x==='number'&&Number.isFinite(x)
      :rule==='reason'?typeof x==='string'&&REASON.test(x)&&!carries(x).size
      :(x===null||['boolean','number','string'].includes(typeof x));
     if(!ok){out[k]=flag(k==='keysUnconfirmed'?'forbidden-key':'secure-meta',p);continue}
     out[k]=typeof x==='string'&&carries(x).size?flag('secret-fragment',p):x;
     continue;
    }
    if(PLAIN_QUOTE_KEYS.test(k)){if(typeof x==='string'){out[k]='[plain quote withheld]';stats.plainQuotes++}else out[k]=walk(x,p,k,rec,true);continue}
    if(!PLAIN_READBACK_KEYS.includes(k))stats.novelKeys.push(safeKey(k));
    out[k]=walk(x,p,k,rec,true);
   }
   return out;
  }
  const clean=walk(value,[],null,null,false);
  return {clean,findings,stats};
 }
 // One line of engine stderr: only findings and a count survive; the line itself is never kept.
 function scanLine(line,{lane='secret',lengths=[],surface='engine-stderr'}={}){
  const ctx=ctxOf(lane,lengths),findings=[];
  const add=code=>findings.push({code,surface,path:'line'});
  const k=carries(line);
  if(k.has('secret'))add('secret-fragment');
  else if(k.has('plain')&&lane!=='plain')add('plain-value-in-secret-lane');
  if(MARKER_DESCRIPTION.test(line))add('marker-value');
  if(lane!=='plain'&&candidateContextLine(line,ctx))add('length-context');
  return findings;
 }
 function candidateContextLine(s,ctx){
  if(!ctx.lengths.size)return false;
  for(const m of s.matchAll(/(\d{1,6})\s*(characters?|chars?|code ?units?|utf-?(?:8|16)|bytes?|units?|long)\b/gi))if(ctx.lengths.has(Number(m[1])))return true;
  for(const m of s.matchAll(/\b(?:length|len|size|count)\b\s*(?:is|of|=|:)?\s*(\d{1,6})/gi))if(ctx.lengths.has(Number(m[1])))return true;
  return false;
 }
 return {register,carries,scan,scanLine};
}
export const digest=s=>createHash('sha1').update(s).digest('hex').slice(0,16);
