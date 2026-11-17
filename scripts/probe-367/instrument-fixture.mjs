// Hosted-only: add a setup control to the already copied owned fixture, then re-sign that copy. Never patch Electron.
import fs from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {signAdHoc,FIXTURE_BUNDLE_ID,FIXTURE_NAME} from '../native-matrix/fixtures/electron-fixture.mjs';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.platform!=='darwin')throw Error('disposable GitHub-hosted macOS only');
const manifestPath=process.argv[2],manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(manifest.bundleId!==FIXTURE_BUNDLE_ID||!manifest.appPath.startsWith(process.env.RUNNER_TEMP+'/'))throw Error('only the runner-owned copied fixture may be instrumented');
const sha=b=>createHash('sha256').update(b).digest('hex');
const directory=join(manifest.appPath,'Contents','Resources','app'),main=join(directory,'main.js');
const executable=join(manifest.appPath,'Contents','MacOS',FIXTURE_NAME),binaryHash=sha(fs.readFileSync(executable));
const original=fs.readFileSync(main,'utf8'),control=fs.readFileSync(new URL('./electron-control.cjs',import.meta.url));
if(manifest.probe367Control)throw Error('owned fixture already instrumented');
fs.copyFileSync(new URL('./electron-control.cjs',import.meta.url),join(directory,'probe367-control.cjs'));
fs.appendFileSync(main,"\n// Probe #367: setup geometry only; no rendering, accessibility enablement, or measured input changes.\nrequire('./probe367-control.cjs').install({app, BrowserWindow});\n");
if(sha(fs.readFileSync(executable))!==binaryHash)throw Error('Electron executable changed before re-signing');
signAdHoc(manifest.appPath);
manifest.probe367Control={mechanism:'owned Electron BrowserWindow.setBounds',controlSourceSha256:sha(control),
 originalMainSha256:sha(original),instrumentedMainSha256:sha(fs.readFileSync(main)),executableBeforeResignSha256:binaryHash,
 changes:['append setup-control bootstrap to copied main.js','copy probe367-control.cjs','ad-hoc re-sign copied fixture'],
 protocol:'per-head command file; operation-ID ACK with requested/accepted bounds; independent AX/CG proof required'};
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
