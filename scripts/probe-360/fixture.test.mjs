import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {page360} from './page.mjs';
test('owned key-only fixture resets at the end, supports a real boundary and arms without changing caret',async()=>{
 const answers=[];let field;
 const document={activeElement:null,visibilityState:'visible',hasFocus:()=>true,addEventListener(){},querySelector(s){
  if(s==='#host')return {set innerHTML(v){field={value:'',selectionStart:0,selectionEnd:0,offsetWidth:500,offsetHeight:44,focus(){document.activeElement=this},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b},getBoundingClientRect:()=>({x:0,y:0})}}};
  if(s==='#editor')return field;
 }};
 const context=vm.createContext({document,crypto:{randomUUID:()=> 'a'.repeat(32)},performance:{timeOrigin:123},location:{href:'http://fixture/'},Date,console,setTimeout,
  fetch:async(url,options)=>{if(url==='/answer'){answers.push(JSON.parse(options.body));return {}}return new Promise(()=>{})}});
 const script=page360().match(/<script>([\s\S]*)<\/script>/)[1];
 vm.runInContext(script,context);const run=vm.runInContext('run',context);let n=1;
 const send=async q=>{await run({pageId:'a'.repeat(32),timeOrigin:123,ownerEpoch:1,expiresAt:Date.now()+10000,n:n++,...q});return answers.at(-1)};
 await send({op:'reset',editor:'input',id:'test'});
 assert.deepEqual((await send({op:'prepare',editor:'input',key:'Left'})).selection,[29,0]);
 assert.deepEqual((await send({op:'arm'})).selection,[29,0]);
 assert.deepEqual((await send({op:'prepare',editor:'input',key:'alt+Left',scene:'boundary'})).selection,[0,0]);
 assert.deepEqual((await send({op:'arm'})).selection,[0,0]);
 const count=answers.length;await run({pageId:'b'.repeat(32),timeOrigin:123,ownerEpoch:1,n:999,op:'reset',expiresAt:Date.now()+10000});assert.equal(answers.length,count);
});
