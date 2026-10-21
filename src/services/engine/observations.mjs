// The observations one connection made of each app (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Design "Indexes, tokens and handles" and "The service", Diff; the Decision Log's M1a pre-flight item 3 and M1a.3 item
// 3): per (connection, app) the latest observation as the renderer and the diff take it, {skyshot, numbering}, where the
// numbering is ./render.mjs's over the engine's tokens (a kept token keeps its index, a new one takes the next never
// issued, a vanished one's index is retired for good, a new lineage starts at 0).
//
//   observe(app, skyshot, {disableDiff}) -> the text the model reads: the full tree with disableDiff (whose observation
//       the engine starts on a new lineage), else the diff against the previous observation of the app (the full tree
//       when there is none, it was of another lineage, or the diff would be longer). Every observation advances the
//       baseline, including one whose text the caller discards (a screenshot's).
//   element(app, index) -> {token, lineage}: the token the latest observation numbered `index`, and the lineage it
//       belongs to, which the action carries. An index never issued in the lineage answers the vendor's `<n> is an
//       invalid element ID`; one issued and retired since, or any index for an app this connection has not observed,
//       answers the vendor's "no longer valid" sentence (cua never reuses an index, so a stale one is always refused).
//   lineage(app) -> the lineage of the app's latest observation, which every action carries (a coordinate's too).
//
// The refusals are the engine's sentences under its error form (-10005 with the vendor's envelope), so the model reads
// one form whichever side refuses.
import {diff} from './diff.mjs';
import {advanceNumbering, indexState, render} from './render.mjs';
import {SkyComputerUseError} from './protocol.mjs';

const NO_LONGER_VALID = 'The element ID is no longer valid. Try to get the on-screen content again and see if that resolves the issue.';
const refused = (errorName, reason) => new SkyComputerUseError({code: -10005, reason, errorName});

export function createObservations() {
  const latest = new Map();   // app -> {skyshot, numbering}

  return {
    observe(app, skyshot, {disableDiff = false} = {}) {
      const previous = latest.get(app) ?? null;
      const current = {skyshot, numbering: advanceNumbering(previous?.numbering ?? null, skyshot)};
      latest.set(app, current);
      return disableDiff ? render(skyshot, current.numbering) : diff(previous, current);
    },

    element(app, index) {
      if (!Number.isInteger(index)) throw new TypeError('elementIndex must be an integer');
      const numbering = latest.get(app)?.numbering;
      if (!numbering) throw refused('elementNoLongerValid', NO_LONGER_VALID);
      const named = indexState(numbering, index);
      if (named.state === 'invalid') throw refused('invalidElementID', `${index} is an invalid element ID`);
      if (named.state === 'retired') throw refused('elementNoLongerValid', NO_LONGER_VALID);
      return {token: named.token, lineage: numbering.lineage};
    },

    lineage(app) {
      return latest.get(app)?.numbering.lineage;
    },
  };
}
