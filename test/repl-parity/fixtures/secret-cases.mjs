// Synthetic service/store doubles only. Never calls fileStore or loads a vendor/native/browser backend.
import assert from 'node:assert/strict';
import {createBrowserService,PINNED_VENDOR_VERSION} from '../../../src/services/browser.mjs';
import {createSkyService} from '../../../src/services/sky.mjs';
import {SecretStoreError} from '../../../src/secrets/store.mjs';
import {RESERVED_PREFIX} from '../../../src/secrets/label.mjs';
const browser=[...['execute','execute-with-recovery'].flatMap(m=>['fill','ax-paste','ax-type-text','ax-set-value'].map(s=>`${m}/${s}`)),
 ...'invalid-label reserved-label unsupported-shape coerced-method extra-fields disabled unavailable unknown-label unsafe-store unreadable-store service-version'.split(' ').map(x=>`refuse/${x}`),
 'errors/rejection-sanitized','errors/recovery-envelope-sanitized','no-substitution/embedded-marker','no-substitution/unsupported-fields','no-substitution/evaluate-strings','no-substitution/cdp-strings','optional-fields/timeouts-and-text-format','reports/labels-not-values'];
const native=[...'invalid-label reserved-label unsupported-shape coerced-method extra-fields disabled unavailable unknown-label unsafe-store unreadable-store'.split(' ').map(x=>`refuse/${x}`),
 'errors/post-read-sanitized','no-substitution/embedded-marker','no-substitution/unsupported-methods-and-fields','no-substitution/javascript-strings','reports/labels-not-values','darwin/paste','darwin/type-text','darwin/set-value','linux/type-text'];
export const secretCaseIds=[...browser.map(x=>`secrets/browser/${x}`),...native.map(x=>`secrets/native/${x}`)];
export async function runSecretCase(id){
 if(!secretCaseIds.includes(id))throw new Error('Unknown secret case');
 const isBrowser=id.startsWith('secrets/browser/'),tail=id.split('/').slice(2).join('/'),ref='{{secret:PARITY_SYNTHETIC}}',sentinel='synthetic-'+Math.random().toString(36).slice(2);
 const reads=[],received=[];let field;
 let request=isBrowser?{method:tail.startsWith('execute/')?'execute':'executeWithRecovery',params:{type:'playwright_locator_fill',browser_id:'fixture',tab_id:'1',selector:'#fixture',value:ref,replace:true}}:
 {type:'execute',method:tail.endsWith('set-value')?'set_value':tail.endsWith('paste')?'paste':'type_text',args:[{app:'fixture',text:ref}]};
 if(isBrowser&&tail.includes('/ax-')){
  const kind=tail.endsWith('ax-paste')?'paste':tail.endsWith('ax-set-value')?'set_value':'type_text';
  request.params={type:'tab_ax_action',browser_id:'fixture',tab_id:'1',action:{kind,element_index:kind==='type_text'?null:1,[kind==='set_value'?'value':'text']:ref}};
 }
 if(tail.startsWith('linux/'))request.args=[{window:{id:1},text:ref}];
 if(!isBrowser&&request.method==='set_value')request.args=[{app:'fixture',element_index:1,value:ref}];
 field=isBrowser?(request.params.action?['params','action',request.params.action.kind==='set_value'?'value':'text']:['params','value']):['args',0,request.method==='set_value'?'value':'text'];
 const set=value=>{let target=request;for(const k of field.slice(0,-1))target=target[k];target[field.at(-1)]=value;};
 let expectedError=null,storeCode=null,unavailable=null;
 if(tail==='refuse/invalid-label'){set('{{secret:bad label}}');expectedError='invalid_secret_label';}
 if(tail==='refuse/reserved-label'){set(`{{secret:${RESERVED_PREFIX}PARITY}}`);expectedError='secret_reserved';}
 if(['refuse/unsupported-shape','refuse/extra-fields'].includes(tail)){request.extra=true;expectedError='unsupported_secret_shape';}
 if(tail==='refuse/coerced-method'){request.method=[request.method];expectedError='unsupported_secret_shape';}
 if(tail==='refuse/disabled'){unavailable='secrets_disabled';expectedError='secrets_disabled';}
 if(tail==='refuse/unavailable'){unavailable='secrets_not_configured';expectedError='secrets_unavailable';}
 if(tail==='refuse/unknown-label'){storeCode='not_found';expectedError='secret_not_found';}
 if(tail==='refuse/unsafe-store'){storeCode='insecure_mode';expectedError='secret_insecure_mode';}
 if(tail==='refuse/unreadable-store'){storeCode='unreadable';expectedError='secret_unreadable';}
 if(tail==='refuse/service-version')expectedError='unsupported_browser_runtime';
 if(tail.startsWith('errors/')||tail==='reports/labels-not-values')expectedError='secret_input_failed';
 if(tail==='no-substitution/embedded-marker')set('prefix '+ref);
 if(tail==='no-substitution/unsupported-fields'||tail==='no-substitution/unsupported-methods-and-fields')request=isBrowser?{method:'execute',params:{type:'playwright_locator_press',value:ref}}:{type:'execute',method:'press_key',args:[{app:'fixture',key:ref}]};
 if(tail==='no-substitution/evaluate-strings'||tail==='no-substitution/javascript-strings')request=isBrowser?{method:'execute',params:{type:'playwright_evaluate',script:ref}}:{type:'execute',method:'evaluate',args:[{app:'fixture',script:ref}]};
 if(tail==='no-substitution/cdp-strings')request={method:'execute',params:{type:'cdp',method:'Input.insertText',params:{text:ref}}};
 if(tail==='optional-fields/timeouts-and-text-format')request.params.timeout_ms=1000;
 const secrets={read:async label=>{reads.push(label);if(storeCode)throw new SecretStoreError(storeCode,{key:label});return sentinel;}};
 const backend={handleRpc:async r=>{received.push(r);if(expectedError==='secret_input_failed'){if(tail==='errors/recovery-envelope-sanitized')return {ok:false,error:{reason:'protected_command_failed',echo:sentinel}};throw new Error(sentinel,{cause:new Error(sentinel)});}return {ok:true};}};
 const service=isBrowser?createBrowserService({loadService:async()=>backend,actualServiceVersion:async()=>tail==='refuse/service-version'?'0.0.0':PINNED_VENDOR_VERSION,expectedVersion:PINNED_VENDOR_VERSION,serviceName:'vendor',secrets,secretsUnavailable:unavailable}):createSkyService({loadVendor:async()=>backend,secrets,secretsUnavailable:unavailable,platform:tail.startsWith('linux/')?'linux':'darwin'});
 let error;try{await service.handleRpc(request);}catch(e){error=e;}
 if(expectedError){assert.equal(error?.code,expectedError);assert.ok(![error?.message,error?.stack,JSON.stringify(error),String(error?.cause)].join('\n').includes(sentinel));if(expectedError==='secret_input_failed'){assert.equal(reads.length,1);assert.equal(received.length,1);assert.ok(error.message.includes('PARITY_SYNTHETIC'));}else{assert.equal(received.length,0);assert.equal(reads.length,storeCode?1:0);}}
 else {assert.equal(error,undefined);assert.equal(received.length,1);if(tail.startsWith('no-substitution/')){assert.equal(reads.length,0);assert.deepEqual(received[0],request);}else{assert.equal(reads.length,1);let value=received[0];for(const k of field)value=value[k];assert.equal(value,sentinel);}}
 return {ok:true,fakeBackend:true};
}
