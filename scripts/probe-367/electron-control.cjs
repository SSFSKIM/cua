// A command/ACK setup control for the copied, owned Electron fixture only. It never exposes an input/Raise route.
const fs=require('node:fs');
const path=require('node:path');
const mechanism='owned Electron BrowserWindow.setBounds';
function createPoller({directory,getWindow}){
 const seen=new Set(),requestFile=path.join(directory,'request.json'),ackFile=path.join(directory,'ack.json');
 return ()=>{
  let request;
  try{request=JSON.parse(fs.readFileSync(requestFile,'utf8'));}catch{return;}
  if(typeof request?.id!=='string'||!request.id||seen.has(request.id))return;
  const window=getWindow();if(!window)return;
  seen.add(request.id); // An operation is applied at most once, including a failed setBounds call.
  const ack={id:request.id,mechanism,pid:process.pid,at:Date.now(),requested:request.bounds};
  try{
   if(request.operation!=='setBounds')throw Error('only setBounds setup is supported');
   const b=request.bounds;
   if(!b||!['x','y','width','height'].every(k=>Number.isSafeInteger(b[k]))||b.width<1||b.height<1)throw Error('setBounds needs a usable integer rectangle');
   window.setBounds({x:b.x,y:b.y,width:b.width,height:b.height});
   ack.accepted=window.getBounds();
  }catch(error){ack.error=error.message;}
  fs.writeFileSync(ackFile+'.tmp',JSON.stringify(ack)+'\n',{mode:0o600});fs.renameSync(ackFile+'.tmp',ackFile);
 };
}
function install({app,BrowserWindow}){
 const prefix='--cua367-control-dir=',directory=process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);
 if(!directory)return;
 if(!path.isAbsolute(directory))throw Error('owned bounds control requires an absolute directory');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 app.whenReady().then(()=>setInterval(createPoller({directory,getWindow:()=>BrowserWindow.getAllWindows()[0]}),50).unref());
}
module.exports={createPoller,install,mechanism};
