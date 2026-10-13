// Loopback-only deterministic pages. Imported by tests, run directly by the mini harness.
import {createServer} from 'node:http';
import {corpusPages,imageSvg,eventScript} from './corpus-pages.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const archive = new URL('../../../docs/evidence/2026-10-05-browser-route-benchmark/fixture/', import.meta.url);
const html = (body,title="Browser parity fixture") => `<!doctype html><meta charset="utf-8"><title>${title}</title>${body}`;
const record = `fetch('/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify`;
export async function startFixture({port = 48732, host = '127.0.0.1'} = {}) {
  let state = {counter:0,events:[]};
  const pages = {
    ...corpusPages,
    'dialogs': `<button id="alert" onclick="setTimeout(()=>alert('fixture alert'),100)">Alert</button><button id="confirm" onclick="setTimeout(()=>document.querySelector('#result').textContent=confirm('fixture confirm'),100)">Confirm</button><button id="prompt" onclick="setTimeout(()=>document.querySelector('#result').textContent=prompt('fixture prompt','seed'),100)">Prompt</button><output id="result"></output>`,
    'downloads': '<a id="download" href="/download" download="parity.txt">Download</a>',
    'chooser': `<input id="file" type="file"><output id="filename"></output><script>document.querySelector('#file').onchange=async e=>{const name=e.target.files[0].name;await ${record}({file:name})});const out=document.querySelector('#filename');out.textContent=name;out.dataset.recorded='yes';}</script>`,
    'oopif': '<iframe id="outer" src="/frame.html"></iframe>',
    'frame': '<label>Nested input<input id="nested"></label><button id="frame-button">Frame button</button>',
    'popup': '<button id="popup" onclick="window.open(\'/counter.html\')">Open popup</button>',
    'slow': `<main id="target"></main><script>${eventScript}setTimeout(()=>{document.querySelector('#target').innerHTML='<button id="late">Late element</button>';document.querySelector('#late').onclick=()=>record({late:true});},8000)</script>`,
    'strict': '<button class="duplicate">Same</button><button class="duplicate">Same</button>',
    'counter': `<button id="post" onclick="fetch('/counter',{method:'POST'})">Post once</button><button id="navigate" onclick="fetch('/counter',{method:'POST'}).then(()=>location.href='/counter.html?navigated=1')">Post and navigate</button><div id="value">Counter fixture</div>`,
  };
  const server = createServer(async (req,res) => {
    const send = (status,body,type='application/json') => {res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));};
    try {
      const url = new URL(req.url,'http://fixture');
      if (req.method === 'GET' && url.pathname === '/state') return send(200,state);
      if (req.method === 'POST' && ['/reset','/counter','/event','/submit'].includes(url.pathname)) {
        const chunks = []; let size=0;
        for await (const chunk of req) {size+=chunk.length; if(size>65536) return send(413,{error:'body too large'}); chunks.push(chunk);}
        const text = Buffer.concat(chunks).toString();
        const body = text ? (req.headers['content-type']?.includes('application/json') ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text))) : {};
        if (url.pathname === '/reset') state = {counter:0,events:[],...body};
        else if (url.pathname === '/counter') state.counter++;
        else state.events.push(body);
        return send(200,state);
      }
      if (req.method !== 'GET') return send(405,{error:'method not allowed'});
      if (url.pathname === '/reload.html') {
        state.reloads=(state.reloads??0)+1;
        return send(200,html(`<output id="reload-count">${state.reloads}</output>`,`Reload ${state.reloads}`),'text/html; charset=utf-8');
      }
      if (url.pathname === '/slow-resource.svg') {
        await new Promise(resolve=>{const timer=setTimeout(resolve,1200);res.once('close',()=>{clearTimeout(timer);resolve();});});
        if(res.destroyed)return;
        return send(200,imageSvg,'image/svg+xml');
      }
      if (url.pathname === '/image.svg') return send(200,imageSvg,'image/svg+xml');
      if (url.pathname === '/download') {res.setHeader('content-disposition','attachment; filename="parity.txt"');return send(200,'parity download\n','text/plain');}
      if (url.pathname.startsWith('/benchmark/')) {
        const name = url.pathname.slice('/benchmark/'.length);
        if (!['index.html','frame-form.html','frame-host.html','frame-inner.html'].includes(name)) return send(404,{error:'not found'});
        return send(200,await readFile(new URL(name,archive)),'text/html; charset=utf-8');
      }
      const name = url.pathname.slice(1).replace(/\.html$/,'') || 'counter';
      if (!Object.hasOwn(pages,name)) return send(404,{error:'not found'});
      let page = pages[name];
      // A different site, not merely a different port, forces the frame out of process under site isolation.
      if(name === 'oopif') page = page.replace('/frame.html',`http://localhost:${server.address().port}/frame.html`);
      return send(200,html(page),'text/html; charset=utf-8');
    } catch { send(400,{error:'invalid request'}); }
  });
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,host,resolve);});
  return {server,url:`http://${host}:${server.address().port}`,close:() => new Promise(resolve => {server.close(resolve);server.closeAllConnections();})};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portIndex = process.argv.indexOf('--port');
  const fixture = await startFixture({port:portIndex < 0 ? 48732 : Number(process.argv[portIndex+1])});
  console.log(JSON.stringify({ready:true,url:fixture.url}));
  for(const signal of ['SIGTERM','SIGINT']) process.once(signal,async()=>{await fixture.close();process.exit(0);});
  // The ssh pipe owns this server. EOF stops it; no daemon or broad kill command.
  process.stdin.resume(); process.stdin.on('end',async()=>{await fixture.close();});
}
