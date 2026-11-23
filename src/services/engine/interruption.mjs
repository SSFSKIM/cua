// #212: cua's macOS engine says, on a userIntervened error's input meta (`interruption`), where the intervention stopped
// the request (`beforeAction`, the pre-action refusal, or `inFlight`, between its steps) and which of its steps may have
// taken effect (native/engine/Sources/Engine/Intervention.swift, `InputEffect`). The engine's own message already says
// so to the model; this reading is for the secret wrapper (src/services/secret-input.mjs), which withholds the engine's
// text and repeats the account in these fixed phrases, the engine's own. Only known phases and effects are read, in this
// order, so nothing the engine did not mean is ever repeated.
export const EFFECT_PHRASES = Object.freeze({
  scroll: 'a scroll to bring the element into view',
  activation: 'the app\'s activation in the background',
  activationClick: 'an activation click, at the window\'s activation point or just outside the window',
  focus: 'moving focus to the field',
  focusClick: 'a click to focus the field',
  value: 'the value written to the field',
  input: 'the action\'s own input, in part or whole',
  activationRelease: 'the end of a held activation, which may have sent the app a deactivation',
});
// The effects after which a substituted value may be in the app: its write, or the action's own input.
export const ENTERING_EFFECTS = Object.freeze(['value', 'input']);

// The engine's account from an input meta, or null when it carries none the wrapper can read. -> {phase, effects}.
export function readInterruption(meta) {
  const detail = meta?.interruption;
  if (!detail || typeof detail !== 'object' || !['beforeAction', 'inFlight'].includes(detail.phase)) return null;
  const given = Array.isArray(detail.effects) ? detail.effects : [];
  return {phase: detail.phase, effects: Object.keys(EFFECT_PHRASES).filter(effect => given.includes(effect))};
}
