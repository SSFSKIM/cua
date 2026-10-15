// Observe the real bounded profiles client's wire, never its launcher choice alone.
// CUABACKENDS is the existing src/profiles/inventory.mjs output; retain only its bounded schema.
export function profileObserver() {
 const requests=new Map();let serverInfo,listing;
 return {
  request(message){
   if(message.id===undefined||!message.method)return;
   if(message.method==='tools/call'&&message.params?.name==='js'&&/\blistTabs\b/.test(message.params.arguments?.code??''))throw new Error('Profiles readiness must not enumerate tabs');
   requests.set(message.id,message);
  },
  response(message){
   const request=requests.get(message.id);if(!request)return;
   requests.delete(message.id);
   if(request.method==='initialize')serverInfo=message.result?.serverInfo;
   if(request.method!=='tools/call'||request.params?.name!=='js')return;
   const result=message.result;
   if(result?.isError||!result)throw new Error('Profiles listing call failed');
   const line=result.content?.filter(c=>c.type==='text').flatMap(c=>c.text.split('\n')).find(t=>t.startsWith('CUABACKENDS '));
   if(!line)throw new Error('Profiles listing marker missing');
   const value=JSON.parse(line.slice('CUABACKENDS '.length));
   if(Object.keys(value).some(k=>k!=='backends')||!Array.isArray(value.backends))throw new Error('Unexpected profiles listing payload');
   for(const backend of value.backends)if(!backend||Object.keys(backend).some(k=>!['instanceId','family','profileName','tabCount'].includes(k))||backend.tabCount!=null)throw new Error('Profiles listing has unexpected fields or tab counts');
   listing={_meta:Object.hasOwn(result,'_meta')?result._meta:null,backends:value.backends,tabCounts:false};
  },
  proof(){if(!serverInfo||!listing)throw new Error('Missing initialized listing host proof');return {serverInfo,...listing};},
 };
}
