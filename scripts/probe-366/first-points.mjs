// Probe-only geometry. No point is silently substituted when the intended region is offscreen.
const valid=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;
function intersection(a,b){if(!valid(a)||!valid(b))throw Error('missing candidate geometry');const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),width=Math.min(a.x+a.width,b.x+b.width)-x,height=Math.min(a.y+a.height,b.y+b.height)-y;if(width<=0||height<=0)throw Error('candidate window is offscreen');return {x,y,width,height};}
export function inertPoint(variant,g) {
 if(['main','bare'].includes(variant))return null;
 let p,visible;
 if(variant==='inert-titlebar') {
  visible=intersection(g.windowFrame,g.screenFrame);
  p=[visible.x+visible.width*.75,g.windowFrame.y+14];
 } else if(variant==='inert-toolbar') {
  visible=intersection(g.webAreaFrame,g.screenFrame);
  p=[visible.x+Math.min(400,visible.width/2),g.webAreaFrame.y+22];
 } else throw Error('unknown inert-point candidate');
 if(p[0]<visible.x||p[0]>=visible.x+visible.width||p[1]<visible.y||p[1]>=visible.y+visible.height)throw Error('intended candidate region is not visible');
 return p;
}
