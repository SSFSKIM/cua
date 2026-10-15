// No Chrome, installed runtime or native helper is launched by these adapter/oracle unit tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';
import {imageHash} from '../../scripts/browser-parity/image-hash.mjs';
import {parseModule} from 'meriyah';
import scenarios from './scenarios/browser-facade-behaviors.mjs';
import {caseSchedule,validateRegistry} from '../../scripts/repl-parity/registry.mjs';
import {RESULT_MARKER,parseCell} from '../../scripts/browser-parity/runner.mjs';

const ids=['api/decorated-tab/paste','api/decorated-tab/presskey','api/decorated-tab/typetext','cells/facade/emit-false-state','cells/facade/emit-false-screenshot','cells/facade/emit-false-combined','cells/facade/dom-only-input-refusal'];
const domError='This tab does not support accessibility input. Use its Playwright API.';
const inputError='Browser input requires an element index from the latest AX snapshot, or null to use current focus.';
const raw=value=>({isError:false,content:[{type:'text',text:RESULT_MARKER+JSON.stringify({ok:true,value,$imageCount:0})}]});
const find=id=>{const s=scenarios.find(s=>s.id===id);assert.ok(s,id);return s;};
const empty={counter:0,events:[]};
const expected=id=>id.endsWith('emit-false-state')?{axAbsent:true,string:true,fixture:true,snapshotMatches:true,heading:'Read fixture'}:
 id.endsWith('emit-false-screenshot')?{axAbsent:true,bytes:true,nonempty:true,image:true,baselineMatches:true,caption:'Parity screenshot'}:
 id.endsWith('emit-false-combined')?{axAbsent:true,state:true,fixture:true,snapshotMatches:true,bytes:true,nonempty:true,image:true,baselineMatches:true,heading:'Read fixture'}:
 {axAbsent:true,focused:true,before:'',after:'',errors:id==='cells/facade/dom-only-input-refusal'?Array(9).fill(domError):[domError,domError,...Array(6).fill(inputError)]};

test('seven facade obligations use real Chrome on both platforms with exact schedule contracts',()=>{
 assert.deepEqual(scenarios.map(s=>s.id).sort(),[...ids].sort());validateRegistry(scenarios);
 const plan=new Map(caseSchedule().map(c=>[c.id,c]));
 for(const s of scenarios){
  assert.deepEqual(s.platforms,['darwin','linux']);assert.deepEqual(s.contracts,plan.get(s.id).contracts);
  assert.equal(s.backend,'chrome');assert.equal(s.browserCase,true);assert.equal(s.setup.open,'goto');
  assert.equal(s.cells.length,1);assert.equal(s.cells[0].raw,true);parseModule(s.cells[0].code,{next:true});
  if(/screenshot|combined/.test(s.id))assert.equal(s.imageMode,'live');
 }
});

test('each independent oracle accepts its complete fixture observation and rejects wrong returns or side effects',async()=>{
 for(const id of ids){
  const s=find(id),results=[raw(expected(id))];
  assert.deepEqual(await s.assert({results,fixtureState:empty}),{ok:true},id);
  assert.equal((await s.assert({results:[raw(null)],fixtureState:empty})).ok,false,id);
  assert.equal((await s.assert({results:[],fixtureState:empty})).ok,false,id);
  if(/decorated-tab|input-refusal/.test(id))assert.equal((await s.assert({results,fixtureState:{events:[{text:'unexpected input'}]}})).ok,false,id);
 }
});

test('emit:false oracles reject leaked state, image items, extra markers and successful MCP errors',async()=>{
 for(const id of ids.filter(id=>id.includes('emit-false'))){
  const s=find(id),value=expected(id);
  for(const change of [
   r=>r.content.unshift({type:'text',text:'fixture automatic state'}),
   r=>{r.content[0].text='fixture automatic state'+r.content[0].text;},
   r=>r.content.push({type:'image',mimeType:'image/jpeg',data:'leaked-image'}),
   r=>r.content.push({...r.content[0]}),
   r=>{r.isError=true;},
  ]){const result=raw(value);change(result);assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,false,id);}
 }
});

// Test our generated raw cells using a fixture handle, not a browser backend or a replacement parity subject.
async function exercise(scenario,tab){
 const content=[];
 const nodeRepl={write:text=>content.push({type:'text',text}),emitImage:async()=>content.push({type:'image',mimeType:'image/jpeg',data:'unexpected'})};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const checkout=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
 await new AsyncFunction('tab','nodeRepl',scenario.cells[0].code.replaceAll('@@CHECKOUT@@',checkout))(tab,nodeRepl);
 return {isError:false,content};
}
const snapshot='- heading "Read fixture"\n- paragraph: Alpha\n- paragraph: Beta\n- button "Enabled"';
const image=new Uint8Array(readFileSync(new URL('./fixtures/pattern.jpeg',import.meta.url)));
function observationTab({plainBytes=false,wrongState=false,baselineImage=image,returnedImage=baselineImage}={}){
 const bytes=()=>plainBytes?Array.from(returnedImage):new Uint8Array(returnedImage);
 return {ax:undefined,playwright:{domSnapshot:async()=>snapshot,locator:()=>({textContent:async()=>'Read fixture'})},screenshot:async()=>new Uint8Array(baselineImage),
  getAXState:async()=>wrongState?'wrong fixture':snapshot,getScreenshot:async()=>bytes(),getAXStateAndScreenshot:async()=>({state:wrongState?'wrong fixture':snapshot,screenshot:bytes()})};
}

test('state and combined raw cells use the fixture snapshot and returned image type, not merely callable methods',async()=>{
 for(const tail of ['state','combined']){
  const s=find('cells/facade/emit-false-'+tail);
  const result=await exercise(s,observationTab());
  assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,true);
  const wrong=await exercise(s,observationTab({wrongState:true}));assert.equal((await s.assert({results:[wrong],fixtureState:empty})).ok,false);
 }
 const s=find('cells/facade/emit-false-combined'),plain=await exercise(s,observationTab({plainBytes:true}));
 assert.equal((await s.assert({results:[plain],fixtureState:empty})).ok,false);
});

test('screenshot raw cell validates Uint8Array JPEG bytes and safe fixture caption without emitting an image',async()=>{
 const s=find('cells/facade/emit-false-screenshot'),tab=observationTab();tab.playwright.locator=()=>({textContent:async()=>'Parity screenshot'});
 const result=await exercise(s,tab);assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,true);
 assert.equal(result.content.length,1);assert.equal(result.content[0].type,'text');assert.equal(parseCell(result).value.bytes,true);
 tab.getScreenshot=async()=>new Uint8Array([1,2,3]);const invalid=await exercise(s,tab);assert.equal((await s.assert({results:[invalid],fixtureState:empty})).ok,false);
});

test('decorated input raw cells invoke both valid focus/index inputs and reject invalid targets before DOM-only input',async()=>{
 for(const method of ['paste','pressKey','typeText']){
  const id='api/decorated-tab/'+method.toLowerCase(),s=find(id),calls=[];
  const tab={ax:undefined,playwright:{locator:()=>({click:async()=>{},evaluate:async()=>''}),evaluate:async()=>true}};
  tab[method]=async(...args)=>{calls.push(args);const index=args[0];if(index!==null&&(!Number.isInteger(index)||index<0))throw new Error(inputError);throw new Error(domError);};
  const result=await exercise(s,tab);assert.equal(calls.length,8,method);assert.equal(calls[0][0],0);assert.equal(calls[1][0],null);
  assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,true,method);
  const bad=raw({...parseCell(result).value,errors:Array(8).fill(domError)});assert.equal((await s.assert({results:[bad],fixtureState:empty})).ok,false,method);
 }
});

test('DOM-only refusal raw cell invokes all nine decorated methods with their real signatures',async()=>{
 const s=find('cells/facade/dom-only-input-refusal'),calls=[];
 const tab={ax:undefined,playwright:{locator:()=>({click:async()=>{},evaluate:async()=>''}),evaluate:async()=>true}};
 for(const method of ['click','drag','scroll','selectText','setValue','performSecondaryAction','paste','pressKey','typeText']){
  tab[method]=(...args)=>{calls.push([method,args]);throw new Error(domError);};
 }
 const result=await exercise(s,tab);
 assert.deepEqual(calls,[['click',[0]],['drag',[[1,2],[3,4]]],['scroll',[0,'down',1]],['selectText',[0,'text']],['setValue',[0,'value']],['performSecondaryAction',[0,'menu']],['paste',[null,'text']],['pressKey',[null,'ENTER']],['typeText',[null,'text']]]);
 assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,true);
 const before=structuredClone(result);await s.assert({results:[result],fixtureState:empty});assert.deepEqual(result,before);
 tab.typeText=()=>{};const unrefused=await exercise(s,tab);assert.equal((await s.assert({results:[unrefused],fixtureState:empty})).ok,false);
});


function imageTab(tail,baselineImage,returnedImage){
 const tab=observationTab({baselineImage,returnedImage});
 if(tail==='screenshot')tab.playwright.locator=()=>({textContent:async()=>'Parity screenshot'});
 return tab;
}

test('image facade raw cells reject a forged same-size JPEG header and corrupted same-header compressed content',async()=>{
 const forged=new Uint8Array(128);forged.set([255,216,255,192,0,17,8,0,8,0,8]);forged.set([255,217],126);
 const corrupted=new Uint8Array(image),scan=corrupted.findIndex((v,i)=>v===255&&corrupted[i+1]===218);
 assert.ok(scan>0);const entropy=scan+2+corrupted[scan+2]*256+corrupted[scan+3];corrupted.fill(255,entropy,corrupted.length-2);
 for(const tail of ['screenshot','combined']){
  const s=find('cells/facade/emit-false-'+tail);
  for(const returnedImage of [forged,corrupted]){
   const result=await exercise(s,imageTab(tail,image,returnedImage));
   assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,false,tail);
  }
 }
});

test('decoded screenshot comparison rejects different JPEG pixels with the same dimensions and MIME',async()=>{
 const baselineImage=new Uint8Array(readFileSync(new URL('../browser-parity/fixture/hash-sample.jpg',import.meta.url)));
 const returnedImage=new Uint8Array(readFileSync(new URL('../browser-parity/fixture/hash-color.jpg',import.meta.url)));
 for(const tail of ['screenshot','combined']){
  const s=find('cells/facade/emit-false-'+tail),result=await exercise(s,imageTab(tail,baselineImage,returnedImage));
  assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,false,tail);
 }
});

// Valid baseline grayscale JPEGs with one constant luminance per 8x8 block. The controlled DC Huffman table
// encodes only 0, +/-512 and +/-1024 deltas; every block ends with an AC end-of-block symbol.
function blockJPEG(hex,{width=64,height=64}={}){
 const segment=(marker,data)=>Buffer.concat([Buffer.from([255,marker,(data.length+2)>>8,(data.length+2)&255]),Buffer.from(data)]);
 const dc=[0,0,3,...Array(14).fill(0),0,10,11],ac=[16,1,...Array(15).fill(0),0];
 let bits='',previous=0;
 for(const bit of BigInt('0x'+hex).toString(2).padStart(64,'0')){
  const value=bit==='1'?512:-512,delta=value-previous;previous=value;
  const n=delta===0?0:Math.abs(delta).toString(2).length;
  bits+=({0:'00',10:'01',11:'10'})[n]+(n?(delta>=0?delta:(1<<n)-1+delta).toString(2).padStart(n,'0'):'')+'0';
 }
 while(bits.length%8)bits+='1';
 const entropy=[];for(let i=0;i<bits.length;i+=8){const byte=parseInt(bits.slice(i,i+8),2);entropy.push(byte);if(byte===255)entropy.push(0);}
 return new Uint8Array(Buffer.concat([Buffer.from([255,216]),segment(219,[0,...Array(64).fill(1)]),segment(192,[8,height>>8,height&255,width>>8,width&255,1,1,17,0]),segment(196,[...dc,...ac]),segment(218,[1,1,0,0,63,0]),Buffer.from(entropy),Buffer.from([255,217])]));
}

test('in-memory decoded comparison allows four changed luminance bits and rejects five',async()=>{
 const baselineImage=blockJPEG('ffffffff00000000');
 for(const tail of ['screenshot','combined']){
  const s=find('cells/facade/emit-false-'+tail);
  for(const [hex,ok] of [['ffffffff0000000f',true],['ffffffff0000001f',false]]){
   const result=await exercise(s,imageTab(tail,baselineImage,blockJPEG(hex)));
   assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,ok,`${tail}/${hex}`);
  }
 }
});

test('different JPEG metadata passes visual comparison but hashes and screenshot bytes never enter raw output',async()=>{
 const baseline=Buffer.from(blockJPEG('ffffffff00000000'));
 const returned=new Uint8Array(Buffer.concat([baseline.subarray(0,2),Buffer.from([255,254,0,5,99,117,97]),baseline.subarray(2)]));
 for(const tail of ['screenshot','combined']){
  const s=find('cells/facade/emit-false-'+tail),result=await exercise(s,imageTab(tail,new Uint8Array(baseline),returned));
  assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,true);
  assert.equal(result.content.length,1);assert.equal(result.content[0].type,'text');
  assert.ok(!result.content[0].text.includes('ffffffff00000000'));assert.ok(!result.content[0].text.includes(baseline.toString('base64')));
  assert.deepEqual(parseCell(result).value,expected(s.id));
 }
});

test('matching decoded luminance cannot hide changed screenshot dimensions',async()=>{
 const baselineImage=blockJPEG('0000000000000000'),returnedImage=blockJPEG('0000000000000000',{width:32,height:128});
 for(const tail of ['screenshot','combined']){
  const s=find('cells/facade/emit-false-'+tail),result=await exercise(s,imageTab(tail,baselineImage,returnedImage));
  assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,false,tail);
 }
});


test('a valid PNG with matching dimensions and perceptual hash cannot satisfy the pinned JPEG MIME contract',async()=>{
 const crc=bytes=>{let value=-1;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^(-(value&1)&0xedb88320);}return (value^-1)>>>0;};
 const chunk=(type,data)=>{const length=Buffer.alloc(4),checksum=Buffer.alloc(4),body=Buffer.concat([Buffer.from(type),data]);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(body));return Buffer.concat([length,body,checksum]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(64,0);header.writeUInt32BE(64,4);header[8]=8;
 const png=new Uint8Array(Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('tEXt',Buffer.concat([Buffer.from('fixture'),Buffer.from([0]),Buffer.alloc(100,120)])),chunk('IDAT',deflateSync(Buffer.alloc(65*64))),chunk('IEND',Buffer.alloc(0))]));
 const baselineImage=blockJPEG('0000000000000000');
 assert.ok(png.length>100);assert.deepEqual(imageHash(png),imageHash(baselineImage));
 for(const tail of ['screenshot','combined']){
  const s=find('cells/facade/emit-false-'+tail),result=await exercise(s,imageTab(tail,baselineImage,png));
  assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,false,tail);
 }
});
