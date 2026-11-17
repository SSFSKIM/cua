// Shared by the fixture page (bundled for the browser, no node imports), the judge and the runner.
export const CAP_LENGTH=10000,CAP_SUFFIX='::cap-suffix';
const modes={guard:'uppercase','cap-suffix':'suffix'};
export const modeFor=cell=>modes[cell]??'plain';
export const transform=(mode,received)=>mode==='uppercase'?received.toUpperCase():mode==='suffix'?received+CAP_SUFFIX:received;
export function capValue(prefix){if(prefix.length>=CAP_LENGTH)throw Error('prefix too long');return prefix+'x'.repeat(CAP_LENGTH-prefix.length);}
