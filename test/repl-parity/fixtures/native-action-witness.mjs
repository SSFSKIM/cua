// Observed on the pinned vendor/gedit on cua-linux: drag selects a range that BackSpace removes; scroll moves
// which document line a fixed point addresses. GTK3 typeText is never used. Only counts/positions leave the cell.
export async function nativeDocumentText(cua,window){
 const state=await cua.computer.get_window_state({window,include_screenshot:false});let value;
 const visit=node=>{if(node.role==='text'&&node.states?.includes('focused')&&node.states?.includes('editable')&&typeof node.value==='string')value=node.value;node.children?.forEach(visit);};visit(state.ax_tree);
 if(value===undefined)throw Error('Owned fixture has no focused editable text');return value;
}
export async function observeDrag(app,readText){
 await app.pressKey('ctrl+Home');const before=await readText();
 await app.drag([100,150],[240,150]);await app.pressKey('BackSpace');const after=await readText();
 let index=0;while(index<after.length&&before[index]===after[index])index++;
 const removed=before.length-after.length,contiguous=before.slice(0,index)+before.slice(index+removed)===after;
 await app.pressKey('ctrl+z');return {removed,contiguous,restored:await readText()===before};
}
export async function observeScroll(app,readText){
 const witness=async()=>{
  await app.click([100,150]);const before=await readText();await app.pressKey('Delete');const after=await readText();
  let index=0;while(index<after.length&&before[index]===after[index])index++;
  await app.pressKey('ctrl+z');return {removed:before.length-after.length,index,line:before.slice(0,index).split('\n').length,restored:await readText()===before};
 };
 await app.pressKey('ctrl+Home');const before=await witness();await app.pressKey('ctrl+Home');
 await app.scroll([100,150],'down',{pixels:400});const after=await witness();return {before,after};
}
export async function observeClick(app,readText){
 await app.pressKey('ctrl+Home');const before=await readText();
 const result=await app.click([100,150],{mouseButton:'left',clickCount:1});await app.pressKey('Delete');const after=await readText();
 let index=0;while(index<after.length&&before[index]===after[index])index++;
 await app.pressKey('ctrl+z');return {returnedUndefined:result===undefined,removed:before.length-after.length,index,line:before.slice(0,index).split('\n').length,restored:await readText()===before};
}
