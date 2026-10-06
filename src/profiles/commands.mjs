// `cua profiles bind`: find the live extension backend of a registered Chrome profile and record its instance id; and
// readiness with the live check, for `cua profiles list` and profiles_list. The live listing (inventory.mjs), the
// directory mapping (directory-map.mjs) and the interactive picker are injected so the decision path is testable; the
// CLI and the server wire the real ones. The listing bind returns carries, per candidate, the vendor's own profile
// label (`profileName`, null when unlabelled; shown to the user so the pick is easy, never stored), its comparison with
// the registered profile's display name (this-profile / other-profile / unlabelled, or comparison-unknown when that name
// is unknown: Local State unreadable or silent about it), its tab count, `likelyMatch` on the backend bind.mjs's
// automatic rule bound, and, when the mapping ran, `chromeProfile`: the profile directory cua's own read of the
// extension stores places it in, that directory's display name and whether it is the registered one (null when the
// mapping placed it nowhere). The registered profile's own display name is reported only where a candidate is placed
// in or labelled with it. Only Google Chrome's backends are listed, can be bound (bind.mjs) and count as live for
// readiness; another browser's are reported as a count (`nonChromeExcluded`), nothing more, not even its label.
import {fail} from '../runtime/errors.mjs';
import {readRegistry, bindProfile, profileStatuses, withLiveness, awaitsLiveEvidence, REASONS} from './registry.mjs';
import {decideBinding, isChromeBackend, placements, REFUSED} from './bind.mjs';
import {teardownUnconfirmed} from './inventory.mjs';

function labelOf(backend, name) {
  if (typeof backend.profileName !== 'string') return 'unlabelled';
  if (name === undefined) return 'comparison-unknown';
  return backend.profileName === name ? 'this-profile' : 'other-profile';
}

// Every registered profile's readiness at this request: profileStatuses, then each bound profile's instance id checked
// against the live Google Chrome backends (withLiveness). The listing runs only when some profile is otherwise ready,
// or bound with Chrome data this process may not read (the listing is then the only evidence); a listing that fails
// leaves those profiles backends_unlistable (or chrome_data_unreadable) and is returned as `listingError` for the
// caller to report. A listing that works and finds no Chrome backend is evidence (host_not_live), not a failure.
// -> {profiles, listingError?: {code, message}}
export async function profileReadiness({home, chrome, listBackends}) {
  const statuses = profileStatuses({home, chrome});
  if (!statuses.some(p => p.ready || awaitsLiveEvidence(p))) return {profiles: statuses};
  try {
    const {backends, teardown} = await listBackends();
    if (teardown && !teardown.confirmed) throw teardownUnconfirmed(teardown);
    return {profiles: withLiveness(statuses, backends.filter(isChromeBackend).map(b => b.instanceId))};
  } catch (error) {
    return {profiles: withLiveness(statuses, null), listingError: {code: error?.code ?? 'error', message: String(error?.message ?? error)}};
  }
}

// -> {ok:true, key, extensionInstanceId, how:'automatic'|'explicit', by?:'directory'|'name', backends, elicitationsDeclined, nonChromeExcluded?, staleBinding?, directoryMap?}
//  | {ok:false, outcome:'pick_required', reason, key, backends, elicitationsDeclined, nonChromeExcluded?, staleBinding?}
//  | {ok:false, outcome:'undetermined', reason:'no_live_backends', key, backends:[], ...}
// Outside bind.mjs's automatic rule, nothing is bound without the user's pick (the picker's, or
// --extension-instance-id). `staleBinding` is the recorded instance id when Chrome backends are live but it is not among
// them. It changes nothing in the rule: the picker is told, and a lone new unlabelled backend is never bound for them
// unless this profile directory's store records it.
// `chromeDataUnreadable` / `localStateUnreadable` carry the error code when this process may not read the profile's
// Chrome data or Local State: the presence check is skipped (the live listing decides) and labels cannot be compared.
// With `dryRun` the same decision is made and reported (`dryRun: true` on the would-be binding) and nothing is stored.
// `directoryMap` is the mapping's outcome when it was asked for ({status:'complete'|'partial'|'unavailable', reason?,
// readError?, unreadableStores?}); an unavailable mapping leaves the candidates unplaced and the rule as without it,
// never a failure.
// Throws classified errors for an unknown key, a profile that cannot be ready, a refused explicit pick, and a
// registration that changed while the backends were listed (`profile_changed`; nothing is bound, run bind again).
export async function bindCommand({home, key, chrome, listBackends, mapDirectories, explicitId, pick, dryRun = false}) {
  const entry = readRegistry(home).profiles[key];
  if (!entry) fail('unknown_profile', `no registered profile "${key}"`, {hint: 'cua profiles list shows the registered keys'});
  const directory = entry.chromeProfileDirectory;
  const found = chrome.profileDirectoryExists(directory);
  if (found === 'missing') fail('profile_not_ready', `profile "${key}": ${REASONS.profile_directory_missing}`);
  const extension = found === 'unreadable' ? 'unreadable' : chrome.extensionInstalled(directory);
  if (extension === 'absent') fail('profile_not_ready', `profile "${key}": ${REASONS.extension_not_installed}`);
  const chromeDataUnreadable = extension === 'unreadable' ? chrome.readError?.(directory) ?? 'unknown' : undefined;

  const {backends: live, elicitationsDeclined, teardown} = await listBackends();
  // A listing whose runtime was not shown stopped binds nothing (the real listing already throws this; a listing
  // that reports it instead is held to the same rule).
  if (teardown && !teardown.confirmed) throw teardownUnconfirmed(teardown);
  let displayNames;
  let localStateUnreadable;
  try { displayNames = chrome.displayNames(); } catch (error) { displayNames = new Map(); localStateUnreadable = error?.readError; }
  const name = displayNames.get(directory);
  const backends = live.filter(isChromeBackend);
  const nonChromeExcluded = live.length - backends.length;
  let mapping;
  if (mapDirectories) try { mapping = await mapDirectories(); } catch { mapping = {status: 'unavailable', reason: 'error'}; }
  const stores = mapping && mapping.status !== 'unavailable' ? mapping.stores : undefined;
  const owner = placements(stores);
  const placed = b => {
    const at = owner.get(b.instanceId);
    return typeof at === 'string' ? {directory: at, name: mapping.names.get(at) ?? null, thisProfile: at === directory} : null;
  };
  const listing = backends.map(b => ({instanceId: b.instanceId, ...(Number.isInteger(b.tabCount) ? {tabCount: b.tabCount} : {}),
    profileName: typeof b.profileName === 'string' ? b.profileName : null, label: labelOf(b, name), ...(mapping ? {chromeProfile: placed(b)} : {})}));
  const recorded = entry.extensionInstanceId;
  const staleBinding = recorded !== undefined && backends.length && !backends.some(b => b.instanceId === recorded) ? recorded : undefined;
  const base = {key, backends: listing, elicitationsDeclined, ...(nonChromeExcluded ? {nonChromeExcluded} : {}), ...(staleBinding ? {staleBinding} : {}),
    ...(chromeDataUnreadable ? {chromeDataUnreadable} : {}), ...(localStateUnreadable ? {localStateUnreadable} : {}),
    ...(mapping ? {directoryMap: {status: mapping.status, ...(mapping.reason ? {reason: mapping.reason} : {}), ...(mapping.readError ? {readError: mapping.readError} : {}), ...(mapping.unreadableStores ? {unreadableStores: mapping.unreadableStores} : {})}} : {})};

  const bind = decision => {
    if (decision.outcome === 'refused') fail('bind_refused', `profile "${key}" was not bound: ${REFUSED[decision.reason]}`, {hint: 'cua profiles bind without --extension-instance-id lists the live backends'});
    if (dryRun) return {ok: true, dryRun: true, ...base, key, extensionInstanceId: decision.instanceId, how: decision.how, ...(decision.by ? {by: decision.by} : {})};
    // Recorded only if the registration is still the one discovery started from (compare-and-set).
    const stored = bindProfile({home, key, extensionInstanceId: decision.instanceId, expected: entry});
    return {ok: true, ...base, key, extensionInstanceId: stored.extensionInstanceId, how: decision.how, ...(decision.by ? {by: decision.by} : {})};
  };

  if (explicitId !== undefined) return bind(decideBinding({directory, displayNames, backends, explicitId, stores}));
  const automatic = decideBinding({directory, displayNames, backends, stores});
  if (automatic.outcome === 'bound') {
    listing.find(entry => entry.instanceId === automatic.instanceId).likelyMatch = true;
    return bind(automatic);
  }
  // No display name because Local State was refused, not because Chrome has none.
  const reason = automatic.reason === 'no_display_name' && localStateUnreadable ? 'local_state_unreadable' : automatic.reason;
  if (pick && listing.length) {
    const choice = await pick(listing, reason, nonChromeExcluded, {staleBinding});
    if (choice) return bind(decideBinding({directory, displayNames, backends, explicitId: choice, stores}));
  }
  return {ok: false, outcome: automatic.outcome, reason, ...base};
}

// `cua profiles open <key>`: open a window in the registered Chrome profile so Chrome loads it, and with it the OpenAI
// extension and its host (a profile with no window is unloaded; Surprises, 2026-10-06), then report the key's readiness.
// CLI only, on the user's request: nothing calls it for them. `open -n` because `--args` reaches only a newly launched
// process: with Chrome already running, `-n` starts one that hands its command line to the running Chrome (which opens
// the window in that profile) and exits, where a plain `open -a` would only bring Chrome forward. On Linux the deb's
// `google-chrome --profile-directory=<dir>` does the same, started detached (`detached` in the invocation): when no Chrome
// runs it becomes the browser itself, and nothing waits for it to exit. The runner and the
// live listing are injected; each readiness check is one bounded runtime launch, so there are at most `pollAt.length`
// (at those many milliseconds after the open), and the wait stops early once the profile is ready or its state is one a
// window cannot change (not bound, extension missing, a listing that failed).
export const CHROME_APP = 'Google Chrome';
export const OPEN_POLL_MS = [5_000, 10_000, 20_000];
export const LINUX_CHROME_COMMAND = 'google-chrome';
export const openInvocation = (directory, {host = {platform: process.platform}} = {}) => host.platform === 'linux'
  ? {command: LINUX_CHROME_COMMAND, args: [`--profile-directory=${directory}`], detached: true}
  : {command: 'open', args: ['-n', '-a', CHROME_APP, '--args', `--profile-directory=${directory}`]};
const OPEN_HINT = {
  darwin: `is ${CHROME_APP} installed in /Applications?`,
  linux: `is Google Chrome's deb (google-chrome-stable, which provides ${LINUX_CHROME_COMMAND}) installed, and DISPLAY set? Flatpak and snap Chrome are not supported`,
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Only these can turn ready through a window: no host live, a host this binding is not among, or a bound profile whose
// Chrome data this process may not read (the live backend decides).
const awaitsWindow = p => p.reason === 'host_not_live' || p.reason === 'binding_stale' || awaitsLiveEvidence(p);

// -> {ok, key, directory, opened: true, command: [command, ...args], readiness: {ready, reason?, extensionInstanceId?, checks, listingError?}}
// Throws unknown_profile, profile_not_ready (the directory is gone) and chrome_open_failed (open exited non-zero);
// nothing is opened for a refused key.
export async function openCommand({home, key, chrome, run, listBackends, pollAt = OPEN_POLL_MS, wait = sleep, now = Date.now, onCheck, host = {platform: process.platform}}) {
  const entry = readRegistry(home).profiles[key];
  if (!entry) fail('unknown_profile', `no registered profile "${key}"`, {hint: 'cua profiles list shows the registered keys'});
  const directory = entry.chromeProfileDirectory;
  if (chrome.profileDirectoryExists(directory) === 'missing') fail('profile_not_ready', `profile "${key}": ${REASONS.profile_directory_missing}`, {hint: `cua profiles remove ${key}, then add the profile again under its current directory`});
  const {command, args, detached} = openInvocation(directory, {host});
  const result = detached ? await run(command, args, {detached}) : await run(command, args);
  if (result.code !== 0) fail('chrome_open_failed', `${command} exited ${result.code} opening Chrome profile ${JSON.stringify(directory)}${result.stderr?.trim() ? `: ${result.stderr.trim()}` : ''}`, {hint: OPEN_HINT[host.platform] ?? OPEN_HINT.darwin});
  let status;
  let listingError;
  let checks = 0;
  // Each check at its offset from the open: a listing takes seconds, so the wait before the next is what is left.
  const opened = now();
  for (const at of pollAt) {
    const left = at - (now() - opened);
    if (left > 0) await wait(left);
    checks += 1;
    onCheck?.({check: checks, of: pollAt.length, afterMs: now() - opened});
    const readiness = await profileReadiness({home, chrome, listBackends});
    status = readiness.profiles.find(p => p.key === key);
    listingError = readiness.listingError;
    if (!status || status.ready || listingError || !awaitsWindow(status)) break;
  }
  // The readiness of the profile that was opened, never of a registration that replaced it meanwhile.
  if (!status || status.chromeProfileDirectory !== directory) fail('profile_changed', `profile "${key}" was removed or registered again while its readiness was being checked; Chrome profile ${JSON.stringify(directory)} was opened`, {hint: 'cua profiles list shows the registered keys'});
  const {key: _key, chromeProfileDirectory: _directory, ...rest} = status;
  return {ok: status.ready, key, directory, opened: true, command: [command, ...args],
    readiness: {...rest, checks, ...(listingError ? {listingError: listingError.code, listingMessage: listingError.message} : {})}};
}
