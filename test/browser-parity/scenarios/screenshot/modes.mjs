import {expectValues} from '../../support/assertions.mjs';
// The viewport (a screencast frame, else a capture) and the full page, both JPEG; on a page taller than the viewport the
// full-page image is the taller one (its height read from the JPEG's frame header).
const jpeg=v=>v?.type==='image'&&v.mimeType==='image/jpeg'&&typeof v.data==='string'&&v.data.length>100;
function jpegHeight(v){
  const bytes=Buffer.from(v.data,'base64');
  for(let i=2;i+9<bytes.length;){
    if(bytes[i]!==0xff){i++;continue;}
    const marker=bytes[i+1];
    if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))return bytes.readUInt16BE(i+5);
    i+=2+bytes.readUInt16BE(i+2);
  }
  return null;
}
let viewportHeight=null;
export default {
  id:'screenshot/modes',milestone:'M1c',commands:['tab_screenshot'],
  setup:{page:'/screenshot-tall.html',state:{}},
  screenshotTolerance:4,
  cells:[
    {label:'viewport',code:"return await tab.screenshot();"},
    {label:'full',code:"return await tab.screenshot({fullPage:true});"},
  ],
  assert:input=>expectValues({
    viewport:v=>jpeg(v)&&(viewportHeight=jpegHeight(v))!=null,
    full:v=>{const height=jpeg(v)?jpegHeight(v):null;return height!=null&&height>=2400&&height>viewportHeight;},
  })(input),
};
