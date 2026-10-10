# peer-auth: the peer identity addon

`peer-auth.c` is a Node-API addon of three system calls that tells a Unix-domain socket's server who is on the other end:
`peer(fd)` (the peer's pid through `LOCAL_PEERPID` and its uid through `getpeereid`), `process(pid)` (its parent and start
time through `proc_pidinfo`) and `version`. The policy over it, whether the peer descends from a known process instance,
lives in `src/chrome/peer.mjs` and guards the client-mode relay socket. MAWS carries the same addon for its per-session
browser socket (`native/peer-auth/` and `src/main/browser/cua/peer.ts` there). The design is
`docs/doperpowers/specs/2026-10-09-maws-socket-peer-auth-design.md`.

`prebuilds/darwin-arm64/peer-auth.node` is committed and shipped (`package.json` `files`): Node-API is ABI-stable, so the
one file loads under any Node that runs cua, and a checkout needs no compiler. Off Apple silicon macOS the loader reports
the addon unavailable without trying. If it is missing or fails to load, the relay refuses every peer
(`module_unavailable`).

## Rebuilding

Only when `peer-auth.c` changes, on an Apple silicon Mac with the Xcode command line tools, after `npm install` (the
headers come from the `node-api-headers` devDependency):

```sh
scripts/build-peer-auth.sh   # prints the prebuild's path
```

Then keep the two repositories in step:

1. If an export changed shape or meaning, bump `PEER_AUTH_VERSION` in `peer-auth.c` and in both loaders
   (`src/chrome/peer.mjs` here, `src/main/browser/cua/peer.ts` in MAWS).
2. Copy `peer-auth.c` and `prebuilds/darwin-arm64/peer-auth.node` to MAWS's `native/peer-auth/`. The two copies of the
   source must be byte-identical; the build fixes the install name, so either repository builds the same bytes.
3. Update `PEER_AUTH_SOURCE_SHA256` (the source's `shasum -a 256`) in `test/chrome-peer.test.mjs` here and in MAWS's
   `src/main/browser/cua/peer.test.ts`; each test fails until its repository's copy matches the pinned hash.
