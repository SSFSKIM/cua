// Linux only, opt-in from the prepared harness environment. Never reads Chrome profiles. Unknown argument values,
// positional URLs and all environment keys except DISPLAY are deliberately absent from the recorded facts.
const booleanFlags=new Set(['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--no-sandbox']);
const valueFlags=new Set(['--profile-directory','--user-data-dir','--window-size','--window-position','--ozone-platform','--use-gl','--use-angle']);
export function chromeLaunchFacts(fs,{display,home}){
 const found=[];
 for(const pid of fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p))){
  let argv,actualDisplay;
  try{
   if(!['chrome','google-chrome'].includes(fs.readFileSync(`/proc/${pid}/comm`,'utf8').trim()))continue;
   argv=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean);
   if(argv.length===1&&argv[0].includes(' '))argv=argv[0].trim().split(/\s+/);
   if(argv.some(a=>a==='--type'||a.startsWith('--type=')))continue;
   actualDisplay=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').find(p=>p.startsWith('DISPLAY='))?.slice(8);
  }catch{continue;}
  if(actualDisplay!==undefined&&actualDisplay!==display)continue;
  const flags=[],unrecordedFlagNames=[];let omittedPositionalArguments=0,profileDirectory=null;
  for(let i=1;i<argv.length;i++){
   const arg=argv[i],key=arg.split('=')[0];
   if(booleanFlags.has(arg))flags.push(arg);
   else if(valueFlags.has(key)){
    const value=arg.includes('=')?arg.slice(key.length+1):argv[++i];if(value===undefined)throw Error('Incomplete Chrome launch flag');
    flags.push(key+'='+value);if(key==='--profile-directory')profileDirectory=value;
   }else if(arg.startsWith('--'))unrecordedFlagNames.push(key);else omittedPositionalArguments++;
  }
  found.push({executable:argv[0],flags,display:actualDisplay??display,displaySource:actualDisplay===undefined?'prepared-X-session (process environment unavailable)':'process-environment',profileDirectory,registrationHome:home,unrecordedFlagNames,omittedPositionalArguments});
 }
 if(found.length>1&&found.some(f=>f.displaySource!=='process-environment'))throw Error('Ambiguous Chrome display after process-title rewriting');
 if(!found.length)throw Error('No main Chrome process on the prepared display');
 return found.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
