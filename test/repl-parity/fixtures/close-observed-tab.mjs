// Tab removal is asynchronous on the Linux extension. Send close exactly once, then observe its completion.
export async function closeObservedTab(browser,tab,{timeoutMs=3000,pollMs=25}={}){
 await tab.close();const deadline=Date.now()+timeoutMs;
 do{if(!(await browser.tabs.list()).some(item=>item.id===tab.id))return true;if(Date.now()>=deadline)return false;await new Promise(resolve=>setTimeout(resolve,pollMs));}while(true);
}
