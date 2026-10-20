// Probe-only trusted service for scripts/probe-engine-lane.mjs, registered beside cua's sky wrapper in the same trusted
// worker (the vendor host's or cua's own): reports what that worker's nodeRepl offers a service (cua's engine service
// reads the same globalThis.nodeRepl), and how its LaunchServices relay answers two requests that launch nothing: an
// empty target, which the worker refuses before relaying, and `{applicationPath}` (the shape cua's engine client sends
// to launch the engine, src/services/engine/client.mjs) naming an .app that does not exist (`absentApp`, from the probe),
// which the host's supervisor receives and refuses. Values are compared by the probe, never printed by it.
const answer = async call => { try { await call(); return {accepted: true}; } catch (error) { return {accepted: false, message: String(error?.message ?? error)}; } };

export async function handleRpc({absentApp} = {}) {
  const repl = globalThis.nodeRepl;
  const env = name => repl.env?.[name] ?? null;
  return {
    env: {CUA_ENGINE_APP: env('CUA_ENGINE_APP'), CUA_ENGINE_SCREENSHOTS: env('CUA_ENGINE_SCREENSHOTS'), CUA_SKY_SERVICE: env('CUA_SKY_SERVICE'), SKY_CUA_SERVICE_PATH: env('SKY_CUA_SERVICE_PATH')},
    types: Object.fromEntries(['withSuspendedTimeout', 'createElicitation', 'setResponseMeta'].map(name => [name, typeof repl[name]])),
    nativePipe: typeof repl.nativePipe?.createConnection,
    launchServices: typeof repl.launchServices?.openApplication,
    openEmpty: await answer(() => repl.launchServices.openApplication({})),
    openAbsent: typeof absentApp === 'string' ? await answer(() => repl.launchServices.openApplication({applicationPath: absentApp})) : null,
  };
}
