import {fixtureDownloadNamePattern} from './fixture-downloads.mjs';
// One bounded probe body, for cellCode({code:downloadDiagnosticCode}) after ordinary discarded Chrome setup.
// Unknown paths are evidence only: no raw path, basename, file access or deletion. Do not relax the corpus guard
// from this classifier. Known fixture files are read-only attested; the kernel never removes Downloads artifacts.
export const downloadDiagnosticCode=String.raw`
let phase='navigate';const result={cleaned:false};
try{
 await tab.goto(fixtureURL+'/downloads.html');
 phase='download';
 const waiting=tab.playwright.waitForEvent('download',{timeoutMs:10000});
 const [downloaded]=await Promise.all([waiting,tab.playwright.locator('#download').click()]);
 phase='path';
 const path=await downloaded.path({timeoutMs:10000});
 result.kind=path===null?'null':typeof path;
 if(typeof path!=='string')return result;
 result.absolute=path.startsWith('/');
 const basename=path.split('/').at(-1);
 const known=${fixtureDownloadNamePattern}.test(basename);
 result.basenameClass=known?'fixture-parity-txt':/^parity/i.test(basename)?'fixture-prefixed-unrecognized':'other';
 result.basenameHash=(await import('node:crypto')).createHash('sha256').update(basename).digest('hex');
 result.basenameLength=basename.length;result.txtExtension=/\.txt$/i.test(basename);
 if(known)result.basename=basename;
 if(result.basenameClass==='fixture-prefixed-unrecognized'){
  const classify=c=>/[0-9]/.test(c)?'digit':/[a-z]/.test(c)?'lowercase':/[A-Z]/.test(c)?'uppercase':c===' '?'space':c==='-'?'hyphen':c==='_'?'underscore':c==='.'?'dot':c==='('?'open-paren':c===')'?'close-paren':'other';
  result.suffixClasses=[];
  for(const char of basename.slice(6)){const kind=classify(char),last=result.suffixClasses.at(-1);if(last?.class===kind)last.count++;else result.suffixClasses.push({class:kind,count:1});}
 }
 if(!result.absolute||!known)return result;
 phase='attest';
 const fs=await import('node:fs/promises'),constants=(await import('node:fs')).constants;
 const entry=await fs.lstat(path);result.regularFile=entry.isFile()&&!entry.isSymbolicLink();
 if(!result.regularFile)return result;
 const expected=(await import('node:buffer')).Buffer.from('parity download\n');
 if(entry.size!==expected.length){result.contentMatches=false;return result;}
 const file=await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 let original;
 try{original=await file.stat();result.contentMatches=(await file.readFile()).equals(expected);}finally{await file.close();}
 if(!result.contentMatches)return result;
 phase='identity';
 const current=await fs.lstat(path);
 if(!current.isFile()||current.isSymbolicLink()||current.dev!==original.dev||current.ino!==original.ino){result.sameFile=false;return result;}
 result.attested=true;
 return result;
}catch(error){
 const codes=['ENOENT','EACCES','EPERM','ELOOP','EISDIR','ENOTDIR'];
 return {...result,error:{phase,code:codes.includes(error?.code)?error.code:'other'}};
}`;
