// Ported from readable chatgpt-26.928.40906 BS:62081-62105 (qf, the agent's cursor); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
//
// Before a pointer action the vendor aims the agent's on-page cursor at the point (the backend's moveMouse, which
// cua's host forwards only to a cursor peer such as MAWS). Aiming never fails the action: any failure is swallowed.
// During a drag the cursor follows without waiting for it to arrive. With a `deadline` (a click's dispatch phase) the
// acknowledgment is awaited only until it, and nothing is sent once it is spent; the click's own Input calls then
// fail on the spent deadline.

export class Cursor {
  // `api` the backend's BackendApi.
  constructor(api) {
    this.api = api;
  }

  api;

  async moveMouse(tabId, x, y, {waitForArrival, deadline} = {}) {
    if (deadline?.expired()) return;
    try {
      const moved = this.api.moveMouse({tabId, ...(waitForArrival === false ? {waitForArrival: false} : {}), x, y}, deadline === undefined ? {} : {deadline});
      if (waitForArrival === false) {
        moved.catch(() => {});
        return;
      }
      await (deadline === undefined ? moved : deadline.race(moved));
    } catch {}
  }
}
