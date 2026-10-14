import {caseSchedule} from '../../../scripts/repl-parity/registry.mjs';
const ids=[
 'timeouts/late-reply-generation-fence','reset/generation-fence','reset/fresh-banner',
 'lifecycle/eof-settles-no-replay','lifecycle/child-exit-settles','lifecycle/owned-group-teardown',
 'confinement/default','confinement/scoped','confinement/disabled','confinement/trusted-write-root-overlap','confinement/linux-fail-closed','confinement/no-unsandboxed-fallback',
];
const plan=new Map(caseSchedule().map(c=>[c.id,c]));
const steps={
 'timeouts/late-reply-generation-fence':['timeout','fresh'],
 'reset/generation-fence':['schedule','reset','fresh'],
 'reset/fresh-banner':['first','again','reset','fresh','timeout','after-timeout'],
 'lifecycle/eof-settles-no-replay':['warm','interrupted','reconnect'],
 'lifecycle/child-exit-settles':['warm','interrupted'],
 'lifecycle/owned-group-teardown':['warm','background'],
 'confinement/default':['filesystem-network'],'confinement/scoped':['filesystem-network'],'confinement/disabled':['filesystem-network'],
 'confinement/trusted-write-root-overlap':[],'confinement/linux-fail-closed':[],
 'confinement/no-unsandboxed-fallback':['reset','refused'],
};
function outcome(tail,value){
 if(!value)return false;
 if(tail==='reset/fresh-banner')return value.oncePerHeap&&value.afterReset&&value.afterTimeout;
 if(tail.includes('generation-fence'))return value.freshHeap===true&&value.staleSideEffect===false;
 if(tail==='lifecycle/owned-group-teardown')return value.confirmed===true&&value.allObservedChildrenGone===true;
 if(tail.startsWith('lifecycle/'))return value.settled===true&&value.executions===1&&value.reconnected===tail.endsWith('eof-settles-no-replay');
 const mode=tail.split('/')[1];
 if(['default','scoped','disabled'].includes(mode))return value.mode===mode&&value.cwdWrite===(mode!=='default')&&value.outsideWrite===(mode==='disabled')&&value.network===(mode==='disabled');
 if(mode==='no-unsandboxed-fallback')return value.codeExecuted===false&&value.toolError===true&&value.outsideWrite!==true&&value.launcherInvoked!==false;
 return value.launched===false&&value.code===(mode==='trusted-write-root-overlap'?'sandbox_conflict':'sandbox_unavailable');
}
export default ids.map(tail=>({...plan.get(`cells/${tail}`),backend:'host-boundary',cells:[...steps[tail].map(label=>({label,op:'probe-step'})),{label:'boundary',op:'boundary',probe:tail}],assert:({results})=>{const ok=results.length===1&&outcome(tail,results[0])===true;return {ok,...(!ok?{reason:tail==='confinement/no-unsandboxed-fallback'?'failed sandbox launch must be refused with no out-of-policy write':'boundary safety condition failed'}:{})};}}));
