// Secret references in text input: only a whole argument equal to `{{secret:<label>}}` refers to a stored secret.
// No substring interpolation and no recursion: text that merely contains or resembles a reference is ordinary input.
// Text that is shaped like a reference (`{{secret:` … `}}`) but whose label breaks the label rule is an invalid
// reference, so a malformed or concatenated marker is refused rather than typed literally or partially expanded.
import {isLabel} from './label.mjs';

const PREFIX = '{{secret:';
const SUFFIX = '}}';

// null when `value` is not a reference; {label} for a reference; {invalid: true} for a reference-shaped string with
// an unusable label.
export function parseReference(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX) || !value.endsWith(SUFFIX) || value.length < PREFIX.length + SUFFIX.length) return null;
  const label = value.slice(PREFIX.length, -SUFFIX.length);
  return isLabel(label) ? {label} : {invalid: true};
}
