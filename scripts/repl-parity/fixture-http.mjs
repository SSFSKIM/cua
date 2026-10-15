// Control-plane HTTP crosses an SSH forward. Do not reuse an idle HTTP socket across long browser cells: the
// device fixture may close it meanwhile. This never retries a browser action or even a failed fixture observation.
export async function fixtureJson(url,options={}){
 let response;
 try{response=await fetch(url,{...options,headers:{'content-type':'application/json',...options.headers,connection:'close'}});}catch(error){throw new Error(`fixture observation failed (${error.cause?.code??error.code??'transport'})`);}
 if(!response.ok)throw new Error(`fixture observation failed (HTTP ${response.status})`);
 return response.json();
}
