# cua

A standalone MCP server (`cua serve`) that lets Claude Code drive OpenAI's computer-use runtime (`cua_repl`) without the
Codex/ChatGPT desktop app: the pinned vendor release relocated under `CUA_HOME`, Keychain-backed `{{secret:<label>}}`
substitution through a trusted helper, and the user's existing Chrome profiles through the original OpenAI extension
and host. The living spec is `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md` (Decision Log newest-first;
Surprises & Discoveries for observations). Phase reports and residue live beside it; live-run evidence under
`docs/evidence/`; narrow debts in `tech-debt-tracker.md`. The plugin bundles the server with the `cua-remote` skill
(`skills/cua-remote/SKILL.md`: onboard a device, connect a client to it) and the `/secret` mod (`hooks/mods/`, tests
`npm run test:mods`).

Working rules:
- The vendor runtime is unmodified and version-pinned; cua wraps it and never patches it. Verify runtime claims against
  a live probe or the readable vendor source (`--readable-source`), not against the spec alone.
- Never read or print `auth.json`, `PLAYWRIGHT_MCP_EXTENSION_TOKEN`, or any secret value; `codex login` runs only as
  `cua login`. Never kill Chrome, the ChatGPT app or their hosts; never click or edit TCC consent; stop on any password
  prompt.
- Keychain access and permission dialogs need the GUI login session: run secret-bearing or live steps from the console,
  not over SSH. A terminal without Full Disk Access cannot read Chrome's user-data directory on macOS 27.
- Board Write Hard Gate: issue creation and every state/edge change MUST go through the doperpowers issue-tracker
  scripts, never raw `gh issue edit` for `status:*` labels or sub-issue/dependency edges. At registration, category +
  status + parent + blocked-by are each either set or consciously N/A; silence is not N/A.
