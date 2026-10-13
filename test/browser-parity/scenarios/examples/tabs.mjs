export default {
  id:'examples/tabs',milestone:'M1a',commands:['create_tab','name_session'],
  setup:{page:'/counter.html',state:{}},
  cells:[
    {label:'created',code:'return {tabId:tab.id, title:await tab.title()};'},
    {label:'end',op:'endTask'},
  ],
  assert({results,fixtureState}) {
    return {ok:results.every(r=>r.ok) && results[0].value.title==='Browser parity fixture' && fixtureState.counter===0};
  },
};
