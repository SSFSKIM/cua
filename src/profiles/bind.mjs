// The bind rule: which live extension backend belongs to a registered Chrome profile. Pure; the live listing comes
// from inventory.mjs and the display names from Chrome's Local State (chrome.mjs).
//
// Candidates: only Google Chrome's extension backends (family "chrome"). The registry names Chrome profile directories
// and the display names come from Chrome's Local State, so another browser's backend (Edge's, labelled from Edge's own
// profiles) can never be this profile, even when its label happens to match; a backend without a family is not
// Chrome's. Everything below applies to the candidates only.
//
// Never automatic (issue #21): nothing is bound without the user's pick. Without one, the rule only marks the likely
// match for the user to confirm: the vendor's own profile enrichment labels a backend with the display name of the
// profile whose extension instance it is (browser-service.mjs `aL`, metadata.profileName), and a backend is the likely
// match only when the registered directory's display name is unique among all profiles in Local State and exactly one
// live backend carries it. The vendor's enrichment fails silently, so a missing label is reported as a reason for no
// likely match, never as a diagnosed cause. Unlabelled backends are never marked.
//
// Explicit: an instance id the user picked (interactively, or relayed with --extension-instance-id) is accepted only
// when that backend is live now, and refused when the runtime itself labels it as another profile. A label can only
// conflict with a known name: when the registered profile's own display name is unknown (Local State unreadable or
// silent about it), the user's live choice stands.
export const isChromeBackend = backend => backend?.family === 'chrome';

// -> {outcome:'bound', how:'explicit', instanceId} | {outcome:'refused', reason}   (with explicitId)
//  | {outcome:'pick_required', likelyMatch} | {outcome:'pick_required', reason} | {outcome:'undetermined', reason:'no_live_backends'}
export function decideBinding({directory, displayNames, backends: live, explicitId}) {
  const backends = live.filter(isChromeBackend);
  const name = displayNames.get(directory);
  if (explicitId !== undefined) {
    const picked = backends.find(b => b.instanceId === explicitId);
    if (!picked) return {outcome: 'refused', reason: 'not_live'};
    if (name !== undefined && typeof picked.profileName === 'string' && picked.profileName !== name) return {outcome: 'refused', reason: 'labelled_other_profile'};
    return {outcome: 'bound', how: 'explicit', instanceId: explicitId};
  }
  if (!backends.length) return {outcome: 'undetermined', reason: 'no_live_backends'};
  const unmarked = reason => ({outcome: 'pick_required', reason});
  if (!backends.some(b => typeof b.profileName === 'string')) return unmarked('unlabelled');
  if (name === undefined) return unmarked('no_display_name');
  if ([...displayNames.values()].filter(n => n === name).length !== 1) return unmarked('display_name_not_unique');
  const matching = backends.filter(b => b.profileName === name);
  if (matching.length === 0) return unmarked('no_matching_backend');
  if (matching.length > 1) return unmarked('several_matching_backends');
  return {outcome: 'pick_required', likelyMatch: matching[0].instanceId};
}

// Why no backend is marked as the likely match (no_live_backends: why there is nothing to pick from at all).
export const NO_LIKELY_MATCH = {
  no_live_backends: 'no OpenAI extension backend of Google Chrome is live (is Chrome open with the extension enabled in this profile?)',
  unlabelled: 'the runtime labelled no live backend with a profile name',
  no_display_name: 'Chrome\'s Local State has no display name for this profile directory',
  local_state_unreadable: 'this process may not read Chrome\'s Local State (macOS Privacy & Security → Full Disk Access for your terminal), so this profile\'s display name is unknown',
  display_name_not_unique: 'another Chrome profile has the same display name, so the runtime\'s label cannot tell them apart',
  no_matching_backend: 'no live backend is labelled with this profile\'s name (is this profile\'s Chrome window open?)',
  several_matching_backends: 'several live backends carry this profile\'s name',
};

export const REFUSED = {
  not_live: 'that extension instance is not among the live backends now (only Google Chrome\'s count)',
  labelled_other_profile: 'the runtime labels that extension instance as a different Chrome profile',
};
