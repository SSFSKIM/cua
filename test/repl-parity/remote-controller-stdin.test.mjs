// The foreground controller must exit by itself after {"op":"stop"}, even when its stdin is never closed by the writer.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,openSync,closeSync,writeSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const controller=pathToFileURL(join(import.meta.dirname,'../../scripts/repl-parity/remote-controller.mjs')).href;
// The child dispatches each command, printing it, and exits only when nothing keeps its event loop alive.
const child=stdin=>spawn(process.execPath,['--input-type=module','-e',
 `import {foregroundCommands} from ${JSON.stringify(controller)};await foregroundCommands(process.stdin,async c=>console.log('ran',c.op));console.log('stopped');`],
 {stdio:[stdin,'pipe','inherit']});
async function exitsAfterStop(proc,write){
 let out='';proc.stdout.on('data',d=>{out+=d;});
 const exited=new Promise(resolve=>proc.once('exit',code=>resolve(code)));
 write('{"op":"probe"}\n{"op":"stop"}\n{"op":"probe"}\n');
 const code=await Promise.race([exited,new Promise(resolve=>setTimeout(()=>resolve('still running'),5000))]);
 if(code==='still running')proc.kill('SIGKILL');
 assert.equal(code,0);
 assert.equal(out,'ran probe\nstopped\n');
}

test('the controller exits after stop while a held-open pipe is its stdin',async()=>{
 const proc=child('pipe');
 try{await exitsAfterStop(proc,text=>proc.stdin.write(text));}finally{proc.stdin.destroy();}
});

test('the controller exits after stop while a FIFO it also holds open for writing is its stdin',{skip:process.platform==='win32'},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cua-controller-fifo-'));const fifo=join(dir,'stdin');
 execFileSync('mkfifo',[fifo]);const fd=openSync(fifo,'r+');
 try{await exitsAfterStop(child(fd),text=>writeSync(fd,text));}finally{closeSync(fd);rmSync(dir,{recursive:true,force:true});}
});
