// The download cases read a file only when its path names this fixture's artifact: `parity.txt`, Chrome's ordinary
// uniquifier `parity (n).txt`, or the timestamp form Chrome falls back to once those run out,
// `parity - YYYY-MM-DDTdddddd.ddd.txt` (observed on the mini's Downloads, M3 task 4; the same grammar the REPL
// oracle's chooser case accepts). A regular-expression literal, as cell source; nothing else is accepted.
export const fixtureDownloadPathGuard=String.raw`/\/parity(?: \(\d+\)| - \d{4}-\d{2}-\d{2}T\d{6}\.\d{3})?\.txt$/`;
