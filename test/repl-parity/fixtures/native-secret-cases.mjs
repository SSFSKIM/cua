// The real Linux binder sends both app text methods as sky.type_text({window,text}).
// Source: chatgpt-26.928.40906 tinysky_alt/bind_linux_app.js:133-148; sky.js:55-66.
export const LABEL='PARITY_SYNTHETIC',REFERENCE=`{{secret:${LABEL}}}`;
export const WINDOW={id:123,app:'fixture',title:'Native secret fixture'};
const q=JSON.stringify,rows=[];
const request=text=>({type:'execute',method:'type_text',args:[{window:WINDOW,text}]});
function add(tail,call,{text=REFERENCE,error=null,reads=error?0:1,substitute=!error,store=null,unavailable=null,requests}={}){rows.push({id:'secrets/native-live/'+tail,tail,call,requests:requests??[request(text)],error,reads,substitute,store,unavailable});}
const type=text=>`app.typeText(${q(text)})`;
add('linux/type-text',`(async()=>{await app.typeText(${q(REFERENCE)});await app.paste(${q(REFERENCE)},{format:'text'});})()`,{reads:2,requests:[request(REFERENCE),request(REFERENCE)]});
for(const [tail,error,text] of [['invalid-label','invalid_secret_label','{{secret:bad label}}'],['reserved-label','secret_reserved','{{secret:CUA_DEVICE_PARITY}}']])add('refuse/'+tail,type(text),{text,error});
const invalid={type:'execute',method:'type_text',args:[{window:{id:123,invalid:{}},text:REFERENCE}]};
add('refuse/unsupported-shape',`cua.computer.type_text(${q(invalid.args[0])})`,{error:'unsupported_secret_shape',requests:[invalid]});
for(const [tail,error,unavailable] of [['disabled','secrets_disabled','secrets_disabled'],['unavailable','secrets_unavailable','secrets_not_configured']])add('refuse/'+tail,type(REFERENCE),{error,unavailable});
for(const [tail,error] of [['unknown-label','secret_not_found'],['unsafe-store','secret_insecure_mode'],['unreadable-store','secret_unreadable']])add('refuse/'+tail,type(REFERENCE),{error,reads:1,store:tail});
for(const tail of ['errors/post-read-sanitized','reports/labels-not-values'])add(tail,type(REFERENCE),{error:'secret_input_failed',reads:1,substitute:true});
add('no-substitution/embedded-marker',type('prefix '+REFERENCE),{text:'prefix '+REFERENCE,reads:0,substitute:false});
add('no-substitution/unsupported-methods-and-fields',`app.pressKey(${q(REFERENCE)})`,{reads:0,substitute:false,requests:[{type:'execute',method:'press_key',args:[{window:WINDOW,key:REFERENCE}]}]});
add('no-substitution/javascript-strings',`Promise.resolve(${q(REFERENCE)})`,{reads:0,substitute:false,requests:[]});
export const nativeSecretCases=rows;
