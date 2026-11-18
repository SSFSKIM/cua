export const fixtureHTML = `<!doctype html>
<meta charset="utf-8">
<title>PW walk owned fixture</title>
<style>
  body { max-width: 600px; }
  label { display: block; margin-bottom: 4px; }
  textarea { vertical-align: middle; }
  #bench:not([hidden]) {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 2px;
  }
  #bench input { box-sizing: border-box; width: 100%; min-width: 0; height: 20px; }
</style>
<h1>Owned password field</h1>
<label>Public control <input aria-label="Public control" value="public-control"></label>
<label>Password <input id="pw" type="password" aria-label="PW walk test" autocomplete="off"></label>
<label>Public notes <textarea aria-label="Public notes" rows="2">public-textarea</textarea></label>
<div id="bench" hidden></div>
<script>
const pw = document.getElementById('pw');
const bench = document.getElementById('bench');
for (let i = 0; i < 216; i++) {
  const field = document.createElement('input');
  field.value = 'bench-value-' + i;
  bench.append(field);
}
const pageId = crypto.randomUUID();
let seen;

function applySeed({trial, value, large}) {
  if (trial === seen) return false;
  bench.hidden = !large;
  pw.value = value;
  pw.focus();
  pw.setSelectionRange(0, Math.min(7, pw.value.length));
  seen = trial;
  return true;
}

function post(path, data) {
  return fetch(path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  });
}

async function tick() {
  try {
    const response = await fetch('/seed', {cache: 'no-store'});
    const seeded = applySeed(await response.json());
    // Read the live field and its metadata together, before any asynchronous digest work.
    const state = {
      trial: seen, pageId,
      focused: document.hasFocus() && document.activeElement === pw,
      selectionStart: pw.selectionStart,
      selectionEnd: pw.selectionEnd,
      large: !bench.hidden,
    };
    const value = pw.value;
    const digest = crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    const checkpoint = digest.then(bytes => {
      const hex = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
      return post('/state', {...state, digest: hex});
    });
    await Promise.all([checkpoint, seeded && post('/ack', {...state, length: value.length})]);
  } catch {
    // Keep polling if the loopback server is briefly unavailable.
  } finally {
    setTimeout(tick, 100);
  }
}
tick();
</script>`;
