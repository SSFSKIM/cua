// Loopback-only deterministic pages. Imported by tests, run directly by the mini harness.
import {createServer} from 'node:http';
import {corpusPages,imageSvg,eventScript} from './corpus-pages.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const archive = new URL('../../../docs/evidence/2026-10-05-browser-route-benchmark/fixture/', import.meta.url);
const html = (body,title="Browser parity fixture") => `<!doctype html><meta charset="utf-8"><title>${title}</title>${body}`;
const record = `fetch('/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify`;
// The cross-origin asset of /page-assets.html, served by the second listener (another port, so another origin): the
// page fetches it once with its credentials, so it is in the page's resource timing but not in Chrome's resource tree.
export const crossAsset = Buffer.from('cua parity cross-origin asset\n');
export async function startFixture({port = 48732, host = '127.0.0.1'} = {}) {
  let state = {counter:0,events:[]};
  const pages = {
    ...corpusPages,
    'dialogs': `<button id="alert" onclick="setTimeout(()=>alert('fixture alert'),100)">Alert</button><button id="confirm" onclick="setTimeout(()=>document.querySelector('#result').textContent=confirm('fixture confirm'),100)">Confirm</button><button id="prompt" onclick="setTimeout(()=>document.querySelector('#result').textContent=prompt('fixture prompt','seed'),100)">Prompt</button><output id="result"></output>`,
    'downloads': '<a id="download" href="/download" download="parity.txt">Download</a>',
    'chooser': `<input id="file" type="file"><output id="filename"></output><script>document.querySelector('#file').onchange=async e=>{const name=e.target.files[0].name;await ${record}({file:name})});const out=document.querySelector('#filename');out.textContent=name;out.dataset.recorded='yes';}</script>`,
    'oopif': '<iframe id="outer" src="/frame.html"></iframe>',
    'frame': '<label>Nested input<input id="nested"></label><button id="frame-button">Frame button</button>',
    'attributes': '<p id="note" class="item" data-note="stable">Alpha</p><input id="secret" name="password" value="hunter2">',
    'frames': '<h1>Frames fixture</h1><iframe id="first" title="First" src="/frame.html"></iframe><iframe id="second" title="Second" src="/frame.html"></iframe><iframe id="third" title="Third" src="/frame.html"></iframe>',
    'popup': '<button id="popup" onclick="window.open(\'/counter.html\')">Open popup</button>',
    'slow': `<main id="target"></main><script>${eventScript}setTimeout(()=>{document.querySelector('#target').innerHTML='<button id="late">Late element</button>';document.querySelector('#late').onclick=()=>record({late:true});},8000)</script>`,
    'strict': '<button class="duplicate">Same</button><button class="duplicate">Same</button>',
    // ASSET_ORIGIN is the second listener's origin, filled in per request.
    'page-assets': `<p id="status">loading</p><script>fetch('ASSET_ORIGIN/cross-asset.png',{credentials:'include',cache:'no-store'}).then(r=>r.arrayBuffer()).then(b=>{const s=document.querySelector('#status');s.textContent='loaded '+b.byteLength;s.dataset.loaded='yes';})</script>`,
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
      // A document that answers 800 ms after its request; the request, the answer and the page's arrival are recorded.
      if (url.pathname === '/slow-document.html') {
        const token = url.searchParams.get('token') ?? '';
        state.events.push({requested:token});
        await new Promise(resolve=>{const timer=setTimeout(resolve,800);res.once('close',()=>{clearTimeout(timer);resolve();});});
        if(res.destroyed)return;
        state.events.push({responded:token});
        return send(200,html(`<p id="arrived">Arrived</p><script>${eventScript}record({arrived:new URLSearchParams(location.search).get('token')??''})</script>`,'Arrived'),'text/html; charset=utf-8');
      }
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
      if(name === 'oopif' || name === 'oopif-input') page = page.replace('/frame.html',`http://localhost:${server.address().port}/frame.html`);
      if(name === 'page-assets') page = page.replace('ASSET_ORIGIN',`http://${host}:${assetServer.address().port}`);
      return send(200,html(page),'text/html; charset=utf-8');
    } catch { send(400,{error:'invalid request'}); }
  });
  // The second listener: one cross-origin asset, readable by the fixture's pages with credentials (CORS), each request
  // recorded in the shared state.
  const assetServer = createServer((req,res) => {
    const url = new URL(req.url,'http://assets');
    if (req.method !== 'GET' || url.pathname !== '/cross-asset.png') {res.writeHead(404,{'content-type':'application/json'});return res.end('{"error":"not found"}');}
    state.events.push({asset:'cross'});
    res.writeHead(200,{'content-type':'image/png','cache-control':'no-store','access-control-allow-origin':req.headers.origin ?? '*','access-control-allow-credentials':'true','vary':'Origin'});
    res.end(crossAsset);
  });
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,host,resolve);});
  try {
    await new Promise((resolve,reject) => {assetServer.once('error',reject);assetServer.listen(0,host,resolve);});
  } catch (error) {
    await new Promise(resolve => server.close(resolve));
    throw error;
  }
  const closeOne = listener => new Promise(resolve => {listener.close(resolve);listener.closeAllConnections();});
  return {server,url:`http://${host}:${server.address().port}`,assetURL:`http://${host}:${assetServer.address().port}`,close:() => Promise.all([closeOne(server),closeOne(assetServer)]).then(() => {})};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portIndex = process.argv.indexOf('--port');
  const fixture = await startFixture({port:portIndex < 0 ? 48732 : Number(process.argv[portIndex+1])});
  console.log(JSON.stringify({ready:true,url:fixture.url}));
  for(const signal of ['SIGTERM','SIGINT']) process.once(signal,async()=>{await fixture.close();process.exit(0);});
  // The ssh pipe owns this server. EOF stops it; no daemon or broad kill command.
  process.stdin.resume(); process.stdin.on('end',async()=>{await fixture.close();});
}
