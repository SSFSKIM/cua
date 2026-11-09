// Independent M3 document oracle. Inputs are readable-vendor bytes plus Table 3, never src/cua-api or docs/cua-api.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateAttestations} from './compare.mjs';
const read=name=>readFileSync(new URL(`../../test/repl-parity/fixtures/docs-${name}`,import.meta.url),'utf8');
export const docsSource=JSON.parse(read('source-pins.json'));
const sha256=text=>createHash('sha256').update(text).digest('hex');
function pinned(name){const pin=docsSource.files[name],text=read(pin.fixture);assert.equal(sha256(text),pin.sha256,`${name}: pinned readable source changed`);return text;}
export const vendorCore=pinned('core'),confirmations=pinned('confirmations'),auxiliary=pinned('auxiliary');
function replaceOnce(text,before,after){assert.equal(text.split(before).length,2,`Table 3 source clause must occur once: ${before}`);return text.replace(before,after);}
export function transformCoreDocument(source){
 assert.equal(sha256(source),docsSource.files.core.sha256,'core document source pin mismatch');
 const edits=[
  ['type?: "iab" | "extension" | "cdp" | "mcpapps";','type?: "extension" | "cdp";'],
  ['metadata?: { extensionInstanceId?: string; codexSessionId?: string };','metadata?: { extensionInstanceId?: string };'],
  ['target: "linux" | "mac" | "windows";','target: "linux" | "mac";'],
  ['MCP App tabs support DOM-based interaction. Use `cua.getTab()` to bind an existing app tab; `createBrowserTab()` cannot create one. Navigation and tab lifecycle methods are optional. Use only methods listed in the returned browser documentation.\n\n',''],
  ['On Linux and Windows, use','On Linux, use'],
  ['available on Linux and Windows and includes','available on Linux and includes'],
  ['does not launch apps on Linux or Windows.','does not launch apps on Linux.'],
  [" Windows input activates the selected window. Get a fresh Windows screenshot before coordinate actions. The bound app uses that screenshot's coordinate mapping until the next observation; an AX-only observation clears it.",''],
  ['Linux and Windows always return','Linux always return'],
  [' and Orbit’s signed new-tab extension page',''],
  [' Windows screenshot methods always display images through Sky and reject `emit: false` before capture. They also reject a result with multiple screenshot regions because the bound API returns one image. Sky displays those regions before the error.',''],
  ['Linux and Windows app `paste`','Linux app `paste`'],
  [' On Windows, pass a coordinate target and `{ pixels: 500 }`; element targets and page counts are unsupported.',''],
  ['`selectText` is unavailable on Linux and Windows.','`selectText` is unavailable on Linux.'],
 ];
 for(const [before,after] of edits)source=replaceOnce(source,before,after);
 // Table 3 amendment (2026-10-15): only these two grammar repairs follow the literal Windows deletions.
 source=replaceOnce(source,'Linux always return full accessibility state.','Linux always returns full accessibility state.');
 source=replaceOnce(source,"Linux app `paste` support only `text` and use the platform's native text input.","Linux app `paste` supports only `text` and uses the platform's native text input.");
 // No surviving ChatGPT/Codex/Orbit product prose in this pinned core: do not rename identifiers, URLs or Sky.
 return source;
}
const ownCore=transformCoreDocument(vendorCore);
// Table 3 addition (2026-10-30, #235): cua's own paragraph after the core, before the policy, where cua's host serves a
// macOS computer surface (cua's own engine, whose agent cursor it describes). `agentCursor` says the lane is one. The
// Table 3 addition of 2026-11-05 (#282) adds the engine's background-click paragraph to the same document, and that
// of 2026-11-07 (#315) extends it to Firefox; that of 2026-11-08 (#316) adds the stale-point paragraph's second half,
// and that of 2026-11-08 (#318) the Firefox toolbar's `clickUnconfirmed` to the background-click paragraph.
export const AGENT_CURSOR="While you act in an app, a cursor labelled with this session's name shows the user where each action lands, unless the user has turned it off, and fades a few seconds after your last action. Your actions do not wait for it, it is not the user's pointer, and your screenshots do not show it.\n"
 +"\nA web page in a Chromium-based app (Chrome, Electron apps) or in Firefox that is in the background does not take a pointer: unless this Mac is a dedicated desktop, a left click, double click or drag there is refused with \"<App>'s web page does not accept a background click; use a dedicated desktop, or ask the person to bring <App> forward\", and nothing is sent. A plain click there on a button, checkbox, radio button, link, pop-up button or menu item goes through the accessibility action of that element instead, and one on a checkbox or radio button whose state does not change fails with `clickUnconfirmed`. A plain click there into a text field, text area or editable region gives it keyboard focus through accessibility instead, with no mouse event, so the page sees no click; the result's text says whether the caret was put at the point, and when it was not, typing goes to the field's existing selection or its start, so use select_text or set_value first if the position matters. In Firefox the field is focused by its own accessibility action instead, which does not put the caret at the point. A field that does not report focus fails with `clickUnconfirmed`. Unless this Mac is a dedicated desktop, a click on a background Firefox window outside its page, on the toolbar for instance, can fail with `clickUnconfirmed` even when it took effect, as Reload does. A click or drag that fails with `clickUnconfirmed` was sent but may only have activated the window: observe the app before any retry.\n"
 +"\nA click or drag at coordinates is checked against the screenshot the coordinates came from: when what that screenshot showed at the point is gone, has moved off it, or has given way to another control, it fails with `screenChangedSinceScreenshot` and nothing is sent. Take a new screenshot and give the coordinates in it. The check reads the accessibility tree at the point, and also refuses a click or drag when the app has opened a new window over the one in the screenshot, or when the point has left the page the screenshot showed. It still cannot see a page's own suggestion list, which can take a click aimed at a control under it, or text that has moved within the same text view (after Return or a paste in TextEdit). After typing into a field that offers suggestions, or editing text above the point, take a new screenshot before clicking at coordinates. When a screenshot shows a panel over the page, aim at what the screenshot shows, not at the page's elements under it.\n"
 +"\nWhen a window holds more than its accessibility tree can list, the tree lists what the window shows first, in its usual order, and ends with a line such as `[truncated: at least 1234 elements omitted, above and below the visible area]`, the count a lower bound and the words saying which way the omitted elements lie. To reach an element the tree does not list, scroll toward it and call `getAXState()` again. A visible control inside a container that reports a collapsed frame can still be left out. In a Chromium-based app, a table's column and header elements take new element IDs at every observation.\n";
export function coreDocument({host,requestMeta,agentCursor=false}={}){
 assert.ok(['vendor','cua'].includes(host),'explicit document host required');
 const policies=requestMeta?.['openai/confirmation_policies'];
 const candidate=policies&&typeof policies==='object'&&!Array.isArray(policies)?policies.computer_use:undefined;
 const policy=typeof candidate==='string'&&candidate.trim()!==''&&Buffer.byteLength(candidate,'utf8')<=12000?candidate:confirmations;
 return host==='vendor'?`${vendorCore}\n${policy}`:`${ownCore}\n${agentCursor?`${AGENT_CURSOR}\n`:''}${policy}`;
}
// Only Name and ID in the first Selected Browser header are volatile. Type, service version, prose, URLs and
// repeated occurrences of an identity elsewhere are not substitutions. Refuse a malformed header instead of hiding it.
export function normalizeSelectedBrowserDocument(text){
 assert.match(text,/^# Selected Browser\n- Name: [^\n]+\n- Type: [^\n]+\n- ID: [^\n]+\n/,'selected browser identity header malformed');
 const lines=text.split('\n');lines[1]='- Name: <browser-name>';lines[3]='- ID: <browser-id>';return lines.join('\n');
}
export function projectDocumentationRow(row,{host,agentCursor=false}={}){
 if(!/^cells\/documentation\//.test(row.case??'')||!Array.isArray(row.content))return row;
 return {...row,content:transformDocumentContent(row.content,{host,agentCursor})};
}
// Additional callers must enumerate their bootstrap/rewrite case and cell scopes before invoking this projection.
// `agentCursor` is one flag for every document, or one per consecutive document (an array; past its end, none).
export function transformDocumentContent(content,{host,agentCursor=false}={}){
 assert.ok(['vendor','cua'].includes(host),'explicit document host required');
 const cursorAt=index=>Array.isArray(agentCursor)?agentCursor[index]===true:agentCursor;
 return content.map(item=>{
  if(item.type!=='text')return item;
  let text=item.text;
  if(host==='vendor'){
   const complete=coreDocument({host:'vendor'});
   if(text.startsWith(complete)){
    // Independent factories may share the cua.core named output. Consume only consecutive, byte-exact default
    // documents at its beginning; a corrupt second document or unrelated suffix stays byte-visible.
    let prefix='',index=0;while(text.startsWith(complete)){prefix+=coreDocument({host:'cua',agentCursor:cursorAt(index++)});text=text.slice(complete.length);}text=prefix+text;
   }else if(text.startsWith(vendorCore+'\n'))text=ownCore+(cursorAt(0)?`\n${AGENT_CURSOR}`:'')+text.slice(vendorCore.length);
  }
  const prefix=auxiliary+'\n\n';
  if(text.startsWith(prefix+'# Selected Browser\n'))text=prefix+normalizeSelectedBrowserDocument(text.slice(prefix.length));
  else if(text.startsWith('# Selected Browser\n'))text=normalizeSelectedBrowserDocument(text);
  return text===item.text?item:{...item,text};
 });
}
export function assertProfileObservation(observation,{host}={}){
 assert.ok(observation,'profiles listing must carry its actual bounded-host observation');
 validateAttestations({host,complete:true,connections:['profiles-bounded'],hostAttestations:[{connection:'profiles-bounded',host,serverInfo:observation.serverInfo,_meta:observation._meta,executionFacts:observation.executionFacts}]});
 assert.equal(observation.tabCounts,false,'readiness must not ask for tabs');assert.equal(observation.teardown?.confirmed,true,'bounded listing teardown unconfirmed');
 assert.ok(Array.isArray(observation.backends),'missing CUABACKENDS inventory');
 for(const backend of observation.backends){
  assert.ok(backend&&typeof backend==='object'&&!Array.isArray(backend));
  const allowed=backend.family==='chrome'?['family','instanceId','profileName','tabCount']:['family'];
  assert.ok(Object.keys(backend).every(key=>allowed.includes(key)),'unexpected inventory field (titles/URLs forbidden)');
  if(backend.family==='chrome'){
   assert.match(backend.instanceId,/^[A-Za-z0-9._:-]{1,128}$/);assert.ok(!backend.instanceId.startsWith('maws:'),'MAWS is not a Chrome profile');
   assert.ok(backend.profileName==null||typeof backend.profileName==='string');assert.ok(backend.tabCount==null,'readiness inventory must not expose tab counts');
  }else assert.ok(backend.family==null||/^[a-z]{1,20}$/.test(backend.family));
 }
}
// Static first-browser contract strings come from the pinned generator, not the owned document builder. Dynamic
// API declarations/guidance stay byte-visible in parity rows; only the header identity slots above are projected.
const builder=pinned('browser_builder');
const browserClauses=[
 'Reuse this browser binding across later turns. A new user turn or tab error does not invalidate it; select another browser only when the browser-selection policy requires it.',
 'If a tab is stale or missing later, obtain or create a fresh tab from this browser; never reselect a browser to recover a tab. Empty tab lists are normal after cleanup and do not invalidate this browser binding.',
 '# Additional Documentation',
 'Use `await agent.documentation.get("<name>")` when you need one of these topics:',
 '# Additional Capabilities',
 '# API Reference',
 'Use this as the supported `agent.browsers.*` surface.',
 '// Returned by setupBrowserRuntime().',
 '// browser was selected during bootstrap.',
];
for(const clause of browserClauses)assert.ok(builder.includes(clause),`browser source pin lacks contract clause: ${clause}`);
export function assertSelectedBrowserDocument(text,{auxiliary:withAuxiliary=false}={}){
 assert.equal(typeof text,'string');
 if(withAuxiliary){assert.ok(text.startsWith(auxiliary+'\n\n'),'first selected browser must retain complete auxiliary bytes');text=text.slice(auxiliary.length+2);}
 normalizeSelectedBrowserDocument(text);
 for(const clause of browserClauses)assert.ok(text.includes(clause),`missing retained browser clause: ${clause}`);
 assert.ok(!text.includes('Computer Use Confirmations Policy'),'browser document must not duplicate core confirmations');
 assert.ok(!/^# (?:Browser|Tab) Capability:/m.test(text),'capability lookup documents must not be emitted eagerly');
}
