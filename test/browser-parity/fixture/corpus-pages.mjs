// Browser-owned handlers make mutations independently observable at /state.
const events = `<script>const record=value=>fetch('/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});</script>`;
export const corpusPages = {
  logs: '<p>Console fixture</p><script>console.log("parity-log deterministic message")</script>',
  read: '<h1>Read fixture</h1><p class="item" data-note="stable">Alpha</p><p class="item">Beta</p><button id="enabled">Enabled</button><button id="disabled" disabled>Disabled</button><div id="hidden" hidden>Hidden</div>',
  controls: `${events}<label>Text<input id="text" oninput="record({text:this.value})"></label><input id="check" type="checkbox" onchange="record({checked:this.checked})"><select id="select" onchange="record({selected:this.value})"><option value="a">Alpha</option><option value="b">Beta</option></select><button id="click" onclick="record({click:true})">Click</button><button id="double" ondblclick="record({double:true}).then(()=>document.querySelector('#result').textContent='recorded')">Double</button><output id="result"></output>`,
  input: `${events}<style>body{margin:0}#input{position:absolute;left:20px;top:20px;width:200px;height:40px}#double{position:absolute;left:20px;top:90px;width:200px;height:40px}#drag{position:absolute;left:20px;top:160px;width:200px;height:40px;background:#ddd}#space{height:2400px}</style><input id="input" aria-label="Pointer input" oninput="record({text:this.value})"><button id="double" ondblclick="record({double:true})">Double target</button><div id="drag" onpointerdown="record({dragStart:true})" onpointerup="record({dragEnd:true})">Drag target</div><div id="space"></div>`,
  media: '<img id="image" alt="Parity media" src="/image.svg" width="120" height="80">',
  screenshot: '<style>body{margin:0;width:320px;height:240px;background:#fff}main{width:160px;height:120px;background:#246}</style><main></main><p>Parity screenshot</p>',
  mutation: `${events}<button id="replace-context" onclick="fetch('/counter',{method:'POST'}).then(()=>location.replace('/counter.html?navigated=1'))">Replace context</button><div id="value">Mutation fixture</div>`,
};
export const imageSvg='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#224466"/><circle cx="60" cy="40" r="20" fill="#fff"/></svg>';
