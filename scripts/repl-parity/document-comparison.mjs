// Comparison-only Table 3 projection. Evidence keeps original MCP bytes, and independent scenario assertions run
// before this projection. Only the document-producing cells below may transform approved vendor document bytes.
import {projectDocumentationRow,transformDocumentContent} from './docs-oracle.mjs';
import binder from '../../test/repl-parity/scenarios/binder.mjs';
const binderIds=new Set(binder.map(s=>s.id));
export function documentComparisonRun(run){
 return {...run,rows:run.rows.map(row=>{
  if((binderIds.has(row.case)&&row.cell==='bind-fixture-app')||(row.case==='api/cua/rewritedocumentation'&&row.cell==='contract'))return {...row,content:transformDocumentContent(row.content,{host:run.meta.host})};
  return projectDocumentationRow(row,{host:run.meta.host});
 })};
}
