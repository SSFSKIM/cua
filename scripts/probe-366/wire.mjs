import {createConnection} from 'node:net';
export class Wire {
 static connect(path){return new Promise((ok,no)=>{const s=createConnection(path);s.once('connect',()=>{s.off('error',no);ok(new Wire(s));});s.once('error',no);});}
 constructor(socket){
  this.socket=socket;this.buffer=Buffer.alloc(0);this.pending=new Map();this.serial=0;this.lineage=null;
  socket.on('data',data=>{try {
   this.buffer=Buffer.concat([this.buffer,data]);
   while(this.buffer.length>=4){const n=this.buffer.readUInt32LE();if(n>64*1024*1024)throw Error('oversized engine frame');if(this.buffer.length<4+n)break;
    const r=JSON.parse(this.buffer.subarray(4,4+n));this.buffer=this.buffer.subarray(4+n);const p=this.pending.get(r.id);if(p){clearTimeout(p.timer);this.pending.delete(r.id);p.ok(r);}
   }
  } catch(e){this.fail(e);}});
  socket.on('error',e=>this.fail(e));socket.on('close',()=>this.fail(Error('engine socket closed')));
 }
 fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.no(e);}this.pending.clear();}
 call(method,params){
  const id=++this.serial,b=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,method,params})),h=Buffer.alloc(4);h.writeUInt32LE(b.length);
  return new Promise((ok,no)=>{const timer=setTimeout(()=>{this.pending.delete(id);no(Error('RPC timeout '+method));},30000);this.pending.set(id,{ok,no,timer});this.socket.write(Buffer.concat([h,b]));});
 }
 async execute(method,args,{deadlineMs=25000}={}){
  const result=await this.call('execute',{method,args,lineage:this.lineage,deadlineUnixMilliseconds:Date.now()+deadlineMs});
  if(result.result?.lineage)this.lineage=result.result.lineage;
  return result;
 }
 close(){this.socket.end();}
}
