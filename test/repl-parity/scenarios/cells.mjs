// Raw code, never an async-function envelope. Only synthetic output is persisted.
import {readFileSync} from 'node:fs';
import {caseSchedule} from '../../../scripts/repl-parity/registry.mjs';
import {exactImage} from '../../../scripts/browser-parity/image-hash.mjs';
const plan=new Map(caseSchedule().map(c=>[c.id,c]));
const text=r=>(r.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
const scenarios=[];
const add=(tail,cells,check)=>{const id=`cells/${tail}`,p=plan.get(id);if(!p)throw new Error(id);scenarios.push({...p,backend:'no-services',cells:cells.map((c,i)=>typeof c==='string'?{label:`cell-${i+1}`,code:c}:c),assert:({results,timings})=>{if(!check(results,timings))throw new Error(`${id}: independent outcome failed`);return {ok:true};}});};
const includes=(value)=>r=>!r.at(-1).isError&&text(r.at(-1)).includes(value);
const err=r=>r[0].isError===true&&text(r[0]).length>0;
add('bindings/persistent',['let parityValue=41;','nodeRepl.write(parityValue+1);'],includes('42'));
add('bindings/redeclare',['let parityValue=1;','let parityValue=2; nodeRepl.write(parityValue);'],includes('2'));
add('bindings/ordinary-error-partial-bindings',['let completedBinding=7; throw new Error("fixture-error");','nodeRepl.write(completedBinding);'],r=>r[0].isError===true&&includes('7')(r));
add('await/top-level',['let answer=await Promise.resolve(42); nodeRepl.write(answer);'],includes('42'));
add('imports/dynamic',['let pathModule=await import("node:path"); nodeRepl.write(pathModule.basename("/fixture/leaf"));'],includes('leaf'));
add('imports/builtins',['let pathModule=await import("node:path");let bufferModule=await import("node:buffer");nodeRepl.write([pathModule.basename("/fixture/leaf"),bufferModule.Buffer.from("ok").toString()]);'],includes('leaf'));
for(const [id,code] of [
 ['imports/static-refused','import fs from "node:fs";'],['imports/process-global-refused','nodeRepl.write(process.version);'],['imports/process-module-refused','await import("node:process");'],
 ['globals/string-codegen-refused','eval("1+1");'],['globals/wasm-codegen-refused','await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));'],
 ['errors/vendor-sentences-is-error','throw new Error("fixture-error");']])add(id,[code],err);
add('errors/thrown-cell-recovery',['throw new Error("fixture-error");','nodeRepl.write("usable");'],r=>err(r)&&includes('usable')(r));
add('globals/node-repl-immutable',['nodeRepl.write(Object.isFrozen(nodeRepl)&&Object.getOwnPropertyDescriptor(globalThis,"nodeRepl").writable===false);'],includes('true'));
add('globals/tmp-dir-immutable',['nodeRepl.write(Object.getOwnPropertyDescriptor(globalThis,"tmpDir").writable===false);'],includes('true'));
add('globals/context',['nodeRepl.write([nodeRepl.cwd,nodeRepl.homeDir,nodeRepl.tmpDir,tmpDir].every(x=>typeof x==="string"&&x.startsWith("/"))&&nodeRepl.tmpDir===tmpDir);'],includes('true'));
add('globals/env-frozen-allowlist',['nodeRepl.write(Object.isFrozen(nodeRepl.env)&&Object.keys(nodeRepl.env).length===0);'],includes('true'));
add('globals/request-meta',['nodeRepl.write(typeof nodeRepl.requestMeta==="object" && nodeRepl.requestMeta!==null);'],includes('true'));
add('globals/rpc-configured-only',['nodeRepl.write(typeof nodeRepl.rpc);'],includes('undefined'));
add('reset/clears-bindings',['let clearMe=1;',{label:'reset',op:'reset'},'nodeRepl.write(typeof clearMe);'],includes('undefined'));
add('reset/preserves-task-id',['nodeRepl.write("before");',{label:'reset',op:'reset'},'nodeRepl.write("after");'],r=>Boolean(r[0]._meta?.['cua/taskId'])&&r[0]._meta['cua/taskId']===r[2]._meta?.['cua/taskId']);
for(const [id,timeout] of [['default-30000',undefined],['explicit-short',50]])add(`timeouts/${id}`,[{label:'timeout',code:'let timeoutBinding=1; await new Promise(()=>{});',...(timeout?{timeoutMs:timeout}:{})},'nodeRepl.write(typeof timeoutBinding);'],(r,t)=>r[0].isError===true&&includes('undefined')(r)&&t[0]>=(timeout?timeout:29000)&&t[0]<(timeout?5000:45000));
add('timeouts/fresh-heap',[{label:'timeout',code:'let timeoutBinding=1; await new Promise(()=>{});',timeoutMs:50},'nodeRepl.write(typeof timeoutBinding);'],r=>r[0].isError===true&&includes('undefined')(r));
add('output/write-values',['nodeRepl.write("text");nodeRepl.write(42);nodeRepl.write({fixture:true});'],r=>includes('text')(r)&&includes('42')(r)&&includes('fixture')(r));
add('output/write-ids',['nodeRepl.write("A","same");nodeRepl.write("B","other");nodeRepl.write("C","same");'],r=>!r[0].isError&&text(r[0]).includes('A')&&text(r[0]).includes('C'));
add('output/console-grouping-newlines',['console.log("line-one");nodeRepl.write("write");console.log("line-two");'],includes('line-one'));
add('output/ordered-content',['nodeRepl.write("first");console.log("second");nodeRepl.write("third");'],r=>{const t=text(r[0]);return !r[0].isError&&t.indexOf('first')<t.indexOf('second')&&t.indexOf('second')<t.indexOf('third');});
add('lifecycle/running-cancellation-eventual-result',[{label:'running',code:'await new Promise(r=>setTimeout(r,300));nodeRepl.write("completed-after-cancel");',cancelAfterMs:100}],includes('completed-after-cancel'));
add('lifecycle/control-traffic-while-running',[{label:'running',code:'await new Promise(r=>setTimeout(r,300));nodeRepl.write("completed");',ping:true}],includes('completed'));
for(const format of ['png','jpeg','webp']) {
 const bytes=readFileSync(new URL(`../fixtures/pattern.${format}`,import.meta.url)),base64=bytes.toString('base64'),oracle=exactImage(bytes);
 const pre=`let Buffer=(await import('node:buffer')).Buffer;let image=Buffer.from(${JSON.stringify(base64)},'base64');`;
 for(const form of ['data-url','file-url','buffer','uint8array','arraybuffer','arraybuffer-view','object-buffer','object-uint8array','object-arraybuffer','object-arraybuffer-view'])for(const promised of [false,true]){
  let value,setup=pre;
  const f=form.replace(/^object-/,'');
  if(f==='data-url')value=JSON.stringify(`data:image/${format};base64,${base64}`);
  else if(f==='file-url'){setup+=`let file=nodeRepl.cwd+'/fixture.${format}';(await import('node:fs/promises')).writeFile;await (await import('node:fs/promises')).writeFile(file,image);`;value=`(await import('node:url')).pathToFileURL(file).href`;}
  else if(f==='buffer')value='image';
  else if(f==='uint8array')value='new Uint8Array(image)';
  else if(f==='arraybuffer')value='new Uint8Array(image).buffer';
  else value='new DataView(new Uint8Array(image).buffer)';
  if(form.startsWith('object-'))value=`{bytes:${value},mimeType:'image/${format}'}`;
  if(promised)value=`Promise.resolve(${value})`;
  add(`emit-image/${format}/${form}${promised?'-promised':''}`,[`${setup}await nodeRepl.emitImage(${value});`],r=>{
   const images=r[0].content?.filter(c=>c.type==='image')??[];return !r[0].isError&&images.length===1&&JSON.stringify(exactImage(Buffer.from(images[0].data,'base64'),{mimeType:images[0].mimeType}))===JSON.stringify(oracle);
  });
 }
}
const imageURL=`data:image/png;base64,${readFileSync(new URL('../fixtures/pattern.png',import.meta.url)).toString('base64')}`;
add('output/image-acknowledgement',[`await nodeRepl.emitImage(${JSON.stringify(imageURL)});nodeRepl.write('acknowledged');`],r=>includes('acknowledged')(r)&&r[0].content.some(c=>c.type==='image'));
for(const id of ['ordered-images','unawaited-emissions'])add(`output/${id}`,[`nodeRepl.write('before');${id==='ordered-images'?'await ':''}nodeRepl.emitImage(${JSON.stringify(imageURL)});nodeRepl.write('after');`],r=>!r[0].isError&&r[0].content.some(c=>c.type==='image')&&text(r[0]).includes('after'));
for(const [id,value] of [['invalid-url','"https://example.invalid/image.png"'],['empty-url','""'],['unknown-bytes','new Uint8Array([1,2,3])'],['empty-bytes','new Uint8Array()'],['invalid-object','({other:true})'],['invalid-mime','({bytes:new Uint8Array([1,2]),mimeType:"text/plain"})'],['rejected-promise','Promise.reject(new Error("fixture-image-rejection"))']])add(`images/${id}`,[`await nodeRepl.emitImage(${value});`],err);
export default scenarios;
