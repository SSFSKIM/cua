// Owned, expiring no-store transport; shape reused from probe/354-measure owner-v3.
export class FixtureTransport {
 constructor({onEvent=()=>{},now=Date.now}={}){this.onEvent=onEvent;this.now=now;this.clients=new Map();this.polls=new Map();this.pending=new Map();this.queue=[];this.owner=null;this.serial=0;this.epoch=0;}
 same(a,b){return a?.pageId===b?.pageId&&a?.timeOrigin===b?.timeOrigin;}
 identity(v){return typeof v?.pageId==='string'&&/^[a-f0-9]{32}$/.test(v.pageId)&&Number.isFinite(v.timeOrigin)&&v.timeOrigin>0;}
 event(kind,data={}){this.onEvent({kind,at:this.now(),...data});}
 register(v){if(!this.identity(v))return false;this.clients.set(v.pageId,v);this.event('ready',v);return true;}
 poll(id,res){
  if(!this.identity(id)||!this.same(this.clients.get(id.pageId),id)){res.end(JSON.stringify({op:'idle'}));return;}
  const old=this.polls.get(id.pageId);if(old&&!old.writableEnded)old.end(JSON.stringify({op:'idle'}));
  this.polls.set(id.pageId,res);res.on('close',()=>{if(this.polls.get(id.pageId)===res)this.polls.delete(id.pageId);});this.dispatch();
 }
 bind(title){
  const match=/probe366:([a-f0-9]{32})(?![a-f0-9])/i.exec(title??'');
  const client=match&&this.clients.get(match[1].toLowerCase());if(!client)throw Error('visible AX window has no registered fixture identity: '+title);
  if(!this.same(client,this.owner)){
   for(const n of [...this.pending.keys()])this.cancel(n);this.queue=[];
   this.owner={pageId:client.pageId,timeOrigin:client.timeOrigin,ownerEpoch:++this.epoch};this.event('bound',{owner:this.owner,title});
  }
  return this.owner;
 }
 send(q){
  if(!this.owner)throw Error('unbound fixture');
  const n=++this.serial,command={...q,n,...this.owner,expiresAt:this.now()+10000};
  this.pending.set(n,{command,answer:null});this.queue.push(n);this.dispatch();return n;
 }
 dispatch(){
  const res=this.owner&&this.polls.get(this.owner.pageId);if(!res)return;
  while(this.queue.length){const n=this.queue.shift(),p=this.pending.get(n);if(!p)continue;
   if(p.command.expiresAt<this.now()){this.cancel(n);continue;}
   this.polls.delete(this.owner.pageId);res.end(JSON.stringify(p.command));return;
  }
 }
 accept(a){
  const p=this.pending.get(a.cmd),q=p?.command;
  if(!p||p.answer||q.expiresAt<this.now()||!this.same(a,q)||!this.same(a,this.owner)||a.ownerEpoch!==q.ownerEpoch||a.op!==q.op){this.event('rejected',{cmd:a.cmd});return false;}
  p.answer=a;return true;
 }
 answer(n){return this.pending.get(n)?.answer;}
 cancel(n){this.pending.delete(n);this.queue=this.queue.filter(x=>x!==n);}
 close(){for(const res of this.polls.values())if(!res.writableEnded)res.end(JSON.stringify({op:'idle'}));this.polls.clear();}
}
