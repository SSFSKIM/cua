// Pure pieces of the Linux native fixture (scripts/accept/linux-native.mjs).

const NAMED = {'-': 'minus', ' ': 'space', '_': 'underscore', '.': 'period'};

// One X keysym per character of `text`, for pressKey: letters and digits are their own keysym names, a few separators
// go by name. Anything else is refused before any input is sent, so a marker is never typed half way.
export function keysymsFor(text) {
  return [...text].map(ch => {
    if (/^[A-Za-z0-9]$/.test(ch)) return ch;
    if (NAMED[ch]) return NAMED[ch];
    throw new Error(`no X keysym for "${ch}" in this fixture`);
  });
}
