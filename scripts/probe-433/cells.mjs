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
  // decoration alive, so main keeps and lands on B; the fix must refuse and never reach B, gate overlayTwin).
  textbehind:{kind:'keep',before:'Inbox',after:'Inbox',behindText:['Saved','Saving']},
  decomove:{kind:'twin',before:'Inbox',after:'Next',twin:'deco',cover:'deco',records:'AXGroup'},
  // The fix's costs (the builder's, reported, never gated: `reportOnlyAt` every point): a fixed header strip that catches
  // the pointer over the link, the page scrolled 128 px under it (`stickyscroll`: main keeps the header, the fix may refuse
  // the link as moved); the veil over a link re-rendered whole with its label (`tipremount`: #431's strict form judges the
  // link beneath); the veil over the first of three same-label links, re-rendered whole (`twinunder`: the record holds
  // twins of the link beneath).
  stickyscroll:{kind:'asMain',before:'Inbox',after:'Inbox',cover:'sticky',scroll:128,records:'AXGroup',reportOnlyAt:['text','link']},
  tipremount:{kind:'keep',before:'Inbox',after:'Inbox',cover:'veil',remount:'link',records:'AXGroup',reportOnlyAt:['text','link']},
  twinunder:{kind:'keep',before:'Delete',after:'Delete',cover:'veil',remount:'link',list:true,records:'AXGroup',reportOnlyAt:['text','link']},
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
