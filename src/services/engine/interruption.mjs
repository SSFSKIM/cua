// Model-visible, value-free rendering of the native engine's interruption metadata. Shared with the secret wrapper:
// never repeat engine text there, and never infer no effects from a null ordinary action interval.
const EFFECTS = {
  'focus-write-attempted': 'An AX focus write was attempted; focus may have moved.',
  'focus-click-posted': 'A preparation/focus click was posted.',
  'activation-click-posted': 'An activation click was posted.',
  'value-write-attempted': 'A value write was attempted; it may have taken effect.',
  'input-posted': 'Action input was dispatched.',
};

export function interruptionMessage(detail) {
  if (!detail || !['before-effects', 'in-flight'].includes(detail.phase)) return null;
  const before = detail.phase === 'before-effects';
  const effects = Array.isArray(detail.effects) ? Object.keys(EFFECTS).filter(key => detail.effects.includes(key)) : [];
  return [
    before ? 'Action refused before any effects.' : 'Action interrupted after possible effects.',
    ...(before ? [] : [...effects.map(key => EFFECTS[key]),
      'Other preparation effects may also have occurred. Already dispatched input may still complete; effects were not rolled back.']),
    'Input attributed to the app triggered the intervention guard; its source is not proven human.',
    'Do not retry automatically. Let the user finish, then call getAXState() and inspect the outcome before deciding on another action.',
  ].join(' ');
}
