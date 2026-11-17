# Provenance of the first-call documents

Ported from readable chatgpt-26.928.40906 `R/cua_node/@oai/cua/docs/` for
`docs/doperpowers/specs/2026-10-14-own-repl-host-design.md` (M3, CoreDocumentation; Design "Owned facade and first-call
documentation"). The facade (`src/cua-api/documentation.mjs`) reads these files and emits their bytes as they are, so a
source comment cannot go inside them; this file carries it instead.

| File | Readable source | Use |
|---|---|---|
| `core.md` | `docs/tinysky-alt-core-cua-repl.md:1-214` | the first-call document (`cua.core`), followed by one confirmations policy |
| `confirmations.md` | `docs/tinysky-alt-confirmations.md:1-78` | the bundled "Computer Use Confirmations Policy", appended to `core.md` unless the request's metadata supplies a valid override |
| `other-browser-apis.md` | `docs/tinysky-alt-other-browser-apis.md:1-18` | the auxiliary "Other Browser APIs" document, emitted once before the first selected browser's documentation |
| `agent-cursor.md` | none: cua's own text (the surface inventory's "Table 3 addition (2026-10-30, #235)", its second paragraph the "Table 3 additions (2026-11-05, #282 and #283)" as amended by "(2026-11-07, #315)" and "(2026-11-08, #318)", with a sentence from "(2026-11-16, #360)" and its last from "(2026-11-17, #366)" as amended by "(2026-11-17, #366, ruling 775)", its third the "Table 3 addition (2026-11-06, #296)" with its second half from "(2026-11-08, #316)" as amended by "(2026-11-08, #330)" and "(2026-11-09, #298)", its fourth the "Table 3 addition (2026-11-08, #328)" with its Show Menu sentences from "(2026-11-15, #374)", its set_value sentence from the "(2026-11-17, #366, ruling 772)" and its last from "(2026-11-17, #390)", and its fifth the "Table 3 addition (2026-11-06, #301)" with its last sentences from "(2026-11-16, #367)" as amended by "(2026-11-17, #367, ruling 1ea561bc:782)", and its sixth the "Table 3 addition (2026-11-10, #354)" as amended by "(2026-11-10, #354, ruling 1ea561bc:589)" , "(2026-11-10, #354, ruling 1ea561bc:593)", "(2026-11-15, #354, ruling 1ea561bc:737)", "(2026-11-15, #354, ruling 1ea561bc:738)", "(2026-11-16, #354, ruling 1ea561bc:754)", "(2026-11-16, #354, ruling 1ea561bc:761)" and "(2026-11-17, #354, ruling 1ea561bc:765)") | what the person sees while the agent acts, the engine's background-click refusal, text-field focus and `clickUnconfirmed`, background Firefox's focus before an arrow key, a first observation's wait in a Chromium app, its stale-point refusal and what that refusal cannot see, its refusal of a point outside the screenshot, its scroll answers, its Show Menu answer, set_value's `valueUnconfirmed` and its read-back in a background Chromium page, its truncation marker, the line of a window off screen and `windowOnAnotherSpace`, and typed text's read-back and `typeUnconfirmed`, read after `core.md` and before the policy only where the facade's computer surface is macOS's (`src/cua-api/documentation.mjs`): there cua's host serves only cua's own engine, whose agent cursor it describes (`docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md`) |

`confirmations.md` and `other-browser-apis.md` are byte-for-byte copies. `core.md` is the vendor document with exactly
the edits of the surface inventory's Tables 2 and 3
(`docs/doperpowers/research/2026-10-14-own-repl-host/surface-inventory.md`): the `"iab"` and `"mcpapps"` browser types
and `codexSessionId` (:66, :68), the `"windows"` target (:128), the MCP App tabs paragraph (:154), and the Windows words,
clauses and sentences at :160, :162, :164, :170, :198, :204, :205 and :206, and the Orbit new-tab page clause (:175).
After those deletions, the surface inventory's "Table 3 amendment (2026-10-15, owner ruling)" repairs the grammar of the
two sentences they broke: "Linux always return" becomes "Linux always returns" (:170), and "Linux app `paste` support
only `text` and use" becomes "supports … uses" (:204). Product names appear in the vendor's prose only inside the
removed text, so no rename remains. Everything else is the vendor's wording. `test/cua-api/core-documentation.test.mjs`
applies the same edits, then the amendment, to the pinned vendor documents (SHA-256-checked copies under
`test/cua-api/fixtures/vendor-docs/`) and requires these bytes.

Not ported: `docs/tinysky-alt-core-node-repl.md`, the dormant alternate first-call document (Table 2). #120's
clean-room rewrite replaces these copies before distribution.
