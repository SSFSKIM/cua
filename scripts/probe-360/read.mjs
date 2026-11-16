// Offline readers. Input is the uploaded artifact directory; no browser, engine or credentials needed.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {summarize,classify} from './model.mjs';
export function readEvidence(out){
 const config=JSON.parse(readFileSync(join(out,'config.json'),'utf8'));
 if(typeof config.smoke!=='boolean')throw Error('missing smoke provenance');
 const raw=existsSync(join(out,'rows.jsonl'))?readFileSync(join(out,'rows.jsonl'),'utf8').trim():'';
 const rows=raw?raw.split('\n').map(JSON.parse):[],summary=summarize(rows,config.smoke);
 summary.engine=config.engine;summary.kit=config.kit;summary.failure=config.failure??null;
 summary.engineStopped=existsSync(join(out,'engine-stopped.json'))&&JSON.parse(readFileSync(join(out,'engine-stopped.json'),'utf8')).stopped===true;
 summary.complete=summary.coverage.complete&&summary.engineStopped&&!summary.failure;
 writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2));
 const tab=v=>v==null?'':String(v).replace(/[\t\n\r]/g,' '),tsv=(name,headers,rs)=>writeFileSync(join(out,name),[headers,...rs].map(r=>r.map(tab).join('\t')).join('\n')+'\n');
 const cols=Object.keys(summary.cells[0]);tsv('rates.tsv',cols,summary.cells.map(c=>cols.map(k=>c[k])));
 const eventCols=['id','variant','editor','key','moment','phase','at','type','flagsHex','keycode','window51','window91','window92','nsWindowNumber','targetPidField','postToPid','sourceStateField','sourcePidField'];
 tsv('events.tsv',eventCols,rows.flatMap(r=>(r.action?.probe?.posted??[]).flatMap(e=>[{...e,moment:'before-post'},...(e.afterPost?[{...e.afterPost,moment:'after-post'}]:[])].map(e=>eventCols.map(k=>['id','variant','editor','key'].includes(k)?r[k]:e[k])))));
 const domCols=['id','event','at','key','inputType','meta','alt','shift','selection','text'];
 tsv('dom.tsv',domCols,rows.flatMap(r=>(r.samples??[]).flatMap(s=>(s.trace??[]).map(e=>domCols.map(k=>k==='id'?r.id:k==='selection'?JSON.stringify(e[k]):e[k])))));
 const axCols=['id','reader','boundary','scorable','effect','axPairReadable','axBeforeAgrees','axAfterAgrees','axConfirms','axFalseConfirm','keydown','beforeinput','selectionchange'];
 tsv('ax.tsv',axCols,rows.map(r=>{const s=classify(r);return axCols.map(k=>k in s?s[k]:r[k])}));
 return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const s=readEvidence(process.argv[2]);console.log(JSON.stringify({complete:s.complete,planned:s.planned,recorded:s.recorded,coverage:s.coverage,engineStopped:s.engineStopped}));if(!s.complete)process.exitCode=1;
}
