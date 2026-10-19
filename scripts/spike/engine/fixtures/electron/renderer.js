// The button counts its presses into the status line, so a click's outcome is readable from the tree.
let presses = 0;
document.getElementById('button').addEventListener('click', () => {
  presses += 1;
  document.getElementById('status').textContent = `Pressed ${presses} ${presses === 1 ? 'time' : 'times'}`;
});
