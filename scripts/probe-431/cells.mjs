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
  twincover:{kind:'twin',before:'Inbox',after:'Inbox',twin:'cover'},
  twinrow:{kind:'twin',before:'Inbox',after:'Inbox',twin:'row'},
  // A group of links, the shape whose width cut Safari shows (Chromium reads such a group whole), so Safari only.
  twinwide:{kind:'twin',before:'Delete',after:'Delete',twin:'wide',lanes:['safari']},
  remount:{kind:'keep',before:'Inbox',after:'Inbox',remount:'link'},
  retext:{kind:'keep',before:'Inbox',after:'Inbox',remount:'text'},
  like:{kind:'keep',before:'Like (12)',after:'Like (13)',style:'tabular'},
  plain:{kind:'keep',before:'Inbox',after:'Inbox'},
  btnremount:{kind:'keep',before:'Again',after:'Again',remount:'link',control:'button',at:['link']},
  // Chromium reads a 151-child group whole (smoke run 44520748737: no width cut on CfT or Electron), so Safari only.
  wideremount:{kind:'big',before:'Inbox',after:'Inbox',remount:'link',big:'wide',lanes:['safari']},
  capremount:{kind:'big',before:'Inbox',after:'Inbox',remount:'link',big:'cap'},
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
export const recordedRole=(cell,at)=>at==='text'?'AXStaticText':controlRole(cell);
export const UNITS=Object.keys(CELLS).flatMap(cell=>(CELLS[cell].at??AT).map(at=>({cell,at})));
export const unitKey=u=>`${u.cell}/${u.at}`;
// The other links on the page, never the target: any click that reaches one is a click on a wrong target.
export const OTHERS={archive:'Archive',drafts:'Drafts'};

// The screen point for a unit, from the observation's frame of the node it aims at (global screen points, top-left).
export function pointFor(at,frame){
  if(!frame||!(frame.width>0)||!(frame.height>0))return null;
  return at==='text'?{x:frame.x+Math.min(frame.width/3,12),y:frame.y+frame.height/2}:{x:frame.x+6,y:frame.y+frame.height/2};
}

// The units of a run: every unit, or those of the named cells (a comma list; unknown names are refused).
export function unitsFor(filter){
  if(!filter)return UNITS;
  const names=filter.split(',').map(s=>s.trim()).filter(Boolean);
  if(!names.length||names.some(n=>!Object.hasOwn(CELLS,n)))throw Error('unknown cell');
  const units=UNITS.filter(u=>names.includes(u.cell));
  if(!units.length)throw Error('no units');
  return units;
}

// Rows in run order. A qualification interleaves the heads, alternating which goes first per unit and repetition.
export function plan({mode,heads,units=UNITS}){
  const reps=mode==='smoke'?1:mode==='qualify'?20:10;
  const rows=[];
  for(let rep=0;rep<reps;rep++)units.forEach((u,i)=>{
    const order=heads.length===2&&(rep+i)%2===1?[heads[1],heads[0]]:heads;
    for(const head of order)rows.push({...u,rep,head});
  });
  return rows;
}
