import {test} from 'node:test';import assert from 'node:assert/strict';
import {discoverDesktopEnvironment} from '../../scripts/repl-parity/desktop.mjs';
test('X environment discovery supports the VM openbox session and exports only desktop keys',()=>{
 const files={'/proc/1/comm':'xfce4-session\n','/proc/1/environ':'HOME=/fixture\0','/proc/2/comm':'openbox\n','/proc/2/environ':'DISPLAY=:0\0XAUTHORITY=/fixture/.Xauthority\0DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus\0OTHER_PRIVATE_SETTING=never-export\0'};
 const result=discoverDesktopEnvironment({readdirSync:()=>['1','2','self'],readFileSync:path=>{if(!(path in files))throw new Error('not found');return files[path];}});
 assert.deepEqual(result,{DISPLAY:':0',XAUTHORITY:'/fixture/.Xauthority',DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/1000/bus'});
});
