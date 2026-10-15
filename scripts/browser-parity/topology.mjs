import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const root = fileURLToPath(new URL('../../',import.meta.url));
export const quote = text => "'"+String(text).replaceAll("'", "'\\''")+"'";
export function assertPreparedProfile(result,key) {
  if(!result.profiles?.some(p=>p.key===key && p.ready && p.extensionInstanceId))throw new Error(`prepare requires the already-bound ready profile ${key}; ask the controller to restore its connection (no rebinding)`);
}
const ssh = (device,script) => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(device)) throw new Error('Invalid ssh device alias');
  return {command:'ssh',args:['-o','BatchMode=yes',device,`export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:/opt/homebrew/bin:$PATH"
${script}`]};
};
export function miniPrepareCommand({device,commit,profile}) {
  if(!/^[0-9a-f]{7,40}$/.test(commit)) throw new Error('prepare requires a commit SHA');
  if(!profile) throw new Error('prepare requires --profile');
  return ssh(device,`set -eu
repo="$HOME/Developer/GitHub/cua-parity"
if [ ! -d "$repo/.git" ]; then git clone -q https://github.com/SSFSKIM/cua "$repo"; fi
cd "$repo"
test -z "$(git status --porcelain)" || { echo 'parity clone is dirty' >&2; exit 1; }
git fetch -q origin
git checkout --detach ${quote(commit)}
npm ci --silent
node --input-type=module -e ${quote(`import {execFileSync} from 'node:child_process';const key=${JSON.stringify(profile)};const r=JSON.parse(execFileSync(process.execPath,['bin/cua.mjs','profiles','list','--json'],{encoding:'utf8',env:{...process.env,CUA_SHIM_SURFACES:'browser',CUA_SHIM_SECRETS:'off',CUA_REPL_HOST:'vendor',CUA_BROWSER_SERVICE:'cua'}}));(${assertPreparedProfile.toString()})(r,key);`)}
node --input-type=module -e ${quote(`import {defaultHome} from './src/runtime/layout.mjs';import {executionFacts} from './scripts/repl-parity/provenance.mjs';import {execFileSync} from 'node:child_process';console.log(JSON.stringify({...executionFacts({source:defaultHome()}),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checkout:process.cwd(),home:defaultHome(),profile:${JSON.stringify(profile)},device:${JSON.stringify(device)},fixturePort:48732}))`)}`);
}
export function serveCommand({device,service,replHost='vendor',home,checkout=root}) {
  if(!['vendor','cua'].includes(replHost))throw new Error('Invalid REPL host');
  if(!['vendor','cua'].includes(service)) throw new Error('service must be vendor or cua');
  if(device==='local') return {command:process.execPath,args:[fileURLToPath(new URL('../../test/browser-parity/fake-serve.mjs',import.meta.url))],cwd:root,
    env:{...process.env,HOME:home,CUA_HOME:home,CUA_BROWSER_SERVICE:service,CUA_REPL_HOST:replHost,CUA_SHIM_SURFACES:'browser'}};
  return ssh(device,`cd ${quote(checkout)} && exec env CUA_HOME=${quote(home)} CUA_BROWSER_SERVICE=${quote(service)} CUA_REPL_HOST=${quote(replHost)} CUA_SHIM_SECRETS=off CUA_SHIM_SURFACES='browser' node test/repl-parity/serve-production.mjs`);
}
// The real `cua serve` from this checkout in a scratch home (the capability host's runs). Its environment is built, not
// inherited: only what a process needs to run (PATH, TMPDIR, locale, user name) comes from the caller; HOME is a
// directory inside the scratch home, so nothing under the caller's home (its secret store, its MAWS sessions, its XDG
// configuration) is reached; secrets are off; CUA_BROWSER_BACKENDS, BROWSER_USE_*, NODE_OPTIONS and every other ambient
// setting are left out, so the capability host is the only backend the launch can list.
const PASSED_THROUGH=['PATH','TMPDIR','LANG','LC_ALL','LC_CTYPE','USER','LOGNAME','__CF_USER_TEXT_ENCODING'];
export function localCuaServeCommand({service,replHost='vendor',home,userHome},ambient=process.env) {
  if(!['vendor','cua'].includes(replHost))throw new Error('Invalid REPL host');
  if(!['vendor','cua'].includes(service)) throw new Error('service must be vendor or cua');
  if(typeof userHome!=='string'||!userHome.startsWith(`${home}/`)) throw new Error('the serve HOME must be inside the scratch home');
  const env=Object.fromEntries(PASSED_THROUGH.filter(name=>ambient[name]!==undefined).map(name=>[name,ambient[name]]));
  return {command:process.execPath,args:[fileURLToPath(new URL('../../bin/cua.mjs',import.meta.url)),'serve'],cwd:root,
    env:{...env,HOME:userHome,CUA_HOME:home,CUA_BROWSER_SERVICE:service,CUA_REPL_HOST:replHost,CUA_SHIM_SURFACES:'browser',CUA_SHIM_SECRETS:'off'}};
}
export function remoteCommand(device,script) {return ssh(device,script);}
export function execute(command) {return execFileSync(command.command,command.args,{encoding:'utf8',cwd:command.cwd,env:command.env,maxBuffer:4*1024*1024});}
