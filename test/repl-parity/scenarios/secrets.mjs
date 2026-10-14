import {secretCaseIds} from '../fixtures/secret-cases.mjs';
import {caseSchedule} from '../../../scripts/repl-parity/registry.mjs';
const plan=new Map(caseSchedule().map(c=>[c.id,c]));
export default secretCaseIds.map(id=>({...plan.get(id),backend:'secret-double',cells:[{label:'boundary',op:'secret-double',id}],assert:({results})=>({ok:results.length===1&&results[0].ok===true&&results[0].fakeBackend===true})}));
