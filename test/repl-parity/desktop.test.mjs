import {test} from 'node:test';import assert from 'node:assert/strict';
import {discoverDesktopEnvironment} from '../../scripts/repl-parity/desktop.mjs';
test('X environment discovery supports the VM openbox session and exports only desktop keys',()=>{
 const files={'/proc/1/comm':'xfce4-session\n','/proc/1/environ':'HOME=/fixture\0','/proc/2/comm':'openbox\n','/proc/2/environ':'DISPLAY=:0\0XAUTHORITY=/fixture/.Xauthority\0DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus\0OTHER_PRIVATE_SETTING=never-export\0'};
 const result=discoverDesktopEnvironment({readdirSync:()=>['1','2','self'],readFileSync:path=>{if(!(path in files))throw new Error('not found');return files[path];}});
 assert.deepEqual(result,{DISPLAY:':0',XAUTHORITY:'/fixture/.Xauthority',DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/1000/bus'});
});
// A harness run on a private display (#171 M4, T18): the session is chosen by its DISPLAY, never the first one found, so
// a run never lands on the person's `:0` when its own private session runs beside it.
const twoSessions={'/proc/2/comm':'openbox\n','/proc/2/environ':'DISPLAY=:0\0DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus\0','/proc/7/comm':'openbox\n','/proc/7/environ':'DISPLAY=:57\0XAUTHORITY=/run/none\0DBUS_SESSION_BUS_ADDRESS=unix:path=/private/bus\0XDG_RUNTIME_DIR=/run/user/1000\0'};
const procFs=files=>({readdirSync:()=>['2','7','self'],readFileSync:path=>{if(!(path in files))throw new Error('not found');return files[path];}});
test('X environment discovery selects the session of a named display',()=>{
 assert.deepEqual(discoverDesktopEnvironment(procFs(twoSessions),{display:':57'}),{DISPLAY:':57',XAUTHORITY:'/run/none',DBUS_SESSION_BUS_ADDRESS:'unix:path=/private/bus',XDG_RUNTIME_DIR:'/run/user/1000'});
 assert.equal(discoverDesktopEnvironment(procFs(twoSessions)).DISPLAY,':0','with no display named, the first session, as before');
 assert.throws(()=>discoverDesktopEnvironment(procFs(twoSessions),{display:':58'}),/:58/);
});
