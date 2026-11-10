// Disposable owner-v3 fixture transport. A page load is not proof that it is the browser window being measured.
export class FixtureError extends Error {constructor(message){super(message);this.name='FixtureError';this.fixtureFailure=true}}
export class FixtureTransport {
 constructor({now=Date.now,onEvent=()=>{}}={}){this.now=now;this.onEvent=onEvent;this.clients=new Map();this.polls=new Map();this.pending=new Map();this.queue=[];this.owner=null;this.epoch=0;this.serial=0}
 event(kind,data={}){this.onEvent({kind,at:this.now(),...data})}
 identity(v){return typeof v?.pageId==='string'&&/^[a-f0-9]{32}$/.test(v.pageId)&&Number.isFinite(v.timeOrigin)&&v.timeOrigin>0}
 same(a,b){return a?.pageId===b?.pageId&&a?.timeOrigin===b?.timeOrigin}
 register(v){if(!this.identity(v))return false;this.clients.set(v.pageId,{...v,registeredAt:this.now()});this.event('ready',v);return true}
 close(res,reason){if(!res.writableEnded&&!res.destroyed)res.end(JSON.stringify({op:'idle',reason}))}
 poll(identity,res){
  if(!this.identity(identity)||!this.same(this.clients.get(identity.pageId),identity)){this.close(res,'unregistered');return}
  const old=this.polls.get(identity.pageId);if(old)this.close(old,'superseded-poll');
  this.polls.set(identity.pageId,res);res.on('close',()=>{if(this.polls.get(identity.pageId)===res)this.polls.delete(identity.pageId)});this.dispatch();
 }
 bindVisible(title){
  const match=/probe354:([a-f0-9]{32})(?![a-f0-9])/i.exec(title??'');if(!match)throw new FixtureError('visible AX window title has no fixture nonce: '+title);
  const client=this.clients.get(match[1].toLowerCase());if(!client)throw new FixtureError('visible fixture is not registered');
  if(!this.same(this.owner,client)){
   for(const n of [...this.pending.keys()])this.cancel(n,'visible-owner-change');this.queue=[];
   if(this.owner){const old=this.polls.get(this.owner.pageId);if(old)this.close(old,'visible-owner-change');this.polls.delete(this.owner.pageId)}
   this.owner={pageId:client.pageId,timeOrigin:client.timeOrigin,ownerEpoch:++this.epoch};this.event('bound',{owner:this.owner,title,client});
  }
  return {...this.owner,title};
 }
 hasPoll(){return !!this.owner&&this.polls.has(this.owner.pageId)}
 prune(){for(const [n,p]of this.pending)if(this.now()>p.command.expiresAt)this.cancel(n,'expired')}
 dispatch(){
  this.prune();if(!this.hasPoll())return;
  while(this.queue.length){const n=this.queue.shift(),p=this.pending.get(n);if(!p)continue;
   if(!this.same(p.command,this.owner)||p.command.ownerEpoch!==this.owner.ownerEpoch){this.cancel(n,'old-owner');continue}
   const res=this.polls.get(this.owner.pageId);this.polls.delete(this.owner.pageId);res.end(JSON.stringify(p.command));return;
  }
 }
 send(q,ttl=10000){
  this.prune();if(!this.owner)throw new FixtureError('fixture owner is unbound');
  const n=++this.serial,command={...q,n,...this.owner,expiresAt:this.now()+ttl};this.pending.set(n,{command,answers:new Map()});this.queue.push(n);this.dispatch();return n;
 }
 accept(answer){
  this.prune();const p=this.pending.get(answer.cmd),q=p?.command;
  let reason;
  if(!p)reason='inactive-command';
  else if(!this.same(answer,q)||!this.same(answer,this.owner)||answer.ownerEpoch!==q.ownerEpoch||answer.ownerEpoch!==this.owner?.ownerEpoch)reason='wrong-owner';
  else if(answer.op!==q.op)reason='wrong-operation';
  else if(q.op==='sample'&&!q.delays.includes(answer.delay))reason='wrong-delay';
  const key=q?.op==='sample'?answer.delay:'once';
  if(!reason&&p.answers.has(key))reason='duplicate-answer';
  if(reason){this.event('rejected-answer',{reason,cmd:answer.cmd,pageId:answer.pageId,timeOrigin:answer.timeOrigin,ownerEpoch:answer.ownerEpoch});return false}
  p.answers.set(key,{...answer,receivedAt:this.now()});return true;
 }
 getAnswers(n){this.prune();const p=this.pending.get(n);if(!p)throw new FixtureError('fixture command expired or inactive: '+n);return [...p.answers.values()]}
 cancel(n,reason='completed'){if(!this.pending.delete(n))return;this.queue=this.queue.filter(x=>x!==n);if(reason!=='completed')this.event('cancelled',{cmd:n,reason})}
 retire(reason){
  const owner=this.owner;for(const n of [...this.pending.keys()])this.cancel(n,reason);this.queue=[];
  // Release orphaned responses. They may reconnect, but cannot claim ownership without a visible-window match.
  for(const res of this.polls.values())this.close(res,'owner-retired');this.polls.clear();this.owner=null;
  if(owner)this.event('retired',{owner,reason});
 }
 snapshot(){return {owner:this.owner,pending:[...this.pending.keys()],queued:this.queue.length,polls:this.polls.size,clients:[...this.clients.values()]}}
}
