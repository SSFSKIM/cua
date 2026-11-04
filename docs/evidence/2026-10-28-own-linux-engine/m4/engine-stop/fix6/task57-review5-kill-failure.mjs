import {spawn, spawnSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
if (!process.env.DISPLAY || /^:0(?:\.|$)/.test(process.env.DISPLAY)) throw Error("private display required");
const engine = process.argv[2];
const dir = mkdtempSync(join(tmpdir(), "cua-review-final-record-"));
const writer = `const fs=require("node:fs"),cp=require("node:child_process");const fd=Number(process.env.CUA_ENGINE_HELD_FD);let r=Buffer.alloc(72);r.write("cuaH");r[4]=2;r[14]=4;fs.writeSync(fd,r);cp.spawnSync("xdotool",["keydown","Shift_L"]);console.log(JSON.stringify({stage:"initial",pid:process.pid}));setTimeout(()=>{r[14]=4;let wrote;try{wrote=fs.writeSync(fd,r);}catch(e){wrote=e.code;}const x=cp.spawnSync("xdotool",["keydown","Shift_L"]);console.log(JSON.stringify({stage:"late",wrote,pressed:x.status}));},1650);setTimeout(()=>process.exit(0),2200);`;
const program = JSON.stringify(process.execPath) + " -e " + JSON.stringify(writer) + " &";
const proc = spawn("strace", ["-o", join(dir,"trace"), "-e", "trace=pidfd_open,pidfd_send_signal", "-e", "inject=pidfd_open:error=EMFILE:when=3", "/bin/sh", "-c", "exec \"$0\" launcher-shim \"$PPID\" /bin/sh -c \"$1\"", engine, program], {stdio:["ignore","pipe","pipe"]});
let out="", err=""; proc.stdout.on("data",d=>out+=d); proc.stderr.on("data",d=>err+=d);
const start=Date.now(); let timer;
try {
  const exit=await Promise.race([new Promise(r=>proc.once("close",(code,signal)=>r({code,signal}))),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("probe deadline")),7000);})]);
  const py=`import ctypes,json; x=ctypes.CDLL("libX11.so.6"); x.XOpenDisplay.restype=ctypes.c_void_p; x.XOpenDisplay.argtypes=[ctypes.c_char_p]; x.XQueryKeymap.argtypes=[ctypes.c_void_p,ctypes.c_void_p]; x.XCloseDisplay.argtypes=[ctypes.c_void_p]; d=x.XOpenDisplay(None); assert d; b=(ctypes.c_ubyte*32)(); x.XQueryKeymap(d,b); print(json.dumps([k for k in range(256) if b[k//8] & (1<<(k%8))])); x.XCloseDisplay(d)`;
  const keys=spawnSync("python3",["-I","-c",py],{encoding:"utf8"});
  console.log(JSON.stringify({display:process.env.DISPLAY,elapsedMs:Date.now()-start,exit,writer:out.trim().split("\n").filter(Boolean).map(JSON.parse),keysAfterShim:JSON.parse(keys.stdout),shimStderr:err.trim(),trace:readFileSync(join(dir,"trace"),"utf8").trim()}));
} finally {
  clearTimeout(timer);
  if(proc.exitCode===null&&proc.signalCode===null) proc.kill("SIGKILL");
  spawnSync("xdotool",["keyup","Shift_L"]);
  rmSync(dir,{recursive:true,force:true});
}
