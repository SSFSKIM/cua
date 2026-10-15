// Importing the very same file in a kernel does not install the worker's privileged nodeRepl.
export function handleRpc(){return {elicitation:typeof nodeRepl.createElicitation,hooks:typeof nodeRepl.addAfterSubmittedCodeHook,native:typeof nodeRepl.nativePipe};}
