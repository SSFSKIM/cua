// Isolated services and Unix socket peer. No native helper, Chrome, account API or real secret store.
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync,realpathSync} from 'node:fs';
import {createServer} from 'node:net';
import {blockedPipe} from './blocked-pipe.mjs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export async function fixtureServices({timeoutPipe=false}={}){
 const dir=realpathSync(mkdtempSync('/tmp/cua-svc-')),outside=join(dir,'outside.mjs'),link=join(dir,'trusted','escape.mjs');
 mkdirSync(join(dir,'trusted'));
 writeFileSync(outside,'export const escaped = true;\n');symlinkSync(outside,link);
 const sockets=new Set(),server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.on('data',bytes=>socket.write(bytes));});
 let blocked;
 const close=async()=>{await blocked?.close();for(const socket of sockets)socket.destroy();if(server.listening)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});};
 try{
 const pipe=join(dir,'echo.sock');await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
 blocked=timeoutPipe?await blockedPipe(join(dir,'blocked.sock')):null;
 const root=fileURLToPath(new URL('../../../',import.meta.url));
 return {services:{fixture:fileURLToPath(new URL('./trusted-service.mjs',import.meta.url))},roots:[root,join(dir,'trusted')],env:{PARITY_WORKER_ONLY:'worker-value',PARITY_CELL_VISIBLE:'cell-value',PARITY_OUTSIDE_URL:pathToFileURL(outside).href,PARITY_SYMLINK_URL:pathToFileURL(link).href,PARITY_PIPE:pipe,PARITY_PIPE_MISSING:join(dir,'missing.sock'),...(blocked?{PARITY_PIPE_BLOCKED:blocked.path}:{})},close};
 }catch(error){await close();throw error;}
}
