import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"capabilities/cursor", milestone:"M2", commands:["cua_move"],
  setup:{page:"/input.html",state:{}},
  cells:[
  {
    "label": "move",
    "code": "await tab.cua.move({x:50,y:40});return true;"
  }
],
  assert:expectValues({move:true}),
};
