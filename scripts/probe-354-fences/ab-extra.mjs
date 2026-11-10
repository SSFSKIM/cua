// Builder-requested diagnostic cells, kept separate from the original rate denominators.
export function extraPlan({browser,editor,reps}){
 const out=[],add=c=>out.push({...c,id:[c.part,c.editor,c.variant??'spike',c.rep].join('/'),key:'cmd+a',length:c.text?.length??null});
 for(let rep=1;rep<=reps;rep++){
  if(editor!=='compose')add({part:'ending-return',editor,rep,text:'First line\n',expectedAnswer:editor==='input'?'keysUnconfirmed':'confirmed',expectedText:editor==='input'?'First line':'First line\n'});
  add({part:'ending-tab',editor,rep,text:'Tab prefix\t',expectedAnswer:'keysUnconfirmed',expectedText:'Tab prefix'});
  if(['textarea','contenteditable'].includes(editor))add({part:'multiline',editor,rep,text:'First line\nSecond line',expectedAnswer:'confirmed'});
  if(browser==='cft'&&editor==='textarea')add({part:'truncation',editor,rep,variant:'unicode-cap',text:'New typed sentence goes here.',seed:'한'.repeat(10001),expectedAnswer:'typeUnconfirmed'});
  if(editor==='input')for(const variant of ['equality','mismatch'])add({part:'secret',editor,rep,variant,text:'{{secret:PROBE354}}',secret:true,key:null,expectedAnswer:variant==='equality'?'confirmed':'typeUnconfirmed'});
 }
 return out.map(c=>({...c,key:c.secret||c.variant==='unicode-cap'?null:c.key,renderedText:c.editor==='contenteditable'&&['ending-return','multiline'].includes(c.part),variant:c.variant??'spike'}));
}
export const qualifiedKeyAnswer=(cell,raw)=>['ending-return','ending-tab'].includes(cell.part)&&cell.expectedAnswer==='keysUnconfirmed'&&readbackStatus(raw).keysUnconfirmed>0;
export function readbackStatus(raw){
 const r=(raw.result?.meta??raw.error?.meta)?.typeReadback;
 return {confirmed:r?.confirmed===true,keysUnconfirmed:r?.keysUnconfirmed??0,checkpoints:r?.checkpoints??0};
}
