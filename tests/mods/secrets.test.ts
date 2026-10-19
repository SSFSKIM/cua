import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { isDevcloudMarker } from '../../hooks/mods/one-guard'
import { MASK, maskEcho, maskEdit, projectSlug, readField, rootFromGit } from '../../hooks/mods/secrets'

tier('user')

const type = (keys: string) => {
  let box = { text: '', cursor: 0 }
  let held = ''
  for (const key of keys) {
    const edit =
      key === '\b'
        ? { text: box.text, start: box.cursor - 1, end: box.cursor, inputText: '' }
        : { text: box.text, start: box.cursor, end: box.cursor, inputText: key }
    const masked = maskEdit(held, edit)
    held = masked.held
    box = masked.box ?? {
      text: edit.text.slice(0, edit.start) + edit.inputText + edit.text.slice(edit.end),
      cursor: edit.start + edit.inputText.length,
    }
  }
  return { box, held }
}

describe('the prompt box', () => {
  test('shows bullets for the value and holds the characters', () => {
    const { box, held } = type('/secret API_KEY sk-abc')
    expect(box.text).toBe(`/secret API_KEY ${MASK.repeat(6)}`)
    expect(held).toBe('sk-abc')
  })

  test('KEY=value is masked as KEY value is', () => {
    const { box, held } = type('/secret API_KEY=sk-abc')
    expect(box.text).toBe(`/secret API_KEY=${MASK.repeat(6)}`)
    expect(held).toBe('sk-abc')
  })

  test('a value after -g or --global is masked too', () => {
    for (const flag of ['-g', '--global']) {
      const { box, held } = type(`/secret ${flag} API_KEY sk-abc`)
      expect(box.text).toBe(`/secret ${flag} API_KEY ${MASK.repeat(6)}`)
      expect(held).toBe('sk-abc')
    }
  })

  test('backspace removes a held character', () => {
    const { box, held } = type('/secret API_KEY sk-abc\b\b')
    expect(box.text).toBe(`/secret API_KEY ${MASK.repeat(4)}`)
    expect(held).toBe('sk-a')
  })

  test('a pasted line is masked whole', () => {
    const masked = maskEdit('', { text: '', start: 0, end: 0, inputText: '/secret TOKEN hunter2 pass' })
    expect(masked.box?.text).toBe(`/secret TOKEN ${MASK.repeat(12)}`)
    expect(masked.held).toBe('hunter2 pass')
  })

  test('editing the key drops the value rather than showing any of it', () => {
    const text = `/secret TOKEN ${MASK.repeat(7)}`
    // Backspace over the space between key and value.
    const masked = maskEdit('a b c d', { text, start: 13, end: 14, inputText: '' })
    expect(masked.held).toBe('')
    expect(masked.box?.text).toBe('/secret TOKEN')
  })

  test('any other draft is left to the editor', () => {
    expect(maskEdit('', { text: 'hello', start: 5, end: 5, inputText: '!' }).box).toBeUndefined()
  })
})

test('an unmasked /secret echo is masked before the model reads it', () => {
  const echo = '<command-name>/secret</command-name>\n<command-args>API_KEY=sk-raw-1234</command-args>'
  expect(maskEcho(echo)).toBe(`<command-name>/secret</command-name>\n<command-args>API_KEY=${MASK.repeat(11)}</command-args>`)
  expect(maskEcho('<command-name>/secret</command-name>\n<command-args>-g API_KEY sk-abc</command-args>')).toBe(`<command-name>/secret</command-name>\n<command-args>-g API_KEY ${MASK.repeat(6)}</command-args>`)
  expect(maskEcho('<command-name>/other</command-name><command-args>A b</command-args>')).toContain('A b')
})

const GLOBAL_DIR = '/home/t/.config/claude-secrets'
// The project of a session in /work/repo/sub, a git repository whose main
// checkout is /work/repo.
const PROJECT_DIR = '/home/t/.config/claude-secrets/projects/-work-repo'
const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const gitRepo = (_: unknown, e: { argv: readonly string[] }) => (e.argv[0] === 'git' ? ok('/work/repo/.git\n/work/repo\n') : undefined)

// A headless session in /work/repo/sub whose ~/.config/claude-secrets holds
// `files`, whose project folder holds `projectFiles` and whose other folders
// (`otherTiers`, by path) hold theirs: the mods read them at session start, as
// they do in a session.
const startWith = async ($: Engine, on: On, files: Record<string, string>, projectFiles: Record<string, string> = {}, otherTiers: Record<string, Record<string, string>> = {}) => {
  const tiers: Record<string, Record<string, string>> = { [GLOBAL_DIR]: files, [PROJECT_DIR]: projectFiles, ...otherTiers }
  const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })
  // A folder's files, and the tiers beneath it as folders.
  const entries = (path: string) => [
    ...Object.keys(tiers[path] ?? {}).map((name) => entry(name, 'file')),
    ...[...new Set(Object.keys(tiers).filter((dir) => dir.startsWith(`${path}/`)).map((dir) => dir.slice(path.length + 1).split('/')[0]!))].map((name) => entry(name, 'dir')),
  ]
  mock.env(on, { HOME: '/home/t' })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => gitRepo(_, e) ?? ok())
  on('fs.exists', (_, e) => ({ value: e.path in tiers && Object.keys(tiers[e.path] ?? {}).length > 0 }))
  on('fs.list', (_, e) => ({ value: entries(e.path) }))
  on('fs.read', (_, e) => {
    const at = e.path.lastIndexOf('/')
    return { value: tiers[e.path.slice(0, at)]?.[e.path.slice(at + 1)] ?? '' }
  })
  await $.session.start({ cwd: '/work/repo/sub', surface: null, isInteractive: false })
}

test('a stored value is scrubbed from a tool result the model would read', async ($, on) => {
  // Nothing beneath keeps a row in a test, so the append itself fails: this
  // hook records what reached the bottom on its way there.
  let kept: unknown
  on('session.append', (_, e, next) => {
    kept = e.message.content[0]?.content
    return next(e)
  })
  await startWith($, on, { API_KEY: 'sk-live-0123456789' })
  await $.session
    .append({
      message: {
        type: 'user',
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Authorization: Bearer sk-live-0123456789' }],
      },
      door: 'tool-result',
      origin: { kind: 'tool', tool: 'Bash' },
      uuid: 'row-1',
    })
    .catch(() => undefined)
  expect(kept).toBe('Authorization: Bearer [secret:API_KEY]')
})

test('a tool record carrying a stored value is recorded scrubbed', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: 'key=sk-live-0123456789', stderr: '', interrupted: false } }))
  await startWith($, on, { API_KEY: 'sk-live-0123456789' })
  const ran = await $.tool.call({ tool: 'Bash', command: 'env' })
  expect(ran.result).toEqual({ stdout: 'key=[secret:API_KEY]', stderr: '', interrupted: false })
})

describe('the field', () => {
  test('reads characters typed after the bullets', () => {
    expect(readField('abc', '•••d')).toBe('abcd')
  })

  test('reads several characters that arrived together, before a redraw', () => {
    expect(readField('abc', '•••de')).toBe('abcde')
    expect(readField('', 'sk-live-1')).toBe('sk-live-1')
  })

  test('backspace at the end drops a character', () => {
    expect(readField('abcd', '•••')).toBe('abc')
  })

  test('an edit inside the bullets cannot be placed', () => {
    expect(readField('abcd', '••x••')).toBeUndefined()
  })
})

test('a value given with the command is refused', async ($) => {
  const ran = await $.command.run({
    command: 'secret',
    args: 'API_KEY sk-in-the-clear',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(ran.text).toContain('Not stored')
})

// Answers the pane's calls and records the write the field's Enter makes.
const storing = (on: On) => {
  const seen: { opened: string; written?: { argv: readonly string[]; stdin?: string }; appended: string[] } = { opened: '', appended: [] }
  mock.env(on, { HOME: '/home/t' })
  on('session.cwd', () => ({ value: '/work/repo/sub' }))
  on('ui.open', (_, e) => {
    seen.opened = e.id
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  // Nothing beneath keeps a row in a test, so the append itself fails; this
  // hook records what reached the bottom on its way there.
  on('session.append', (_, e, next) => {
    const block = e.message.content[0]
    if (block?.type === 'text' && typeof block.text === 'string') seen.appended.push(block.text)
    return next(e)
  })
  on('process.run', (_, e) => {
    const git = gitRepo(_, e)
    if (git) return git
    seen.written = { argv: e.argv, stdin: e.init?.stdin }
    return ok()
  })
  return seen
}

const run = ($: Engine, args: string) =>
  $.command.run({ command: 'secret', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

const typeInField = async ($: Engine, text: string) => {
  const pane = await $.ui.mount({
    plugin: 'cua-mods',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'secret',
    props: { title: 'secret', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 2 }, view: {} },
  })
  await pane.input({ key: 'secret-value', text, kind: 'submit' })
  await pane.unmount()
}

describe('the tiers', () => {
  test('a project is named as Claude Code names its folder under ~/.claude/projects/', () => {
    expect(projectSlug('/Users/dev/Developer/GitHub/MAWS')).toBe('-Users-dev-Developer-GitHub-MAWS')
    expect(projectSlug('/private/tmp/fold-smoke/.claude/worktrees/72-api-architect')).toBe('-private-tmp-fold-smoke--claude-worktrees-72-api-architect')
    // Past 200 characters, the first 200 and a hash of the whole path (the same value src/secrets/store.mjs gives).
    const long = projectSlug(`/Users/dev/${'a'.repeat(120)}/${'b'.repeat(100)}`)
    expect(long.length).toBe(207)
    expect(long.slice(195)).toBe('bbbbb-bt89mn')
  })

  test("a worktree's project is its main checkout; a submodule's is its own top level", () => {
    expect(rootFromGit('/work/repo/.git', '/work/repo')).toBe('/work/repo')
    expect(rootFromGit('/work/repo/.git', '/work/repo-wt')).toBe('/work/repo')
    expect(rootFromGit('/work/super/.git/modules/sub', '/work/super/sub')).toBe('/work/super/sub')
  })

  test('/secret KEY stores in the project, /secret -g KEY and a device credential globally', async ($, on) => {
    const seen = storing(on)
    expect((await run($, 'API_KEY')).text).toContain('for this project')
    await typeInField($, 'sk-project-1')
    expect(seen.written?.argv.slice(-2)).toEqual([PROJECT_DIR, 'API_KEY'])
    expect(seen.appended.at(-1)).toContain('"$(cat ~/.config/claude-secrets/projects/-work-repo/API_KEY)"')

    for (const args of ['-g API_KEY', '--global API_KEY']) {
      expect((await run($, args)).text).toContain('for every project')
      await typeInField($, 'sk-global-1')
      expect(seen.written?.argv.slice(-2)).toEqual([GLOBAL_DIR, 'API_KEY'])
    }

    await run($, 'CUA_DEVICE_abc')
    await typeInField($, 'c'.repeat(64))
    expect(seen.written?.argv.slice(-2)).toEqual([GLOBAL_DIR, 'CUA_DEVICE_abc'])
  })

  // A session whose git answers `answer` (an exit code and its output), then
  // `/secret KEY` and a value in the field: the folder the write went to.
  const storedIn = async ($: Engine, on: On, cwd: string, answer: { exitCode: number; stdout: string }) => {
    let written: readonly string[] | undefined
    mock.env(on, { HOME: '/home/t' })
    on('command.register', (_, e) => ({ value: { command: e.name } }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('fs.exists', () => ({ value: false }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    on('ui.close', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))
    on('session.append', (_, e, next) => next(e))
    on('process.run', (_, e) => {
      if (e.argv[0] === 'git') return { value: { ...answer, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      written = e.argv
      return ok()
    })
    await $.session.start({ cwd, surface: null, isInteractive: false })
    await run($, 'API_KEY')
    await typeInField($, 'sk-value-1')
    return written?.at(-2)
  }

  test('outside a git repository the project is the session directory itself', async ($, on) => {
    expect(await storedIn($, on, '/tmp/plain', { exitCode: 128, stdout: '' })).toBe('/home/t/.config/claude-secrets/projects/-tmp-plain')
  })

  test('a git older than 2.31, which echoes --path-format=absolute back, leaves the session directory as the project', async ($, on) => {
    const old = { exitCode: 0, stdout: '--path-format=absolute\n.git\n/work/repo\n' }
    expect(await storedIn($, on, '/work/repo/sub', old)).toBe('/home/t/.config/claude-secrets/projects/-work-repo-sub')
  })

  test('"projects", in any case, is not a key in either tier', async ($) => {
    for (const args of ['projects', '-g PROJECTS', '--global Projects']) expect((await run($, args)).text).toContain('Not stored')
  })

  test('a value given after -g is refused like any other', async ($) => {
    expect((await run($, '-g API_KEY sk-in-the-clear')).text).toContain('Not stored')
    expect((await run($, '-g')).text).toContain('Usage')
  })

  test('the system prompt lists both tiers, a shadowed global key included', async ($, on) => {
    on('prompt.compose', () => ({ sections: [] }))
    await startWith($, on, { API_KEY: 'sk-global-0123456789', OTHER: 'other-global-value' }, { API_KEY: 'sk-project-0123456789' })
    const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
    const section = composed.sections.find((s) => s.id === 'cua:secrets')
    expect(section?.text.split('\n').slice(1)).toEqual([
      '- API_KEY (project): "$(cat ~/.config/claude-secrets/projects/-work-repo/API_KEY)"',
      '- API_KEY (global, shadowed by the project\'s): "$(cat ~/.config/claude-secrets/API_KEY)"',
      '- OTHER (global): "$(cat ~/.config/claude-secrets/OTHER)"',
    ])
    expect((await run($, '')).text).toBe("Stored: API_KEY (project), API_KEY (global, shadowed by the project's), OTHER (global)")
  })

  test('a value of either tier is scrubbed', async ($, on) => {
    on('tool.call', () => ({ result: { stdout: 'sk-global-0123456789 sk-project-0123456789', stderr: '', interrupted: false } }))
    await startWith($, on, { API_KEY: 'sk-global-0123456789' }, { API_KEY: 'sk-project-0123456789' })
    const ran = await $.tool.call({ tool: 'Bash', command: 'env' })
    // The project's key shadows the global one, whose handle says so (since 0.14.0).
    expect(ran.result).toEqual({ stdout: '[secret:API_KEY@global] [secret:API_KEY]', stderr: '', interrupted: false })
  })
})

test('the field stores what was typed, the last characters and Enter arriving together', async ($, on) => {
  const seen = storing(on)

  await $.command.run({ command: 'secret', args: 'API_KEY', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect(seen.opened).toBe('secret')
  const pane = await $.ui.mount({
    plugin: 'cua-mods',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'secret',
    props: { title: 'secret API_KEY', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 2 }, view: {} },
  })
  await pane.input({ key: 'secret-value', text: 'sk-l', kind: 'change' })
  expect((await pane.find({ key: 'secret-value' }))?.props?.value).toBe('••••')
  // The rest of the value and Enter arrive together.
  await pane.input({ key: 'secret-value', text: '••••ive-9', kind: 'submit' })

  expect(seen.written?.argv.slice(-2)).toEqual([PROJECT_DIR, 'API_KEY'])
  expect(seen.written?.stdin).toBe('sk-live-9')
})

const STORED = 'sk-live-0123456789'
const bash = (stdout: string) => ({ stdout, stderr: '', interrupted: false })

// The bottom of `tool.call`: records each call that ran and prints `stdout`.
const printing = (on: On, stdout: string) => {
  const ran: Record<string, unknown>[] = []
  on('tool.call', (_, e) => {
    ran.push(e as Record<string, unknown>)
    return { result: bash(stdout) }
  })
  return ran
}

// Until 0.14.0 cua refused each of these before it ran.
describe('redact, never refuse', () => {
  test('a command that reads the store runs, and the value it prints reaches the model as its handle', async ($, on) => {
    const ran = printing(on, `${STORED}\n`)
    await startWith($, on, { API_KEY: STORED }, { API_KEY: 'sk-project-0123456789' })
    for (const command of [
      'cat ~/.config/claude-secrets/API_KEY',
      'ls -la ~/.config/claude-secrets',
      'xxd /Users/u/.config/claude-secrets/API_KEY',
      'echo ok; cat ~/.config/claude-secrets/API_KEY | head -c 4',
      'ls ~/.config/claude-secrets/projects',
      'cat ~/.config/claude-secrets/projects/-Users-u-repo/API_KEY',
      'echo "$(cat ~/.config/claude-secrets/projects/-Users-u-repo/API_KEY)" ; ls ~/.config/claude-secrets/projects/-Users-u-repo',
    ]) {
      const call = await $.tool.call({ tool: 'Bash', command })
      expect(call.deny).toBeUndefined()
      // The project's API_KEY shadows the global one, whose handle says so.
      expect(call.result).toEqual(bash('[secret:API_KEY@global]\n'))
    }
    expect(ran).toHaveLength(7)
  })

  test('mv, test -f and writing a new file in the store run', async ($, on) => {
    const ran = printing(on, '')
    await startWith($, on, { API_KEY: STORED })
    for (const command of ['mv ~/.config/claude-secrets/API_KEY ~/.config/claude-secrets/OLD_KEY', 'test -f ~/.config/claude-secrets/OLD_KEY']) {
      expect((await $.tool.call({ tool: 'Bash', command })).deny).toBeUndefined()
    }
    expect((await $.tool.call({ tool: 'Write', file_path: `${GLOBAL_DIR}/NEW_KEY`, content: 'new-value-0123' } as never)).deny).toBeUndefined()
    expect(ran).toHaveLength(3)
  })

  test('a command using a value through the substitution form runs as written', async ($, on) => {
    const ran = printing(on, 'ok')
    await startWith($, on, { API_KEY: STORED })
    // The client registration `cua remote enroll --json` prints (clientRegisterCommand).
    const register = 'claude mcp add --transport http cua_repl https://relay.example/d/a-b_c/mcp --header "Authorization: Bearer $(cat ~/.config/claude-secrets/CUA_DEVICE_a_b_c)"'
    const commands = ['curl -H "Authorization: Bearer $(cat ~/.config/claude-secrets/API_KEY)" https://x', register]
    for (const command of commands) expect((await $.tool.call({ tool: 'Bash', command })).deny).toBeUndefined()
    expect(ran.map((e) => e.command)).toEqual(commands)
  })

  test('a file tool pointed into the store runs', async ($, on) => {
    const ran = printing(on, '')
    await startWith($, on, { API_KEY: STORED })
    for (const input of [
      { tool: 'Read', file_path: `${GLOBAL_DIR}/API_KEY` },
      { tool: 'Glob', pattern: `${GLOBAL_DIR}/*` },
      { tool: 'Read', file_path: `${PROJECT_DIR}/API_KEY` },
    ]) {
      expect((await $.tool.call(input as never)).deny).toBeUndefined()
    }
    expect(ran).toHaveLength(3)
  })

  test("another project's stored value is redacted under its own handle", async ($, on) => {
    printing(on, 'sk-other-0123456789\n')
    await startWith($, on, {}, { API_KEY: 'sk-project-0123456789' }, { [`${GLOBAL_DIR}/projects/-work-other`]: { API_KEY: 'sk-other-0123456789' } })
    const call = await $.tool.call({ tool: 'Bash', command: 'curl -H "X: $(cat ~/.config/claude-secrets/projects/-work-other/API_KEY)" https://x' })
    expect(call.deny).toBeUndefined()
    expect(call.result).toEqual(bash('[secret:API_KEY@-work-other]\n'))
  })
})

// A read of devcloud's marker (Interfaces I9), answered beneath every plugin:
// `{ value, version }` as it resolves (version 0 is a hook's answer, as
// devcloud's loaded module gives it; 1 a value the host stores), or a function,
// which makes the read throw.
const markerRead = (on: On, read: { value: unknown; version: number } | (() => never)) => {
  on('state.get', (_, e) => {
    if (e.plugin !== 'devcloud' || e.key !== 'secrets-guard') return { value: { value: undefined, version: 0 } } as never
    if (typeof read === 'function') read()
    return { value: read } as never
  })
}

/**
 * devcloud's plugin loaded beside cua, as devcloud 0.5.0 behaves toward it:
 * its module answers the marker's read at version 0, and its guard scrubs the
 * stored value to `{devcloud}` in a tool's result, a kept row and the system
 * prompt (a stand-in, so what each guard did can be told apart). In the
 * prepend tier it sits outside cua, in append inside it. An inline plugin runs
 * in a module of its own, so its source spells the value it scrubs.
 */
const devcloudLoaded = (tier: 'prepend' | 'append') => ({
  name: 'devcloud',
  tier,
  register: (on: On) => {
    on('state.get', { plugin: 'devcloud', key: 'secrets-guard' }, () => ({ value: { value: { owner: 'devcloud', version: 1 }, version: 0 } }))
    on('tool.call', async (_, e, next) => {
      const ran = await next(e)
      return 'result' in ran ? { result: JSON.parse(JSON.stringify(ran.result).replaceAll('sk-live-0123456789', '{devcloud}')) } : ran
    })
    on('session.append', (_, e, next) => next(JSON.parse(JSON.stringify(e).replaceAll('sk-live-0123456789', '{devcloud}'))))
    on('prompt.compose', async (_, e, next) => {
      const composed = await next(e)
      return { sections: composed.sections.map((s) => ({ ...s, text: s.text.replaceAll('sk-live-0123456789', '{devcloud}') })) }
    })
  },
})

describe("one guard per session: cua's stands down only on devcloud's live answer (Interfaces I9)", () => {
  const exact = { owner: 'devcloud', version: 1 }
  // A tool result, a write through a handle, a kept row and the system prompt,
  // each where one guard's work shows: `{devcloud}` is devcloud's scrub,
  // `[secret:API_KEY]` cua's, a restored write and a `cua:secrets-guard`
  // section cua's alone.
  const session = async ($: Engine, on: On) => {
    const ran = printing(on, STORED)
    let kept: unknown
    on('session.append', (_, e, next) => {
      kept = e.message.content[0]?.content
      return next(e)
    })
    on('prompt.compose', () => ({ sections: [{ id: 'other:notes', text: `use ${STORED}`, scope: 'session' as const }] }))
    await startWith($, on, { API_KEY: STORED })
    const result = (await $.tool.call({ tool: 'Bash', command: 'env' })).result
    await $.tool.call({ tool: 'Write', file_path: '/work/repo/f', content: '[secret:API_KEY]' } as never)
    await $.session
      .append({
        message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: `Bearer ${STORED}` }] },
        door: 'tool-result',
        origin: { kind: 'tool', tool: 'Bash' },
        uuid: 'row-1',
      })
      .catch(() => undefined)
    const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
    // `cua:secrets`, /secret's list of the stored keys, is cua's own whichever guard acts.
    return { result, written: ran[1]?.content, kept, sections: composed.sections.filter((s) => s.id !== 'cua:secrets').map((s) => [s.id, s.text]) }
  }

  test('cua alone, from session start: it writes no marker and redacts a stored value', async ($, on) => {
    const set: unknown[] = []
    on('state.set', (_, e) => {
      set.push({ plugin: e.plugin, key: e.key })
      return { value: { isSet: true, version: 1 } } as never
    })
    printing(on, STORED)
    on('prompt.compose', () => ({ sections: [] }))
    await startWith($, on, { API_KEY: STORED })
    expect((await $.tool.call({ tool: 'Bash', command: 'env' })).result).toEqual(bash('[secret:API_KEY]'))
    const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
    expect(composed.sections.some((s) => s.id === 'cua:secrets-guard')).toBe(true)
    expect(set).toEqual([])
  })

  for (const [tier, place] of [['prepend', 'outside'], ['append', 'inside']] as const) {
    test(`devcloud loaded ${place} cua: each of cua's guard's hooks passes the event on, and devcloud's guard alone scrubs`, { plugins: [devcloudLoaded(tier)] }, async ($, on) => {
      expect(await session($, on)).toEqual({
        result: bash('{devcloud}'),
        written: '[secret:API_KEY]',
        kept: 'Bearer {devcloud}',
        sections: [['other:notes', 'use {devcloud}']],
      })
    })
  }

  // doperpowers board #101: the host keeps a plugin's state after its module unloads, so a
  // devcloud before 0.5.0, disabled mid-session and reloaded away, leaves the
  // marker it stored at its start, at version 1, and no guard of its own.
  test("devcloud gone after a reload, the marker an older devcloud stored still held: cua's guard acts", async ($, on) => {
    markerRead(on, { value: exact, version: 1 })
    expect(await session($, on)).toEqual({
      result: bash('[secret:API_KEY]'),
      written: STORED,
      kept: 'Bearer [secret:API_KEY]',
      sections: [
        ['other:notes', 'use [secret:API_KEY]'],
        ['cua:secrets-guard', expect.stringContaining('[secret:KEY]')],
      ],
    })
  })

  for (const [name, read] of [
    ['nothing stored', { value: undefined, version: 0 }],
    ['a malformed marker', { value: 'devcloud', version: 0 }],
    ['another owner', { value: { owner: 'other', version: 1 }, version: 0 }],
    ['an unknown version', { value: { owner: 'devcloud', version: 2 }, version: 0 }],
    ['an extra field', { value: { owner: 'devcloud', version: 1, extra: true }, version: 0 }],
    ['a read that throws', () => { throw new Error('state.get failed') }],
  ] as const) {
    test(`${name}: the guard redacts`, async ($, on) => {
      markerRead(on, read)
      printing(on, STORED)
      await startWith($, on, { API_KEY: STORED })
      expect((await $.tool.call({ tool: 'Bash', command: 'env' })).result).toEqual(bash('[secret:API_KEY]'))
    })
  }

  test('only the exact marker is one', () => {
    expect(isDevcloudMarker(exact)).toBe(true)
    for (const value of [undefined, null, [], 'devcloud', { owner: 'devcloud' }, { owner: 'devcloud', version: '1' }, { owner: 'Devcloud', version: 1 }]) {
      expect(isDevcloudMarker(value)).toBe(false)
    }
  })
})

test('a value printed in base64 or hex is scrubbed too', async ($, on) => {
  on('tool.call', () => ({
    result: { stdout: 'c2stbGl2ZS0wMTIzNDU2Nzg5 736b2d6c6976652d30313233343536373839', stderr: '', interrupted: false },
  }))
  await startWith($, on, { API_KEY: 'sk-live-0123456789' })
  const ran = await $.tool.call({ tool: 'Bash', command: 'env' })
  // Since 0.14.0 each spelling has a handle of its own, which restores to it on write.
  expect(ran.result).toEqual({ stdout: '[secret:API_KEY~b64] [secret:API_KEY~hex]', stderr: '', interrupted: false })
})

// A `/secret` echo whose value was never stored (refused, typed in the box)
// and is shaped like no token: only the echo's own mask hides it.
describe("a /secret echo a tool reads back is masked, whichever guard holds the session", () => {
  const UNSTORED = 'zq unstored 77'
  const echo = `<command-name>/secret</command-name>\n<command-args>OTHER_KEY ${UNSTORED}</command-args>`
  const masked = `<command-name>/secret</command-name>\n<command-args>OTHER_KEY ${MASK.repeat(UNSTORED.length)}</command-args>`
  // A Read of a transcript or history export that holds the echo, beside a stored value's base64.
  const read = (on: On) =>
    on('tool.call', (_, e) => ({
      result: { type: 'text', file: { filePath: e.file_path, content: `${echo}\n${btoa(STORED)}`, numLines: 3, startLine: 1, totalLines: 3 } } as never,
    }))
  const fileOf = (call: { result?: unknown }) => (call.result as { file: { content: string } }).file.content

  test('in a nested tool result the conversation keeps', async ($, on) => {
    let kept: unknown
    on('session.append', (_, e, next) => {
      kept = e.message.content[0]?.content
      return next(e)
    })
    await startWith($, on, { API_KEY: STORED })
    await $.session
      .append({
        message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: `history: ${echo}` }] }] },
        door: 'tool-result',
        origin: { kind: 'tool', tool: 'Read' },
        uuid: 'row-1',
      } as never)
      .catch(() => undefined)
    expect(kept).toEqual([{ type: 'text', text: `history: ${masked}` }])
  })

  test("in a Read's result and record, a stored value's handle beside it intact", async ($, on) => {
    read(on)
    await startWith($, on, { API_KEY: STORED })
    const call = await $.tool.call({ tool: 'Read', file_path: '/work/repo/history.jsonl' } as never)
    expect(fileOf(call)).toBe(`${masked}\n[secret:API_KEY~b64]`)
  })

  test("with devcloud's guard loaded, the echo is still masked and the rest left to devcloud", async ($, on) => {
    markerRead(on, { value: { owner: 'devcloud', version: 1 }, version: 0 })
    read(on)
    await startWith($, on, { API_KEY: STORED })
    const call = await $.tool.call({ tool: 'Read', file_path: '/work/repo/history.jsonl' } as never)
    expect(fileOf(call)).toBe(`${masked}\n${btoa(STORED)}`)
  })
})
