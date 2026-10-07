# cua's own Chrome extension on Linux: a self-hosted CRX force-installed by policy, no sign-in (H4, acceptance 7)

Spec: `docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md`, H4 and acceptance 7. Branch `wip/h4-linux`
(off `b672355`). The CRX was packed on the owner's Mac with the owner's key (`CUA_EXTENSION_KEY`, used only as the
packer's input) and published on the relay; two Linux machines then ran the cua route with no ChatGPT sign-in and no
`cua login`.

| Item | Result |
|---|---|
| Pack | **PASS**. `node scripts/extension-pack.mjs` → `dist/cua-extension-0.1.0.crx` (CRX3, 10 931 bytes) and `dist/update.xml`, id `jkejaaijdfpohkdhankllbekkhmnippb` (= `CUA_EXTENSION_ID`); `dist/` is git-ignored |
| Publish | **PASS**. `relay/deploy/update.sh --host 178.104.102.73 --ext dist`: the CRX, then `update.xml`, under `/var/lib/cua-relay/ext`; the Caddyfile's new `/ext/` route validated and installed, Caddy reloaded; `cua-relay` not restarted (active since 06:15:24 UTC before and after). `https://178-104-102-73.sslip.io/ext/update.xml` 200 `text/xml`; the CRX 200 `application/x-chrome-extension`, byte-identical to `dist/`; `/d/x/mcp` still 401 |
| Remote HTTPS force-install (the gate) | **PASS**. Branded Chrome 154 (Tart VM, aarch64) and 155 (Hetzner, x86_64) installed the CRX from the relay's HTTPS update URL |
| Tart VM `cua-linux` | **PASS** for every browser row; doctor `ok:false` only from `agent.enrolled` (below) |
| Hetzner, `create-hetzner.sh --extension hosted` | **PASS**. From nothing to doctor `ok: true` in 3 min 45 s, `chrome.hosts.live: pass (1)`, `codex.login: skip`; checklist "none: the device is ready"; `verify.mjs` exit 0, `problems: []`; `linux-chrome.mjs` PASS; a re-run in 9 s, unchanged |
| Cleanup | `cua-h4-accept` (169221703) deleted; `hcloud server list` (context `cua`) shows only `cua-relay` |

## The gate: remote HTTPS force-install (Tart VM, 2026-10-07 12:54 UTC)

- The VM's one managed policy file `/etc/opt/chrome/policies/managed/cua.json` gained the cua entry beside OpenAI's
  (one `ExtensionInstallForcelist`, never a second file): `["hehggadaopoacecdllhhajmbjkdcmajg;https://clients2.google.com/service/update2/crx",
  "jkejaaijdfpohkdhankllbekkhmnippb;https://178-104-102-73.sslip.io/ext/update.xml"]` (previous file kept at
  `/tmp/cua-policy-before-h4.json` on the VM). Written 12:54:46.
- Relay access log: 12:54:52 `GET /ext/update.xml?os=linux&arch=arm64&prod=chromecrx&prodversion=154.0.8037.97&acceptformat=crx3,puff&x=id%3Djkejaaijdfpohkdhankllbekkhmnippb%26v%3D0.0.0.0%26installsource%3Dnotf…`
  200, then 12:54:53 `GET /ext/cua-extension-0.1.0.crx` 200 (Chrome's user agent): 6 s from the policy write, no
  restart.
- Chrome had only `Profile 2` loaded at the time; the extension appeared there at once. `Default` was loaded with
  `google-chrome --profile-directory=Default about:blank` at 12:59:19 and had `Extensions/jkejaaijdfpohkdhankllbekkhmnippb/`
  within 3 s (the stale `crx-probe` extension of the earlier gate measurement left `Default` at the same load). The
  installed manifest carries version `0.1.0` and `update_url` `https://178-104-102-73.sslip.io/ext/update.xml`.

## Tart VM `cua-linux` (aarch64, Chrome 154), 2026-10-07 12:57–13:03 UTC

The checkout `~/cua` was moved to the branch from a git bundle (`a1870fb..wip/h4-linux`, no push). A dedicated home,
`CUA_HOME=/home/admin/.local/share/cua-h4`, so the negative control is clean and the default home (bound on the vendor
route, used by the VM's relay agent from `~/cua-58`) is untouched. Both routes now coexist on the VM: OpenAI's
extension still talks to the default home's vendor host, cua's to this home's launcher.

- `cua install --archive ~/mirror/chatgpt_26.928.40906_arm64.deb` ok; `test ! -e $CUA_HOME/state/codex/auth.json` (before
  and after the run).
- `cua chrome register` → `chrome placed …/NativeMessagingHosts/io.github.ssfskim.cua.json`, "previous launcher recorded:
  none". Within 5 s `Profile 2`'s extension (retrying every 5 s) started a host; after `Default` loaded, a second.
- `cua profiles add me --chrome-profile Default`; `cua profiles bind me` → "bound me to extension instance
  ee43424f-… (this profile directory's extension store records exactly this live backend)", the `Profile 2` backend
  listed as another profile's. `cua profiles list` → `me ready Default`.
- `cua doctor --json`: `codex.login` skip ("not needed: the cua extension route needs no Codex login …"),
  `chrome.extension.me` pass, `chrome.host.registered` pass (`cua: io.github.ssfskim.cua names this home's launcher …`),
  `chrome.hosts.live` pass (**2**: `Default` and `Profile 2` are both loaded on this VM; one per loaded profile is the
  design). `ok: false` from one row only: `agent.enrolled` fail, because the user's `cua-agent.service` belongs to the
  default home and this home is not enrolled (an artifact of the dedicated home, not of the route; every other row pass).
- `CUA_SHIM_SURFACES=browser node verify.mjs` → exit 0, `problems: []`.
- `node scripts/accept/linux-chrome.mjs` → **PASS**, route `cua`: profiles_list `me` ready; "me's cua host serves at its
  pre-listed socket" (`chrome/b/97bcc14e4aaa.sock`, pid 112081 `node /home/admin/cua/src/chrome/host.mjs`, extension
  0.1.0); `Example Domain` read; tab closed; `end_task`; the host owns no tab after it; `cua serve` exited cleanly; no
  `run/` entry left. One elicitation: origin access for `https://example.com`, accepted for the session.

## Hetzner, the template (2026-10-07 13:03–13:08 UTC)

`HCLOUD_CONTEXT=cua deploy/cloud-vm/create-hetzner.sh --name cua-h4-accept --location fsn1 --ref wip/h4-linux --repo
/tmp/cua-h4.bundle --extension hosted` (the branch is not pushed, so `--repo` uploaded a bundle of it; the deb from the
pin's URL). Server **169221703**, `cx23`, fsn1, 2.28.43.138.

- Timeline (script clock): created 0 m 15 s, SSH 0 m 40 s, bundle copied 0 m 50 s, cloud-init done 3 m 37 s, summary
  and checklist 3 m 45 s. VM log: packages +69 s, Chrome 155 +118 s, desktop +119 s, clone of the bundle and checkout
  `1dd9908` +120 s, deb +122 s, `cua install` +127 s, Chrome's `Default` with the extension already present and the
  host's socket already there at +173 s, bind, doctor +178 s.
- `/etc/opt/chrome/policies/managed/cua.json`: `{"ExtensionInstallForcelist": ["jkejaaijdfpohkdhankllbekkhmnippb;https://178-104-102-73.sslip.io/ext/update.xml"]}`;
  `Default/Extensions/` holds `jkejaaijdfpohkdhankllbekkhmnippb` (and Chrome's two component extensions), no OpenAI
  extension. The relay logged two `/ext/` requests from the VM.
- Doctor (`/var/log/cua-provision.json`): **`ok: true`**; every row pass except `secrets.store` blocked (no secret
  stored), `codex.login` skip, the four `agent.*` skip (no relay). `chrome.hosts.live`: "1 cua host(s) serving".
- The printed checklist: "none: the device is ready (no ChatGPT or Codex sign-in is needed)" and the doctor check line;
  neither sign-in step.
- As `cua` over SSH: `test ! -e ~/.local/share/cua/state/codex/auth.json`; `CUA_SHIM_SURFACES=browser node verify.mjs`
  exit 0, `problems: []`; `node scripts/accept/linux-chrome.mjs` **PASS** (route `cua`, host pid 9058 `node
  /opt/cua/src/chrome/host.mjs`, `Example Domain`, every step PASS).
- Re-run `/usr/local/sbin/cua-provision.sh`: exit 0 in 9 s, `cua install` `changed:false`, the bind repeated to the same
  instance id, doctor `ok: true`.
- Deleted with `hcloud server delete cua-h4-accept`; `hcloud server list` → `cua-relay` only.
