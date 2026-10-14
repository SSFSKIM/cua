// The VM uses openbox, not necessarily a full session manager. Export only the runtime's X-session allowlist.
// The filesystem interface also lets unit tests supply process records without touching a live desktop.
export function discoverDesktopEnvironment({readdirSync,readFileSync}) {
  const keys=new Set(['DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','XDG_RUNTIME_DIR','XDG_DATA_DIRS']);
  const sessions=new Set(['xfce4-session','gnome-session-b','mate-session','lxsession','openbox']);
  for(const pid of readdirSync('/proc').filter(x=>/^\d+$/.test(x))) {
    try {
      if(!sessions.has(readFileSync(`/proc/${pid}/comm`,'utf8').trim()))continue;
      const env=Object.fromEntries(readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').flatMap(pair=>{
        const index=pair.indexOf('='),key=pair.slice(0,index);return keys.has(key)?[[key,pair.slice(index+1)]]:[];
      }));
      if(env.DISPLAY)return env;
    } catch { /* Another user's or exiting process is not this fixture's desktop. */ }
  }
  throw new Error('No X session environment found; prepare cannot attest a desktop');
}
