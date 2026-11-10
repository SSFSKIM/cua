// The fixture's long-poll server with an explicit visible owner and command identity. Disposable experiment kit.
// No document is bound until the harness binds the one whose title nonce its browser window's AX title shows; a
// document becoming ready never takes over. Only the bound document's poll is held or handed commands; any other
// document (hidden realm, reload, second tab) is told it is stale, and its answers are recorded and ignored. Every
// command expires: one the bound document does not answer in time is a fixture loss and is never handed out later.
import {createServer} from 'node:http';
export class FixtureLost extends Error {}
export async function createFixture(html,{idleMs=20000,lostMs=5000}={}){
 const fx={bound:null,boundNonce:null,ready:[],foreignPolls:0,foreignAnswers:[],expired:0,bindings:[],lastPollAt:new Map()};
 let n=0,poll=null,queue=[],arm=null;const replies=new Map(),readyWaiters=[];
 const reply=k=>{if(!replies.has(k))replies.set(k,{list:[],wake:null});return replies.get(k)};
 const hand=(res,c)=>{res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(c))};
 function next(){const now=Date.now();while(queue.length&&queue[0].expiresAt<=now){queue.shift();fx.expired++}return queue.shift()}
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return}
  if(url.pathname==='/cmd'){
   const doc=url.searchParams.get('doc');fx.lastPollAt.set(doc,Date.now());
   if(!doc||doc!==fx.bound){fx.foreignPolls++;hand(res,{op:'stale'});return}
   const c=next();if(c){hand(res,c);return}
   if(poll)hand(poll,{op:'idle'});
   poll=res;const t=setTimeout(()=>{if(poll===res){poll=null;hand(res,{op:'idle'})}},idleMs);
   res.on('close',()=>{clearTimeout(t);if(poll===res)poll=null});return;
  }
  if(url.pathname==='/answer'&&req.method==='POST'){
   let b='';for await(const c of req)b+=c;res.end('ok');let o;try{o=JSON.parse(b)}catch{return}
   o.receivedAt=Date.now();
   if(o.op==='ready'){fx.ready.push({doc:o.doc,nonce:o.nonce,nav:o.nav,href:o.href,visibility:o.visibility,at:o.at,receivedAt:o.receivedAt});readyWaiters.splice(0).forEach(f=>f());return}
   if(!o.doc||o.doc!==fx.bound){if(fx.foreignAnswers.length<50)fx.foreignAnswers.push({doc:o.doc??null,op:o.op??null,kind:o.kind??null,n:o.n??null,cell:o.cell??null,receivedAt:o.receivedAt});return}
   if(o.kind==='marker'){if(arm&&!arm.hit&&o.cell===arm.cell&&o.phase===arm.phase){arm.hit=o;arm.wake?.()}if(arm)arm.all.push(o);return}
   if(typeof o.n==='number'&&replies.has(o.n)){const r=replies.get(o.n);r.list.push(o);r.wake?.()}
   return;
  }
  res.statusCode=404;res.end();
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url=`http://127.0.0.1:${server.address().port}/`;
 function send(q,ms=lostMs){if(!fx.bound)throw new FixtureLost('no bound fixture document');const c={doc:fx.bound,n:++n,expiresAt:Date.now()+ms,...q};reply(c.n);if(poll){const p=poll;poll=null;hand(p,c)}else queue.push(c);return c.n}
 // `count` answers to command `k` from the bound document within `ms`, else a fixture loss.
 function collect(k,count,ms=lostMs){const r=reply(k);return new Promise((ok,no)=>{
  const done=()=>{if(r.list.length<count)return false;clearTimeout(t);replies.delete(k);const err=r.list.find(a=>a.error);if(err)no(Error('fixture '+JSON.stringify(err).slice(0,500)));else ok(r.list.slice(0,count));return true};
  const t=setTimeout(()=>{replies.delete(k);no(new FixtureLost(`fixture document ${fx.bound} did not answer command ${k} within ${ms}ms`))},ms);
  r.wake=done;done();
 })}
 async function command(q,ms=lostMs){const rpcStartedAt=Date.now(),k=send(q,ms),[r]=await collect(k,1,ms);return {...r,rpcStartedAt,rpcReturnedAt:Date.now()}}
 // Arm before posting, so an acknowledgement that beats the key RPC's return is still this cell's.
 function armMarker(cell,phase='keydown'){arm={cell,phase,hit:null,wake:null,all:[]};return arm}
 async function awaitMarker(a,deadline){if(!a.hit&&Date.now()<deadline)await new Promise(ok=>{const t=setTimeout(ok,Math.max(0,deadline-Date.now()));a.wake=()=>{clearTimeout(t);ok()}});return a.hit}
 function disarm(){const a=arm;arm=null;return a?{hit:a.hit,all:a.all}:null}
 async function waitReady(ms){const deadline=Date.now()+ms;while(!fx.ready.length){if(Date.now()>=deadline)throw new FixtureLost('no fixture document became ready');await new Promise(ok=>{const t=setTimeout(ok,deadline-Date.now());readyWaiters.push(()=>{clearTimeout(t);ok()})})}}
 function bind(doc,evidence={}){const from=fx.bound,r=fx.ready.find(x=>x.doc===doc);fx.bound=doc;fx.boundNonce=r?.nonce??null;queue=[];if(poll){hand(poll,{op:'stale'});poll=null}replies.clear();fx.bindings.push({from,to:doc,nonce:fx.boundNonce,nav:r?.nav??null,at:Date.now(),...evidence});return doc}
 // Bind the polling document (other than the current one) whose nonce the browser window's AX titles show.
 async function bindVisible(titles,ms=15000){const deadline=Date.now()+ms;let seen=[];for(;;){
  seen=await titles();
  const live=fx.ready.filter(r=>r.doc!==fx.bound&&r.nonce&&Date.now()-(fx.lastPollAt.get(r.doc)??0)<3000&&seen.some(t=>typeof t==='string'&&t.includes(r.nonce)));
  if(live.length===1)return bind(live[0].doc,{titles:seen});
  if(live.length>1)throw new FixtureLost('several visible fixture documents: '+live.map(r=>r.nonce).join(','));
  if(Date.now()>=deadline)throw new FixtureLost('no polling fixture document is the visible window: titles '+JSON.stringify(seen).slice(0,300));
  await new Promise(ok=>setTimeout(ok,200));
 }}
 function close(){server.closeAllConnections?.();server.close()}
 return {url,fx,send,collect,command,armMarker,awaitMarker,disarm,waitReady,bind,bindVisible,close};
}
