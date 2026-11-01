// Comparison-only Table 3 projection. Evidence keeps original MCP bytes, and independent scenario assertions run
// before this projection. Only the document-producing cells below may transform approved vendor document bytes.
import {projectDocumentationRow,transformDocumentContent} from './docs-oracle.mjs';
import {browserIdentityProjection,applyBrowserIdentity} from './browser-identity.mjs';
import binder from '../../test/repl-parity/scenarios/binder.mjs';
import {BINDER_FACADES} from '../../test/repl-parity/fixtures/binder-bootstrap.mjs';
const binderIds=new Set(binder.map(s=>s.id));
// The binder lane's first cell carries one document per facade its banner builds, in order. Its Sky double answers
// target 'mac' (fixtures/binder-service.mjs), so a facade with the computer surface is a macOS computer surface and
// its document shows the paragraph; the run's recorded surfaces are the host's (browser), not the facades'.
const binderAgentCursor=BINDER_FACADES.map(({options})=>options.computer!==false);
// A row's lane shows cua's agent cursor paragraph (Table 3 addition, 2026-10-30) when it is a macOS computer lane: on
// macOS cua's host serves the computer surface only with cua's own engine.
export const agentCursorLane=(run,row)=>run.meta.platform==='darwin'&&(run.meta.caseConfigurations?.[row.case]?.surfaces??run.meta.surfaces??[]).includes('computer');
export function documentComparisonRun(run){
 return {...run,rows:run.rows.map(row=>{
  const options={host:run.meta.host,agentCursor:agentCursorLane(run,row)};
  if(row.case?.startsWith('secrets/native-live/')&&row.cell==='setup')return {...row,content:transformDocumentContent(row.content,options)};
  if(binderIds.has(row.case)&&row.cell==='bind-fixture-app')return {...row,content:transformDocumentContent(row.content,{...options,agentCursor:binderAgentCursor})};
  if(row.case==='api/cua/rewritedocumentation'&&row.cell==='contract')return {...row,content:transformDocumentContent(row.content,options)};
  return applyBrowserIdentity(projectDocumentationRow(row,options),browserIdentityProjection(row));
 })};
}
