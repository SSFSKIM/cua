# The secrets guard, vendored from devcloud

This folder and `tests/mods/guard/` are devcloud's secrets guard, copied from
[SSFSKIM/doperpowers](https://github.com/SSFSKIM/doperpowers) at
`ce6edfda3b641bfb0c5e4e0d4a566df13ed26ecb` (the merge of doperpowers#220,
devcloud 0.1.0, which carries every guard fix through `be1ea25a`). The code is
devcloud's: change it there and resync, rather than editing it here. cua's
part is `/secret` (`../secrets.tsx`), which stays cua's own, and the
stand-down (`../one-guard.tsx`).

| here | devcloud |
|---|---|
| `hooks/mods/guard/secrets*.tsx` | `devcloud/hooks/mods/secrets*.tsx` |
| `hooks/mods/guard/devcloud.d.ts` | `devcloud/types/devcloud.d.ts` |
| `tests/mods/guard/*.ts` | `devcloud/tests/mods/*.ts` |

## Adaptations

Every vendored file starts with a two-line header naming its source path and
commit. Beyond that, and the paths in the table:

1. **No marker write.** devcloud's `secretsStart` opens with
   `$.state.set({ plugin: 'devcloud', key: 'secrets-guard' }, …)` (line 277 of
   `devcloud/hooks/mods/secrets.tsx` at the commit above). cua's copy drops it,
   deliberately: cua reads that marker to stand down, so writing it would make
   cua stand down to itself and leave the session with no guard, and the engine
   refuses one plugin's write to another's state anyway. A resync must not
   bring it back; `grep -n 'state\.set' hooks/mods/guard/*.tsx` stays empty, and two
   tests pin it (the first in `tests/mods/guard/secrets.test.ts`, "cua alone"
   in `tests/mods/secrets.test.ts`).
2. **One guard per session.** Each hook `registerSecrets` registers
   (`session.start`, `tool.call`, `session.append`, `session.compact`,
   `prompt.compose`, `prompt.context`, `prompt.attachment`) and `tool.call`'s
   `.catch` handler first pass the event on untouched while devcloud's marker is
   set (`devcloudGuards`, imported from `../one-guard`). Each such line ends in
   `// cua: one guard per session`.
3. **Section id.** The system-prompt section is `cua:secrets-guard`, not
   `devcloud:secrets`.
4. **Tests.** Imports reach `../../../hooks/mods/guard/`. In
   `tests/mods/guard/secrets.test.ts`, `start()` also answers
   `command.register` (cua's `/secret` registers itself at session start in the
   same hooks module), the marker test pins that no state is written, and the
   section id is cua's.
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
OLD=ce6edfda3b641bfb0c5e4e0d4a566df13ed26ecb
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
