import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nonBmpShape,page} from './page.mjs';

test('non-BMP observation exposes only a delivery class',()=>{
  const scalar=String.fromCodePoint(0x1f4a1), expected='abcd'+scalar+'efg';
  for(const [actual,shape] of [
    [expected,'exact'], ['','empty'], ['abcdefg','missing'], ['abcd?efg','question-mark'],
    ['abcd�efg','replacement-character'], ['abcdaefg','ascii-substitution'],
    ['abcd'+scalar[0]+'x'+scalar[1]+'efg','split-or-unpaired'], ['xyz','surrounding-mismatch'],
  ])assert.equal(nonBmpShape(expected,actual),shape);
  assert.equal(nonBmpShape('no-non-bmp','not-the-input'),null);
});

// The page's own script against a minimal DOM: commands in, the replies it posts out.
function load(singlePassword=false){
  const listeners=new Map(),doc={activeElement:null,title:''};
  const input=(id,type)=>({id,type,value:'',isConnected:true,selectionStart:0,selectionEnd:0,
    focus(){doc.activeElement=this;},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;},scrollIntoView(){},
    getBoundingClientRect:()=>({top:100,bottom:120}),addEventListener(t,f){listeners.set(id+':'+t,f);}});
  const els={password:input('password','password'),...(singlePassword?{}:{setup:input('setup','text')})};
  doc.getElementById=id=>els[id]??null;
  const queue=[],posted=[];
  let live=true;
  const fetch=async(url,o)=>{
    if(o?.method==='POST'){posted.push(JSON.parse(o.body));return {};}
    while(!queue.length){if(!live)return new Promise(()=>{});await new Promise(ok=>setTimeout(ok,2));}
    return {json:async()=>queue.shift()};
  };
  const js=page(0,singlePassword).split('<script>')[1].split('</script>')[0];
  new Function('document','self','fetch',js)(doc,{crypto:{randomUUID:()=>'abcd-ef'}},fetch);
  let n=0;
  const send=async c=>{const k=++n;queue.push({...c,n:k,expiresAt:Date.now()+5000});
    while(!posted.some(p=>p.n===k))await new Promise(ok=>setTimeout(ok,2));return posted.find(p=>p.n===k);};
  const fire=(id,type,event)=>listeners.get(id+':'+type)?.({isTrusted:true,target:els[id],...event});
  return {els,send,fire,stop:()=>{live=false;}};
}
test('a plain cell targets the setup field, and only text that arrived there reads as exact',async()=>{
  const {els,send,fire,stop}=load();
  const text='abcd'+String.fromCodePoint(0x1f4a1)+'efg';
  let s=await send({op:'prepare',trial:1,expected:''});
  assert.equal(s.plainFocused,true);assert.equal(s.plainEmpty,true);assert.equal(s.exact,true);
  s=await send({op:'seed',trial:1,expected:'',start:0,end:0,effect:'none',first:'a',target:'plain'});
  assert.equal(s.plainFocused,true);assert.equal(s.plainEmpty,true);assert.equal(s.plainKey,false);assert.equal(s.plainInput,false);
  // plainExpected outside a read is never compared.
  assert.equal((await send({op:'seed',trial:1,expected:'',start:0,end:0,target:'plain',plainExpected:''})).plainExact,null);
  s=await send({op:'read',trial:1,expected:'',plainExpected:text,target:'plain',unicode:true});
  assert.equal(s.plainExact,false);assert.equal(s.unicodeShape,'empty');
  fire('setup','keydown',{key:'v'});els.setup.value=text;fire('setup','input',{});
  s=await send({op:'read',trial:1,expected:'',plainExpected:text,target:'plain',unicode:true});
  assert.equal(s.plainExact,true);assert.equal(s.plainKey,true);assert.equal(s.plainInput,true);
  assert.equal(s.exact,true);assert.equal(s.key,false);assert.equal(s.unicodeShape,'exact');
  els.setup.value='abcdefg';
  assert.equal((await send({op:'read',trial:1,expected:'',plainExpected:text,target:'plain',unicode:true})).unicodeShape,'missing');
  s=await send({op:'prepare',trial:2,expected:''});
  assert.equal(s.plainEmpty,true);assert.equal(s.plainKey,false);assert.equal(s.plainInput,false);
  stop();
});
test('a password cell still reads the password field, and reports it empty',async()=>{
  const {els,send,fire,stop}=load(true);
  await send({op:'prepare',trial:1,expected:''});
  let s=await send({op:'seed',trial:1,expected:'',start:0,end:0,effect:'none',first:'a'});
  assert.equal(s.focused,true);assert.equal(s.empty,true);assert.equal(s.plainEmpty,null);
  fire('password','keydown',{key:'a'});els.password.value='abcd';fire('password','input',{});
  s=await send({op:'read',trial:1,expected:'abcd'});
  assert.equal(s.exact,true);assert.equal(s.empty,false);assert.equal(s.key,true);assert.equal(s.input,true);
  stop();
});
