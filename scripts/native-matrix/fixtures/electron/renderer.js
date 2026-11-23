// The button counts its presses into the status line, so a click's outcome is readable from the tree.
let presses = 0;
document.getElementById('button').addEventListener('click', () => {
  presses += 1;
  document.getElementById('status').textContent = `Pressed ${presses} ${presses === 1 ? 'time' : 'times'}`;
});

// The side-effect counters (./counters.js): the page's focus and blur and the text field's, reported to the main process.
const count = event => window.cuaFixture?.count(event);
window.addEventListener('focus', () => count('page-focus'));
window.addEventListener('blur', () => count('page-blur'));
document.getElementById('text').addEventListener('focus', () => count('text-focus'));
document.getElementById('text').addEventListener('blur', () => count('text-blur'));

// The pointerdown page (ruling 1168; ./main.js --cua-fixture-page=pointerdown, the native matrix's alone): one more line
// below every control, a button whose only handler is `pointerdown` (no click handler) and its own count beside it, as
// the Chrome scene page's (../scene-page.mjs POINTERDOWN). Without the flag the DOM is index.html's alone.
if (new URLSearchParams(location.search).get('page') === 'pointerdown') {
  const line = document.createElement('p'), button = document.createElement('button'), status = document.createElement('span');
  button.id = 'pointer';
  button.type = 'button';
  button.textContent = 'Pointer target';
  status.id = 'pointer-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-label', 'Pointer status');
  status.textContent = 'Pointer downs: 0';
  line.append(button, ' ', status);
  document.querySelector('main').append(line);
  let downs = 0;
  button.addEventListener('pointerdown', () => { downs += 1; status.textContent = `Pointer downs: ${downs}`; });
}
