// gedit's window title for a document (#171 M4, task 51): gedit 46 (gedit-window.c `set_title`) titles a window
// `<name> (<directory>) - gedit`, the directory middle-truncated (tepl's `tepl_utils_str_middle_truncate`, an ellipsis
// in the middle) to what is left of 100 characters once the name is counted, at least 20, and a name over 100 truncated
// itself, with no directory. The harness compares its gedit windows' titles across lanes, each lane's window on a file
// named for its own label, so a truncated directory shows a different middle in each lane: task 49's longer scratch
// path made `gedit tree_shot` differ between cua's window and the vendor's, the trees equal. (A directory under the
// application's HOME shows as `~`; the harness's documents never lie there.)

import { basename, dirname } from 'node:path';

/** gedit's `MAX_TITLE_LENGTH`. */
export const GEDIT_TITLE_MAX = 100;
const ELLIPSIS = '…';

/** tepl's middle truncation, by characters (code points): `str` itself when it is no longer than `length`. */
function middleTruncate(str, length) {
  const chars = [...str];
  if (length < 3 || chars.length <= length) return str;
  const left = Math.floor((length - 1) / 2);
  const right = chars.length - length + left + 1;
  return `${chars.slice(0, left).join('')}${ELLIPSIS}${chars.slice(right).join('')}`;
}

/** The title gedit gives a window on `file` (an absolute path), and whether gedit shortened any of it. */
export function geditTitle(file) {
  const name = basename(file);
  const length = [...name].length;
  if (length > GEDIT_TITLE_MAX) return { title: `${middleTruncate(name, GEDIT_TITLE_MAX)} - gedit`, ellipsized: true };
  const dir = dirname(file);
  const shown = middleTruncate(dir, Math.max(20, GEDIT_TITLE_MAX - length));
  return { title: `${name} (${shown}) - gedit`, ellipsized: shown !== dir };
}
