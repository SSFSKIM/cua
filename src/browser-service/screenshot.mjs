// Ported from readable chatgpt-26.928.40906 BS:43870-44103 (zp, WG, HG, tw, IR, VG, $G, zG and GG, tab_screenshot); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
//
// A tab's screenshot as the vendor takes it, JPEG at quality 80 in base64 ({data}). The visible viewport is, when the
// page's CSS pixels are at least device pixels (devicePixelRatio >= 1), the first frame of a screencast of the
// service's own sized to the viewport's CSS size and newer than the request, waited for at most 2 s; otherwise, and
// when no such frame comes, a capture of the visual viewport scaled to CSS pixels. A clip (cropX, cropY, cropWidth,
// cropHeight) and a full page (the CSS content size) are captures beyond the viewport at the same scale. A capture keeps
// the debugger on its 5 s timeout. The `device` mode (device pixels, 2 s capture) is the vendor's for its own internal
// callers; the command takes `css`. Dropped: the credential observation gate (RR) and the telemetry attributes.
import {tabIdOf} from './tabs.mjs';

const FORMAT = 'jpeg';                                                                                                // Br
const QUALITY = 80;
const SCREENCAST_MS = 2000;                                                                                           // UG
const CAPTURE_MS = 5000;                                                                                              // qG
const DEVICE_CAPTURE_MS = 2000;                                                                                       // jG

// CSS pixels per device pixel (IR): 1 / devicePixelRatio, or 1 when it cannot be read.
async function cssScale(cdp, tabId) {
  try {
    const value = (await cdp.call(tabId, 'Runtime.evaluate', {expression: 'window.devicePixelRatio', returnByValue: true}))?.result?.value;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return 1 / value;
  } catch {}
  return 1;
}

const scaleFor = async (cdp, tabId, mode) => (mode === 'device' ? 1 : await cssScale(cdp, tabId));                // tw

// The clip a command asks for, or undefined (VG).
function requestedClip(params) {
  if (params.cropX == null || params.cropY == null || params.cropWidth == null || params.cropHeight == null) return undefined;
  if (params.cropWidth <= 0 || params.cropHeight <= 0) throw new Error('tab_screenshot crop width and height must be positive');
  return {x: params.cropX, y: params.cropY, width: params.cropWidth, height: params.cropHeight, scale: 1};
}

const isFrameOrHidden = event => event.method === 'Page.screencastFrame'                                            // $G
  || (event.method === 'Page.screencastVisibilityChanged' && event.params != null && Reflect.get(event.params, 'visible') === false);

function frameTimestamp(event) {                                                                                       // GG
  if (event.params == null) return undefined;
  const metadata = Reflect.get(event.params, 'metadata');
  if (typeof metadata !== 'object' || metadata == null) return undefined;
  const timestamp = Reflect.get(metadata, 'timestamp');
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : undefined;
}

const isFresh = (event, since) => {                                                                                    // zG
  const timestamp = frameTimestamp(event);
  return timestamp != null && since != null && timestamp >= since;
};

// The data of the first screencast frame newer than the request, sized to `viewport` {width, height} when given, or
// undefined (no frame within 2 s, the page hidden, a failure, or a raw screencast holding the tab) (HG).
async function screencastFrame(cdp, tabId, viewport) {
  const height = viewport == null ? undefined : Math.round(viewport.height);
  const width = viewport == null ? undefined : Math.round(viewport.width);
  if (!(height == null || (!(height <= 0) && width != null && !(width <= 0)))) return undefined;
  return await cdp.withInternalScreencast(tabId, async isOwnEvent => {
    const abort = new AbortController();
    const until = Date.now() + SCREENCAST_MS;
    const nextFrame = () => {
      const waiting = cdp.waitForEvent(tabId, event => isOwnEvent(event) && isFrameOrHidden(event), {
        signal: abort.signal, timeoutMessage: 'Timed out waiting for a viewport screencast frame.', timeoutMs: Math.max(1, until - Date.now()),
      });
      waiting.catch(() => {});
      return waiting;
    };
    let pending = nextFrame();
    let running = false;
    try {
      running = true;
      const since = Date.now() / 1000;
      await cdp.call(tabId, 'Page.startScreencast', {everyNthFrame: 1, format: FORMAT, ...(height == null ? {} : {maxHeight: height, maxWidth: width}), quality: QUALITY});
      while (true) {
        const event = await pending;
        if (event.method !== 'Page.screencastFrame' || event.params == null) return undefined;
        const sessionId = Reflect.get(event.params, 'sessionId');
        if (typeof sessionId !== 'number') return undefined;
        if (!isFresh(event, since)) {
          pending = nextFrame();
          await cdp.call(tabId, 'Page.screencastFrameAck', {sessionId});
          continue;
        }
        const data = Reflect.get(event.params, 'data');
        try {
          await cdp.call(tabId, 'Page.stopScreencast');
          running = false;
        } finally {
          await cdp.call(tabId, 'Page.screencastFrameAck', {sessionId});
        }
        return typeof data === 'string' && data.length > 0 ? data : undefined;
      }
    } catch {
      return undefined;
    } finally {
      abort.abort();
      await pending.catch(() => {});
      if (running) await cdp.call(tabId, 'Page.stopScreencast').catch(() => {});
    }
  });
}

// -> {data} of the tab's screenshot in `mode` ('css' or 'device') (WG).
export async function takeScreenshot(cdp, tabId, params, mode) {
  const capture = {format: FORMAT, quality: QUALITY};
  const clip = requestedClip(params);
  if (clip != null) {
    const scale = await scaleFor(cdp, tabId, mode);
    capture.captureBeyondViewport = true;
    capture.clip = {...clip, scale};
  } else if (params.fullPage === true) {
    const scale = await scaleFor(cdp, tabId, mode);
    const size = (await cdp.call(tabId, 'Page.getLayoutMetrics')).cssContentSize;
    if (size?.width == null || size.height == null || size.width <= 0 || size.height <= 0) {
      throw new Error('Page.getLayoutMetrics returned no valid cssContentSize for full-page screenshot.');
    }
    capture.captureBeyondViewport = true;
    capture.clip = {x: size.x ?? 0, y: size.y ?? 0, width: size.width, height: size.height, scale};
  } else {
    const scale = await scaleFor(cdp, tabId, mode);
    let viewport;
    if (mode === 'css') ({cssVisualViewport: viewport} = await cdp.call(tabId, 'Page.getLayoutMetrics'));
    const frame = mode === 'device' || scale <= 1
      ? await screencastFrame(cdp, tabId, viewport == null ? undefined : {height: viewport.clientHeight, width: viewport.clientWidth})
      : undefined;
    if (frame != null) return {data: frame};
    viewport ??= (await cdp.call(tabId, 'Page.getLayoutMetrics')).cssVisualViewport;
    capture.clip = {x: viewport.pageX, y: viewport.pageY, width: viewport.clientWidth, height: viewport.clientHeight, scale};
  }
  const shot = await cdp.call(tabId, 'Page.captureScreenshot', capture, {
    preserveOnTimeout: true,
    timeoutMs: mode === 'device' && clip == null && params.fullPage !== true ? DEVICE_CAPTURE_MS : CAPTURE_MS,
  });
  if (typeof shot.data !== 'string' || !shot.data) throw new Error(`Page.captureScreenshot returned no data for tab ${tabId}.`);
  return {data: shot.data};
}

export const SCREENSHOT_HANDLERS = {
  async tab_screenshot(params, session) {                                                                           // zp
    return await takeScreenshot(session.cdp, tabIdOf(params.tab_id), params, 'css');
  },
};
