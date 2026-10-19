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
