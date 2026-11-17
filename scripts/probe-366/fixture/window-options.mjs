// Copied focus/chrome boundary from MAWS src/main/window.ts and renderer app/Toolbar.tsx,
// checked 2026-11-17. No owner window-state/profile is read. Both controls use the same bounds/preferences;
// only native title chrome differs. The fixed placement keeps the test controls on the hosted display.
export const chrome={toolbarHeight:44,trafficLightPadding:78,drag:'drag',noDrag:'no-drag'};
export function windowOptions(style) {
 if(!['default','maws'].includes(style))throw Error('unknown fixture window style');
 return {
  title:'Owned dialog probe',x:0,y:25,width:1440,height:900,minWidth:960,minHeight:600,show:false,backgroundColor:'#faf9f6',
  titleBarStyle:style==='maws'?'hiddenInset':'default',
  ...(style==='maws'?{trafficLightPosition:{x:16,y:15}}:{}),
  // MAWS sets neither frame nor vibrancy and leaves backgroundThrottling at Electron's default.
  // Its application IPC preload is intentionally not copied into this owned page; it does not set window focus.
  webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,plugins:true},
 };
}
