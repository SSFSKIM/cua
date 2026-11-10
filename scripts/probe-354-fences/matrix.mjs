// The hosted matrix: one shard per browser and editor; the textarea shard also carries the unreadable lane.
import {pathToFileURL} from 'node:url';
export const BROWSERS=['safari','cft','firefox'],SHARDS=['textarea','input','contenteditable','compose'];
export function matrix(only='all'){
 const all=BROWSERS.flatMap(browser=>SHARDS.map(shard=>({id:`${browser}-${shard}`,browser,shard})));
 if(only.trim()==='all')return {include:all};
 const want=only.split(',').map(s=>s.trim()).filter(Boolean),unknown=want.filter(id=>!all.some(c=>c.id===id));
 if(!want.length||unknown.length)throw Error('unknown or empty shard ids: '+(unknown.join(',')||only));
 return {include:all.filter(c=>want.includes(c.id))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log('matrix='+JSON.stringify(matrix(process.argv[2]??'all')));
