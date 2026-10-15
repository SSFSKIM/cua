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
