// The browser-surface mode of the native baseline (--surfaces browser, #115 acceptance 11): an own-host browser-only
// session's cold start, measured as the native run measures it. The run makes the same cold connections and nothing
// else: no warm connection, no native call, no app and no window, so nothing on the device is refused for being open
// (TextEdit or gedit) and nothing is left to quit. It keeps the platform adapter's read-only device listings (the
// computer-use helpers, the serves of the clone) and judges what the run left by its serves alone.
export function browserAdapter(platform) {
  return {
    platform: platform.platform,
    target: null,
    device: platform.device,
    answer: () => ({action: 'decline'}),
    refuse: () => null,
    start(meta) { meta.service = {surface: 'browser'}; },
    gui: null,
    async cleanup() {},
    leftovers: device => ({serves: device.leftovers().serves}),
    leftBehind: leftovers => leftovers.serves > 0,
  };
}
