// The native matrix's route A/B switch (scripts/native-matrix/route-ab.mjs, Decision Log 2026-10-22 "hold 3's route
// A/B"): cua's engine service forwards a click's `spikeRoute` only when the trusted worker's environment carries
// CUA_ENGINE_SPIKE_ROUTE=1 (src/services/engine/service.mjs). The product launch never puts it there: buildLaunch drops
// it with every other ambient value (src/runtime/launch.mjs). Only this harness serve (./serve.mjs) adds it, through the
// serve's launch hook, when its own environment asks (./remote.mjs nativeEnvironment, the route-ab lane only) and the
// launch drives cua's engine. -> the launch record, unchanged or with the variable added to its environment.
export function withSpikeRoute(launch, env) {
  if (env.CUA_ENGINE_SPIKE_ROUTE !== '1' || typeof launch.env?.CUA_ENGINE_APP !== 'string') return launch;
  return {...launch, env: {...launch.env, CUA_ENGINE_SPIKE_ROUTE: '1'}};
}
