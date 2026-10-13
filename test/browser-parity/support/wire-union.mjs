// Static extraction only: never execute an edited vendor module. Anchors are pinned by the spec.
export function extractWireUnion(source) {
  const exports=new Map([...source.matchAll(/\bG\(\s*([\w$]+)\s*,\s*\{([^}]+)\}\s*\)/g)].map(([,name,body])=>[name,new Map([...body.matchAll(/([\w$]+)\s*:\s*\(\)\s*=>\s*([\w$]+)/g)].map(m=>m.slice(1)))]));
  const escape=s=>s.replace(/[$]/g,'\\$');
  const literal=symbol=> {
    const m=source.match(new RegExp(`(?:\\bvar\\s+|[,;])\\s*${escape(symbol)}\\s*=\\s*"([^"\\n]+)"`));
    if(!m)throw new Error(`Unresolved schema literal ${symbol}`);
    return m[1];
  };
  const resolve=expression=> {
    expression=expression.replace(/\s/g,'');
    if(expression.startsWith('"'))return JSON.parse(expression);
    const parts=expression.split('.');
    if(parts.length===1)return literal(expression);
    const schema=exports.get(parts[0])?.get(parts[1]);
    const type=exports.get(schema)?.get('commandType');
    if(!type)throw new Error(`Unresolved command schema ${expression}`);
    return literal(type);
  };
  const table=exports.get('Rf');if(!table?.size)throw new Error('Missing Rf handler table');
  const types=[];
  for(const symbol of table.values()) {
    const handler=source.match(new RegExp(`\\b${escape(symbol)}\\s*=\\s*L\\(([^,]+),`));
    const assigned=source.match(new RegExp(`\\b${escape(symbol)}\\.type\\s*=\\s*("[^"]+"|[\\w$.]+)`));
    if(!handler&&!assigned)throw new Error(`Unresolved Rf handler ${symbol}`);
    types.push(resolve((handler??assigned)[1]));
  }
  for(const name of ['zN','RTe','zTe','iCe']) {
    const body=source.match(new RegExp(`\\b${name}\\s*=\\s*\\{([^}]+)\\}`))?.[1];
    if(!body)throw new Error(`Missing ${name} dispatch table`);
    const keys=[...body.matchAll(/\[([^\]]+)\]\s*:/g)];
    if(!keys.length)throw new Error(`Empty ${name} dispatch table`);
    for(const [,key] of keys)types.push(resolve(key));
  }
  return [...new Set(types)].sort();
}
