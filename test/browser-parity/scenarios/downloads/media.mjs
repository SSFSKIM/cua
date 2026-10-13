import {expectValues} from '../../support/assertions.mjs';
import {imageSvg} from '../../fixture/corpus-pages.mjs';
export default {
  id:'downloads/media',milestone:'M1c',commands:['playwright_locator_download_media'],
  setup:{page:'/media.html',state:{}},
  cells:[{
    label:'media',timeoutMs:20000,
    // Read only this scenario's expected image artifact, never an arbitrary path returned by a broken service.
    code:`const path=await tab.playwright.locator('#image').downloadMedia({timeoutMs:10000});const expectedName=/\\/image(?: \\(\\d+\\))?\\.svg$/;if(typeof path!=='string'||!path.startsWith('/')||!expectedName.test(path))throw new Error('Unexpected fixture media path');const fs=await import('node:fs/promises');const real=await fs.realpath(path);if(!expectedName.test(real))throw new Error('Unexpected fixture media target');const content=await fs.readFile(real,'utf8');return {exists:true,contentMatches:content===${JSON.stringify(imageSvg)}};`,
  }],
  assert:expectValues({media:{exists:true,contentMatches:true}}),
};
