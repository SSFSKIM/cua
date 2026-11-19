// #398's collision census on hosted macOS: how often the placeholder is the only attribute separating two text fields of
// one window, by the engine's own identity match, on public pages in Chrome for Testing or Safari and in built-in apps.
// The engine is the instrumented copy of main (patch-census.mjs); its census lines carry only roles and attribute shapes.
// Hosted runners only. Pages are loaded and observed; nothing is typed into them or submitted.
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Wire} from './wire.mjs';
import {owned,stop,pause,until,environment,plistVersion} from './proc.mjs';
import {startHelper} from './platform.mjs';
import {PAGES,SCENES} from './sites.mjs';

const LANES=['census-cft','census-safari','census-appkit'];
const cft='/Applications/Google Chrome for Testing.app';
// The site a host belongs to: its last two labels (enough to tell a page from a redirect elsewhere).
export const site=host=>String(host??'').toLowerCase().replace(/^www\./,'').split('.').slice(-2).join('.');

async function main(){
  const [lane,root,out,helperBin,engineBin]=process.argv.slice(2);
  if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
  if(!LANES.includes(lane))throw Error('invalid lane');
  mkdirSync(out,{recursive:true});
  const tmp=mkdtempSync(join(root,'q398c-')),home=join(tmp,'platform'),ehome=join(tmp,'engine');mkdirSync(home);mkdirSync(ehome,{mode:0o700});
  const env=environment(home),socket=join(ehome,'e.sock');
  let latest=null;
  const engine=owned(engineBin,[],{...environment(ehome),CUA_ENGINE_SOCKET:socket,PROBE398_CENSUS:'1'},{stderr:l=>{
    try{const d=JSON.parse(l)?.probe398Census;if(d)latest=d;}catch{}
  }});
  const helper=startHelper(helperBin,env);
  const rows=[],config={kit:process.env.GITHUB_SHA,main:process.env.MAIN_SHA,image:process.env.ImageVersion,lane,
    os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()};
  let browser=null,abort=null,w=null;
  try{
    w=await Wire.connect(socket,{timeoutMs:15000});
    const ping=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});
    if(ping.error||!ping.result)throw Error('engine ping failed');
    // One observation, and the census line its commit emitted (none when the walk found no window).
    const observe=async pid=>{
      latest=null;
      const r=await w.execute('get_app_state',{pid,includeScreenshot:false,disableDiff:true});
      for(let i=0;i<20&&!latest&&r.result;i++)await pause(50);
      return {result:r.result??null,error:r.error?.errorName??null,census:latest};
    };
    const front=pid=>until(async()=>(await helper.ask({op:'front',pid,activate:true})).frontmostPid===pid,9000).catch(()=>false);
    const record=(base,first,second)=>{
      const nodes=Array.isArray(second.result?.nodes)?second.result.nodes:[];
      const webHosts=nodes.filter(n=>n.role==='AXWebArea'&&typeof n.url==='string').map(n=>{try{return new URL(n.url).hostname;}catch{return null;}});
      rows.push({...base,observed:!!second.census,error:second.error,firstFields:first.census?.fields??null,
        hostMatch:base.url?webHosts.some(h=>site(h)===site(new URL(base.url).hostname)):null,webAreas:webHosts.length,
        nodes:nodes.length,census:second.census});
    };
    if(lane==='census-appkit'){
      for(const scene of SCENES){
        const base={id:scene.id,kind:'appkit',bundle:scene.bundle};
        try{
          execFileSync('/usr/bin/open',scene.url?[scene.url]:['-b',scene.bundle],{stdio:'ignore',timeout:20000});
          const pid=await until(async()=>(await helper.ask({op:'lookup',bundle:scene.bundle})).pid,30000);
          base.ready=await until(async()=>(await helper.ask({op:'status',pid})).ready,20000).then(()=>true,()=>false);
          await pause(2500);
          base.front=await front(pid)!==false;
          base.keys=true;
          for(const key of scene.keys){
            const r=await w.execute('press_key',{pid,key});
            if(r.error)base.keys=false;
            await pause(1500);
          }
          // The scene, by a window title where one marks it, else by its app ready and its keys accepted.
          const titles=(await helper.ask({op:'titles',pid})).titles??[];
          base.titleMatch=scene.expectTitle?titles.some(t=>typeof t==='string'&&scene.expectTitle.test(t)):null;
          base.sceneVerified=base.ready&&base.keys&&base.titleMatch!==false;
          const first=await observe(pid);await pause(2000);
          record(base,first,await observe(pid));
        }catch{rows.push({...base,observed:false,sceneVerified:false,error:'setup'});}
      }
    }else{
      const profile=join(home,'profile');let pid,port=null;
      if(lane==='census-cft'){
        browser=owned(cft+'/Contents/MacOS/Google Chrome for Testing',['--user-data-dir='+profile,'--no-first-run','--no-default-browser-check',
          '--disable-search-engine-choice-screen','--disable-features=Translate','--lang=en-US','--window-position=200,30','--window-size=1200,860',
          '--remote-debugging-port=0','about:blank'],{...env,HOME:process.env.HOME});
        pid=browser.pid;
        port=await until(()=>{const f=join(profile,'DevToolsActivePort');return existsSync(f)&&Number(readFileSync(f,'utf8').split('\n')[0]);},30000);
        config.version=plistVersion(cft);
      }else{
        if((await helper.ask({op:'lookup',bundle:'com.apple.Safari'})).pid)throw Error('Safari already present');
        execFileSync('/usr/bin/open',['-a','/Applications/Safari.app','--env','HOME='+home,'about:blank'],{env,stdio:'ignore'});
        pid=await until(async()=>(await helper.ask({op:'lookup',bundle:'com.apple.Safari'})).pid,30000);
        config.version=plistVersion('/Applications/Safari.app');
      }
      await until(async()=>(await helper.ask({op:'status',pid})).ready,45000);
      await helper.ask({op:'enable',pid});
      for(const p of PAGES){
        let tab=null;
        try{
          if(port){
            const r=await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(p.url)}`,{method:'PUT'});
            tab=r.ok?(await r.json().catch(()=>null))?.id:null;
            if(typeof tab!=='string'||!tab){tab=null;rows.push({id:p.id,kind:p.kind,url:p.url,observed:false,error:'tab-open'});continue;}
          }else execFileSync('/usr/bin/open',['-a','/Applications/Safari.app',p.url],{stdio:'ignore',timeout:20000});
          await pause(8000);
          await front(pid);
          const first=await observe(pid);await pause(2500);
          record({id:p.id,kind:p.kind,url:p.url},first,await observe(pid));
        }catch{rows.push({id:p.id,kind:p.kind,url:p.url,observed:false,error:'setup'});}
        finally{
          try{
            if(port&&tab)await fetch(`http://127.0.0.1:${port}/json/close/${tab}`);
            else if(!port){await front(pid);await w.execute('press_key',{pid,key:'cmd+w'});}
          }catch{}
          await pause(500);
        }
      }
    }
  }catch(e){abort=String(e?.message??'error').slice(0,80);}
  finally{
    try{await w?.call('endTask',{});}catch{}
    w?.close();
    await stop(engine);
    // The owned browser is never signalled (project rule); the hosted job's cleanup ends it.
    if(browser){browser.stdin?.destroy();browser.stdout?.destroy();browser.stderr?.destroy();browser.unref();}
    await helper.close();
  }
  // Totals over reached windows only: a page on its requested site, a verified app scene. Every row stays in census.json.
  const reached=r=>r.observed&&(r.kind==='appkit'?r.sceneVerified===true:r.hostMatch===true);
  for(const r of rows)r.reached=reached(r);
  const observed=rows.filter(r=>r.reached);
  const sum=k=>observed.reduce((a,r)=>a+(r.census?.counts?.[k]??0),0);
  const tally=list=>list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
  const status={lane,abort,kit:config.kit,main:config.main,version:config.version??null,os:config.os,image:config.image,
    sampled:rows.length,observedAny:rows.filter(r=>r.observed).length,reached:observed.length,
    unreached:rows.length-observed.length,unreachedBy:tally(rows.filter(r=>!reached(r)).map(r=>r.error??(r.observed?'not-reached':'not-observed'))),
    fields:observed.reduce((a,r)=>a+(r.census?.fields??0),0),fieldsWithPlaceholder:observed.reduce((a,r)=>a+(r.census?.fieldsWithPlaceholder??0),0),
    windowsWithTwoFields:observed.filter(r=>(r.census?.fields??0)>=2).length,
    pairs:sum('pairs'),placeholderOnly:sum('placeholderOnly'),identical:sum('identical'),
    placeholderOnlyIgnoringValue:sum('placeholderOnlyIgnoringValue'),identicalIgnoringValue:sum('identicalIgnoringValue'),
    placeholderOnlyAncestryAlike:sum('placeholderOnlyAncestryAlike'),identicalAncestryAlike:sum('identicalAncestryAlike'),
    windowsWithPlaceholderOnly:observed.filter(r=>(r.census?.counts?.placeholderOnly??0)+(r.census?.counts?.placeholderOnlyIgnoringValue??0)>0).length,
    windowsWithIdentical:observed.filter(r=>(r.census?.counts?.identical??0)>0).length};
  // A census passes when it reached at least half of what it sampled.
  status.pass=abort===null&&observed.length>0&&observed.length>=rows.length/2;
  writeFileSync(join(out,'status.json'),JSON.stringify(status,null,2)+'\n');
  writeFileSync(join(out,'census.json'),JSON.stringify(rows,null,2)+'\n');
  writeFileSync(join(out,'config.json'),JSON.stringify(config,null,2)+'\n');
  console.log(JSON.stringify({lane,abort,sampled:rows.length,reached:observed.length,pass:status.pass}));
  if(!status.pass)process.exitCode=1;
}
if(process.argv[1]?.endsWith('census.mjs'))main().catch(()=>{console.error('Census harness failed before evidence publication');process.exitCode=1;});
