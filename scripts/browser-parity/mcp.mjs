// A minimal newline JSON-RPC MCP stdio client. Requests from the server have their own ID namespace.
import {spawn} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {createInterface} from 'node:readline';
export class StdioClient {
  // `answer(msg)` decides an elicitation (default: accept, as the parity runs do); `onElicitation(row, msg)` records it.
  // `stderrFile`: where the tail of the server's stderr (its last `stderrBytes`) goes when the connection ends abnormally:
  // a nonzero exit or a signal the harness did not send, or any exit before the harness closed it (#157: a Linux native
  // connection closed once with code 1 and its stderr was gone). A connection that ends as asked writes nothing.
  constructor({command,args = [],env = process.env,cwd,timeoutMs = 150000,closeTimeoutMs = 5000,onElicitation = () => {},answer = () => ({action:'accept',content:{}}),onNotification = () => {},clientName = 'cua-browser-parity',stderrFile,stderrBytes = 64 * 1024}) {
    this.clientName = clientName; this.answer=answer;this.closeTimeoutMs=closeTimeoutMs;
    this.child = spawn(command,args,{env,cwd,stdio:['pipe','pipe','pipe']});
    this.pending = new Map(); this.nextId=0; this.timeoutMs=timeoutMs; this.closed=false;
    this.ending=null;let tail=Buffer.alloc(0);
    this.exited = new Promise(resolve => this.child.once('close',(code,signal) => {
      this.closed=true;
      const abnormal=!this.ending||(code!==0&&!(this.ending==='drop'&&signal==='SIGTERM'));
      if(stderrFile&&abnormal){
        try{mkdirSync(dirname(stderrFile),{recursive:true});writeFileSync(stderrFile,`# ${new Date().toISOString()} exit ${code ?? signal}${this.ending?` after the harness's ${this.ending}`:' before the harness closed it'}; the last ${tail.length} bytes of stderr follow\n`+tail.toString('utf8'),{mode:0o600});}catch{}
        this.stderrFile=stderrFile;
      }
      this.failAll(new Error(`MCP exited (${code ?? signal})`));resolve({code,signal});
    }));
    // Runtime stderr is not parity evidence: only its bounded tail is kept, and written only for a diagnosis (above).
    this.child.stderr.on('data',chunk => {tail=Buffer.concat([tail,chunk]);if(tail.length>stderrBytes)tail=tail.subarray(tail.length-stderrBytes);});
    this.child.once('error',e => this.failAll(e));
    this.child.stdin.on('error',e => this.failAll(e));
    const lines = createInterface({input:this.child.stdout});
    lines.on('line',async line => {
      let msg; try {msg=JSON.parse(line);} catch {this.failAll(new Error('Non-JSON MCP stdout'));return;}
      if (msg.method && msg.id !== undefined) {
        if (msg.method === 'elicitation/create') {
          // Vendor approvals are schema-form requests. Record action only, never prompt text or supplied secrets.
          try {
            const result = await this.answer(msg);
            const row = {t:new Date().toISOString(),method:msg.method,action:result?.action};
            onElicitation(row,msg);
            this.write({jsonrpc:'2.0',id:msg.id,result});
          } catch {
            this.write({jsonrpc:'2.0',id:msg.id,error:{code:-32603,message:'Harness elicitation handler failed'}});
          }
        } else if (msg.method === 'ping') this.write({jsonrpc:'2.0',id:msg.id,result:{}});
        else this.write({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Unsupported client request'}});
        return;
      }
      if (msg.method && msg.id === undefined) onNotification(msg);
      if (!msg.method && msg.id !== undefined) {
        const p = this.pending.get(msg.id); if (!p) return;
        this.pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.error) p.reject(Object.assign(new Error(msg.error.message),{code:msg.error.code}));else p.resolve(msg.result);
      }
    });
  }
  write(msg) {if (!this.closed && !this.child.stdin.destroyed) this.child.stdin.write(JSON.stringify(msg)+'\n');}
  failAll(error) {for (const p of this.pending.values()) {clearTimeout(p.timer);p.reject(error);} this.pending.clear();}
  request(method,params={},timeoutMs=this.timeoutMs) {
    if(this.closed) return Promise.reject(new Error('MCP connection is closed'));
    const id=++this.nextId;
    const promise=new Promise((resolve,reject) => {
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`MCP ${method} timed out`));},timeoutMs);
      this.pending.set(id,{resolve,reject,timer}); this.write({jsonrpc:'2.0',id,method,params});
    });
    promise.requestId=id; return promise;
  }
  setElicitationAnswer(answer) {if(typeof answer!=='function')throw new Error('answer must be a function');this.answer=answer;}
  cancel(requestId,reason='parity cancellation') {this.write({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId,reason}});}
  async initialize(capabilities={elicitation:{form:{}}}) {
    const value=await this.request('initialize',{protocolVersion:'2025-06-18',capabilities,clientInfo:{name:this.clientName,version:'1'}});
    this.write({jsonrpc:'2.0',method:'notifications/initialized'});return value;
  }
  call(name,args={},meta) {return this.request('tools/call',{name,arguments:args,...(meta?{_meta:meta}:{})});}
  async close({drop=false}={}) {
    if (!this.closed) {
      this.ending=drop?'drop':'eof';
      if(drop) this.child.kill('SIGTERM'); else this.child.stdin.end();
    }
    let timer;
    const exited=await Promise.race([this.exited,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),this.closeTimeoutMs);})]);clearTimeout(timer);
    if(exited) return exited;
    this.child.kill('SIGKILL'); return this.exited;
  }
}
export const textOf = result => (result?.content ?? []).filter(c=>c.type==='text').map(c=>c.text).join('\n');
