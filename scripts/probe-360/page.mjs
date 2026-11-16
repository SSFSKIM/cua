// Keep #354's owner-v3 page and its key-only setup, with two narrow fixture commands.
import {page} from '../probe-354/page.mjs';
function once(s,from,to){if(s.split(from).length!==2)throw Error('inherited fixture anchor changed');return s.replace(from,to)}
export function page360(){
 let s=page();
 s=once(s,"if(c.key==='cmd+v')pos=0;select(pos,len);","if(c.key==='cmd+v'||c.scene==='boundary')pos=0;select(pos,len);");
 s=once(s," if(c.op==='read'){"," if(c.op==='arm'){trace=[];lastSent=0;await reply({cmd:c.n,op:c.op,...state()});return}\n if(c.op==='read'){");
 return s;
}
