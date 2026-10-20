// Probe-only trusted service for scripts/probe-engine-lane.mjs, registered beside cua's sky wrapper in the same trusted
// worker: reports what that worker's nodeRepl offers a service (cua's engine service reads the same globalThis.nodeRepl).
// It calls launchServices.openApplication only with an empty target, which the relay refuses before sending anything:
// nothing is launched. Values are compared by the probe, never printed by it.
export async function handleRpc() {
  const repl = globalThis.nodeRepl;
  let openApplication = null;
  try { await repl.launchServices.openApplication({}); openApplication = 'accepted an empty target'; } catch (error) { openApplication = error.message; }
  const env = name => repl.env?.[name] ?? null;
  return {
    env: {CUA_ENGINE_APP: env('CUA_ENGINE_APP'), CUA_ENGINE_SCREENSHOTS: env('CUA_ENGINE_SCREENSHOTS'), CUA_SKY_SERVICE: env('CUA_SKY_SERVICE'), SKY_CUA_SERVICE_PATH: env('SKY_CUA_SERVICE_PATH')},
    types: Object.fromEntries(['withSuspendedTimeout', 'createElicitation', 'setResponseMeta'].map(name => [name, typeof repl[name]])),
    nativePipe: typeof repl.nativePipe?.createConnection,
    launchServices: typeof repl.launchServices?.openApplication,
    openApplication,
  };
}
