// Ported from readable chatgpt-26.928.40906 BS:56229-56460 (class Pf, the injected script's installation: evaluateWithPlaywrightInjectedInTarget, callRuntimeEvaluateWithPlaywrightInjectedInTarget, ensurePlaywrightInjectedInTarget, callRuntimeEvaluateInExecutionTarget, playwrightFrameWorld and the state they keep); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: JY, $1 and Tf (BS:54566-54587, the install expression); YY, V1, Cf, r_ and Z1 (BS:54699-54705); Pf's
// constructor listeners (BS:54718-54765) and releaseRuntimeObjects (BS:55839-55857); Je, so, n_, X1, J1, ao, Ef and Af
// (BS:56770-56906); qi and Pn (BS:19881-19900, the credential field check).
//
// Playwright's InjectedScript (vendor/injected-script.js, extracted from the pinned playwright-core) in the frames the
// locator engine works in. One InjectedScripts per CDP controller. The script lives in each frame's isolated world
// `cua-browser-injected` (Page.createIsolatedWorld), never in the page's own world, so a page can neither see nor
// tamper with it; it is installed on first use in a frame and again once the frame's document changed: a navigation
// or a cleared context drops the frame's world (lazily, as the vendor does), and an evaluation that finds its world
// gone or the script missing makes the world again, reinstalls and runs once more. Every CDP call is given the
// command's Deadline (budgets.mjs), so nothing is dispatched once it is spent.
//
// Departures from Pf: the vendor installs in the page's main world unless asked for an isolated one; cua always uses
// the isolated world (the spec's "the locator engine keeps its own isolated world"), and keeps each target's main
// frame id (from the frame tree once, then from main-frame navigations) so the world can be made without asking for
// the frame tree each time. Dropped: the readonly evaluate contexts (the spec drops the read-only membrane), MCP-app
// documents (forDocument), cached CDP expressions and telemetry attributes.
import {readFileSync} from 'node:fs';
import {Deadline} from './budgets.mjs';
import {BrowserServiceError} from './errors.mjs';

export const WORLD_NAME = 'cua-browser-injected';
export const INJECTED_GLOBAL = '__cuaPlaywrightInjected';
export const HELPER_MISSING = 'Browser Use Playwright injected helper is missing';                                  // r_
export const SELECTOR_DEADLINE_EXCEEDED = 'Playwright selector deadline exceeded';                                   // Z1
// The options the vendor constructs the InjectedScript with (JY), in every frame it reaches.
export const INJECTED_OPTIONS = Object.freeze({
  isUnderTest: false, sdkLanguage: 'javascript', testIdAttributeName: 'data-testid', stableRafCount: 1,
  browserName: 'chromium', customEngines: [],
});

const WORLD_LIMIT = 50;                         // YY
const RELEASE_MS = 100;                         // V1
// The fields a read must not reveal the value of (Pn): hidden inputs and anything named like a credential.
export const CREDENTIAL_FIELDS = {
  attributes: ['type', 'autocomplete', 'id', 'name', 'placeholder', 'aria-label', 'title'],
  pattern: /user[-_ ]?name|e[-_ ]?mail|one[-_ ]?time[-_ ]?code|password|passcode|passwd|\botp\b|\b(?:2fa|mfa)\b|phone|mobile|\btel\b/i.source,
};

const VENDORED_SOURCE = readFileSync(new URL('./vendor/injected-script.js', import.meta.url), 'utf8');

// Runs in the page (qi): whether `element` is a form field whose value a read must not return.
export function isProtectedCredentialField(element, fields) {
  const tag = element.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return false;
  if (element.getAttribute('type')?.toLowerCase() === 'hidden') return true;
  let text = '';
  for (const name of fields.attributes) text += ` ${element.getAttribute(name) ?? ''}`;
  return new RegExp(fields.pattern, 'i').test(text);
}

// The expression that installs the script in a world (JY): once per document; the credential check is (re)attached.
export function installExpression(source = VENDORED_SOURCE) {
  return `(() => {
  if (!window.${INJECTED_GLOBAL}) {
${source}
    window.${INJECTED_GLOBAL} = new PlaywrightInjected.InjectedScript(window, ${JSON.stringify(INJECTED_OPTIONS)});
  }
  window.${INJECTED_GLOBAL}.isProtectedCredentialField = (element) =>
    (${isProtectedCredentialField.toString()})(element, ${JSON.stringify(CREDENTIAL_FIELDS)});
})()`;
}

const messageOf = error => String(error instanceof Error ? error.message : error);

// The locator engine's deadline check (Je): its sentence, where a CDP call's own check says it ran out before dispatch.
export function checkSelectorDeadline(deadline) {
  if (deadline?.expired()) throw new BrowserServiceError('timeout', SELECTOR_DEADLINE_EXCEEDED);
}

// The page exception of a Runtime result as the vendor words it (n_), or null.
export function pageError(result) {
  if (result?.exceptionDetails == null) return null;
  const value = result.exceptionDetails.exception?.value;
  const text = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
    ?? (value == null ? 'Playwright selector evaluation failed.' : String(value));
  return new Error(`Browser Use encountered an error interacting with this webpage: ${text}`);
}

// The value of a Runtime result, or its page exception thrown (so).
export function resultValue(result) {
  const error = pageError(result);
  if (error != null) throw error;
  return result.result?.value;
}

// The world lost the script (X1), or the world itself is gone (J1).
const isHelperMissing = error => messageOf(error).includes(HELPER_MISSING)
  || /Cannot read properties of (?:undefined|null) \(reading ['"]incrementalAriaSnapshot['"]\)/.test(messageOf(error));
const isContextLost = error => /Cannot find context|Execution context was destroyed|context.*destroyed|context.*not found/i.test(messageOf(error));
const isWorldLost = error => isHelperMissing(error) || isContextLost(error);

// The remote objects a Runtime result holds: its value's and its exception's.
export const remoteObjects = result => [result?.result?.objectId, result?.exceptionDetails?.exception?.objectId];

// The key of a target, or of a frame in it (ao); the keys a CDP source names (Ef); whether a key is under one (Af).
export function targetKey(target, frameId) {
  const frame = frameId == null ? '' : `:${frameId}`;
  if (target.sessionId != null) return `${target.tabId}:${target.sessionId}${frame}`;
  if (target.targetId != null) return `${target.tabId}:${target.targetId}${frame}`;
  return `${target.tabId}${frame}`;
}
const sourceKeys = source => {
  const keys = [...(source.sessionId == null ? [] : [`${source.tabId}:${source.sessionId}`]),
    ...(source.targetId == null ? [] : [`${source.tabId}:${source.targetId}`])];
  return keys.length === 0 ? [String(source.tabId)] : keys;
};
const under = (key, prefix) => key === prefix || key.startsWith(`${prefix}:`);

const callOptions = options => (options.deadline === undefined ? {} : {deadline: options.deadline});

export class InjectedScripts {
  // `cdp` the backend's CdpController; `source` the script to install (the vendored Playwright script; tests give a
  // stand-in that works over their fake documents).
  constructor(cdp, {source} = {}) {
    this.cdp = cdp;
    this.installParams = Object.freeze({expression: installExpression(source), awaitPromise: true, returnByValue: true});    // Tf
    cdp.addListener('tabDetached', tabId => { this.forget(key => under(key, String(tabId))); });
    cdp.addListener('event', event => { this.handleEvent(event); });
  }

  cdp;
  installParams;
  worlds = new Map();                 // targetKey(target, frameId) -> executionContextId
  installed = new Set();              // targetKey(target, frameId)
  mainFrames = new Map();             // targetKey(target) -> the target's main frame id
  epoch = 0;                          // counts invalidations, so a world made or filled across one is not kept

  // --- evaluation --------------------------------------------------------------------------------------------------

  // Runs `expression` in frame `frameId` of `target` (its main frame when null) with the script installed -> its value;
  // a page exception is thrown with its remote objects released.
  async evaluateValue(target, frameId, expression, options = {}) {
    return await this.valueOf(target, await this.evaluate(target, frameId, {expression, returnByValue: true, awaitPromise: true}, options));
  }

  // The value of a by-value Runtime result; on a page exception its remote objects (the only ones a by-value result
  // holds) are released before the exception is thrown.
  async valueOf(target, result) {
    const error = pageError(result);
    if (error == null) return result.result?.value;
    await this.release(target, remoteObjects(result));
    throw error;
  }

  // Runtime.evaluate of `params` in the frame's world, the script installed, guarded against its absence -> the
  // Runtime result with the world's executionContextId and the frame id it ran in. A world found gone or without the
  // script, while installing or evaluating, is made again and the whole tried once more (the selector expressions are
  // ours and side-effect free; no user script comes through here).
  async evaluate(target, frameId, params, options = {}) {
    checkSelectorDeadline(options.deadline);
    const frame = frameId ?? await this.mainFrameId(target, options);
    const evaluation = {...params, expression: `(() => {
          if (!window.${INJECTED_GLOBAL}) {
            throw new Error(${JSON.stringify(HELPER_MISSING)});
          }
          return (${params.expression});
        })()`};
    for (let attempt = 1; ; attempt++) {
      let result;
      try {
        await this.install(target, frame, options);
        delete evaluation.timeout;
        checkSelectorDeadline(options.deadline);
        if (options.deadline != null) evaluation.timeout = options.deadline.timeoutMs();
        result = {...(await this.evaluateInWorld(target, frame, evaluation, options)), frameId: frame};
      } catch (error) {
        if (!isWorldLost(error)) throw error;
        this.forgetWorld(target, frame);
        if (attempt > 1) throw error;
        checkSelectorDeadline(options.deadline);
        continue;
      }
      const error = pageError(result);
      if (error == null || !isWorldLost(error) || attempt > 1) return result;
      this.forgetWorld(target, frame);
      await this.release(target, remoteObjects(result));
      checkSelectorDeadline(options.deadline);
    }
  }

  // Runtime.evaluate of `params` in the frame's world, nothing installed (callRuntimeEvaluateInExecutionTarget).
  async evaluateInWorld(target, frameId, params, options = {}) {
    const executionContextId = await this.world(target, frameId, options);
    checkSelectorDeadline(options.deadline);
    return {...(await this.cdp.callTarget(target, 'Runtime.evaluate', {...params, contextId: executionContextId}, callOptions(options))), executionContextId};
  }

  // Installs the script in the frame's world unless it is there (ensurePlaywrightInjectedInTarget). A world found gone
  // meanwhile is forgotten, so the next use makes it again; an installation that raced a navigation is not recorded.
  async install(target, frameId, options = {}) {
    const key = targetKey(target, frameId);
    if (this.installed.has(key)) return;
    checkSelectorDeadline(options.deadline);
    const epoch = this.epoch;
    try {
      await this.valueOf(target, await this.evaluateInWorld(target, frameId, this.installParams, options));
    } catch (error) {
      if (isWorldLost(error)) this.forgetWorld(target, frameId);
      throw error;
    }
    if (this.epoch === epoch && this.worlds.has(key)) this.installed.add(key);
  }

  // The frame's isolated world, made when it has none (playwrightFrameWorld) -> its executionContextId. A world made
  // while a navigation or a cleared context invalidated worlds is used once but not kept: it may be the old document's.
  async world(target, frameId, options = {}) {
    const key = targetKey(target, frameId);
    const known = this.worlds.get(key);
    if (known != null) return known;
    checkSelectorDeadline(options.deadline);
    const epoch = this.epoch;
    const {executionContextId} = await this.cdp.callTarget(target, 'Page.createIsolatedWorld',
      {frameId, worldName: WORLD_NAME, grantUniveralAccess: false}, callOptions(options));
    if (this.epoch !== epoch) return executionContextId;
    this.worlds.set(key, executionContextId);
    if (this.worlds.size > WORLD_LIMIT) {
      const oldest = this.worlds.keys().next().value;
      this.worlds.delete(oldest);
      this.installed.delete(oldest);
    }
    return executionContextId;
  }

  // The target's main frame id: from its frame tree the first time, then from its main-frame navigations.
  async mainFrameId(target, options = {}) {
    const key = targetKey(target);
    const known = this.mainFrames.get(key);
    if (known != null) return known;
    const {frameTree} = await this.cdp.callTarget(target, 'Page.getFrameTree', undefined, callOptions(options));
    if (!frameTree?.frame?.id) throw new Error('Frame target is not available for this iframe selector path');       // Cf
    this.mainFrames.set(key, frameTree.frame.id);
    return frameTree.frame.id;
  }

  // Releases remote objects, each on a short budget of its own; failures are ignored (releaseRuntimeObjects).
  async release(target, objectIds) {
    for (const objectId of new Set(objectIds)) {
      if (objectId == null) continue;
      await this.cdp.callTarget(target, 'Runtime.releaseObject', {objectId}, {deadline: new Deadline(RELEASE_MS)}).catch(() => {});
    }
  }

  // --- what a page's changes invalidate ----------------------------------------------------------------------------

  handleEvent(event) {
    const {method, params, source} = event;
    if (method === 'Runtime.executionContextsCleared' || (method === 'Page.frameNavigated' && params.frame.parentId == null)) {
      const keys = sourceKeys(source);
      this.forget(key => keys.some(prefix => under(key, prefix)), {mainFrames: false});
      if (method === 'Page.frameNavigated') this.mainFrames.set(targetKey(source), params.frame.id);
    } else if (method === 'Page.frameNavigated') {
      this.forgetWorld(source, params.frame.id);
    } else if (method === 'Page.frameDetached') {
      this.forgetWorld(source, params.frameId);
    } else if (method === 'Target.attachedToTarget') {
      const keys = sourceKeys(source);
      this.forget(key => keys.some(prefix => under(key, prefix)), {mainFrames: false});
    } else if (method === 'Target.detachedFromTarget') {
      const keys = sourceKeys({tabId: source.tabId, sessionId: params.sessionId, targetId: params.targetId});
      this.forget(key => keys.some(prefix => under(key, prefix)));
    }
  }

  forgetWorld(target, frameId) {
    this.epoch += 1;
    const key = targetKey(target, frameId);
    this.worlds.delete(key);
    this.installed.delete(key);
  }

  forget(matches, {mainFrames = true} = {}) {
    this.epoch += 1;
    for (const key of [...this.worlds.keys()]) if (matches(key)) this.worlds.delete(key);
    for (const key of [...this.installed]) if (matches(key)) this.installed.delete(key);
    if (mainFrames) for (const key of [...this.mainFrames.keys()]) if (matches(key)) this.mainFrames.delete(key);
  }
}
