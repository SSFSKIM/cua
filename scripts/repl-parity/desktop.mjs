// The VM uses openbox, not necessarily a full session manager. Export only the runtime's X-session allowlist.
// The filesystem interface also lets unit tests supply process records without touching a live desktop.
// `display` names the session to take, by its DISPLAY: a harness run on a private display (#171 M4, T18) names its own,
// since its private session runs beside the person's and the first one found may be the person's. Without it, the first.
// Self-contained: topology.mjs embeds its source in the device's shell.
export function discoverDesktopEnvironment({readdirSync,readFileSync},{display}={}) {
  const keys=new Set(['DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','XDG_RUNTIME_DIR','XDG_DATA_DIRS']);
  const sessions=new Set(['xfce4-session','gnome-session-b','mate-session','lxsession','openbox']);
  for(const pid of readdirSync('/proc').filter(x=>/^\d+$/.test(x))) {
    try {
      if(!sessions.has(readFileSync(`/proc/${pid}/comm`,'utf8').trim()))continue;
      const env=Object.fromEntries(readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').flatMap(pair=>{
        const index=pair.indexOf('='),key=pair.slice(0,index);return keys.has(key)?[[key,pair.slice(index+1)]]:[];
      }));
      if(env.DISPLAY&&(display===undefined||env.DISPLAY===display))return env;
    } catch { /* Another user's or exiting process is not this fixture's desktop. */ }
  }
  throw new Error(display===undefined?'No X session environment found; prepare cannot attest a desktop':`No X session environment found on the display ${display}; prepare cannot attest a desktop`);
}
