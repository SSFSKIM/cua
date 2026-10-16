// Bind through a relative pathname in a child-owned cwd. The caller connects using the deliberately over-limit
// absolute pathname. No process-wide chdir, inherited listener, native helper, or source-host workaround is used.
import {mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
import {ownedJsonProcess} from '../../../scripts/browser-parity/resources.mjs';
export async function longPipe(directory){
 const owner=join(directory,'long-pipe'),filename='long.sock';
 const padding=192-Buffer.byteLength(join(owner,filename))-1;
 if(padding<1||padding>255)throw new Error('Fixture scratch path cannot form the 192-byte socket path');
 const cwd=join(owner,'d'.repeat(padding)),path=join(cwd,filename);
 mkdirSync(cwd,{recursive:true,mode:0o700});let peer;
 try{
  peer=await ownedJsonProcess({command:process.execPath,args:[fileURLToPath(import.meta.url),'--peer',filename],cwd});
  if(peer.path!==path)throw new Error('Long-path listener readiness differs from its owned path');
  return {path,async close(){try{await peer.close();}finally{rmSync(owner,{recursive:true,force:true});}}};
 }catch(error){try{await peer?.close();}finally{rmSync(owner,{recursive:true,force:true});}throw error;}
}
async function serve(filename){
 if(filename!=='long.sock')throw new Error('Unexpected fixture socket name');
 const sockets=new Set(),server=createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  const received=[];
  socket.on('data',chunk=>{received.push(...chunk);if(received.length===6)socket.end(Buffer.from(received.reverse()));else if(received.length>6)socket.destroy();});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(filename,resolve);});
 console.log(JSON.stringify({ready:true,path:join(process.cwd(),filename)}));
 await new Promise(resolve=>{process.stdin.resume();process.stdin.once('end',resolve);for(const signal of ['SIGTERM','SIGINT'])process.once(signal,resolve);});
 for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv[2]!=='--peer')throw new Error('Long-path fixture peer only');await serve(process.argv[3]);}
