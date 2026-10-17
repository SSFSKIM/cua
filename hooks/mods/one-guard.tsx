import type { EngineInterface } from 'claude-code'

/**
 * One guard per session. cua carries devcloud's secrets guard (./guard, a
 * vendored copy); when devcloud's own plugin is loaded beside cua, its guard
 * decides every handle and each hook of cua's copy passes the event straight
 * on, since two guards in sequence would lose the encoding a handle names
 * (`[secret:KEY~b64]` collapsed by the first). devcloud says it is loaded
 * through its marker (Interfaces I9 of its design, ./guard/devcloud.d.ts),
 * read at hook time so the plugins' load order does not matter. cua never
 * writes it, nor any marker of its own: nothing reads one.
 */

/** Exactly the marker devcloud 0.1.0 sets: anything else leaves cua's guard acting. */
export function isDevcloudMarker(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const marker = value as Record<string, unknown>
  return Object.keys(marker).length === 2 && marker.owner === 'devcloud' && marker.version === 1
}

/** Whether devcloud's guard holds this session; a read that fails says no. */
export async function devcloudGuards($: EngineInterface): Promise<boolean> {
  try {
    const { value } = await $.state.get({ plugin: 'devcloud', key: 'secrets-guard' })
    return isDevcloudMarker(value)
  } catch {
    return false
  }
}
