// Browser service numbers backends in response order. Only this declared inventory/document schema maps those
// numbers: the stable identity is the backend family/type and extension profile instance, never arrival order.
// Unknown ids, duplicate identities and missing backend identity are invalid evidence, not volatile fields.
import assert from 'node:assert/strict';
export function browserIdentityProjection(row){
 if(row.case!=='cells/documentation/browser-docs-before-state'||!row.cell)return null;
 const inventories=row.content?.filter(c=>c.type==='text'&&c.text.startsWith('[{'))??[];
 assert.equal(inventories.length,1,'browser identity requires one inventory');
 const browsers=JSON.parse(inventories[0].text),byId=new Map(),identities=new Set();
 for(const b of browsers){
  assert.ok(typeof b.id==='string'&&b.id&&typeof b.family==='string'&&typeof b.type==='string'&&typeof b.metadata?.extensionInstanceId==='string'&&b.metadata.extensionInstanceId,'browser backend identity missing');
  const identity=JSON.stringify([b.family,b.type,b.metadata.extensionInstanceId,b.profileName??null]);
  assert.ok(!byId.has(b.id)&&!identities.has(identity),'duplicate browser identity');byId.set(b.id,identity);identities.add(identity);
 }
 const docs=row.content.filter(c=>c.type==='text'&&/(?:^|\n)# Selected Browser\n/.test(c.text));
 assert.equal(docs.length,1,'browser identity requires one selected document');
 const selected=/\n- ID: ([^\n]+)\n/.exec(docs[0].text)?.[1];assert.ok(byId.has(selected),'selected browser identity absent from inventory');
 return {inventory:JSON.stringify(browsers.map(b=>({...b,id:`<browser:${byId.get(b.id)}>`})).sort((a,b)=>a.id.localeCompare(b.id))),selected:`<browser:${byId.get(selected)}>`};
}
export function applyBrowserIdentity(row,projection){
 if(!projection)return row;
 return {...row,content:row.content.map(c=>{
  if(c.type!=='text')return c;
  if(c.text.startsWith('[{'))return {...c,text:projection.inventory};
  if(/(?:^|\n)# Selected Browser\n/.test(c.text))return {...c,text:c.text.replace(/(\n- ID: )[^\n]+\n/,(_,prefix)=>prefix+projection.selected+'\n')};
  return c;
 })};
}
