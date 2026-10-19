import type { EngineInterface } from 'claude-code'

/**
 * One guard per session. cua carries devcloud's secrets guard (./guard, a
 * vendored copy); while devcloud's own guard is in the session's chain, it
 * decides every handle and each hook of cua's copy passes the event straight
 * on, since two guards in sequence would lose the encoding a handle names
 * (`[secret:KEY~b64]` collapsed by the first). devcloud says its guard is there
 * through its marker (Interfaces I9 of its design, ./guard/devcloud.d.ts): its
 * loaded module answers the read itself, at version 0, and stores nothing, so
 * the answer exists exactly while the module does, whichever plugin sits
 * outside the other. Read at hook time, on every event, so cua's guard acts
 * from the first event after devcloud is disabled and the plugins reloaded. A
 * marker at any other version is a value the host keeps, which a devcloud
 * before 0.5.0 stored and which outlives its module (doperpowers board #101):
 * cua's guard acts. cua never writes or answers the marker, nor one of its
 * own: nothing reads one.
 */

/** Exactly the marker devcloud answers: anything else leaves cua's guard acting. */
export function isDevcloudMarker(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const marker = value as Record<string, unknown>
  return Object.keys(marker).length === 2 && marker.owner === 'devcloud' && marker.version === 1
}

/** Whether devcloud's guard holds this session now: its loaded module's answer, at version 0; a read that fails says no. */
export async function devcloudGuards($: EngineInterface): Promise<boolean> {
  try {
    const { value, version } = await $.state.get({ plugin: 'devcloud', key: 'secrets-guard' })
    return version === 0 && isDevcloudMarker(value)
  } catch {
    return false
  }
}
