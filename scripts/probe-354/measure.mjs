// Hosted-only #354 measurement. All changes here are disposable experiment kit, never product code.
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync,writeFileSync,appendFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch,placePid,version} from '../probe-316/browser.mjs';
import {page,expectation,SEED,CLIP} from './page.mjs';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?undefined:process.argv[i+1]};
const OUT=arg('out'),ENGINE=arg('engine'),TOOL=arg('tool'),KIND=arg('browser'),REPS=+(arg('reps')??20),SMOKE=arg('smoke')==='true';
mkdirSync(OUT,{recursive:true});const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms))),start=Date.now();
const sh=(c,a)=>spawnSync(c,a,{encoding:'utf8',timeout:20000});
const osa=s=>sh('osascript',['-e',s]);
const front=pid=>osa(`tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`);
const WIN={x:400,y:30,w:620,h:720};
class Wire{
 static async connect(p){return new Promise((ok,no)=>{let s=createConnection(p);s.once('connect',()=>ok(new Wire(s)));s.once('error',no)})}
 constructor(s){this.s=s;this.buf=Buffer.alloc(0);this.pending=new Map();this.id=0;s.on('data',d=>{this.buf=Buffer.concat([this.buf,d]);while(this.buf.length>=4){let n=this.buf.readUInt32LE();if(this.buf.length<4+n)break;let r=JSON.parse(this.buf.subarray(4,4+n));this.buf=this.buf.subarray(4+n);this.pending.get(r.id)?.(r);this.pending.delete(r.id)}});s.on('error',()=>{})}
 call(method,params){let id=++this.id,b=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,method,params})),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return new Promise((ok,no)=>{let t=setTimeout(()=>{this.pending.delete(id);no(Error('RPC timeout '+method))},60000);this.pending.set(id,r=>{clearTimeout(t);ok(r)});this.s.write(Buffer.concat([h,b]))})}
 execute(method,args){return this.call('execute',{method,args,deadlineUnixMilliseconds:Date.now()+55000})}
 close(){this.s.destroy()}
}
const socket=join(process.env.RUNNER_TEMP,'s354.sock');rmSync(socket,{force:true});
let engineError='';const engine=spawn(ENGINE,[],{env:{...process.env,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore','pipe']});engine.stderr.on('data',d=>{engineError+=d;writeFileSync(join(OUT,'engine-stderr.txt'),engineError)});
async function connect(){for(let i=0;i<200;i++){try{let w=await Wire.connect(socket);let r=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(r.error)throw Error(JSON.stringify(r));return w}catch{await sleep(50)}}throw Error('engine unavailable')}
const side=spawn(TOOL,[],{stdio:['pipe','pipe','inherit']}),waiters=[];
createInterface({input:side.stdout}).on('line',l=>{let r;try{r=JSON.parse(l)}catch{r={error:l}}waiters.shift()?.(r)});
const ask=q=>new Promise(ok=>{waiters.push(ok);side.stdin.write(JSON.stringify(q)+'\n')});
let cmdNo=0,poll=null,queue=[],answers=[];
const server=createServer(async(req,res)=>{if(req.url==='/'){res.end(page());return}if(req.url==='/cmd'){if(queue.length)res.end(JSON.stringify(queue.shift()));else{poll=res;res.on('close',()=>{if(poll===res)poll=null})}return}if(req.url==='/answer'){let b='';for await(const c of req)b+=c;try{answers.push({...JSON.parse(b),receivedAt:Date.now()})}catch{}res.end('ok');return}res.statusCode=404;res.end()});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const URL=`http://127.0.0.1:${server.address().port}/`;
function send(q){const c={n:++cmdNo,...q};if(poll){poll.end(JSON.stringify(c));poll=null}else queue.push(c);return c.n}
async function until(fn,ms=10000){const deadline=Date.now()+ms;for(;;){let v=fn();if(v)return v;if(Date.now()>=deadline)throw Error('condition timeout');await sleep(5)}}
async function command(q){const n=send(q);return until(()=>answers.find(a=>a.cmd===n))}
const meta={browser:KIND,reps:REPS,smoke:SMOKE,kit:process.env.GITHUB_SHA,engine:process.env.ENGINE_REF,image:process.env.ImageVersion,startedAt:start,rateSampling:'0 and 500ms; mismatches re-read at 3000ms',candidateBoundMs:1000,candidatePollMs:5};
const rows=[];function save(row){rows.push(row);appendFileSync(join(OUT,'rows.jsonl'),JSON.stringify(row)+'\n');writeFileSync(join(OUT,'progress.json'),JSON.stringify({meta,rows:rows.length,elapsedMs:Date.now()-start,last:row.id},null,2));console.log('354',row.id,row.problem??'ok','final',row.correct,'state',row.stateContains,'keywait',row.key?.probe?.ms,'typewait',row.type?.probe?.ms)}
let browser,coverPid,pid,native=KIND==='native';
const modes=SMOKE?['baseline','ax-noop','key-effect','typed','combined']:['baseline','ax-noop','key-effect','typed','combined'];
const editors=native?['TextEdit']:['textarea','input','contenteditable','compose'];
const keys=SMOKE?['cmd+a','cmd+z','cmd+x','cmd+v','cmd+Left','alt+Left','cmd+shift+Left','Left']:['cmd+a','cmd+z','cmd+x','cmd+v','cmd+Left','alt+Left','cmd+shift+Left','Left'];
const sentence=n=>('New typed sentence goes here. Every word is delivered in order. ').repeat(Math.ceil(n/62)).slice(0,n);
function brief(raw,startedAt,endedAt){return {startedAt,endedAt,durationMs:endedAt-startedAt,error:raw.error??null,meta:raw.result?.meta??raw.error?.data?.meta,probe:raw.result?.probe354??null}}
async function rpc(w,method,args){let t=Date.now(),r=await w.execute(method,{pid,...args});return {...brief(r,t,Date.now()),raw:r}}
function clean(r){if(!r)return r;let {raw,...v}=r;return v}
function values(raw){return (raw?.result?.nodes??[]).filter(n=>['AXTextArea','AXTextField','AXStaticText'].includes(n.role)).map(n=>({role:n.role,value:n.value,title:n.title,description:n.description,frame:n.frame}))}
async function nativeState(){return (await ask({op:'read',pid})).state}
async function setupNative(w,key){await ask({op:'reset',pid,text:SEED,range:[3,0]});let pos=3,len=0;if(['cmd+Left','alt+Left','cmd+shift+Left','Left','cmd+z'].includes(key))pos=SEED.length;if(key==='cmd+x'){pos=0;len=SEED.length}if(key==='cmd+v')pos=0;await ask({op:'range',pid,range:[pos,len]});if(key==='cmd+z'){await rpc(w,'type_text',{text:' undo'});await sleep(150)}return nativeState()}
async function observe(w,row,full){row.state=clean(await rpc(w,'get_app_state',{includeScreenshot:false}));row.stateValues=values(row.state.raw); // raw retained separately below
}
async function cell({part,editor,key,mode,rep,length=30,sameRPC=false,foreground=false}){
 const text=sentence(length),expected=expectation(key,text),id=[part,editor,key,mode,length,sameRPC?'one':'two',foreground?'front':'behind',rep].join('/');
 const row={id,part,editor,keyName:key,mode,rep,length,sameRPC,foreground,text,expected,startedAt:Date.now()};let w;
 try{
 w=await connect();
 if(native){row.setup=await setupNative(w,key)}else row.setup=await command({op:'reset',id,editor,key});
 if(key==='cmd+v')await ask({op:'clip',text:CLIP});
 front(foreground?pid:coverPid);
 if(!native){
 // A new observation establishes the point used for the click; match the original typing probe's click at character 3.
 const shot=await rpc(w,'get_app_state',{includeScreenshot:true,outputDirectory:join(OUT,'setup')});
 if(shot.error)throw Error('setup observation '+JSON.stringify(shot.error));
 const sky=shot.raw.result;row.setupObservation={startedAt:shot.startedAt,endedAt:shot.endedAt,timings:sky.timings};
 const field=sky.nodes.find(n=>['AXTextArea','AXTextField'].includes(n.role)&&n.frame&&/Draft control|Message Body/.test([n.title,n.description,n.placeholder].join(' ')))??sky.nodes.find(n=>n.role==='AXTextArea'&&n.frame);
 const leaf=sky.nodes.find(n=>n.role==='AXStaticText'&&n.frame&&(n.value===SEED||n.title===SEED));
 let point;if(field)point={x:field.frame.x+35,y:field.frame.y+20};else if(leaf)point={x:leaf.frame.x+30,y:leaf.frame.y+10};else throw Error('editor missing '+JSON.stringify(sky.nodes.map(n=>[n.role,n.title,n.description])));
 // Selection is re-established by the fixture after the click except for cmd+a: its exact original click -> key race.
 const f=sky.window.frame,scale=sky.screenshot.width/f.width;
 row.click=clean(await rpc(w,'click',{x:Math.round((point.x-f.x)*scale),y:Math.round((point.y-f.y)*scale)}));
 if(row.click.error)throw Error('click '+JSON.stringify(row.click.error));
 if(key!=='cmd+a')row.setup=await command({op:'reset',id,editor,key});
 }
 const options={spike354Mode:mode,spike354Value:expected.value,spike354Range:expected.range};
 if(!sameRPC)row.key=clean(await rpc(w,'press_key',{key,...options}));
 row.type=clean(await rpc(w,'type_text',{text,...options,...(sameRPC?{spike354PreKey:key}:{})}));
 row.returnedAt=row.type.endedAt;
 let sampleNo;if(!native)sampleNo=send({op:'sample',returnedAt:row.returnedAt,delays:part==='partial'?[0,250,1000,3000]:[0,500]});
 const st=await rpc(w,'get_app_state',{includeScreenshot:false});row.stateValues=values(st.raw);row.state=clean(st);row.stateContains=JSON.stringify(row.stateValues).includes(text);
 if(part==='partial'||rep===1){const ss=await rpc(w,'get_app_state',{includeScreenshot:true,outputDirectory:join(OUT,'shots',id.replace(/[^a-z0-9]+/gi,'_'))});row.screenshot=clean(ss);row.screenshotValues=values(ss.raw);row.screenshotContains=JSON.stringify(row.screenshotValues).includes(text);row.screenshotPath=ss.raw.result?.screenshot;}
 if(native){row.samples=[];for(const delay of (part==='partial'?[0,250,1000,3000]:[0,500])){await sleep(row.returnedAt+delay-Date.now());row.samples.push({delay,...await nativeState()})}}
 else {await until(()=>answers.filter(a=>a.cmd===sampleNo).length===(part==='partial'?4:2),10000);row.samples=answers.filter(a=>a.cmd===sampleNo);}
 let last=row.samples.at(-1);if(part!=='partial'&&last.text!==expected.final){await sleep(row.returnedAt+3000-Date.now());last=native?{delay:3000,...await nativeState()}:await command({op:'read'});row.samples.push(last)}
 row.final=last.text;row.correct=row.final===expected.final;
 row.trace=row.samples.flatMap(s=>s.trace??[]).sort((a,b)=>a.at-b.at);
 row.partialAtReturn=row.samples[0]?.text!==expected.final&&expected.final.includes(row.samples[0]?.text??'');
 row.confirmed=row.type.probe?.confirmed??null;
 if(!native)answers=answers.filter(a=>a.id!==id);
 }catch(e){row.problem=String(e.stack??e).slice(0,3000)}finally{w?.close();row.endedAt=Date.now();save(row)}
}
try{
 if(native){const path=join(OUT,'control.txt');writeFileSync(path,SEED);sh('open',['-a','TextEdit',path]);await sleep(1500);pid=+(sh('pgrep',['-x','TextEdit']).stdout.trim().split('\n')[0]);coverPid=+(sh('pgrep',['-x','Finder']).stdout.trim().split('\n')[0]);placePid(pid,WIN);front(pid)}
 else{
 meta.version=version(KIND);browser=await launch(KIND,URL,join(OUT,'profile'),WIN);pid=browser.pid;
 await until(()=>answers.some(a=>a.op==='ready'),30000);await sleep(KIND==='cft'?Math.max(0,browser.launchedAt+22000-Date.now()):1500);placePid(pid,WIN);
 const doc=join(OUT,'cover.txt');writeFileSync(doc,'The probe cover.');sh('open',['-a','TextEdit',doc]);await sleep(1000);coverPid=+(sh('pgrep',['-x','TextEdit']).stdout.trim().split('\n')[0]);placePid(coverPid,{x:0,y:40,w:380,h:300});
 const w=await connect();for(let i=0;i<2;i++){await rpc(w,'get_app_state',{includeScreenshot:false});await sleep(1200)}w.close();
 }
 meta.pid=pid;meta.coverPid=coverPid;writeFileSync(join(OUT,'config.json'),JSON.stringify(meta,null,2));
 // Interleave candidates and keys within each repetition rather than measuring a whole mode at one time.
 for(let rep=1;rep<=REPS;rep++)for(const editor of editors)for(const key of keys)for(const mode of modes){await cell({part:'rate',editor,key,mode,rep});if(Date.now()-start>125*60000)throw Error('125 minute budget exceeded')}
 for(let rep=1;rep<=REPS;rep++)for(const editor of editors)for(const length of [30,120,500])for(const mode of ['baseline','combined']){await cell({part:'partial',editor,key:'cmd+a',mode,rep,length});if(Date.now()-start>125*60000)throw Error('125 minute budget exceeded')}
 for(let rep=1;rep<=REPS;rep++)for(const editor of editors){await cell({part:'mechanism',editor,key:'cmd+a',mode:'baseline',rep,sameRPC:true});await cell({part:'mechanism',editor,key:'cmd+a',mode:'baseline',rep,foreground:true})}
}catch(e){meta.failure=String(e.stack??e);console.error(meta.failure);process.exitCode=1}
finally{meta.finishedAt=Date.now();writeFileSync(join(OUT,'config.json'),JSON.stringify(meta,null,2));engine.kill('SIGTERM');side.kill('SIGTERM');if(browser){try{process.kill(browser.pid,'SIGTERM')}catch{}}server.closeAllConnections();server.close();}
