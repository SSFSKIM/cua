import {imageHash,exactImage} from './image-hash.mjs';
// Only schema-known volatile fields are masked; text (especially snapshots) is exact.
const idKinds = {'cua/taskId':'task', 'cua/callId':'call', 'cua/sessionId':'session',taskId:'task', turnId:'turn', tabId:'tab', tab_id:'tab', browserId:'browser', browser_id:'browser', extensionInstanceId:'browser', sessionId:'session', session_id:'session', targetId:'target', requestId:'request', loaderId:'loader', frameId:'frame'};
const timestamps = new Set(['timestamp','createdAt','updatedAt','startedAt','finishedAt']);
export function createNormalizer({imageMode='live',schemaFields=true}={}) {
  const hash=imageMode==='exact'?exactImage:imageHash;
  const maps = new Map();
  const id = (kind, value) => {
    if (!maps.has(kind)) maps.set(kind,new Map());
    const map = maps.get(kind), key = String(value);
    if (!map.has(key)) map.set(key, `<${kind}:${map.size+1}>`);
    return map.get(key);
  };
  return async function normalize(value, {ids = {}, masks = []} = {}) {
    const visit = (v, key = '', path = '') => {
      if (masks.includes(path)) return '<masked>';
      if (v === null || v === undefined) return v ?? null;
      if (v?.type === 'image' && typeof v.data === 'string') return hash(Buffer.from(v.data,'base64'),{mimeType:v.mimeType});
      if (schemaFields && v?.$imageData) return hash(v.$imageData);
      if (schemaFields && v?.type === 'Buffer' && Array.isArray(v.data)) return hash(v.data);
      if (schemaFields && typeof v === 'string' && /^data:image\/(png|jpeg);base64,/.test(v)) return hash(Buffer.from(v.split(',')[1],'base64'));
      if (schemaFields && timestamps.has(key)) return '<timestamp>';
      const kind = ids[path] ?? (schemaFields ? idKinds[key] : undefined);
      if (kind && (typeof v === 'string' || typeof v === 'number')) return id(kind,v);
      if (Array.isArray(v)) return v.map((x,i) => visit(x,'',`${path}${path ? '.' : ''}${i}`));
      if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x]) => [k,visit(x,k,`${path}${path ? '.' : ''}${k}`)]));
      return v;
    };
    return visit(value);
  };
}
