// Vendored from SSFSKIM/doperpowers devcloud/types/devcloud.d.ts at ce6edfda3b641bfb0c5e4e0d4a566df13ed26ecb
// (devcloud 0.1.0); the adaptations and the resync are in hooks/mods/guard/VENDORED.md.

/**
 * devcloud's contract: what other plugins may read of it.
 *
 * `secrets-guard` (Interfaces I9 of the devcloud design): set in `$.state`
 * when a session starts with devcloud's secrets guard loaded. A plugin that
 * scrubs secrets of its own (`cua`) reads it at hook time and stands down
 * while it is set, so one guard decides every handle:
 *
 *   const { value } = await $.state.get({ plugin: 'devcloud', key: 'secrets-guard' })
 *   if (value?.owner === 'devcloud') return next(e)
 */
export type DevcloudSecretsGuard = { owner: 'devcloud'; version: 1 }

declare module 'claude-code' {
  interface PluginState {
    devcloud: { 'secrets-guard': DevcloudSecretsGuard }
  }
}
