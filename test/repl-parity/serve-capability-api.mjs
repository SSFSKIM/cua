// M3 command-boundary oracle launch adapter. Called only from the M0 remote capability lane.
// Real-service cases still delegate every browser command to the production service. Boundary-double cases prove
// the real selected CLIENT only, not implementation or advertisement of a browser-service capability.
import {delimiter,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export function prepareCapabilityApiLaunch(launch,{host,vendorClient,ownClient}={}){
 if(!['vendor','cua'].includes(host))throw Error('Invalid capability oracle host');
 const prefix=host==='vendor'?'NODE_REPL':'CUA_REPL',env={...launch.env};
 const registered=JSON.parse(env[`${prefix}_TRUSTED_SERVICES`]??'{}');
 if(!registered.browser)throw Error('Capability oracle requires the retained browser service');
 env.PARITY_CAPABILITY_DELEGATE=registered.browser;
 const fixture=fileURLToPath(new URL('../browser-parity/capability-api-fixture.mjs',import.meta.url));
 registered.browser=fixture;
 env[`${prefix}_TRUSTED_SERVICES`]=JSON.stringify(registered);
 const moduleDir=env[`${prefix}_NODE_MODULE_DIRS`]?.split(delimiter)[0];
 const client=host==='vendor'?(vendorClient??(moduleDir&&join(moduleDir,'@oai/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js'))):(ownClient??fileURLToPath(new URL('../../src/cua-api/browser-client.mjs',import.meta.url)));
 if(!client)throw Error('Capability oracle requires the selected client module');
 const roots=new Set((env[`${prefix}_TRUSTED_CODE_PATHS`]??'').split(delimiter).filter(Boolean));
 roots.add(dirname(fixture));roots.add(dirname(client));
 env[`${prefix}_TRUSTED_CODE_PATHS`]=[...roots].join(delimiter);
 env[`${prefix}_JS_BANNER`]=`globalThis.__capabilitySetup=(await import(${JSON.stringify(pathToFileURL(client).href)})).setupBrowserRuntime;globalThis.agent=await __capabilitySetup();`;
 env[`${prefix}_TRUSTED_RPC_ENABLED`]='1';
 env[`${prefix}_UNTRUSTED_ENV_ALLOWLIST`]='CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV';
 // The vendor thin launcher overwrites its banner. Run its selected, pinned host directly, as M0's cells lane does.
 return {...launch,env,...(host==='vendor'?{command:env.CUA_REPL_NODE_REPL_PATH,args:[]}:{})};
}
