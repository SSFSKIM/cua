// Ported from readable chatgpt-26.928.40906 BS:43827-43837 (Gl, Vl and Kl: count, is_enabled and is_visible); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: jO, WO, HO, KO and XO (BS:49734-49970: get_attribute, inner_text, all_text_contents, text_content and read_all);
// Pf.readElementState (BS:55445-55468).
//
// The locator reads. Each runs one side-effect-free function in the injected script's world (selectors.mjs): the
// single-element reads resolve the selector strictly with the vendor's visible fallback and poll until the command's
// budget (`timeout_ms`, clamped: 3 s by default, at most 120 s); count, the element states and the list reads query
// every match at once (an empty match is an answer, not a wait). Field values a credential-named or hidden input holds
// are not returned (the injected script's isProtectedCredentialField, as the vendor's reads do). Result shapes are the
// vendor's: {count}, {value} or {values}.
import {Deadline, clamp} from './budgets.mjs';
import {tabIdOf} from './tabs.mjs';

const budget = params => new Deadline(clamp(params.timeout_ms));

// The first match's state (`visible`, `enabled`, ...), false when nothing matches or it is detached (readElementState).
async function elementState(params, session, stateName) {
  return await session.selectors.evaluateOnSelectorAll(params.selector, tabIdOf(params.tab_id), (elements, injected, arg) => {
    const element = elements[0] ?? null;
    if (!element) return false;
    const state = injected.elementState(element, arg.stateName);
    return state.received === 'error:notconnected' ? false : !!state.matches;
  }, {arg: {stateName}, deadline: budget(params)});
}

async function readOne(params, session, fn, arg) {
  return await session.selectors.evaluateOnSelector(params.selector, tabIdOf(params.tab_id), fn, {arg, deadline: budget(params)});
}

export const READ_HANDLERS = {
  // The vendor's count takes no budget of its own (Gl): the default 3 s.
  async playwright_locator_count(params, session) {
    return {count: await session.selectors.evaluateOnSelectorAll(params.selector, tabIdOf(params.tab_id), elements => elements.length, {deadline: budget({})})};
  },

  async playwright_locator_is_enabled(params, session) {
    return {value: await elementState(params, session, 'enabled')};
  },

  async playwright_locator_is_visible(params, session) {
    return {value: await elementState(params, session, 'visible')};
  },

  async playwright_locator_text_content(params, session) {
    return {value: (await readOne(params, session, element => element.textContent)).result};
  },

  async playwright_locator_inner_text(params, session) {
    return {value: (await readOne(params, session, element => ('innerText' in element ? String(element.innerText) : ''))).result};
  },

  async playwright_locator_get_attribute(params, session) {
    if (typeof params.name !== 'string' || !params.name) throw new Error('playwright_locator_get_attribute requires name');
    return {value: (await readOne(params, session, (element, injected, {name}) =>
      (name.toLowerCase() === 'value' && injected.isProtectedCredentialField(element) ? null : element.getAttribute(name)), {name: params.name})).result};
  },

  async playwright_locator_all_text_contents(params, session) {
    return {values: await session.selectors.evaluateOnSelectorAll(params.selector, tabIdOf(params.tab_id),
      elements => elements.map(element => (typeof element.textContent === 'string' ? element.textContent : '')), {deadline: budget(params)})};
  },

  // Every match's attributes, inner text and text content; with `relative_selector`, those of each match's first
  // descendant matching it (null where none does).
  async playwright_locator_read_all(params, session) {
    return {values: await session.selectors.evaluateOnSelectorAll(params.selector, tabIdOf(params.tab_id), (elements, injected, arg) => {
      const read = element => ({
        attributes: Object.fromEntries(Array.from(element.attributes)
          .filter(attribute => attribute.name.toLowerCase() !== 'value' || !injected.isProtectedCredentialField(element))
          .map(attribute => [attribute.name, attribute.value])),
        inner_text: 'innerText' in element ? String(element.innerText) : '',
        text_content: element.textContent,
      });
      if (!arg.relativeSelector) return elements.map(read);
      const parsed = injected.parseSelector(arg.relativeSelector);
      return elements.map(element => {
        const [first] = injected.querySelectorAll(parsed, element);
        return first ? read(first) : null;
      });
    }, {arg: {relativeSelector: params.relative_selector}, deadline: budget(params)})};
  },
};
