// Stream artifacts: do not retain thousands of full browser traces in the offline process.
import {readdirSync,readFileSync,createReadStream} from 'node:fs';
import {join,dirname} from 'node:path';
import {createInterface} from 'node:readline';
export function artifactFiles(root,name){return readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?artifactFiles(join(root,e.name),name):e.name===name?[join(root,e.name)]:[])}
export async function* records(root){for(const source of artifactFiles(root,'rows.jsonl')){const config=JSON.parse(readFileSync(join(dirname(source),'config.json'),'utf8'));let lineNumber=0;for await(const line of createInterface({input:createReadStream(source),crlfDelay:Infinity})){lineNumber++;if(!line.trim())continue;yield {row:JSON.parse(line),config,source,lineNumber}}}}
export const quantile=(a,p)=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?+a[Math.max(0,Math.min(a.length-1,Math.ceil(a.length*p)-1))].toFixed(2):null};
export const stats=a=>({n:a.filter(Number.isFinite).length,p50:quantile(a,.5),p95:quantile(a,.95),max:quantile(a,1)});
