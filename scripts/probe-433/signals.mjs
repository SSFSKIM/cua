// #442's signals, pure (unit-tested by kit.test.mjs): what the observation's record, accessibility read live by the kit
// (host.swift `signals`) and the page itself (page.mjs `probe`) say about the controls at the click point. Only closed
// names, roles, frames, counts and times leave here; a control's label becomes the page's name for it (`nameOf`).

// StalePoint.swift `stalePointInteractiveRoles` on main 5580ac20.
export const INTERACTIVE=new Set(['AXButton','AXCheckBox','AXRadioButton','AXLink','AXPopUpButton','AXMenuButton','AXMenuItem','AXTextField',
  'AXTextArea','AXComboBox','AXSearchField','AXSecureTextField','AXSlider','AXIncrementor','AXDisclosureTriangle','AXTab','AXSwitch',
  'AXColorWell','AXSegmentedControl']);
const role=x=>typeof x==='string'&&/^AX[A-Za-z]{1,40}$/.test(x)?x:x==null?null:'other';
const holds=(f,p)=>!!f&&!!p&&f.width>0&&f.height>0&&p.x>=f.x&&p.x<=f.x+f.width&&p.y>=f.y&&p.y<=f.y+f.height;
const r1=x=>Math.round(x*10)/10;
const frameOf=f=>f&&Number.isFinite(f.x)?{x:r1(f.x),y:r1(f.y),width:r1(f.width),height:r1(f.height)}:null;

// A control's label as the page's closed name for it: the cell's own text is the target (a twin cell's same-label
// controls included), the rival buttons and decomove's B are `twin`, bgbutton's button `behind`, the overlap cells' back
// link `back`.
export function nameOf(label,spec={}){
  const t=typeof label==='string'?label.trim():'';
  if(!t)return 'unlabelled';
  if(t===spec.before||t===spec.after)return 'target';
  if(t==='Archive')return 'archive';
  if(t==='Drafts')return 'drafts';
  if(t==='Compose'||t==='Next')return 'twin';
  if(t==='Close')return spec.rival?'twin':'behind';
  if(t==='Older')return 'back';
  return 'other';
}

// The record (the observation's nodes, in the walk's preorder with their depth): the node #296 takes at the point (the
// deepest whose frame holds it, the later of two at one depth), whether it is an inert layer (no interactive role, no
// AXPress, no acting ancestor: #433's precondition), and the innermost controls whose frames hold the point, by the
// engine's rule (an interactive role or AXPress) and by role alone. Frames stand in for the engine's shown frames.
export function recordAt(nodes,p,spec={}){
  const list=Array.isArray(nodes)?nodes:[];
  const parent=[],path=[];
  list.forEach((n,i)=>{const d=Number.isInteger(n?.depth)?n.depth:0;path.length=Math.min(path.length,d);parent[i]=d>0?path[d-1]??null:null;path[d]=i;});
  const acts=n=>INTERACTIVE.has(n?.role)||(Array.isArray(n?.actions)&&n.actions.includes('AXPress'));
  const at=list.map((n,i)=>i).filter(i=>holds(list[i]?.frame,p));
  let deepest=null;for(const i of at)if(deepest==null||(list[i].depth??0)>=(list[deepest].depth??0))deepest=i;
  const up=i=>{const out=[];for(let j=parent[i];j!=null;j=parent[j])out.push(j);return out;};
  const innermost=pred=>{const set=at.filter(i=>pred(list[i]));const holders=new Set(set.flatMap(up));
    return set.filter(i=>!holders.has(i)).map(i=>({name:nameOf(label(list[i]),spec),role:role(list[i].role),frame:frameOf(list[i].frame),
      press:Array.isArray(list[i].actions)&&list[i].actions.includes('AXPress')}));};
  const d=deepest==null?null:list[deepest];
  return {deepest:d?role(d.role):null,inert:!!d&&!acts(d)&&!up(deepest).some(j=>acts(list[j])),
    engine:innermost(acts),role:innermost(n=>INTERACTIVE.has(n?.role))};
}
const label=n=>[n?.title,n?.description,n?.value].find(v=>typeof v==='string'&&v.trim())??'';

// One walk's controls (host.swift `collect`: preorder, each with its nearest acting ancestor `up`): the innermost by the
// engine's rule and by role alone, in tree order, with what each offers about stacking (`visible`: its parent's
// AXVisibleChildren lists it; `index` among its parent's AXChildren).
export function liveSet(walk,spec={}){
  if(!walk||!Array.isArray(walk.found))return null;
  const f=walk.found;
  const chain=i=>{const out=[];for(let j=f[i].up;Number.isInteger(j)&&j>=0&&j<f.length&&!out.includes(j);j=f[j].up)out.push(j);return out;};
  const pick=pred=>{const set=f.map((_,i)=>i).filter(i=>pred(f[i]));const holders=new Set(set.flatMap(chain));
    return set.filter(i=>!holders.has(i)).map(i=>({name:nameOf(f[i].label,spec),role:role(f[i].role),frame:frameOf(f[i].frame),press:f[i].press===true,
      ...(f[i].visible!==undefined?{visible:f[i].visible}:{}),...(Number.isInteger(f[i].index)?{index:f[i].index,siblings:f[i].siblings}:{})}));};
  return {engine:pick(()=>true),role:pick(x=>INTERACTIVE.has(x.role)),visited:walk.visited,ms:walk.ms,cut:walk.cut===true,unsupported:walk.unsupported??0};
}
const key=c=>`${c.name}:${c.role}`;
// Whether two control sets are the same: the same names and roles, each frame within 2 pt.
export function sameSet(a,b){
  if(!a||!b||a.length!==b.length)return false;
  const left=[...b];
  return a.every(c=>{const i=left.findIndex(d=>key(d)===key(c)&&(!c.frame||!d.frame||['x','y','width','height'].every(k=>Math.abs(c.frame[k]-d.frame[k])<=2)));
    if(i<0)return false;left.splice(i,1);return true;});
}
const names=set=>set?set.map(c=>c.name).sort().join('+')||'none':null;
// A hit's closed name: its control's page name, the cover (`overlay`, the veil's DOM id or a group), else its role.
export function hitName(h,spec={}){
  if(!h||h.role==null)return 'nothing';
  if(h.control)return nameOf(h.control.label,spec);
  if(h.dom==='veil'||h.role==='AXGroup')return 'overlay';
  return role(h.role)??'nothing';
}
const tally=list=>list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
// One reading of host.swift `signals` as closed facts.
export function axFacts(s,spec={}){
  if(!s||typeof s!=='object')return null;
  if(s.error)return {error:String(s.error).slice(0,40),ms:s.ms??null};
  // Only what the reading asked for (\`walks\`, \`hits\`, \`seq\`).
  const out={ms:s.ms??null};
  if(s.full)for(const k of ['full','pruned','nav','visible'])out[k]=liveSet(s[k],spec);
  if(s.hit!==undefined){
    Object.assign(out,{hitMs:s.hitMs??null,hitsMs:s.hitsMs??null,hit:hitName(s.hit,spec),webFrom:s.webFrom==='hit'?'hit':'windows'});
    out.grid=tally((Array.isArray(s.grid)?s.grid:[]).map(h=>hitName(h,spec)));
    out.hitFromWeb=hitName(s.hitFromWeb,spec);
    out.hitFromChain=(Array.isArray(s.hitFromChain)?s.hitFromChain:[]).map(h=>`${role(h.root)}>${hitName(h,spec)}`);
  }
  // The hit sequence at the point: each answer and the ms it first came.
  if(Array.isArray(s.seq))out.seq=s.seq.map(h=>`${hitName(h,spec)}@${Number.isFinite(h.t)?Math.round(h.t):'?'}`);
  if(Array.isArray(s.attributeNames))out.attributeNames=s.attributeNames.filter(n=>/^(param:)?AX[A-Za-z]{1,60}$/.test(n));
  return out;
}
// The page's own truth, closed already (page.mjs `probe`).
const CLOSED=new Set(['target','archive','drafts','twin','other','none','back','overlay','page']);
export const domFacts=d=>!d||d.error?null:{top:CLOSED.has(d.top)?d.top:'other',stack:(d.stack??[]).map(n=>CLOSED.has(n)?n:'other'),
  boxes:(d.boxes??[]).map(n=>CLOSED.has(n)?n:'other'),ms:d.ms??null};
// The control a click reached, from the page's log: the first click event's, else the first event's, else nothing.
export function recipientOf(clicks){
  const list=Array.isArray(clicks)?clicks:[];
  const c=list.find(x=>x?.type==='click')??list[0];
  return c?(CLOSED.has(c.link)?c.link:'other'):'nothing';
}
// The page's paint order at the point, controls only (top first): what draws on top among the controls there.
const paintControls=dom=>dom?dom.stack.filter(n=>!['overlay','page'].includes(n)):[];
// Per row: the record's controls, the live walks before the change (after the observation) and before the click, the
// page's truth at both, and the judgements each option would make.
// - a: the live set at the click (the full walk, innermost by role) against the record's, and against the live set
//   read after the observation (`preVsPost`, live against live); `complete`: the live set's names are every control the
//   page has whose box holds the point; `prunedSame`/`navSame`/`visibleSame`: the cheaper walks find the full walk's set.
// - b: the record holds two or more unrelated controls at the point (by role; `engine` by the engine's rule); its rule
//   refuses where one of them changed (`a.recordLost`).
// - stack: where the page holds two or more controls at the point, whether the later in the tree's order (what
//   `deepestScreenshotNode` assumes draws above) is the one painted on top, and whether AXVisibleChildren leaves out the
//   covered one.
// - c: elementFromPoint at the click names the control the click reached.
// \`pre\` and \`post\` are walks (no hit-test before the click, which would move Chromium's hit cache under the engine);
// \`after\` the hits and the hit sequence read after the click; \`warm\` a hit sequence read just before it (PROBE_HITS=warm).
export function signalsOf({spec={},nodes,point,pre,post,after,warm,domPre,domPost,clicks}){
  const record=nodes?recordAt(nodes,point,spec):null;
  const ax={pre:axFacts(pre,spec),post:axFacts(post,spec),after:axFacts(after,spec),warm:axFacts(warm,spec)},dom={pre:domFacts(domPre),post:domFacts(domPost)};
  const live=w=>w?.full?.role??null;
  const recipient=clicks?recipientOf(clicks):null;
  const boxesOf=d=>d?[...new Set(d.boxes)].sort().join('+')||'none':null;
  const stackAt=(a,d)=>{const painted=paintControls(d);if(painted.length<2||!a?.full)return null;
    const tree=a.full.role;const later=tree.length?tree[tree.length-1].name:null;
    return {paintTop:painted[0],treeLast:later,treeAgrees:later===painted[0],
      visible:Object.fromEntries(tree.filter(c=>c.visible!==undefined).map(c=>[c.name,c.visible]))};};
  return {
    record:record&&{deepest:record.deepest,inert:record.inert,role:names(record.role),engine:names(record.engine),
      engineRoles:record.engine.map(c=>c.role).sort().join('+')||'none'},
    ax,dom,recipient,
    a:{recordVsPost:record&&live(ax.post)?!sameSet(record.role,live(ax.post)):null,
      // (b)'s trigger: a control of the record's set at the point not found, in place, in the live set at the click.
      recordLost:record&&live(ax.post)?record.role.some(c=>!live(ax.post).some(d=>sameSet([c],[d]))):null,
      preVsPost:live(ax.pre)&&live(ax.post)?!sameSet(live(ax.pre),live(ax.post)):null,
      livePost:names(live(ax.post)),livePre:names(live(ax.pre)),
      complete:live(ax.post)&&dom.post?names(live(ax.post))===boxesOf(dom.post):null,
      completePre:live(ax.pre)&&dom.pre?names(live(ax.pre))===boxesOf(dom.pre):null,
      prunedSame:ax.post?.pruned&&ax.post?.full?names(ax.post.pruned.role)===names(ax.post.full.role):null,
      navSame:ax.post?.nav&&ax.post?.full?names(ax.post.nav.role)===names(ax.post.full.role):null,
      visibleSame:ax.post?.visible&&ax.post?.full?names(ax.post.visible.role)===names(ax.post.full.role):null},
    b:{overlap:record?record.role.length>=2:null,overlapEngine:record?record.engine.length>=2:null},
    stack:{pre:stackAt(ax.pre,dom.pre),post:stackAt(ax.post,dom.post)},
    c:{top:dom.post?.top??null,agrees:dom.post&&recipient&&recipient!=='nothing'?dom.post.top===recipient:null},
  };
}
// The CSS point for a screen point, through the target's box: the page's own (CSS px, at prepare) and its AX frame at the
// observation (screen points); null when either is missing.
export function cssPoint(dom,ax,screen){
  if(!dom||!ax||!screen||!Number.isFinite(dom.x)||!Number.isFinite(ax.x))return null;
  return {x:dom.x+(screen.x-ax.x),y:dom.y+(screen.y-ax.y)};
}
