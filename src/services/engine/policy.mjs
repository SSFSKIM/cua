// Policy and approvals of cua's own macOS engine service (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Design "The service", Policy and approvals; Interfaces, Policy): the vendor's withComputerUsePolicy contract
// (S/targets/mac/computer-use-policy.js; R/A-contract.md §2.6; R/sky-behaviour.md §20) around every app-scoped method:
//
//   1. the response meta's tool surface is reset (no app);
//   2. the input must be an object whose properties are plain data and whose `app` is a non-empty string; it is frozen;
//   3. the app is resolved (the service's `resolve`, the engine's resolve_app); the engine refuses a forbidden app there,
//      and its sentence is raised as the vendor's policy raises its own, a plain Error;
//   4. the tool surface names the resolved bundle (and Chrome's flag);
//   5. a resolved bundle on the forbidden list is refused here too, with the same sentence;
//   6. the approval is asked on every call through nodeRepl.createElicitation, with the vendor's message and meta
//      (`tool_params.app` the resolved bundle id, which the host's per-connection memory keys on and answers repeats
//      from: src/repl-host/elicitation.mjs), and anything but accept fails `Computer Use was not approved to use <app>`;
//   7. the action runs on a frozen copy of the input whose `app` is the resolved path, the bound identity.
//
// The lists are data, below: the forbidden list (password managers, the keychain and iPhone Mirroring; system security
// processes) and the risk table (terminals and browsers high, with the subtitle). The engine refuses the same forbidden
// list on resolve_app, on every app-scoped request and on the process an input reaches, from its own copy:
// native/engine/Sources/Engine/Policy.generated.swift, generated from this module by scripts/generate-engine-policy.mjs
// (so an edit to the list changes the engine's build), which test/services-engine-policy.test.mjs regenerates and
// compares.

// Password managers, the keychain and iPhone Mirroring (R/E-helper-catalogue.md §6.1; membership read from the binary's
// string order, an inference, plus iPhone Mirroring, which the engine refused from M0 on).
export const FORBIDDEN = [
  'com.apple.keychainaccess', 'com.apple.Passwords', 'com.1password.1password', 'com.1password.safari', 'com.bitwarden.desktop',
  'com.dashlane.dashlanephonefinal', 'com.lastpass.LastPass', 'com.nordsec.nordpass', 'me.proton.pass.electron', 'me.proton.pass.catalyst',
  'com.apple.ScreenContinuity',
];
// System security processes (R/E-helper-catalogue.md §6.1), refused with the helper's own sentence.
export const SYSTEM_SECURITY = ['com.apple.UserNotificationCenter', 'com.apple.LocalAuthenticationRemoteService', 'com.apple.SecurityAgent'];
// High risk: terminals, then browsers (R/E-helper-catalogue.md §6.1; Chrome's id, which the binary's string uniquing
// lists elsewhere, included). Chrome for Testing is in no list.
export const HIGH_RISK = [
  'com.apple.Terminal', 'com.googlecode.iterm2', 'dev.warp.Warp-Stable', 'net.kovidgoyal.kitty', 'com.github.wez.wezterm', 'com.mitchellh.ghostty',
  'com.raphaelamorim.rio', 'dev.commandline.waveterm', 'org.alacritty', 'co.zeit.hyper', 'org.tabby',
  'com.apple.Safari', 'com.apple.SafariTechnologyPreview', 'com.openai.atlas', 'com.openai.atlas.alpha', 'com.openai.atlas.beta', 'ai.perplexity.comet',
  'com.brave.Browser', 'com.microsoft.edgemac', 'com.operasoftware.Opera', 'com.vivaldi.Vivaldi', 'company.thebrowser.Browser', 'company.thebrowser.browser',
  'company.thebrowser.dia', 'org.chromium.Chromium', 'org.mozilla.firefox', 'org.mozilla.nightly', 'com.duckduckgo.macos.browser', 'com.google.Chrome',
];
// The vendor's subtitle for a high-risk app, naming Computer Use as every other approval text does (the helper's names
// ChatGPT, its host).
export const RISK_SUBTITLE = 'Allowing Computer Use to use this app introduces new risks, including those related to prompt injection attacks, such as data theft or loss. Carefully monitor Computer Use while it uses this app.';

// Each list's refusal: the sentence before and after the bundle id.
const REFUSALS = [
  {list: 'systemSecurity', ids: SYSTEM_SECURITY, before: 'Computer use actions are not allowed for system security process: ', after: ''},
  {list: 'forbidden', ids: FORBIDDEN, before: 'Computer Use is not allowed to use the app \'', after: '\' for safety reasons.'},
];
const lowered = ids => new Set(ids.map(id => id.toLowerCase()));
const REFUSAL_SETS = REFUSALS.map(refusal => ({...refusal, set: lowered(refusal.ids)}));
const HIGH_RISK_SET = lowered(HIGH_RISK);

// The sentence refusing `bundleIdentifier`, or null when it is on no list (bundle ids compare without case).
export function refusal(bundleIdentifier) {
  if (typeof bundleIdentifier !== 'string') return null;
  const found = REFUSAL_SETS.find(({set}) => set.has(bundleIdentifier.toLowerCase()));
  return found ? `${found.before}${bundleIdentifier}${found.after}` : null;
}

export const riskOf = bundleIdentifier => (typeof bundleIdentifier === 'string' && HIGH_RISK_SET.has(bundleIdentifier.toLowerCase()) ? 'high' : 'low');

// The approval the vendor's policy asks for `target` ({appPath, bundleIdentifier, displayName}) before `toolName`. An
// app without a bundle id is named by its path, so the host's memory still has a key for it.
export function approvalRequest({toolName, target, callId}) {
  const risk = riskOf(target.bundleIdentifier);
  return {
    message: `Allow Computer Use to use "${target.displayName}"?`,
    meta: {
      codex_approval_kind: 'mcp_tool_call', connector_id: 'computer-use', connector_name: 'Computer Use', persist: ['session'], riskLevel: risk,
      ...(risk === 'high' ? {subtitle: RISK_SUBTITLE} : {}), ...(callId ? {tool_call_id: callId} : {}),
      tool_name: toolName, tool_params: {app: target.bundleIdentifier ?? target.appPath},
      tool_params_display: [{name: 'app', display_name: 'App', value: target.displayName}],
    },
  };
}

// The response meta naming the app a call works on (null: none yet), as the vendor's policy sets it.
export function toolSurface(bundleIdentifier) {
  return {
    'codex/toolSurface': {app: bundleIdentifier == null ? null : {appId: bundleIdentifier, kind: 'appId'}, kind: 'computerUse'},
    ...(bundleIdentifier === 'com.google.Chrome' ? {'codex/computerUseChrome': true} : {}),
  };
}

// The call id of the turn metadata (its call_id, else item_id), as the vendor's policy reads it for tool_call_id.
function toolCallId(nodeRepl) {
  let metadata = nodeRepl?.requestMeta?.['x-codex-turn-metadata'];
  if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch { return undefined; } }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  for (const key of ['call_id', 'item_id']) if (typeof metadata[key] === 'string' && metadata[key].trim()) return metadata[key].trim();
  return undefined;
}

// The vendor policy's input check: a frozen copy of `input`, every property plain data, `app` a non-empty string,
// replaced by `app` when given.
function checkedInput(input, app) {
  if (typeof input !== 'object' || input === null) throw new Error('Computer Use app approval requires an object input');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const given = descriptors.app;
  if (!given || !('value' in given)) throw new Error('Computer Use app approval requires app to be a plain data property');
  if (typeof given.value !== 'string' || given.value.trim() === '') throw new Error('Computer Use app approval requires a non-empty app');
  const copy = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!('value' in descriptor)) throw new Error(`Computer Use app approval requires ${key} to be a plain data property`);
    Object.defineProperty(copy, key, {configurable: false, enumerable: descriptor.enumerable, writable: false, value: key === 'app' ? (app ?? given.value) : descriptor.value});
  }
  return Object.freeze(copy);
}

function required(nodeRepl, name) {
  if (typeof nodeRepl?.[name] !== 'function') throw new Error(`Computer Use requires nodeRepl.${name}`);
  return nodeRepl[name].bind(nodeRepl);
}

// `nodeRepl` is the trusted worker's (setResponseMeta, requestMeta, createElicitation); `resolve(app)` resolves an app
// string to {appPath, bundleIdentifier, displayName, …} through the engine (the service keeps it per app string).
export function createPolicy({nodeRepl, resolve}) {
  const setMeta = meta => nodeRepl?.setResponseMeta?.(meta);

  async function targetOf(app) {
    try {
      return await resolve(app);
    } catch (error) {
      // The engine's refusal of a forbidden app is the policy's refusal: its bare sentence, as the vendor's policy
      // raises one, not a server error.
      if (error?.name === 'SkyComputerUseError' && error.errorName === 'appNotAllowed') throw new Error(error.message.replace(/^Computer Use server error -?\d+: /, ''));
      throw error;
    }
  }

  // Runs `fn(input with app = the resolved path, target)` once the app is resolved, allowed and approved.
  async function withPolicy(toolName, input, fn) {
    setMeta(toolSurface(null));
    const checked = checkedInput(input);
    const createElicitation = required(nodeRepl, 'createElicitation');
    const target = await targetOf(checked.app);
    setMeta(toolSurface(target.bundleIdentifier));
    const refused = refusal(target.bundleIdentifier);
    if (refused) throw new Error(refused);
    const answer = await createElicitation(approvalRequest({toolName, target, callId: toolCallId(nodeRepl)}));
    if (answer?.action !== 'accept') throw new Error(`Computer Use was not approved to use ${target.displayName}`);
    return fn(checkedInput(checked, target.appPath), target);
  }

  return {withPolicy};
}

// ---------------------------------------------------------------------------------------------------------------------
// The engine's copy.

export const SWIFT_POLICY_FILE = 'native/engine/Sources/Engine/Policy.generated.swift';

// A Swift string literal's body for `text` (plain text only: the lists and sentences carry no control characters).
function swiftLiteral(text) {
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`no control characters in the engine's policy: ${JSON.stringify(text)}`);
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// The Swift source of native/engine/Sources/Engine/Policy.generated.swift.
export function swiftPolicySource() {
  const set = ids => ids.map(id => `    "${swiftLiteral(id.toLowerCase())}",\n`).join('');
  const check = REFUSALS.map(({list, before, after}) => `    if ${list}.contains(id) {
      throw EngineError(.appNotAllowed, "${swiftLiteral(before)}\\(bundleIdentifier!)${swiftLiteral(after)}")
    }
`).join('');
  return `// Generated by scripts/generate-engine-policy.mjs from src/services/engine/policy.mjs, the one copy of the forbidden list
// (the spec's Interfaces, Policy). Do not edit: change the list there and regenerate; test/services-engine-policy.test.mjs
// fails while this file differs from what policy.mjs generates.
import Foundation

// The engine's copy of the forbidden list (the spec's Design, "Socket and peer check" and "The service", Policy): the
// engine refuses these on resolve_app, on every app-scoped request and on the process an input reaches, whoever the
// client is.
enum Policy {
  /// System security processes, refused with the helper's own sentence.
  static let systemSecurity: Set<String> = [
${set(SYSTEM_SECURITY)}  ]

  /// Password managers, the keychain and iPhone Mirroring.
  static let forbidden: Set<String> = [
${set(FORBIDDEN)}  ]

  /// Throws \`appNotAllowed\` when \`bundleIdentifier\` is on either list (bundle ids compare without case).
  static func check(_ bundleIdentifier: String?) throws {
    guard let id = bundleIdentifier?.lowercased() else { return }
${check}  }
}
`;
}
