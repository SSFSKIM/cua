// M5 live session: the M3 features the unchanged client does not offer on cua's extension route, sent as the client
// would send them, through node_repl's browser RPC (the corpus' capabilities/page-assets does the same), so the live
// network observation covers their service paths: the bot-detection report (answered locally; the vendor's is a
// telemetry event), the user's tab context, history, WebMCP and browserAuth (each refused on this host, which announces
// none of them), and the generic content export (not served). The messages are the services' own sentences.
const rpc = `const call=params=>nodeRepl.rpc('browser',{method:'execute',params:{browser_id:browser.browserId,...params}});const refused=async p=>{try{await p;return {refused:false};}catch(e){return {refused:true,message:String(e.message).slice(0,300)};}};`;
const expect = {
  docs: v => v === true,
  bot: v => v.status === 'reported' && v.hostname === '127.0.0.1',
  context: v => v.refused && /executeTabRead/.test(v.message),
  history: v => v.refused && /getUserHistory|history/i.test(v.message),
  'webmcp-list': v => v.refused && /does not support command "webmcp_list_tools"/.test(v.message),
  'webmcp-invoke': v => v.refused,
  'auth-handoff': v => v.refused && /does not support command/.test(v.message),
  'content-export': v => v.refused && /does not support command "tab_content_export"/.test(v.message),
};
export default {
  id: 'm5-live/m3-raw', milestone: 'M5', commands: ['tab_bot_detection_report', 'browser_user_get_tab_context', 'browser_user_history', 'webmcp_list_tools', 'webmcp_invoke_tool', 'tab_browser_auth_handoff', 'tab_content_export'],
  setup: {page: '/counter.html', state: {}},
  cells: [
    // WebMCP and browserAuth require their documentation to have been read first (as the vendor's do).
    {label: 'docs', code: `${rpc}for(const name of ['webmcp','capabilities/tab/browserAuth'])await call({type:'get_documentation',name});return true;`},
    {label: 'bot', code: `${rpc}return await call({type:'tab_bot_detection_report',tab_id:tab.id,reason:'captcha_failed'});`},
    {label: 'context', code: `${rpc}return await refused(call({type:'browser_user_get_tab_context',tab_id:tab.id,expected_url:await tab.url()}));`},
    {label: 'history', code: `${rpc}return await refused(call({type:'browser_user_history',queries:['cua-m5-live-sentinel']}));`},
    {label: 'webmcp-list', code: `${rpc}return await refused(call({type:'webmcp_list_tools',tab_id:tab.id}));`},
    {label: 'webmcp-invoke', code: `${rpc}return await refused(call({type:'webmcp_invoke_tool',tab_id:tab.id,tool_name:'t',registration_id:'r',input:{}}));`},
    {label: 'auth-handoff', code: `${rpc}return await refused(call({type:'tab_browser_auth_handoff',tab_id:tab.id,origin:fixtureURL,fields:[],qr_code:true}));`},
    {label: 'content-export', code: `${rpc}return await refused(call({type:'tab_content_export',tab_id:tab.id,format:'markdown'}));`},
  ],
  assert: ({results}) => {
    const bad = results.filter(r => !r.ok || !expect[r.cell]?.(r.value));
    return bad.length ? {ok: false, reason: `unexpected: ${JSON.stringify(bad.map(r => ({cell: r.cell, value: r.value, error: r.error})))}`} : {ok: true};
  },
};
