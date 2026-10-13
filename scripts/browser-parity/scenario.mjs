// Descriptor helpers for corpus authors; the runner owns the MCP connection and task lifecycle.
export const start = cell => ({...cell,start:true});
export const join = (label,handle,options={}) => ({label,join:typeof handle==='string'?handle:handle.label,...options});
export const endTask = (label='end-task',options={}) => ({label,op:'endTask',...options});
export const drop = (label='drop',options={}) => ({label,op:'drop',...options});
