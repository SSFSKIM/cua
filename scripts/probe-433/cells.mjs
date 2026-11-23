// #431's cells (built on #340's kit): what the owned page does to the target control between the observation (with its
// screenshot, which is what #296's stale-point record is taken from) and the coordinate click, and where the click is
// placed. Link truth is the owned page's own (./page.mjs), never read through cua.

export const LANES=['cft','safari','electron'];
// `kind` names the gate a cell answers to in a qualification (check.mjs `gates`):
// - twin: a different control with the target's label takes the removed target's place, so the right answer is
//   nodeGone and no click on the other control (#431); main lands on it. `twin` says how the other control gets there:
//   `move`, a second control moved up into the target's row (`twin`; `twinbtn`, the same with buttons); `list`, the
//   target's row removed from a list of identical "Delete" links, the next row reflowing up into its place (`twindel`);
//   `cap`, a second link the observation never read, past the walk's node cap (after a filler below the fold), moved
//   into the target's row (`twincap`); `deep`, one in a subtree the walk does not descend into (below its depth cap),
//   moved up into the target's row (`twindeep`). The last two are ruling 881's: the other control is absent from the
//   record, so a rule that only refuses a control the record holds elsewhere cannot tell it from the target re-created.
// - keep: genuine re-creation of the same control, which must stay kept and land as on main: the link re-rendered whole
//   with the same label at the same place (`remount`, a React-style key remount), its text element re-created in place
//   (`retext`), the same text re-created (`plain`), a same-width count (`like`, #298's), and a button re-rendered whole
//   (`btnremount`, #296's re-created button);
// - big: the link re-rendered whole where the observation's record does not hold every child of its container, so the
//   fix (which takes a re-created handle only where the record covered where it lies) may refuse a genuine re-creation:
//   the target first in a container of 150 more links running past the window (`wideremount`: the width rule keeps the
//   visible subset), or of 59 shown groups of 100 small texts each (`capremount`: the node cap ends the walk inside the
//   container). Reported (`bigPage`), never part of the pass: how often a large page costs a re-creation its click.
// - asMain: every other cell answers as main does (#340's: the text that grows, shrinks or changes meaning, the moved
//   link; refusals on main at the text where the text's width changes).
// - refuse (#442): another live control comes on top of the recorded target under an inert layer; the fix must refuse
//   every row and reach nothing (gate `otherOnTop`).
// - shape (#442, the fix review's false-refusal shapes): each answers as main row for row, reason included (gate
//   `shapeAsMain`).
// - report (#442): run and reported only (`reportOnlyAt` every point).
// `style` gives the link a width the change keeps (`tabular`: a fixed width with tabular digits; `mono`: monospace;
// `right` and `centre`: a fixed width with the text aligned right or centred).
// `control: 'button'` builds the target (and its twin) as buttons; a button exposes no text child, so only the control
// point (`at: ['link']`) is planned.
export const CELLS={
  twin:{kind:'twin',before:'Inbox',after:'Inbox',twin:'move'},
  twinbtn:{kind:'twin',before:'Inbox',after:'Inbox',twin:'move',control:'button',at:['link']},
  twindel:{kind:'twin',before:'Delete',after:'Delete',twin:'list'},
  twincap:{kind:'twin',before:'Inbox',after:'Inbox',twin:'cap'},
  twindeep:{kind:'twin',before:'Inbox',after:'Inbox',twin:'deep'},
  // The coordinator's second set (the fix review's six holes), all expected refused on the fix: the target moved away on
  // its own element while a new link (`twinswap`) or button (`twinswapbtn`) with its label appears at its old place (a
  // moved handle refuses frameMoved, counted with nodeGone as #340's ruling has it); the twin moved up under a group laid
  // over the target's row that survives (`twincover`); the twin's row, alive, moving up with the twin re-rendered in it
  // (`twinrow`); a list of WIDE rows with the twin the first the window does not show (`twinwide`).
  twinswap:{kind:'twin',before:'Inbox',after:'Inbox',twin:'swap',reasons:['nodeGone','frameMoved']},
  twinswapbtn:{kind:'twin',before:'Inbox',after:'Inbox',twin:'swap',swap:'button',reasons:['nodeGone','frameMoved']},
  // #433: the twin moved up under a transparent group (`cover: 'veil'`, pointer-events:none) laid over the target's row
  // that survives the change, nested so the record holds it at both points (`records`). Main keeps the live overlay
  // (sameElement) and the click falls through to the twin; the fix must refuse, any reason, and never reach the twin
  // (gate `overlayTwin`).
  twincover:{kind:'twin',before:'Inbox',after:'Inbox',twin:'cover',cover:'veil',records:'AXGroup'},
  twinrow:{kind:'twin',before:'Inbox',after:'Inbox',twin:'row'},
  // A group of links, the shape whose width cut Safari shows (Chromium reads such a group whole), so Safari only.
  twinwide:{kind:'twin',before:'Delete',after:'Delete',twin:'wide',lanes:['safari']},
  // #435's frameless twins: the second "Inbox" link, in the second row, inside a container that may leave the browser
  // listing it with no AXPosition or AXSize (`hide`): a collapsed <details> (`details`), a content-visibility:auto section
  // below the fold (`cv`), a hidden=until-found section (`until`), a 0x0 overflow:hidden box (`zero`), a 64 px
  // overflow:hidden box the link lies past (`clip`). After the observation the target and the hidden twin are removed and
  // a new link with the label rendered in the target's row (new handles: a handle the record holds is refused on main). #431's twin search reads the record's framed nodes only, so main keeps the re-created match and
  // lands on the twin; #435's reads the frameless ones too and must refuse. Gated (`twinFrameless`) only where the
  // observation holds the twin frameless (check.mjs `uncoveredBy`); mode `discover` records what each lane lists.
  twindetails:{kind:'twin',before:'Inbox',after:'Inbox',twin:'hidden',hide:'details'},
  twincv:{kind:'twin',before:'Inbox',after:'Inbox',twin:'hidden',hide:'cv'},
  twinuntil:{kind:'twin',before:'Inbox',after:'Inbox',twin:'hidden',hide:'until'},
  twinzero:{kind:'twin',before:'Inbox',after:'Inbox',twin:'hidden',hide:'zero'},
  twinclip:{kind:'twin',before:'Inbox',after:'Inbox',twin:'hidden',hide:'clip'},
  remount:{kind:'keep',before:'Inbox',after:'Inbox',remount:'link'},
  retext:{kind:'keep',before:'Inbox',after:'Inbox',remount:'text'},
  like:{kind:'keep',before:'Like (12)',after:'Like (13)',style:'tabular'},
  plain:{kind:'keep',before:'Inbox',after:'Inbox'},
  btnremount:{kind:'keep',before:'Again',after:'Again',remount:'link',control:'button',at:['link']},
  // Chromium reads a 151-child group whole (smoke run 44520748737: no width cut on CfT or Electron), so Safari only.
  wideremount:{kind:'big',before:'Inbox',after:'Inbox',remount:'link',big:'wide',lanes:['safari']},
  capremount:{kind:'big',before:'Inbox',after:'Inbox',remount:'link',big:'cap'},
  // Ruling 891's groups. #330's wide parent: the target first of 151 links in one group, and after the observation a new
  // child of that group, a text, laid over the target (a page's own suggestion box) and hit at the point: as main
  // (rule dL, newElementOverPoint, where the record holds the parent with every child). A data table, whose cells
  // Chromium lists under both its rows and its columns, beside a link re-rendered whole (`tableremount`), or holding it
  // in its first cell (`tablecellremount`): kept and landed, as main.
  wideoverlay:{kind:'asMain',before:'Inbox',after:'Inbox',layout:'wide',overlay:true},
  tableremount:{kind:'keep',before:'Inbox',after:'Inbox',remount:'link',table:'outside'},
  tablecellremount:{kind:'keep',before:'Inbox',after:'Inbox',remount:'link',table:'cell'},
  // #433's controls, each under an overlay the record holds at the point and nothing changing: the same transparent veil
  // over the live link (`overcontrol`: kept and landed on both heads); a click-catching backdrop (`scrim`, ruling 903: a
  // full-row group with no interactive role and no pointer-events:none, which eats the click on main; the fix no worse,
  // and reaching nothing main's does not); the veil beside the link, nothing interactive under it, aimed past the link's
  // right edge (`nounder`, `aim: 'beside'`: kept as on main).
  overcontrol:{kind:'keep',before:'Inbox',after:'Inbox',cover:'veil',records:'AXGroup'},
  scrim:{kind:'asMain',before:'Inbox',after:'Inbox',cover:'scrim',records:'AXGroup'},
  nounder:{kind:'asMain',before:'Inbox',after:'Inbox',cover:'beside',aim:'beside',records:'AXGroup',at:['link']},
  // The fix review's regressions, kept and landed as main (gate `overlayKept`): the veil over link A, in a branch of its
  // own, while A's list parent is re-rendered in place with A's label unchanged (`rebuildunder`); the veil over an
  // unchanged link and its text while an unrelated button behind them is removed (`bgbutton`).
  rebuildunder:{kind:'keep',before:'Inbox',after:'Inbox',cover:'veil',parent:'list',records:'AXGroup'},
  bgbutton:{kind:'keep',before:'Inbox',after:'Inbox',cover:'veil',behind:'button',records:'AXGroup'},
  // The second fix wave's cells: the link's text unchanged while the text behind it changes (`textbehind`, kept as main,
  // gate keptAsMain: the record holds the link's text, no overlay); an inert decoration (a group nested two deep, the
  // size of the link) moved from link A into a new link B, "Next", at the same point (`decomove`: the record holds the
  // decoration alive, so main keeps and lands on B; reported, never gated).
  textbehind:{kind:'keep',before:'Inbox',after:'Inbox',behindText:['Saved','Saving']},
  // #443 gates decomove (overlayTwin, and decoGone: refused controlGone wherever main kept); #433 reported it only.
  decomove:{kind:'twin',before:'Inbox',after:'Next',twin:'deco',cover:'deco',records:'AXGroup'},
  // #443's role change: the same decoration inside link A, and mark gives A's own element role=button (Chromium
  // re-creates an element's accessibility object when its role changes). The DOM element, its box and its label stay, so
  // a click lands on A; the fix's named limit is a control re-created this way while the decoration's object survives,
  // which it would refuse controlGone (gate overlayKept: kept and landed as main).
  rolechange:{kind:'keep',before:'Inbox',after:'Inbox',cover:'deco',role:'button',records:'AXGroup'},
  // #443's review shape (2a3c7e53's hitControlVouches): a back link under the target, the record taking the back link's
  // decoration at the point; mark removes the back link, the decoration kept in place, moved into the target (`overlapinto`)
  // or into the row under it (`overlaprow`); the target, in front, unchanged, takes the click (gate overlayKept: kept and
  // landed as main).
  overlapinto:{kind:'keep',before:'Inbox',after:'Inbox',cover:'deco',overlap:'into',records:'AXGroup'},
  overlaprow:{kind:'keep',before:'Inbox',after:'Inbox',cover:'deco',overlap:'row',records:'AXGroup'},
  // The fix's costs (the builder's, reported, never gated: `reportOnlyAt` every point): a fixed header strip that catches
  // the pointer over the link, the page scrolled 128 px under it (`stickyscroll`: main keeps the header, the fix may refuse
  // the link as moved); the veil over a link re-rendered whole with its label (`tipremount`: #431's strict form judges the
  // link beneath); the veil over the first of three same-label links, re-rendered whole (`twinunder`: the record holds
  // twins of the link beneath).
  stickyscroll:{kind:'asMain',before:'Inbox',after:'Inbox',cover:'sticky',scroll:128,records:'AXGroup',reportOnlyAt:['text','link']},
  tipremount:{kind:'keep',before:'Inbox',after:'Inbox',cover:'veil',remount:'link',records:'AXGroup',reportOnlyAt:['text','link']},
  twinunder:{kind:'keep',before:'Delete',after:'Delete',cover:'veil',remount:'link',list:true,records:'AXGroup',reportOnlyAt:['text','link']},
  // #442's measurement (main alone, mode measure; `kind` is never gated there): two shapes where the record under an inert
  // veil holds link A and the click reaches another control, B, which the page logs as `twin`.
  // - slideover: button B ("Compose", A's box) in the second row, drawn under the veil (veil z-index 2, B 1); mark slides B
  //   up over A by a transform (its element and AX object survive; A not removed, unchanged).
  // - siblingstack: button B ("Close", A's box), a later sibling of A in A's row; CSS stacks A (z-index 1) above B (0), so
  //   the record holds both at the point; mark removes A.
  // #442's qualification gates slideover (kind refuse) and keeps siblingstack as main (the declared limit, overlayAsMain).
  slideover:{kind:'refuse',before:'Inbox',after:'Inbox',cover:'veil',rival:'slide',records:'AXGroup'},
  siblingstack:{kind:'asMain',before:'Inbox',after:'Inbox',cover:'veil',rival:'stack',records:'AXGroup'},
  // #442's qualification, the fix review's shapes, all under the record's inert layer at the point:
  // - veilinto (refuse): as slideover, and mark also moves the veil into B as B slides over A.
  // - overflowlink: the target overflowing a 20 px wide parent (no clip), the text point in the overflow; nothing changes.
  //   (The review's shape has the parent's read fail, which a page cannot cause.)
  // - deepfront: button F ("Close", the target's box) drawn over the target under the veil, nested DEEP groups down, so
  //   the walk's depth cut leaves F out of the record; the screenshot shows F on top and nothing changes (both heads reach
  //   F, logged as `twin`).
  // - rescrim: the scrim re-created whole in place (a new element, the same box).
  // - scrimhidden: the scrim holding an aria-hidden child over the row, which Chromium may hit but does not list; nothing
  //   changes.
  // - widen: siblingstack's two candidates, and mark widens the front one (the target) by 10 px on its right instead of
  //   removing it; the click lands on the target.
  veilinto:{kind:'refuse',before:'Inbox',after:'Inbox',cover:'veil',rival:'slide',veilInto:true,records:'AXGroup'},
  overflowlink:{kind:'shape',before:'Inbox',after:'Inbox',cover:'veil',narrow:true,records:'AXGroup'},
  deepfront:{kind:'shape',before:'Inbox',after:'Inbox',cover:'veil',front:'deep',records:'AXGroup'},
  rescrim:{kind:'shape',before:'Inbox',after:'Inbox',cover:'scrim',recover:true,records:'AXGroup'},
  scrimhidden:{kind:'shape',before:'Inbox',after:'Inbox',cover:'scrim',hiddenChild:true,records:'AXGroup'},
  widen:{kind:'shape',before:'Inbox',after:'Inbox',cover:'veil',rival:'stack',widen:10,records:'AXGroup'},
  // Ruling 1079's shapes, each expected to keep and land as on main:
  // - shrinkfront: siblingstack's two candidates, the front link's text a positioned span; mark shrinks the front link's
  //   box to 20 px (padding 0) away from the text point while its text stays there.
  // - textoutside: the link's text drawn outside its box (a positioned span 8 px past its right edge), the veil deeper
  //   than the text so the record takes the veil; nothing changes.
  // - parentpad (#305's edge): the link in a parent with 16 px of left padding and a ::before 12 px wide out into it, the
  //   point 6 pt left of the link's frame (its parent's padding, which the link's pseudo-element takes); nothing changes.
  // - contentsfront: link F ("Close", display:contents, so no box of its own at the observation) whose positioned span
  //   covers the target's box on top; mark gives F a box of its own over the same place (display:block); both heads
  //   reach F. The observation's frame of F is recorded (\`frontFrame\`).
  // (A wrapper whose actions read unknown at the observation cannot be caused by a page.)
  shrinkfront:{kind:'shape',before:'Inbox',after:'Inbox',cover:'veil',rival:'stack',shrink:true,records:'AXGroup'},
  textoutside:{kind:'shape',before:'Inbox',after:'Inbox',cover:'veil',outsideText:true,records:'AXGroup'},
  parentpad:{kind:'shape',before:'Inbox',after:'Inbox',cover:'veil',pad:true,aim:'pad',at:['link'],records:'AXGroup'},
  contentsfront:{kind:'shape',before:'Inbox',after:'Inbox',cover:'veil',front:'contents',records:'AXGroup'},
  // Ruling 1080: two recorded links under the veil at the point, front link A (the target, z-index 1) and link C
  // ("Close", A's box, z-index 0); mark relabels A ("Inbox" to "Sent"), C unchanged. #433's first survivor is the later
  // of the two in tree order: C (relabelfront: C after A, both heads sameElement) or A (relabelfirst: C before A, both
  // heads relabelled). As main row for row.
  relabelfront:{kind:'shape',before:'Inbox',after:'Sent',cover:'veil',rival:'stack',rivalLink:true,relabel:true,records:'AXGroup'},
  relabelfirst:{kind:'shape',before:'Inbox',after:'Sent',cover:'veil',rival:'stack',rivalLink:true,rivalFirst:true,relabel:true,records:'AXGroup'},
  // A popup window of the app's own opened over the point while the fix waits to hit-test again (Chromium only; the page's
  // window.open, `popup`: the delay after the harness's command sweeps POPUP_DELAYS by repetition). Reported only.
  popupwait:{kind:'report',before:'Inbox',after:'Inbox',cover:'veil',popup:true,lanes:['cft','electron'],records:'AXGroup',at:['link'],reportOnlyAt:['link']},
  inbox:{kind:'asMain',before:'Inbox',after:'Inbox (3)'},
  reltime:{kind:'asMain',before:'1 minute ago',after:'2 minutes ago'},
  shrink:{kind:'asMain',before:'Inbox (12)',after:'Inbox'},
  linksave:{kind:'asMain',before:'Save',after:'Delete'},
  moved:{kind:'asMain',before:'Inbox',after:'Inbox',move:true},
  linkmono:{kind:'asMain',before:'Save',after:'Send',style:'mono'},
  right:{kind:'asMain',before:'1 minute ago',after:'2 minutes ago',style:'right'},
  centre:{kind:'asMain',before:'Inbox',after:'Inbox (3)',style:'centre'},
};
// The filler that puts `twincap`'s twin past the walk's node cap (Walk.swift `maxObservedNodes`, 4,000): groups of at
// most the width rule's 100 children (`widthThreshold`, so every child is read), below the fold, before the twin.
export const FILLER={groups:60,each:100};
// How deep `twindeep`'s twin lies under the target's sibling row: past the walk's 200 levels (Walk.swift `maxDepth`),
// within the guard's 300-level ancestor walk (StalePoint.swift `stalePointAncestorLevels`).
export const DEEP=220;
// The big cells' containers: `wide`, 150 links of 20 px after the target (past the width rule's 100 children, and past the
// window, so only the visible subset is read); `cap`, 59 groups of 100 inline texts, all shown, so the walk spends its
// 4,000-node budget inside the container before reading every child.
export const BIG={wide:150,groups:59,each:100};
// `twinwide`'s rows: past the width rule's 100 children, so only those the window shows are read.
export const WIDE=150;
// Where the click is placed in the observation, and so which node #296's record takes at the point: `text`, inside the
// control's AXStaticText near its start; `link`, in the control's left padding, outside its text (the record takes the
// control itself).
export const AT=['text','link'];
// popupwait's delays (ms) from the harness's popup command, which it sends just before the click, by repetition.
export const POPUP_DELAYS=[0,20,40,60,90,150];
export const controlRole=cell=>CELLS[cell].control==='button'?'AXButton':'AXLink';
// The role the record takes at the unit's point: the overlay's for #433's cells (`records`), else the text's or the control's.
export const recordedRole=(cell,at)=>CELLS[cell].records??(at==='text'?'AXStaticText':controlRole(cell));
// #433's overlay cells, gated apart.
export const OVERLAY=new Set(Object.keys(CELLS).filter(c=>CELLS[c].cover));
export const UNITS=Object.keys(CELLS).flatMap(cell=>(CELLS[cell].at??AT).map(at=>({cell,at})));
export const unitKey=u=>`${u.cell}/${u.at}`;
// The other links on the page, never the target: any click that reaches one is a click on a wrong target.
export const OTHERS={archive:'Archive',drafts:'Drafts'};

// The screen point for a unit, from the observation's frame of the node it aims at (global screen points, top-left).
// `beside` (#433's `nounder`): 60 pt past the control's right edge, under the overlay laid there.
export function pointFor(at,frame,spec={}){
  if(!frame||!(frame.width>0)||!(frame.height>0))return null;
  if(spec.aim==='beside')return {x:frame.x+frame.width+60,y:frame.y+frame.height/2};
  if(spec.aim==='pad')return {x:frame.x-6,y:frame.y+frame.height/2};  // #442's parentpad: the parent's padding
  return at==='text'?{x:frame.x+Math.min(frame.width/3,12),y:frame.y+frame.height/2}:{x:frame.x+6,y:frame.y+frame.height/2};
}

// The units of a run: every unit, or those of the named cells or units (a comma list of `cell` or `cell/at`; unknown
// names are refused).
export function unitsFor(filter){
  if(!filter)return UNITS;
  const names=filter.split(',').map(s=>s.trim()).filter(Boolean),keys=new Set(UNITS.map(unitKey));
  if(!names.length||names.some(n=>!Object.hasOwn(CELLS,n)&&!keys.has(n)))throw Error('unknown cell');
  const units=UNITS.filter(u=>names.includes(u.cell)||names.includes(unitKey(u)));
  if(!units.length)throw Error('no units');
  return units;
}
// A lane's units: those of the filter whose cell runs on the lane (a cell's `lanes`, when it names some). Empty when the
// lane has none to run, which the workflow's plan drops from the matrix and the runner refuses.
export const unitsForLane=(filter,lane)=>unitsFor(filter).filter(u=>!CELLS[u.cell].lanes||CELLS[u.cell].lanes.includes(lane));
// A unit run and reported, never gated (`reportOnlyAt`): it counts toward no gate, coverage or abort streak.
export const isReportOnly=u=>(CELLS[u.cell].reportOnlyAt??[]).includes(u.at);
// A dispatch's `reps`: empty takes the mode's; anything else must be an integer 1-99.
export function repsOf(input){
  if(input==null||input==='')return null;
  if(!/^[1-9][0-9]?$/.test(input))throw Error('reps must be an integer 1-99');
  return Number(input);
}

// Rows in run order. A qualification interleaves the heads, alternating which goes first per unit and repetition.
export function plan({mode,heads,units=UNITS,reps:override=null}){
  const reps=Number.isInteger(override)&&override>0?override:mode==='smoke'?1:mode==='qualify'?20:mode==='discover'?3:10;
  const rows=[];
  for(let rep=0;rep<reps;rep++)units.forEach((u,i)=>{
    const order=heads.length===2&&(rep+i)%2===1?[heads[1],heads[0]]:heads;
    for(const head of order)rows.push({...u,rep,head});
  });
  return rows;
}
