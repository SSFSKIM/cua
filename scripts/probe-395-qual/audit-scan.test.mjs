import test from 'node:test';
import assert from 'node:assert/strict';
import {createScanner} from './audit-scan.mjs';

const SECRET='f3a9c04be7d21856a0c9e4b7d3f18a52',PLAIN='1c7be0a49d35f862b4e0d17c93a5f6e8',SEED='Old draft sentence goes here.';
function scanner(extra={}){const s=createScanner(extra);s.register(SECRET,'secret');s.register(PLAIN,'plain');s.register(SEED,'seed');return s}
const scan=(value,lane='secret',lengths=[32],s=scanner())=>s.scan(value,{lane,lengths,surface:'t'});
const codes=r=>r.findings.map(f=>f.code).sort();
const concealed={confirmed:true,snapshotMs:12.4,concealed:true};

test('a clean concealed reply keeps every allowlisted typeReadback field',()=>{
 const raw={result:{meta:{startedAt:1768000000000,endedAt:1768000000032,inputRoute:'keys',typeReadback:{...concealed,keysUnconfirmed:true,stoppedBeforeKey:true}}}};
 const r=scan(raw);
 assert.deepEqual(r.findings,[]);
 assert.deepEqual(r.clean.result.meta.typeReadback,{...concealed,keysUnconfirmed:true,stoppedBeforeKey:true});
 assert.equal(r.clean.result.meta.startedAt,1768000000000);
});
test('secret fragments are found raw, case-folded, in encodings and as char-code arrays, and redacted without echo',()=>{
 for(const leaked of ['xx '+SECRET.slice(5,20)+' yy',SECRET.slice(3,15).toUpperCase(),Buffer.from(SECRET).toString('hex'),Buffer.from(SECRET).toString('base64'),Buffer.from('zz'+SECRET).toString('base64'),JSON.stringify({a:SECRET})]){
  const r=scan({error:{message:'Failed '+leaked,errorName:'typeUnconfirmed'}});
  assert.ok(codes(r).includes('secret-fragment'),leaked.slice(0,10));
  assert.equal(JSON.stringify(r.clean).includes(SECRET.slice(8,16)),false);
 }
 const arr=[...Buffer.from(SECRET.slice(0,12))],r=scan({detail:arr});
 assert.ok(codes(r).length>0);assert.equal(JSON.stringify(r.clean).includes(String(arr[0])+','+String(arr[1])),false);
});
test('digit-only windows and plain timestamps are not mistaken for fragments or lengths',()=>{
 const s=createScanner();s.register('4400000000011111111110000000000','secret');
 assert.deepEqual(s.scan({startedAt:1770000032,endedAt:4400000000011,snapshotMs:32,d:{pollMs:32}},{lane:'secret',lengths:[32],surface:'t'}).findings.map(f=>f.code),['forbidden-key']);
 // 32 under a timing key is a coincidence; 32 under a length-like key or a length context is not.
 assert.deepEqual(scan({snapshotMs:32,startedAt:32,elapsedMs:32}).findings,[]);
 assert.deepEqual(codes(scan({typeLength:32})),['length-key']);
 assert.deepEqual(codes(scan({detail:{name:'length',amount:32}})),['length-context']);
 assert.deepEqual(codes(scan({message:'Typed 32 characters'})),['length-context']);
 assert.deepEqual(codes(scan({message:'length is 32'})),['length-context']);
 assert.deepEqual(scan({count:31,size:129}).findings,[]); // not this secret's length
});
test('#354 concealed expectedLength and the plain quote keys stay forbidden in the secret lane only',()=>{
 const rb={confirmed:false,reason:'valueMismatch',expectedLength:32,actualLength:31,expected:'x',actual:'y'};
 const sec=scan({error:{meta:{typeReadback:rb}}});
 assert.deepEqual(codes(sec),['forbidden-key','forbidden-key','forbidden-key','forbidden-key']);
 assert.equal(sec.clean.error.meta.typeReadback.reason,'valueMismatch');
 const plain=scan({error:{meta:{typeReadback:{...rb,expected:'abcdefgh',actual:'abcdefgi',pollMs:5,reads:3,start:2}}}},'plain',[]);
 assert.deepEqual(plain.findings,[]);
 assert.equal(plain.clean.error.meta.typeReadback.expectedLength,32);
 assert.equal(plain.clean.error.meta.typeReadback.expected,'[plain quote withheld]'); // ordinary quote: legitimate, never kept in a row
 assert.equal(plain.stats.plainQuotes,2);
});
test('novel typeReadback keys fail closed in the secret lane and are reported, not failed, in the plain lane',()=>{
 const s=scan({result:{meta:{typeReadback:{...concealed,markerReads:3}}}});
 assert.deepEqual(codes(s),['novel-key']);assert.equal(s.clean.result.meta.typeReadback.markerReads,'[redacted:novel-key]');
 assert.deepEqual(scan({result:{meta:{typeReadback:{...concealed,routeNote:true}}}},'secret',[32],scanner({extraSecretReadbackKeys:['routeNote']})).findings,[]);
 const p=scan({result:{meta:{typeReadback:{confirmed:true,markerReads:3}}}},'plain',[]);
 assert.deepEqual(p.findings,[]);assert.deepEqual(p.stats.novelKeys,['markerReads']);assert.equal(p.clean.result.meta.typeReadback.markerReads,3);
 assert.deepEqual(codes(scan({result:{meta:{typeReadback:{...concealed,keysUnconfirmed:2}}}})),['forbidden-key']);
});
test('secure lane meta is canonical confirmation, a reason and secure:true, nothing about a value or range',()=>{
 const ok=scan({error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason:'secure',snapshotMs:3,concealed:true,secure:true}}}},'secure');
 assert.deepEqual(ok.findings,[]);
 for(const extra of [{secure:'yes'},{secure:1},{value:'x'},{range:[3,4]},{caret:3},{selectedLength:0},{secure:true,textLength:32},{keysUnconfirmed:true},{reason:'secure32'},{reason:'marker offset 4'}])
  assert.ok(scan({meta:{typeReadback:{confirmed:false,reason:'secure',...extra}}},'secure').findings.length>0,JSON.stringify(extra));
 assert.deepEqual(codes(scan({error:{meta:{typeReadback:{confirmed:false,reason:'secure'},selectedLength:0}}},'secure')),['length-key']);
});
test('marker content, offsets, indexes, bytes and descriptions are rejected; fixed reasons and tags pass',()=>{
 for(const bad of [{markerBytes:'AAEC'},{markerOffset:12},{textMarkerIndex:3},{markerData:[1,2,3]},{rawMarkerValue:'x'},{marker:{start:1}},{info:'<AXTextMarker 0x6000012345678>'},{data:[7,8,9,10,11,12,13,14,15]},{blob:'a3f9c04be7d21856a0c9e4b7d3f18a52c1'}])
  assert.ok(scan({result:{meta:bad}},'plain',[]).findings.length>0,JSON.stringify(bad));
 assert.deepEqual(scan({result:{meta:{typeReadback:{confirmed:false,reason:'markerRangeUnavailable'}}}},'secret').findings,[]);
 assert.deepEqual(scan({probe395Audit:'main-small-secretLong-r07',markerRoute:true}, 'plain',[]).findings,[]);
 assert.deepEqual(codes(scan({markerReads:'abc def'},'plain',[])),['marker-value']);
});
test('cross-lane: a plain or seed value in a concealed surface is a violation, in the plain lane a withheld quote',()=>{
 assert.ok(codes(scan({error:{message:'Mismatch '+PLAIN}})).includes('plain-value-in-secret-lane'));
 assert.ok(codes(scan({error:{message:'Field held '+SEED}})).length>0);
 const p=scan({error:{message:'Mismatch '+PLAIN}},'plain',[]);assert.deepEqual(p.findings,[]);assert.equal(JSON.stringify(p.clean).includes(PLAIN.slice(0,10)),false);
 assert.ok(codes(scan({result:{meta:{typeReadback:{confirmed:true}}},note:SECRET},'plain',[])).includes('secret-fragment')); // a secret is never allowed, in any lane
});
test('errors, cycles, binary values and deep nesting are handled without throwing or echo',()=>{
 const e=new Error('boom '+SECRET);e.errorName='typeUnconfirmed';e.meta={typeReadback:{confirmed:false,reason:'concealedMismatch',concealed:true}};
 const r=scan(e);assert.ok(codes(r).includes('secret-fragment'));assert.equal(r.clean.errorName,'typeUnconfirmed');assert.equal(JSON.stringify(r.clean).includes(SECRET.slice(0,10)),false);
 const cyc={a:1};cyc.self=cyc;assert.doesNotThrow(()=>scan(cyc));
 assert.ok(codes(scan({bytes:Buffer.from('hello world')})).length>0);
 let deep={};let cur=deep;for(let i=0;i<20;i++){cur.n={};cur=cur.n}
 assert.ok(codes(scan(deep)).includes('depth-exceeded'));
 assert.ok(scan({'weird key <script>':1}).findings.length>0);
});
test('prose messages survive, quoted values and digits do not',()=>{
 const r=scan({error:{errorName:'typeUnconfirmed',code:-32000,message:'Secret text is not confirmed. Observe, then use setValue.'}});
 assert.deepEqual(r.findings,[]);assert.equal(r.clean.error.message,'Secret text is not confirmed. Observe, then use setValue.');
 assert.equal(scan({error:{message:'Field 7 held abc123'}}).clean.error.message,'[string withheld]');
});
test('stderr lines: only findings survive',()=>{
 const s=scanner();
 assert.deepEqual(s.scanLine('2026 engine ready'),[]);
 assert.equal(s.scanLine('read '+SECRET.slice(2,18))[0].code,'secret-fragment');
 assert.equal(s.scanLine('typed 32 characters',{lane:'secret',lengths:[32]})[0].code,'length-context');
 assert.deepEqual(s.scanLine('typed 8 characters',{lane:'secret',lengths:[32]}),[]);
 assert.equal(s.scanLine('<AXTextMarker 0xdeadbeef1234>')[0].code,'marker-value');
});
