import {createInterface} from 'node:readline';
const send=x=>console.log(JSON.stringify({jsonrpc:'2.0',...x}));let pending;
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')send({id:m.id,result:{serverInfo:{name:'control-double',version:'1'}}});
 else if(m.method==='tools/call'){pending=m.id;send({id:'ask',method:'elicitation/create',params:{message:'fixture',requestedSchema:{type:'object'}}});}
 else if(m.id==='ask')send({id:pending,result:{content:[{type:'text',text:JSON.stringify(m.result)}]}});
 else if(m.method==='notifications/cancelled')send({method:'test/cancelled',params:m.params});
});
