// The bind rule: which live extension backend belongs to a registered Chrome profile. Pure; the live listing comes
// from inventory.mjs, the display names from Chrome's Local State (chrome.mjs), and the directory mapping from cua's
// own read of each profile's extension store (directory-map.mjs).
//
// Candidates: only Google Chrome's extension backends (family "chrome"). The registry names Chrome profile directories
// and the display names come from Chrome's Local State, so another browser's backend (Edge's, labelled from Edge's own
// profiles) can never be this profile, even when its label happens to match; a backend without a family is not
// Chrome's. Everything below applies to the candidates only.
//
// Directory (when the mapping ran: `stores`, directory -> the instance ids its extension store records): a candidate
// whose instance id the registered directory's own store records is this profile, whatever the display names say, so
// it is bound automatically even when names collide, provided exactly one candidate is so placed and no other
// directory's store records the same id. When the registered directory's store was read and records no live
// candidate, this profile's backend is not live and nothing is bound automatically. A candidate the mapping places in
// another directory is never this profile.
//
// Name (the step before the mapping, and what remains when the registered directory's store could not be read): the
// vendor's own profile enrichment labels a backend with the display name of the profile whose extension instance it
// is (browser-service.mjs `aL`, metadata.profileName). A backend is bound automatically only when the registered
// directory's display name is unique among all profiles in Local State, exactly one live backend carries it, and the
// mapping does not place that backend in another directory. Every other case needs the user's pick (`pick_required`,
// with the reason): the vendor's enrichment fails silently, so a missing label is a reason, never a diagnosed cause. A
// singleton backend is never bound without the name match; unlabelled backends are never chosen.
//
// Explicit: an instance id the user picked (interactively, or relayed with --extension-instance-id) is accepted only
// when that backend is live now, and refused when the mapping places it in another directory or, without a placement,
// when the runtime itself labels it as another profile. A label can only conflict with a known name: when the
// registered profile's own display name is unknown (Local State unreadable or silent about it), the user's live choice
// stands.
import {ACCESS_NOTE} from './chrome.mjs';

export const isChromeBackend = backend => backend?.family === 'chrome';

// Instance id -> the directory whose store records it, or null when several directories' stores record it.
export function placements(stores) {
  const owner = new Map();
  for (const [directory, ids] of stores ?? []) for (const id of ids) owner.set(id, owner.has(id) && owner.get(id) !== directory ? null : directory);
  return owner;
}

// -> {outcome:'bound', how:'explicit', instanceId} | {outcome:'refused', reason}   (with explicitId)
//  | {outcome:'bound', how:'automatic', by:'directory'|'name', instanceId} | {outcome:'pick_required', reason}
//  | {outcome:'undetermined', reason:'no_live_backends'}
// `stores` is absent when the directory mapping did not run or was unavailable.
export function decideBinding({directory, displayNames, backends: live, explicitId, stores}) {
  const backends = live.filter(isChromeBackend);
  const name = displayNames.get(directory);
  const owner = placements(stores);
  const placedElsewhere = b => typeof owner.get(b.instanceId) === 'string' && owner.get(b.instanceId) !== directory;
  if (explicitId !== undefined) {
    const picked = backends.find(b => b.instanceId === explicitId);
    if (!picked) return {outcome: 'refused', reason: 'not_live'};
    if (placedElsewhere(picked)) return {outcome: 'refused', reason: 'other_profile_directory'};
    if (owner.get(picked.instanceId) !== directory && name !== undefined && typeof picked.profileName === 'string' && picked.profileName !== name) return {outcome: 'refused', reason: 'labelled_other_profile'};
    return {outcome: 'bound', how: 'explicit', instanceId: explicitId};
  }
  if (!backends.length) return {outcome: 'undetermined', reason: 'no_live_backends'};
  const pickRequired = reason => ({outcome: 'pick_required', reason});
  if (stores) {
    const recorded = stores.get(directory) ?? [];
    const own = backends.filter(b => recorded.includes(b.instanceId));
    if (own.some(b => owner.get(b.instanceId) === null)) return pickRequired('instance_in_several_directories');
    if (own.length === 1) return {outcome: 'bound', how: 'automatic', by: 'directory', instanceId: own[0].instanceId};
    if (own.length > 1) return pickRequired('several_directory_backends');
    if (recorded.length) return pickRequired('directory_backend_not_live');
  }
  if (!backends.some(b => typeof b.profileName === 'string')) return pickRequired('unlabelled');
  if (name === undefined) return pickRequired('no_display_name');
  if ([...displayNames.values()].filter(n => n === name).length !== 1) return pickRequired('display_name_not_unique');
  const matching = backends.filter(b => b.profileName === name);
  if (matching.length === 0) return pickRequired('no_matching_backend');
  if (matching.length > 1) return pickRequired('several_matching_backends');
  if (placedElsewhere(matching[0])) return pickRequired('labelled_backend_other_directory');
  return {outcome: 'bound', how: 'automatic', by: 'name', instanceId: matching[0].instanceId};
}

// Why the user must pick (no_live_backends: why there is nothing to pick from at all).
export const PICK_REASONS = {
  no_live_backends: 'no OpenAI extension backend of Google Chrome is live (is Chrome open with the extension enabled in this profile?)',
  unlabelled: 'the runtime labelled no live backend with a profile name',
  no_display_name: 'Chrome\'s Local State has no display name for this profile directory',
  local_state_unreadable: `this process may not read Chrome's Local State (${ACCESS_NOTE}), so this profile's display name is unknown`,
  display_name_not_unique: 'another Chrome profile has the same display name, so the runtime\'s label cannot tell them apart',
  no_matching_backend: 'no live backend is labelled with this profile\'s name (is this profile\'s Chrome window open?)',
  several_matching_backends: 'several live backends carry this profile\'s name',
  directory_backend_not_live: 'this profile directory\'s extension store records an instance that is not among the live backends (is this profile\'s Chrome window open?)',
  several_directory_backends: 'this profile directory\'s extension stores record several live backends',
  instance_in_several_directories: 'the extension stores of several profile directories record the same instance id, so the directory cannot tell them apart',
  labelled_backend_other_directory: 'the backend labelled with this profile\'s name belongs to another profile directory by its extension store',
};

export const REFUSED = {
  not_live: 'that extension instance is not among the live backends now (only Google Chrome\'s count)',
  labelled_other_profile: 'the runtime labels that extension instance as a different Chrome profile',
  other_profile_directory: 'that extension instance belongs to another Chrome profile directory by its extension store',
};
