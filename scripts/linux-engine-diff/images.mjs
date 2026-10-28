// Window screenshots compared (Design, Verification system: images by size and pixel difference). Every sample's
// screenshot is compared with the pinned build's last screenshot of the same block (each engine has its own
// equivalent window, in the same state within a block), below the rows that carry the window's own label (gedit's
// title, Chrome's tab strip: the top 40 rows, measured on equivalent windows, where they differ and nowhere below).

import { execFileSync } from 'node:child_process';

export const IMAGE_TOLERANCE = {
  /** Rows at the top left out of the comparison: where an equivalent window's own label is drawn. */
  maskTopRows: 40,
  /** At most this fraction of the compared pixels may differ (a channel by more than 32, xprobe's threshold). */
  maxOverFraction: 0.001,
};

/** The judgement of one `xprobe imgdiff` result. */
export function imageVerdict(diff, tolerance = IMAGE_TOLERANCE) {
  if (!diff) return { ok: false, reason: 'no comparison' };
  const [aw, ah] = diff.a;
  const [bw, bh] = diff.b;
  if (aw !== bw || ah !== bh || diff.over === null) return { ok: false, reason: `size ${aw}×${ah} against ${bw}×${bh}` };
  const fraction = diff.over / Math.max(1, diff.compared);
  if (fraction > tolerance.maxOverFraction) return { ok: false, reason: `${diff.over} of ${diff.compared} pixels differ (mean ${diff.mad})` };
  return { ok: true, reason: null };
}

/** `xprobe imgdiff` of two JPEG files below the masked rows. */
export function xprobeDiff(xprobe, tolerance = IMAGE_TOLERANCE) {
  return (reference, image) => JSON.parse(execFileSync(xprobe, ['imgdiff', reference, image, String(tolerance.maskTopRows)], { encoding: 'utf8' }));
}

/**
 * Compares every sample `{engine, scene, op, block, i, image}` with the pinned build's last screenshot of its scene,
 * op and block; returns each sample with `ok`, `reason`, `mad` and `over`.
 */
export function compareShots(samples, diff) {
  const reference = new Map();
  for (const s of samples) {
    if (s.engine !== 'pinned') continue;
    const key = `${s.scene}|${s.op}|${s.block}`;
    const held = reference.get(key);
    if (!held || s.i > held.i) reference.set(key, s);
  }
  return samples.map((s) => {
    const ref = reference.get(`${s.scene}|${s.op}|${s.block}`);
    if (!ref) return { ...s, ok: false, reason: 'no pinned screenshot in this block', mad: null, over: null };
    if (!s.image || !ref.image) return { ...s, ok: false, reason: 'a screenshot is missing', mad: null, over: null };
    const d = diff(ref.image, s.image);
    return { ...s, ...imageVerdict(d), mad: d?.mad ?? null, over: d?.over ?? null };
  });
}
