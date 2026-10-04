// `cua profiles bind`: find the live extension backend of a registered Chrome profile and record its instance id; and
// readiness with the live check, for `cua profiles list` and profiles_list. The live listing (inventory.mjs) and the
// interactive picker are injected so the decision path is testable; the CLI and the server wire the real ones. Display
// names never leave this module: the listing bind returns names each backend's label only as this-profile /
// other-profile / unlabelled, or comparison-unknown when the registered profile's own display name is unknown (Local
// State unreadable or silent about it), with its tab count. Only Google Chrome's backends are listed, can be bound
// (bind.mjs) and count as live for readiness; another browser's are reported as a count (`nonChromeExcluded`), nothing
// more.
import {fail} from '../runtime/errors.mjs';
import {readRegistry, bindProfile, profileStatuses, withLiveness, REASONS} from './registry.mjs';
import {decideBinding, isChromeBackend, REFUSED} from './bind.mjs';
import {teardownUnconfirmed} from './inventory.mjs';

function labelOf(backend, name) {
  if (typeof backend.profileName !== 'string') return 'unlabelled';
  if (name === undefined) return 'comparison-unknown';
  return backend.profileName === name ? 'this-profile' : 'other-profile';
}

// Every registered profile's readiness at this request: profileStatuses, then each bound profile's instance id checked
// against the live Google Chrome backends (withLiveness). The listing runs only when some profile is otherwise ready; a
// listing that fails leaves those profiles backends_unlistable and is returned as `listingError` for the caller to
// report.
// -> {profiles, listingError?: {code, message}}
export async function profileReadiness({home, chrome, listBackends}) {
  const statuses = profileStatuses({home, chrome});
  if (!statuses.some(p => p.ready)) return {profiles: statuses};
  try {
    const {backends, teardown} = await listBackends();
    if (teardown && !teardown.confirmed) throw teardownUnconfirmed(teardown);
    return {profiles: withLiveness(statuses, backends.filter(isChromeBackend).map(b => b.instanceId))};
  } catch (error) {
    return {profiles: withLiveness(statuses, []), listingError: {code: error?.code ?? 'error', message: String(error?.message ?? error)}};
  }
}

// -> {ok:true, key, extensionInstanceId, how, backends, elicitationsDeclined, nonChromeExcluded?, staleBinding?}
//  | {ok:false, outcome:'undetermined', reason, key, backends, elicitationsDeclined, nonChromeExcluded?, staleBinding?}
// `staleBinding` is the recorded instance id when Chrome backends are live but it is not among them. It changes nothing
// in the rule: the picker is told, and the user still picks (a lone new unlabelled backend is never bound for them).
// Throws classified errors for an unknown key, a profile that cannot be ready, a refused explicit pick, and a
// registration that changed while the backends were listed (`profile_changed`; nothing is bound, run bind again).
export async function bindCommand({home, key, chrome, listBackends, explicitId, pick}) {
  const entry = readRegistry(home).profiles[key];
  if (!entry) fail('unknown_profile', `no registered profile "${key}"`, {hint: 'cua profiles list shows the registered keys'});
  const directory = entry.chromeProfileDirectory;
  if (!chrome.profileDirectoryExists(directory)) fail('profile_not_ready', `profile "${key}": ${REASONS.profile_directory_missing}`);
  if (!chrome.extensionInstalled(directory)) fail('profile_not_ready', `profile "${key}": ${REASONS.extension_not_installed}`);

  const {backends: live, elicitationsDeclined, teardown} = await listBackends();
  // A listing whose runtime was not shown stopped binds nothing (the real listing already throws this; a listing
  // that reports it instead is held to the same rule).
  if (teardown && !teardown.confirmed) throw teardownUnconfirmed(teardown);
  let displayNames;
  try { displayNames = chrome.displayNames(); } catch { displayNames = new Map(); }
  const name = displayNames.get(directory);
  const backends = live.filter(isChromeBackend);
  const nonChromeExcluded = live.length - backends.length;
  const listing = backends.map(b => ({instanceId: b.instanceId, ...(Number.isInteger(b.tabCount) ? {tabCount: b.tabCount} : {}), label: labelOf(b, name)}));
  const recorded = entry.extensionInstanceId;
  const staleBinding = recorded !== undefined && backends.length && !backends.some(b => b.instanceId === recorded) ? recorded : undefined;
  const base = {key, backends: listing, elicitationsDeclined, ...(nonChromeExcluded ? {nonChromeExcluded} : {}), ...(staleBinding ? {staleBinding} : {})};

  const bind = decision => {
    if (decision.outcome === 'refused') fail('bind_refused', `profile "${key}" was not bound: ${REFUSED[decision.reason]}`, {hint: 'cua profiles bind without --extension-instance-id lists the live backends'});
    // Recorded only if the registration is still the one discovery started from (compare-and-set).
    const stored = bindProfile({home, key, extensionInstanceId: decision.instanceId, expected: entry});
    return {ok: true, ...base, key, extensionInstanceId: stored.extensionInstanceId, how: decision.how};
  };

  if (explicitId !== undefined) return bind(decideBinding({directory, displayNames, backends, explicitId}));
  const automatic = decideBinding({directory, displayNames, backends});
  if (automatic.outcome === 'bound') return bind(automatic);
  if (pick && listing.length) {
    const choice = await pick(listing, automatic.reason, nonChromeExcluded, {staleBinding});
    if (choice) return bind(decideBinding({directory, displayNames, backends, explicitId: choice}));
  }
  return {ok: false, outcome: 'undetermined', reason: automatic.reason, ...base};
}
