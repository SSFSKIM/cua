// Independent grammar from chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/project/cua/sky_js/src/
// targets/linux/accessibility_tree.js:18-101: preorder lines use tab indentation, then an assigned decimal ID and
// role/content. The observed harness gedit root is a named frame; frame is not one of the collapsed group roles.
export function isFullNativeTree(state,filename){
 const header='Accessibility source: at_spi\n';
 if(typeof state!=='string'||!state.startsWith(header))return false;
 const lines=state.slice(header.length).split('\n');
 if(lines.length<2||!/^\d+ frame(?: |$)/.test(lines[0])||!lines[0].includes(filename))return false;
 let previousDepth=0,editable=false;
 for(const [index,line] of lines.entries()){
  const match=/^(\t*)(\d+) (.*)$/.exec(line);if(!match)return false;
  const depth=match[1].length;
  if(index>0&&(depth===0||depth>previousDepth+1))return false;
  if(depth>0&&/^text \([^)]*\bsettable\b/.test(match[3]))editable=true;
  previousDepth=depth;
 }
 return editable;
}
