# Provenance of the own host's tool text and banner

Ported from readable chatgpt-26.928.40906 `R/cua_node/@oai/cua-repl/instructions/` for
`docs/doperpowers/specs/2026-10-14-own-repl-host-design.md` (M2: the effective retained tool text and the temporary
banner). The files beside this one are byte-for-byte copies of the pinned runtime's
`@oai/cua-repl/instructions/` (26.928.40906), whose content equals the readable tree's; the readable `banner.js` carries
only an added `// source:` decompiler line, which the copy here does not. A source comment cannot go inside them: each
file's bytes, trailing whitespace trimmed, are the text the model reads.

| File | Readable source | Use |
|---|---|---|
| `macos/description.md`, `linux/description.md` | `instructions/{macos,linux}/description.md:1-11` | `js` description, first part |
| `macos/browser.md`, `linux/browser.md` | `instructions/{macos,linux}/browser.md:1-44` | with the browser surface |
| `macos/computer.md`, `linux/computer.md` | `instructions/{macos,linux}/computer.md:1-5` | with the computer surface |
| `macos/output.md`, `linux/output.md` | `instructions/{macos,linux}/output.md:1-3` | `js` description, last part |
| `browser-disabled.md`, `computer-disabled.md` | `instructions/*-disabled.md:1` | in place of a disabled surface's part |
| `code.md` | `instructions/code.md:1` | `js` `code` field description |
| `reset.md` | `instructions/reset.md:1` | `js_reset` description |
| `server.md` | `instructions/server.md:1` | server instructions |
| `banner.js` | `instructions/banner.js:2` | first-cell banner: imports the unmodified vendor facade (M2 only; M3 switches it to `src/cua-api/bootstrap.mjs`) |

How they are assembled is `R/cua_node/@oai/cua-repl/dist/lib/js/oai_js_cua_repl/src/launch.js:15-60` and
`instructions.js:3-29`, ported in `../instructions.mjs`. Not ported: the cloud-browser variants
(`browser-cloud*.md`, surface inventory Table 2) and the Windows directory (not an enabled platform). The copies stay
verbatim; the approved exclusion edits of `browser.md` (surface inventory Table 2, the "documentation text edit" rows for
`cua-repl/instructions/{linux,macos}/browser.md:10,22,25,42,43`: the in-app browser and MCP Apps instructions) are
applied by `../instructions.mjs` (`BROWSER_EDITS`), each to exactly one occurrence, so the served text is a
deterministic transformation of the vendor bytes. #120's clean-room rewrite replaces these copies before distribution.
