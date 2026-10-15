// M0 remote capability lane adapter. It preserves the real host/client; only the downstream service is a double.
import {delimiter,dirname,join,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,realpathSync} from 'node:fs';
import {prepareCapabilityApiLaunch} from './serve-capability-api.mjs';
export function prepareLiveSecretsLaunch(launch,{host,vendorClient,ownClient,userHome,capabilityHome,remote}={}){
 if(remote!==true)throw Error('Live secret launch requires the remote capability lane');
 if(typeof capabilityHome!=='string'||typeof userHome!=='string'||resolve(userHome)!==join(resolve(capabilityHome),'home')||!/^cua-cap-/.test(basename(capabilityHome)))throw Error('Live secret launch requires the capability scratch HOME');
 // scoped permits writes only under launch.cwd/TMPDIR. Keep its policy unchanged; move only this fixture's HOME.
 if(typeof launch.cwd!=='string'||dirname(resolve(launch.cwd))!==join(resolve(capabilityHome),'run')||!/^[A-Za-z0-9-]{1,128}$/.test(basename(launch.cwd))||realpathSync(capabilityHome)!==resolve(capabilityHome)||realpathSync(userHome)!==resolve(userHome))throw Error('Live secret launch requires a canonical capability scratch run directory');
 const workerHome=join(launch.cwd,'home');
 // prepareLaunch precedes connection's mkdir(cwd). Create each child only after checking its parent, so a
 // symlink at run/session/home is refused before creating any child through it. No store values are written here.
 for(const path of [join(capabilityHome,'run'),launch.cwd,workerHome]){mkdirSync(path,{recursive:true,mode:0o700});if(realpathSync(path)!==path)throw Error('Live secret launch refuses a symlinked scratch directory');}
 const next=prepareCapabilityApiLaunch(launch,{host,vendorClient,ownClient}),prefix=host==='vendor'?'NODE_REPL':'CUA_REPL';
 const fixture=fileURLToPath(new URL('./fixtures/live-secret-service.mjs',import.meta.url));
 const registered=JSON.parse(next.env[`${prefix}_TRUSTED_SERVICES`]);registered.browser=fixture;
 next.env[`${prefix}_TRUSTED_SERVICES`]=JSON.stringify(registered);
 next.env[`${prefix}_TRUSTED_CODE_PATHS`]=[...new Set([...next.env[`${prefix}_TRUSTED_CODE_PATHS`].split(delimiter),dirname(fixture)])].join(delimiter);
 Object.assign(next.env,{HOME:workerHome,PARITY_LIVE_SECRET_REMOTE:'1',PARITY_LIVE_SECRET_HOME:workerHome,PARITY_LIVE_SECRET_CAPABILITY_HOME:capabilityHome,PARITY_LIVE_SECRET_RUN_DIRECTORY:launch.cwd});
 return next;
}
