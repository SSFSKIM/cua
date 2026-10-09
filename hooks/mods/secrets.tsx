import type { EngineInterface, Hook, On } from 'claude-code'

/**
 * `/secret KEY` opens a field in a pane; the value typed there is drawn as
 * bullets, stored as `~/.config/claude-secrets/projects/<slug>/KEY` for the
 * session's project (`/secret -g KEY`: `~/.config/claude-secrets/KEY`, for
 * every project; mode 600), and the model sees only the key. The value never passes through the prompt box, so neither
 * the prompt history nor the transcript can hold it; a stored value that turns
 * up in a tool's output reaches neither the model nor the transcript file.
 *
 * Not the prompt box: when the last keys and Enter arrive in one read (mosh,
 * a slow link), the editor inserts and submits them before a `prompt.edit`
 * answer lands, so they reach the history raw. The box still masks a value
 * typed there out of habit, and the command refuses it.
 */

// A file per key, not the Keychain: a session under ssh, mosh or a daemon
// finds the login keychain locked and cannot raise its unlock dialog.
export const DIR = '.config/claude-secrets'
export const MASK = '•'
// `/secret KEY ` or `/secret KEY=`, `-g` or `--global` before the key or not:
// the value starts after the one character that ends the key.
const PREFIX = /^\/secret[ \t]+(?:(?:-g|--global)[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t=]/
const FLAG = /^(?:(-g|--global)(?:[ \t]+|$))?([\s\S]*)$/
const ARGS = /^([A-Za-z_][A-Za-z0-9_]*)[ \t=]([\s\S]*)$/
// The echo of a `/secret` run as the conversation keeps it.
const ECHO = /(<command-name>\/secret<\/command-name>[\s\S]*?<command-args>[ \t]*(?:(?:-g|--global)[ \t]+)?[A-Za-z_][A-Za-z0-9_]*[ \t=])([\s\S]*?)(<\/command-args>)/g
// Device credentials (cua's reserved keys, src/secrets/label.mjs) are read
// from the global tier only, so they are stored there whatever the project.
const RESERVED = /^CUA_DEVICE_/i
// Claude Code cuts a slug at this length and adds a hash of the whole path.
const SLUG_MAX = 200
// Shorter values would scrub ordinary words out of everything the model reads.
const SCRUB_MIN = 6

const PANE = 'secret'
const FIELD = 'secret-value'

type Scope = 'project' | 'global'
type Pending = { key: string; scope: Scope }
type Listed = { key: string; scope: Scope; shadowed: boolean }

// What is typed lives only in this module's memory, never in `$.state` (which
// every plugin can read): `drafted` behind the prompt box's bullets, `typed`
// behind the field's, for the key and tier in `pending`.
let drafted = ''
let typed = ''
let pending: Pending | undefined
// The session's project root, once resolved.
let project: string | undefined
// Every stored secret of both tiers, by `<scope>/<key>`, so that no row the
// model reads carries one.
const known = new Map<string, { key: string; scope: Scope; value: string }>()

type Edit = { text: string; start: number; end: number; inputText: string }
type Masked = { held: string; box?: { text: string; cursor: number } }

/**
 * One edit of the prompt box, given the value held so far. While the draft
 * reads `/secret KEY ` (or `KEY=`), what follows is kept in `held` and the box
 * shows one bullet per character; `box` absent means the edit is not ours.
 */
export function maskEdit(held: string, e: Edit): Masked {
  const before = PREFIX.exec(e.text)?.[0].length
  const isMasked = before !== undefined && e.text.slice(before) === MASK.repeat(held.length)
  const cursor = e.start + e.inputText.length

  if (isMasked && e.start < before) {
    // An edit to `/secret KEY ` itself drops the value, so a moved boundary
    // between key and value can never show part of it.
    const prefix = e.text.slice(0, before)
    return { held: '', box: { text: prefix.slice(0, e.start) + e.inputText + prefix.slice(Math.min(e.end, before)), cursor } }
  }

  const real = isMasked ? e.text.slice(0, before) + held : e.text
  const spliced = real.slice(0, e.start) + e.inputText + real.slice(e.end)
  const after = PREFIX.exec(spliced)?.[0].length
  if (after === undefined) return { held: '' }
  const value = spliced.slice(after)
  return { held: value, box: { text: spliced.slice(0, after) + MASK.repeat(value.length), cursor } }
}

/**
 * The field's text read back against what it held: bullets for the characters
 * kept, then whatever was typed since the last redraw (several characters when
 * they arrived together, Enter among them). Undefined for an edit inside the
 * bullets, which cannot be placed.
 */
export function readField(held: string, value: string): string | undefined {
  const kept = value.length - value.replace(/^•+/, '').length
  const added = value.slice(kept)
  if (kept > held.length || added.includes(MASK)) return undefined
  return held.slice(0, kept) + added
}

/** A `/secret` echo with its value masked, for one typed where nothing masked it. */
export function maskEcho(text: string): string {
  return text.replace(ECHO, (_, head: string, value: string, tail: string) => head + MASK.repeat(value.length) + tail)
}

// The value and the encodings a command prints it in by accident: base64
// (padded or not), hex either case, URL encoding. A slice or a transformation
// of its own making is beyond this; the guard below keeps the store unread.
function spellings(value: string): string[] {
  const bytes = Array.from(new TextEncoder().encode(value), (b) => b.toString(16).padStart(2, '0')).join('')
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(value)))
  return [...new Set([value, base64, base64.replace(/=+$/, ''), bytes, bytes.toUpperCase(), encodeURIComponent(value)])]
}

function scrub(text: string): string {
  let out = maskEcho(text)
  for (const { key, value } of known.values()) {
    if (value.length < SCRUB_MIN) continue
    for (const spelling of spellings(value)) out = out.split(spelling).join(`[secret:${key}]`)
  }
  return out
}

// The one form a command may name a stored value in, of either tier:
// substituted where it is used, so the command's own output is all that could
// carry it.
const SUBSTITUTION = /\$\(\s*cat\s+(?:~|"?\$HOME"?|"?\$\{HOME\}"?|\/(?:Users|home)\/[^/\s"')]+)\/\.config\/claude-secrets\/(?:projects\/[A-Za-z0-9-]+\/)?[A-Za-z_][A-Za-z0-9_]*\s*\)/g

/**
 * Why a tool call would read the store itself, or undefined: a command naming
 * the folder (the projects' folders beneath it included) other than in the
 * substitution form, or a file tool whose path
 * (a Glob's pattern) points into it. What a Write or an Edit puts in a file,
 * or what a Grep searches for, is not a read of the store.
 */
export function guardReason(input: Readonly<Record<string, unknown>>): string | undefined {
  const reads =
    typeof input.command === 'string'
      ? input.command.replace(SUBSTITUTION, '').includes('.config/claude-secrets')
      : Object.entries(input).some(
          ([field, value]) =>
            (/path$/i.test(field) || (input.tool === 'Glob' && field === 'pattern')) &&
            typeof value === 'string' &&
            value.includes('claude-secrets'),
        )
  if (!reads) return undefined
  return (
    'secrets: the stored values are not for reading. Use one only inside the command that needs it, ' +
    'as "$(cat ~/.config/claude-secrets/KEY)"; the stored keys are listed in the system prompt.'
  )
}

// A tool's record, every string in it scrubbed; the same object when none changed.
function scrubRecord(value: unknown): unknown {
  if (typeof value === 'string') return scrub(value)
  if (Array.isArray(value)) {
    const items = value.map(scrubRecord)
    return items.some((item, i) => item !== value[i]) ? items : value
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([k, v]) => [k, scrubRecord(v)] as const)
    return entries.some(([k, v]) => v !== (value as Record<string, unknown>)[k]) ? Object.fromEntries(entries) : value
  }
  return value
}

/**
 * A project's path as Claude Code names its folder under ~/.claude/projects/:
 * every character other than an ASCII letter or digit becomes '-', and a slug
 * longer than 200 characters keeps its first 200 and gains '-' and a base-36
 * hash of the path. cua's store (src/secrets/store.mjs) carries the same.
 */
export function projectSlug(path: string): string {
  const slug = path.replace(/[^a-zA-Z0-9]/g, '-')
  if (slug.length <= SLUG_MAX) return slug
  let hash = 0
  for (let i = 0; i < path.length; i++) hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0
  return `${slug.slice(0, SLUG_MAX)}-${Math.abs(hash).toString(36)}`
}

/**
 * The project root from `git rev-parse --path-format=absolute
 * --git-common-dir --show-toplevel`'s two lines: the main checkout's root
 * (the parent of its `.git`, which every linked worktree shares), or the
 * repository's top level where the common directory is no `.git` folder (a
 * submodule's). cua's src/secrets/project.mjs resolves it the same way.
 */
export function rootFromGit(commonDir: string, topLevel: string): string {
  return /\/\.git$/.test(commonDir) ? commonDir.slice(0, -'/.git'.length) || '/' : topLevel
}

// The session's project: the main worktree root of the git repository around
// its directory, else that directory. Resolved once, at session start.
async function projectOf($: EngineInterface, cwd?: string): Promise<string> {
  if (project !== undefined) return project
  const dir = cwd ?? (await $.session.cwd())
  let root = dir
  try {
    const git = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'], { cwd: dir, timeoutMs: 5000 })
    const [commonDir, topLevel] = git.stdout.trim().split('\n')
    if (git.exitCode === 0 && commonDir && topLevel) root = rootFromGit(commonDir, topLevel)
  } catch {}
  project = root
  return root
}

// The tier's folder, relative to $HOME.
async function tierDir($: EngineInterface, scope: Scope): Promise<string> {
  return scope === 'global' ? DIR : `${DIR}/projects/${projectSlug(await projectOf($))}`
}

async function usage($: EngineInterface, key: string, scope: Scope): Promise<string> {
  return `"$(cat ~/${await tierDir($, scope)}/${key})"`
}

const TIER = { project: 'for this project', global: 'for every project (global)' }

async function storeField($: EngineInterface, { key, scope }: Pending, value: string) {
  if (value === '') return
  // The bullets hide a mistyped character, an input method left on.
  if (/[^\x20-\x7e]/.test(value)) {
    typed = ''
    $.ui.toast('secret: a character outside printable ASCII (an input method on?); type it again')
    return
  }
  // The value goes in on stdin, so no process's arguments carry it, and is
  // created under umask 077 (`$.fs.write` sets no mode).
  const dir = `${await $.env.get('HOME')}/${await tierDir($, scope)}`
  const added = await $.process.run(
    ['/bin/sh', '-c', 'umask 077 && mkdir -p "$1" && chmod 700 "$1" && cat > "$1/$2" && chmod 600 "$1/$2"', 'sh', dir, key],
    { stdin: value },
  )
  if (added.exitCode !== 0) {
    $.ui.toast(`secret: not stored, ${added.stderr.trim().split('\n')[0] || 'the write failed'}`)
    return
  }
  known.set(`${scope}/${key}`, { key, scope, value })
  typed = ''
  pending = undefined
  await $.ui.close({ id: PANE })
  $.ui.toast(`secret: stored ${key} (${scope})`)
  await $.session.append({
    message: {
      type: 'user',
      content: [
        {
          type: 'text',
          text: `The person stored a secret under ${key}, ${TIER[scope]}. You never see its value. In a shell command, read it as ${await usage($, key, scope)}, never printing it.`,
        },
      ],
    },
  })
}

// The stored keys, sorted by key with the project's first; a global key the
// project's of the same name shadows is marked so.
function listed(): Listed[] {
  return [...known.values()]
    .map(({ key, scope }) => ({ key, scope, shadowed: scope === 'global' && known.has(`project/${key}`) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.scope === 'project' ? -1 : 1))
}

function describe({ key, scope, shadowed }: Listed): string {
  return `${key} (${scope}${shadowed ? ", shadowed by the project's" : ''})`
}

// The tier's folder as the pane shows it, the project resolved at session start.
function shownDir(scope: Scope): string {
  return scope === 'global' || project === undefined ? DIR : `${DIR}/projects/${projectSlug(project)}`
}

// Taken with both matchers below: the other mods register session.start too,
// and an event is registered without one once per module.
const secretsStart: Hook<'session.start'> = async ($, e, next) => {
  await $.command.register({
    name: 'secret',
    description: 'Store a secret for this project (-g: for every project) that the model sees only by its key; the value goes in the field it opens',
    argumentHint: '[-g] KEY',
  })
  project = undefined
  known.clear()
  await projectOf($, e.cwd)
  const home = await $.env.get('HOME')
  for (const scope of ['project', 'global'] as const) {
    const dir = `${home}/${await tierDir($, scope)}`
    if (!(await $.fs.exists(dir))) continue
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind === 'file' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name)) {
        known.set(`${scope}/${entry.name}`, { key: entry.name, scope, value: await $.fs.read(`${dir}/${entry.name}`) })
      }
    }
  }
  return next(e)
}

export function registerSecrets(on: On) {
  on('session.start', { isInteractive: true }, secretsStart)
  on('session.start', { isInteractive: false }, secretsStart)

  // Masks a value typed into the box out of habit; the command refuses it.
  on('prompt.edit', async (_, e, next) => {
    const masked = maskEdit(drafted, e)
    drafted = masked.held
    return masked.box ?? next(e)
  })

  on('command.run', { command: 'secret' }, async ($, e) => {
    const [, flag, rest = ''] = FLAG.exec(e.args.trim()) ?? []
    const args = rest.trim()
    if (args === '' && !flag) {
      return { text: known.size ? `Stored: ${listed().map(describe).join(', ')}` : 'No secrets stored.' }
    }
    const parsed = ARGS.exec(args)
    drafted = ''
    if (parsed) {
      return {
        text:
          'Not stored: type `/secret KEY` alone and the value in the field it opens. ' +
          'A value typed in the prompt box may be in the prompt history (~/.claude/history.jsonl), whole or in part.',
      }
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(args)) return { text: 'Usage: /secret [-g|--global] KEY (letters, digits and _)' }
    const isDevice = !flag && RESERVED.test(args)
    pending = { key: args, scope: flag || isDevice ? 'global' : 'project' }
    typed = ''
    await projectOf($)
    await $.ui.open({ id: PANE, title: `secret ${args} (${pending.scope})`, focus: true, closeOnEscape: true, rows: 2 })
    const where = isDevice
      ? 'for every project, as device credentials are'
      : pending.scope === 'project'
        ? `${TIER.project} (/secret -g ${args} stores it for every project)`
        : TIER.global
    return { text: `Type the value of ${args} in the field of the pane it opened; it is stored ${where}. Enter stores it, Escape cancels.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>The mobile app draws no field: type the value from a terminal, the desktop app or VS Code.</Text>
    }
    const { Box, Input, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Input
          key={FIELD}
          label={`${pending?.key ?? ''} `}
          value={MASK.repeat(typed.length)}
          placeholder="value"
          submitLabel="store"
          autoFocus
          onSubmit={() => {}}
        />
        <Text dimColor>Escape cancels. Stored in ~/{pending ? `${shownDir(pending.scope)}/${pending.key}` : DIR}, mode 600.</Text>
      </Box>
    )
  })

  // Taken here rather than in the element's closures, which have no `$`.
  on('ui.input', { element: FIELD }, async ($, e) => {
    const value = readField(typed, e.value)
    typed = value ?? ''
    if (value === undefined) $.ui.toast('secret: edit at the end of the field; it was cleared')
    $.ui.invalidate('ui.render')
    if (e.kind === 'submit' && value !== undefined && pending !== undefined) await storeField($, pending, value)
    return { element: e.element, value: MASK.repeat(typed.length) }
  })

  on('ui.close', { id: PANE }, (_, e, next) => {
    typed = ''
    pending = undefined
    return next(e)
  })

  // The tool's own record is what the transcript file keeps beside the row the
  // model reads (`toolUseResult`), and `session.append` cannot reach it.
  on('tool.call', async (_, e, next) => {
    const reason = guardReason(e)
    if (reason !== undefined) return { deny: reason }
    const ran = await next(e)
    if (ran.deny !== undefined || known.size === 0) return ran
    const result = scrubRecord(ran.result)
    if (result === ran.result) return ran
    return ran.isError ? { deny: scrub(ran.text ?? '') } : { result, context: ran.context }
  }).catch((_, e, next) => (next.called ? next(e) : { deny: 'secrets: its guard failed, so the call did not run.' }))

  // The last line of defence: a stored value that turns up in any row the
  // conversation keeps (a tool's output, an echo) is replaced by its key.
  on('session.append', async (_, e, next) => {
    let isChanged = false
    const content = e.message.content.map((block) => {
      if (block.type === 'text' && typeof block.text === 'string') {
        const text = scrub(block.text)
        if (text === block.text) return block
        isChanged = true
        return { ...block, text }
      }
      if (block.type === 'tool_result') {
        const inner = scrubRecord(block.content)
        if (inner === block.content) return block
        isChanged = true
        return { ...block, content: inner }
      }
      return block
    })
    return isChanged ? next({ ...e, message: { ...e.message, content } }) : next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (known.size === 0) return composed
    const lines = await Promise.all(listed().map(async (s) => `- ${describe(s)}: ${await usage($, s.key, s.scope)}`))
    return {
      sections: [
        ...composed.sections,
        {
          id: 'cua:secrets',
          scope: 'session',
          text:
            'Secrets the person stored, one file each, for this project or for every project (global). ' +
            'You see only their keys; read a value inside the shell command that uses it, never printing it. ' +
            "Where a key is stored in both, use the project's:\n" +
            lines.join('\n'),
        },
      ],
    }
  })
}
