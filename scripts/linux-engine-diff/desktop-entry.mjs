// Desktop entries the harness writes for launch_app. A path in one carries the run's label, which is the caller's, so
// it reaches the program as a quoted argument and never as shell source.

/**
 * `arg` as one `Exec` argument, quoted per the Desktop Entry spec: in double quotes, with `"`, `` ` ``, `$` and `\`
 * escaped by a backslash, and `%` doubled. The engines read `Exec` without the key-file layer's unescaping (the
 * vendor's rule, `native/linux-engine/src/apps.rs`), where the spec applies it first; a backslash would therefore read
 * differently in the two, and a line break would end the key, so both are refused.
 */
export function desktopExecArg(arg) {
  if (/[\r\n]/.test(arg)) throw new Error(`a desktop Exec argument cannot hold a line break: ${JSON.stringify(arg)}`);
  if (arg.includes('\\')) throw new Error(`a desktop Exec argument with a backslash reads differently in the key-file and Exec layers: ${JSON.stringify(arg)}`);
  return `"${arg.replace(/["`$]/g, (c) => `\\${c}`).replace(/%/g, '%%')}"`;
}

/** A `[Desktop Entry]` of type Application named `name` running `argv`. */
export function desktopEntry(name, argv) {
  return `[Desktop Entry]\nType=Application\nName=${name}\nExec=${argv.map(desktopExecArg).join(' ')}\n`;
}
