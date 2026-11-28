// The DOM benchmark: build `items` rows (a text and a button each), rewrite every row's text `passes` times, clear.
// Each phase forces layout and waits two frames, so the renderer's accessibility work for it has been scheduled.
const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
window.probeBench = async ({items = 2000, passes = 5} = {}) => {
  const host = document.getElementById('bench');
  const status = document.getElementById('status');
  host.textContent = '';
  await frames();
  const t0 = performance.now();
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < items; i += 1) {
    const row = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `row ${i}`;
    const button = document.createElement('button');
    button.textContent = `act ${i}`;
    row.append(label, button);
    fragment.append(row);
  }
  host.append(fragment);
  void host.offsetHeight;
  await frames();
  const t1 = performance.now();
  for (let pass = 0; pass < passes; pass += 1) {
    for (const row of host.children) row.firstChild.textContent = `row changed ${pass}`;
    status.textContent = `pass ${pass}`;
    void host.offsetHeight;
    await frames();
  }
  const t2 = performance.now();
  host.textContent = '';
  void host.offsetHeight;
  await frames();
  const t3 = performance.now();
  status.textContent = 'idle';
  return {buildMs: t1 - t0, mutateMs: t2 - t1, clearMs: t3 - t2, totalMs: t3 - t0};
};
