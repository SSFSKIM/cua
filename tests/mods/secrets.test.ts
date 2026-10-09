import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { MASK, guardReason, maskEcho, maskEdit, projectSlug, readField, rootFromGit, substitutionFor } from '../../hooks/mods/secrets'

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
// `files` and whose project folder holds `projectFiles`: the mod reads both at
// session start, as it does in a session.
const startWith = async ($: Engine, on: On, files: Record<string, string>, projectFiles: Record<string, string> = {}) => {
  const tiers: Record<string, Record<string, string>> = { [GLOBAL_DIR]: files, [PROJECT_DIR]: projectFiles }
  const entries = (names: Record<string, string>) => Object.keys(names).map((name) => ({ name, kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false }))
  mock.env(on, { HOME: '/home/t' })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => gitRepo(_, e) ?? ok())
  on('fs.exists', (_, e) => ({ value: e.path in tiers && Object.keys(tiers[e.path] ?? {}).length > 0 }))
  on('fs.list', (_, e) => ({ value: entries(tiers[e.path] ?? {}) }))
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
    expect(projectSlug('/Users/new/Developer/GitHub/MAWS')).toBe('-Users-new-Developer-GitHub-MAWS')
    expect(projectSlug('/private/tmp/fold-smoke/.claude/worktrees/72-api-architect')).toBe('-private-tmp-fold-smoke--claude-worktrees-72-api-architect')
    // Past 200 characters, the first 200 and a hash of the whole path (the same value src/secrets/store.mjs gives).
    const long = projectSlug(`/Users/new/${'a'.repeat(120)}/${'b'.repeat(100)}`)
    expect(long.length).toBe(207)
    expect(long.slice(195)).toBe('bbbbb-iqtzp2')
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
    expect(ran.result).toEqual({ stdout: '[secret:API_KEY] [secret:API_KEY]', stderr: '', interrupted: false })
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

describe('the guard', () => {
  test('lets a command use a value through the substitution form', () => {
    expect(guardReason({ tool: 'Bash', command: 'curl -H "Authorization: Bearer $(cat ~/.config/claude-secrets/API_KEY)" https://x' })).toBeUndefined()
    expect(guardReason({ tool: 'Bash', command: 'K="$(cat "$HOME"/.config/claude-secrets/API_KEY)" ./run' })).toBeUndefined()
    // The client registration `cua remote enroll --json` prints (clientRegisterCommand).
    const register = 'claude mcp add --transport http cua_repl https://relay.example/d/a-b_c/mcp --header "Authorization: Bearer $(cat ~/.config/claude-secrets/CUA_DEVICE_a_b_c)"'
    expect(guardReason({ tool: 'Bash', command: register })).toBeUndefined()
  })

  test("admits the session's own project tier in that form, and no other project's", () => {
    const own = 'curl -H "X-Key: $(cat ~/.config/claude-secrets/projects/-Users-u-repo/API_KEY)" https://x'
    const other = 'curl -H "X-Key: $(cat ~/.config/claude-secrets/projects/-Users-u-other/API_KEY)" https://x'
    const form = substitutionFor('-Users-u-repo')
    expect(guardReason({ tool: 'Bash', command: own }, form)).toBeUndefined()
    expect(guardReason({ tool: 'Bash', command: '$(cat ~/.config/claude-secrets/GLOBAL_KEY)' }, form)).toBeUndefined()
    expect(guardReason({ tool: 'Bash', command: other }, form)).toContain('not for reading')
    // Before a project is known, only the global tier.
    expect(guardReason({ tool: 'Bash', command: own }, substitutionFor())).toContain('not for reading')
  })

  test("in a session, a command naming another project's secret is refused before it runs", async ($, on) => {
    let ran = 0
    on('tool.call', () => {
      ran++
      return { result: { stdout: '', stderr: '', interrupted: false } }
    })
    await startWith($, on, {}, { API_KEY: 'sk-project-0123456789' })
    const own = await $.tool.call({ tool: 'Bash', command: 'curl -H "X: $(cat ~/.config/claude-secrets/projects/-work-repo/API_KEY)" https://x' })
    expect(own.deny).toBeUndefined()
    const other = await $.tool.call({ tool: 'Bash', command: 'curl -H "X: $(cat ~/.config/claude-secrets/projects/-work-other/API_KEY)" https://x' })
    expect(other.deny).toContain('not for reading')
    expect(ran).toBe(1)
  })

  test('refuses a command that reads the store', () => {
    for (const command of [
      'cat ~/.config/claude-secrets/API_KEY',
      'ls -la ~/.config/claude-secrets',
      'xxd /Users/u/.config/claude-secrets/API_KEY',
      'echo ok; cat ~/.config/claude-secrets/API_KEY | head -c 4',
      'ls ~/.config/claude-secrets/projects',
      'cat ~/.config/claude-secrets/projects/-Users-u-repo/API_KEY',
      'echo "$(cat ~/.config/claude-secrets/projects/-Users-u-repo/API_KEY)" ; ls ~/.config/claude-secrets/projects/-Users-u-repo',
    ]) {
      expect(guardReason({ tool: 'Bash', command })).toContain('not for reading')
    }
  })

  test('refuses a file tool pointed into the store, not text that names it', () => {
    expect(guardReason({ tool: 'Read', file_path: '/Users/u/.config/claude-secrets/API_KEY' })).toBeDefined()
    expect(guardReason({ tool: 'Glob', pattern: '/Users/u/.config/claude-secrets/*' })).toBeDefined()
    expect(guardReason({ tool: 'Read', file_path: '/Users/u/.config/claude-secrets/projects/-Users-u-repo/API_KEY' })).toBeDefined()
    expect(guardReason({ tool: 'Grep', pattern: 'claude-secrets', path: '/repo' })).toBeUndefined()
    expect(guardReason({ tool: 'Write', file_path: '/repo/run.sh', content: 'cat ~/.config/claude-secrets/API_KEY' })).toBeUndefined()
  })
})

test('a value printed in base64 or hex is scrubbed too', async ($, on) => {
  on('tool.call', () => ({
    result: { stdout: 'c2stbGl2ZS0wMTIzNDU2Nzg5 736b2d6c6976652d30313233343536373839', stderr: '', interrupted: false },
  }))
  await startWith($, on, { API_KEY: 'sk-live-0123456789' })
  const ran = await $.tool.call({ tool: 'Bash', command: 'env' })
  expect(ran.result).toEqual({ stdout: '[secret:API_KEY] [secret:API_KEY]', stderr: '', interrupted: false })
})

test('a read of the store is refused before it runs', async ($, on) => {
  let ran = false
  on('tool.call', () => {
    ran = true
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  const call = await $.tool.call({ tool: 'Bash', command: 'cat ~/.config/claude-secrets/API_KEY' })
  expect(call.deny).toContain('not for reading')
  expect(ran).toBe(false)
})
