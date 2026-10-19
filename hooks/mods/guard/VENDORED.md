# The secrets guard, vendored from devcloud

This folder and `tests/mods/guard/` are devcloud's secrets guard, copied from
[SSFSKIM/doperpowers](https://github.com/SSFSKIM/doperpowers) at
`823f772f634003278886446940fe9fb6b679e254` (devcloud 0.5.0: the bare Google
OAuth token rules of `9d593f70`, and the guard marker answered by devcloud's
loaded module rather than stored, doperpowers board #101). It was first
copied at `ce6edfda` (devcloud 0.1.0). The code is devcloud's: change it there
and resync, rather than editing it here. cua's part is `/secret`
(`../secrets.tsx`), which stays cua's own, and the stand-down
(`../one-guard.tsx`).

| here | devcloud |
|---|---|
| `hooks/mods/guard/secrets*.tsx` | `devcloud/hooks/mods/secrets*.tsx` |
| `hooks/mods/guard/devcloud.d.ts` | `devcloud/types/devcloud.d.ts` |
| `tests/mods/guard/*.ts` | `devcloud/tests/mods/*.ts` |

## Adaptations

Every vendored file starts with a two-line header naming its source path and
commit. Beyond that, and the paths in the table:

1. **No marker answer.** devcloud answers its own guard marker (Interfaces I9):
   `MARKER_READ`, and the `state.get` hook `registerSecrets` registers with it
   (`on('state.get', { plugin: 'devcloud', key: 'secrets-guard' }, …)`, in
   `devcloud/hooks/mods/secrets.tsx` at the commit above). cua's copy drops
   both, deliberately: cua reads that marker to stand down, so answering it
   would make cua stand down to itself and leave the session with no guard. A
   resync must bring back neither that hook nor a write of the marker (devcloud
   before 0.5.0 stored it; the engine refuses one plugin's write to another's
   state anyway): `grep -n "state\.set\|'state\.get'" hooks/mods/guard/*.tsx`
   stays empty, and two tests pin it (the first in
   `tests/mods/guard/secrets.test.ts`, "cua alone" in
   `tests/mods/secrets.test.ts`).
2. **One guard per session.** Each hook `registerSecrets` registers
   (`session.start`, `tool.call`, `session.append`, `session.compact`,
   `prompt.compose`, `prompt.context`, `prompt.attachment`) and `tool.call`'s
   `.catch` handler first pass the event on untouched while devcloud's guard is
   in the session's chain: while a read of devcloud's marker resolves to the
   exact marker at version 0, its loaded module's own answer (`devcloudGuards`,
   imported from `../one-guard`). A marker at any other version is one the host
   kept from a devcloud before 0.5.0, which outlives that devcloud's module
   (doperpowers board #101), and cua's guard acts on it. Each such line ends in
   `// cua: one guard per session`.
3. **Section id.** The system-prompt section is `cua:secrets-guard`, not
   `devcloud:secrets`.
4. **Tests.** Imports reach `../../../hooks/mods/guard/`. In
   `tests/mods/guard/secrets.test.ts`, `start()` also answers
   `command.register` (cua's `/secret` registers itself at session start in the
   same hooks module), the section id is cua's, and devcloud's Interfaces I9
   tests (its answer to the marker, and a second guard standing down beside
   devcloud in either order) are replaced by one that pins that cua's copy
   neither answers nor writes the marker: cua's stand-down is
   `tests/mods/secrets.test.ts`'s, which loads a devcloud outside and inside cua.
5. **Not vendored.** devcloud's `register.tsx`, `hooks.json`, `tsconfig.json`
   and `tests/mods/run.sh`. The engine takes one hooks module per plugin, so
   cua's `hooks/mods/register.tsx` calls this folder's `registerSecrets` beside
   cua's own; `hooks/mods/tsconfig.json` excludes `shell-exec.ts` as devcloud's
   does; `tests/mods/run-mods-tests.sh` runs the kit tests, then `shell-exec.ts`
   under bun. One module also cannot register an event twice without a matcher,
   so cua's own `session.append` and `prompt.compose` hooks take a matcher every
   event meets (`../secrets.tsx`).

## Resync

From this repository's root, with a doperpowers checkout at `$D` and the new
commit in `$NEW`:

```sh
OLD=823f772f634003278886446940fe9fb6b679e254
git -C "$D" diff "$OLD" "$NEW" --relative=devcloud/hooks/mods -- devcloud/hooks/mods \
  ':!devcloud/hooks/mods/register.tsx' ':!devcloud/hooks/mods/tsconfig.json' | git apply --reject --directory=hooks/mods/guard
git -C "$D" diff "$OLD" "$NEW" --relative=devcloud/tests/mods -- devcloud/tests/mods \
  ':!devcloud/tests/mods/run.sh' | git apply --reject --directory=tests/mods/guard
git -C "$D" diff "$OLD" "$NEW" --relative=devcloud/types -- devcloud/types | git apply --reject --directory=hooks/mods/guard
```

Applying devcloud's diff, not copying its files, keeps the adaptations. Then
resolve any `*.rej` against the list above; give a new file the header and a
new hook the stand-down line; put `$NEW` in the headers and here; and run
`npm run test:mods`.
