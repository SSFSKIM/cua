// Source witnesses: readable chatgpt-26.928.40906 browser-client.js (BC): fill 6912-6932,
// AX 8194-8263, evaluate 6717-6737/7720-7733, CDP 8712-8726, transport 10024-10036,
// setup selects execute vs executeWithRecovery from credentialRecoveryErrorVersion at 10236-10284.
// This module contains references/labels only, never the synthetic value held by the trusted fixture.
export const LIVE_SECRET_LABEL='PARITY_SYNTHETIC';
export const LIVE_SECRET_REFERENCE=`{{secret:${LIVE_SECRET_LABEL}}}`;
const ref=LIVE_SECRET_REFERENCE,q=JSON.stringify;
const params=(type,fields)=>({type,browser_id:'fixture',tab_id:'7',...fields});
const fill=(value=ref,fields={})=>params('playwright_locator_fill',{selector:'#fixture',value,replace:true,...fields});
const ax=(kind,fields)=>params('tab_ax_action',{action:{kind,...fields}});
const rows=[];
function add(tail,calls,commands,{method='execute',error=null,reads=error?0:1,substitute=!error,unavailable=null,store=null,versionMismatch=false}={}){
 rows.push({id:`secrets/browser-live/${tail}`,tail,calls:Array.isArray(calls)?calls:[calls],requests:(Array.isArray(commands)?commands:[commands]).map(p=>({method,params:p})),method,error,reads,substitute,unavailable,store,versionMismatch});
}
const shapes=[['fill',`tab.playwright.locator('#fixture').fill(${q(ref)})`,fill()],
 ['ax-paste',`tab.ax.paste(null,${q(ref)})`,ax('paste',{element_index:null,text:ref})],
 ['ax-type-text',`tab.ax.typeText(null,${q(ref)})`,ax('type_text',{element_index:null,text:ref})],
 ['ax-set-value',`tab.ax.setValue(3,${q(ref)})`,ax('set_value',{element_index:3,value:ref})]];
for(const [channel,method]of [['execute','execute'],['execute-with-recovery','executeWithRecovery']])for(const [kind,call,command]of shapes)add(`${channel}/${kind}`,call,command,{method});
for(const [tail,error,value]of [['invalid-label','invalid_secret_label','{{secret:bad label}}'],['reserved-label','secret_reserved','{{secret:CUA_DEVICE_PARITY}}']])add(`refuse/${tail}`,`tab.playwright.locator('#fixture').fill(${q(value)})`,fill(value),{error});
add('refuse/unsupported-shape',`tab.ax.paste(null,${q(ref)},{format:'html'})`,ax('paste',{element_index:null,text:ref,format:'html'}),{error:'unsupported_secret_shape'});
for(const [tail,error,unavailable]of [['disabled','secrets_disabled','secrets_disabled'],['unavailable','secrets_unavailable','secrets_not_configured']])add(`refuse/${tail}`,shapes[0][1],fill(),{error,unavailable});
for(const [tail,error]of [['unknown-label','secret_not_found'],['unsafe-store','secret_insecure_mode'],['unreadable-store','secret_unreadable']])add(`refuse/${tail}`,shapes[0][1],fill(),{error,reads:1,store:tail});
add('refuse/service-version',shapes[0][1],fill(),{error:'unsupported_browser_runtime',versionMismatch:true});
for(const tail of ['errors/rejection-sanitized','errors/recovery-envelope-sanitized','reports/labels-not-values'])add(tail,shapes[0][1],fill(),{method:tail.includes('envelope')?'executeWithRecovery':'execute',error:'secret_input_failed',reads:1,substitute:true});
add('no-substitution/embedded-marker',`tab.playwright.locator('#fixture').fill(${q('prefix '+ref)})`,fill('prefix '+ref),{reads:0,substitute:false});
add('no-substitution/unsupported-fields',`tab.ax.pressKey(3,${q(ref)})`,ax('press_key',{element_index:3,key:ref}),{reads:0,substitute:false});
add('no-substitution/evaluate-strings',`tab.playwright.evaluate(${q(q(ref))})`,params('playwright_evaluate',{script:`const arg = undefined;\nreturn (${q(ref)});`}),{reads:0,substitute:false});
add('no-substitution/cdp-strings',`(await tab.capabilities.get('cdp')).send('Input.insertText',{text:${q(ref)}})`,params('tab_cdp_call',{method:'Input.insertText',params:{text:ref}}),{reads:0,substitute:false});
add('optional-fields/timeouts-and-text-format',[`tab.playwright.locator('#fixture').fill(${q(ref)},{timeoutMs:1000})`,`tab.ax.paste(3,${q(ref)},{format:'text'})`],[fill(ref,{timeout_ms:1000,client_timeout_ms:1000}),ax('paste',{element_index:3,text:ref,format:'text'})],{reads:2});
export const liveSecretCases=rows;
export const liveSecretCaseIds=rows.map(c=>c.id);
