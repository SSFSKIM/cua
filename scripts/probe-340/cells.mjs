// #340's cells: what the owned page does to the target link between the observation (with its screenshot, which is
// what #296's stale-point record is taken from) and the coordinate click, and where the click is placed. Link truth is
// the owned page's own (./page.mjs), never read through cua.

export const LANES=['cft','safari','electron'];
// `kind` names the gate a cell answers to in a qualification (check.mjs `gates`):
// - grow, shrink: a count or a ticking time on the link's text ("Inbox" to "Inbox (3)"), which must be kept and land;
// - refuse: the true refusals, which must stay refused: words that change meaning (linksave) and a link moved away
//   from the point while another link takes its place (moved);
// - asMain: every other cell answers as main does: a same-width count (like), the same text re-created (plain), and a
//   same-width change of meaning (linkmono, refused on main by #298's re-created label check).
// `style` gives the link a width the change keeps (`tabular`: a fixed width with tabular digits; `mono`: monospace).
export const CELLS={
  inbox:{kind:'grow',before:'Inbox',after:'Inbox (3)'},
  reltime:{kind:'grow',before:'1 minute ago',after:'2 minutes ago'},
  shrink:{kind:'shrink',before:'Inbox (12)',after:'Inbox'},
  linksave:{kind:'refuse',before:'Save',after:'Delete'},
  moved:{kind:'refuse',before:'Inbox',after:'Inbox',move:true},
  like:{kind:'asMain',before:'Like (12)',after:'Like (13)',style:'tabular'},
  plain:{kind:'asMain',before:'Inbox',after:'Inbox'},
  linkmono:{kind:'asMain',before:'Save',after:'Send',style:'mono'},
};
// Where the click is placed in the observation, and so which node #296's record takes at the point: `text`, inside the
// link's AXStaticText near its start (the failing case: replacing the text re-creates that node); `link`, in the link's
// left padding, outside its text (the record takes the AXLink, whose handle a text change keeps).
export const AT=['text','link'];
export const RECORDED_ROLE={text:'AXStaticText',link:'AXLink'};
export const UNITS=Object.keys(CELLS).flatMap(cell=>AT.map(at=>({cell,at})));
export const unitKey=u=>`${u.cell}/${u.at}`;
// The other links on the page, never the target: any click that reaches one is a click on a wrong target.
export const OTHERS={archive:'Archive',drafts:'Drafts'};

// The screen point for a unit, from the observation's frame of the node it aims at (global screen points, top-left).
export function pointFor(at,frame){
  if(!frame||!(frame.width>0)||!(frame.height>0))return null;
  return at==='text'?{x:frame.x+Math.min(frame.width/3,12),y:frame.y+frame.height/2}:{x:frame.x+6,y:frame.y+frame.height/2};
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
