import {imageHash} from './image-hash.mjs';
// Only schema-known volatile fields are masked; text (especially snapshots) is exact.
const idKinds = {taskId:'task', turnId:'turn', tabId:'tab', tab_id:'tab', browserId:'browser', browser_id:'browser', extensionInstanceId:'browser', sessionId:'session', session_id:'session', targetId:'target', requestId:'request', loaderId:'loader', frameId:'frame'};
const timestamps = new Set(['timestamp','createdAt','updatedAt','startedAt','finishedAt']);
export function createNormalizer() {
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
      if (v?.type === 'image' && typeof v.data === 'string') return imageHash(Buffer.from(v.data,'base64'));
      if (v?.$imageData) return imageHash(v.$imageData);
      if (v?.type === 'Buffer' && Array.isArray(v.data)) return imageHash(v.data);
      if (typeof v === 'string' && /^data:image\/(png|jpeg);base64,/.test(v)) return imageHash(Buffer.from(v.split(',')[1],'base64'));
      if (timestamps.has(key)) return '<timestamp>';
      const kind = ids[path] ?? idKinds[key];
      if (kind && (typeof v === 'string' || typeof v === 'number')) return id(kind,v);
      if (Array.isArray(v)) return v.map((x,i) => visit(x,'',`${path}${path ? '.' : ''}${i}`));
      if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x]) => [k,visit(x,k,`${path}${path ? '.' : ''}${k}`)]));
      return v;
    };
    return visit(value);
  };
}
