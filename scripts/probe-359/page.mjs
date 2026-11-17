// Reuse #354's visible-owner protocol, including its probe354 nonce title (transport version 3).
import {page as inherited,SEED} from '../probe-354/page.mjs';
export {SEED};
export const REQUESTED='NEW359';
export function assertVisibleOwner(title,owner){
 const match=/probe354:([a-f0-9]{32})(?![a-f0-9])/i.exec(title??'');
 if(!match||match[1].toLowerCase()!==owner?.pageId)throw Error('visible fixture owner changed or unavailable');
 return true;
}
export function page(){
 return inherited()
  .replace('Typing delivery probe','Click caret ordering probe #359')
  .replace("'selectionchange','focusin'","'selectionchange','focusin','focusout','focus','blur','mousedown','mouseup','click'")
  .replaceAll('at:Date.now()','at:Date.now(),monoMs:performance.now()')
  .replace('select(pos,len);','select(c.initialCaret??SEED.length,0);')
  .replace("select(0,value().length);const s=state();","select(0,value().length);trace.push({event:'script-selected',seq:trace.length,at:Date.now(),monoMs:performance.now(),selection:selection()});const s=state();");
}
