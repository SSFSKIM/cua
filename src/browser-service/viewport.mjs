// Ported from readable chatgpt-26.928.40906 BS:66434-66443 (the dispatch of a command without a handler of its own to the backend's executeUnhandledCommand); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: rh.executeUnhandledCommand (BS:64815-64817); the browser capability commands' payloads, browser_management_*
// (BS:35469-35500), browser_visibility_* (BS:35624-35650) and browser_viewport_* (BS:35697-35720).
//
// The browser-scoped capabilities live in the backend, not the service: the vendor serves browser_viewport_set/_reset,
// browser_visibility_get/_set and browser_management_call/_get_audit_trail by handing the command, as it came, to the
// backend's executeUnhandledCommand, and answers what the backend answers. cua's host serves the viewport (its getInfo
// announces `viewport`) and refuses the others in its own words ("cua does not support command ..."), as it would for
// the vendor; the model only reaches them when a backend announces the capability. The service names each type here
// (COMMAND_HANDLERS lists exactly what it serves) rather than falling through for any unknown type, which
// unsupported_command refuses.

const forwarded = type => async (params, session) => await session.api.executeUnhandledCommand({type, ...params});

export const VIEWPORT_HANDLERS = Object.fromEntries([
  'browser_viewport_set', 'browser_viewport_reset',
  'browser_visibility_get', 'browser_visibility_set',
  'browser_management_call', 'browser_management_get_audit_trail',
].map(type => [type, forwarded(type)]));
