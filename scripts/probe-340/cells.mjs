// #340's cells: what the owned page does to the target link between the observation (with its screenshot, which is
// what #296's stale-point record is taken from) and the coordinate click, and where the click is placed. Link truth is
// the owned page's own (./page.mjs), never read through cua.

export const LANES=['cft','safari','electron'];
export const REFUSED_GONE=['nodeGone','frameMoved'];
// `kind` names the gate a cell answers to in a qualification (check.mjs `gates`):
// - grow, shrink: a count or a ticking time on the link's text ("Inbox" to "Inbox (3)"), which must be kept and land;
// - refuse: the true refusals, which must stay refused: words that change meaning (linksave) and a link moved away
//   from the point while another link takes its place (moved);
// - asMain: every other cell answers as main does: a same-width count (like), the same text re-created (plain), and a
//   same-width change of meaning (linkmono, refused on main by #298's re-created label check), and a same-label twin
//   sliding into the removed target's row (twin: main clicks the twin, a wrong target #296's same-frame re-created
//   match makes, filed as #431 and outside #340; its wrong-target count is reported apart and `noWrongTarget` leaves
//   it out);
// - expect: a named answer at the text point, gated (`expectedAnswers`); at the link, as main: a count badge in an
//   AXPress chip inside the link (`badge`: "3" to "12" in a clickable span; refused);
// - limit: reported apart from the gates (`statedLimits`, the coordinator's ruling): a right-aligned relative time that
//   grows (`right`: expected kept at the text) and a centred label that grows (`centre`: expected nodeGone at the text,
//   as on main); at the link, as main.
// `expect` names the text point's expected verdict, and the refusal reasons it accepts: nodeGone and frameMoved are one
// (the coordinator's ruling: a shrinking link's vanished count answers either, both correct refusals).
// `badge` puts the changing text in a clickable span (`onclick`, so AXPress) after the link's own word `label`.
// `style` gives the link a width the change keeps (`tabular`: a fixed width with tabular digits; `mono`: monospace;
// `right` and `centre`: a fixed width with the text aligned right or centred, so the text grows leftward or both ways).
export const CELLS={
  inbox:{kind:'grow',before:'Inbox',after:'Inbox (3)'},
  reltime:{kind:'grow',before:'1 minute ago',after:'2 minutes ago'},
  shrink:{kind:'shrink',before:'Inbox (12)',after:'Inbox'},
  linksave:{kind:'refuse',before:'Save',after:'Delete'},
  moved:{kind:'refuse',before:'Inbox',after:'Inbox',move:true},
  // Two links with the same label and different destinations: the first (the target) is removed and the second slides
  // into its row. The right answer is nodeGone; main lands on the second link (#431), so #340 gates it as main.
  twin:{kind:'asMain',before:'Inbox',after:'Inbox',twin:true},
  like:{kind:'asMain',before:'Like (12)',after:'Like (13)',style:'tabular'},
  plain:{kind:'asMain',before:'Inbox',after:'Inbox'},
  linkmono:{kind:'asMain',before:'Save',after:'Send',style:'mono'},
  right:{kind:'limit',before:'1 minute ago',after:'2 minutes ago',style:'right',expect:{verdict:'kept-landed'}},
  centre:{kind:'limit',before:'Inbox',after:'Inbox (3)',style:'centre',expect:{verdict:'refused',reasons:REFUSED_GONE}},
  badge:{kind:'expect',before:'3',after:'12',badge:true,label:'Inbox',expect:{verdict:'refused'}},
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
