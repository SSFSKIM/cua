#!/usr/bin/python3 -I
# Task 49's outer guard (#171 M4), from task 46's: runs one private-display session (session.mjs) as its descendant,
# under a child subreaper so every process the run starts stays in its tree, with two decoy buses standing for the
# person's (the session bus and the accessibility bus a shell would carry), and samples every descendant's fd link
# targets and cwd (every ~110 ms), its memory maps (every third sample) and the Unix socket table (every fifth).
# Stop conditions (the harness process named in <out>/driver.pid gets SIGTERM, its own stop, at once):
#   - a path under the person's Chrome profile or NSS databases (~/.config/google-chrome, ~/.pki, ~/.local/share/pki)
#     in any fd, cwd or mapping of a run process;
#   - a Chrome or Electron process of the run whose HOME is not under the run's TMPDIR, or a Chrome browser process
#     (no --type=) whose --user-data-dir is not exactly one directory under it;
#   - a run process connected to the person's session bus, the person's accessibility bus, or the X socket of :0.
# Metadata only: link targets, cwd, mapping paths, ss tables, selected environment keys of the run's own processes.
# Nothing under the person's home is opened, read or listed.
# usage: wrap.py <out> <tmproot> <command...>
import ctypes, json, os, re, signal, socket, struct, subprocess, sys, threading, time

HOME = '/Users/new'
FORBID = [HOME + '/.config/google-chrome', HOME + '/.pki', HOME + '/.local/share/pki']
PERSON_SOCKS = {'/run/user/501/bus', '/run/user/501/at-spi/bus_0'}
X0_SOCKS = {'/tmp/.X11-unix/X0', '@/tmp/.X11-unix/X0'}
CHROME_NAMES = {'chrome', 'google-chrome', 'google-chrome-stable', 'chrome_crashpad', 'chrome_crashpad_handler', 'chromium', 'chromium-browser'}
ELECTRON_NAMES = {'electron'}
ENV_KEYS = ['DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS', 'HOME', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'GSETTINGS_BACKEND', 'XAUTHORITY', 'ACCESSIBILITY_ENABLED', 'GNOME_ACCESSIBILITY', 'SESSION_MANAGER']
# HOME paths that are the run's own tooling, not an application's reach into the person's home
OWN = [HOME + '/.local/share/cua-171', HOME + '/Developer/GitHub/cua', HOME + '/.local/share/cua/runtimes', HOME + '/.cargo', HOME + '/.rustup']

out = os.path.abspath(sys.argv[1])
tmproot = os.path.abspath(sys.argv[2])
cmd = sys.argv[3:]
os.makedirs(out, exist_ok=True)
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
    sys.exit('prctl(PR_SET_CHILD_SUBREAPER) failed')
me = os.getpid()
t0 = time.time()
lock = threading.Lock()
flags = []
decoy_hits = []
procs = {}  # pid -> record
home_paths = {}  # comm -> set of paths
counts = {'samples': 0, 'maps_samples': 0, 'ss_samples': 0, 'maps_reads': 0, 'fd_reads': 0}
own_home_hits = {}  # run-home NSS paths seen in Chrome/Electron fds or maps
nss_loaded = {}  # NSS libraries mapped by the run's Chrome/Electron processes, by process type
nss_dirs = {}  # NSS database directories that appeared in the run's homes, first seen
stopping = {'sent': False}


def now():
    return round(time.time() - t0, 3)


def under(path, root):
    return path == root or path.startswith(root + '/')


def log_flag(kind, **kw):
    row = {'t': now(), 'kind': kind, **kw}
    with lock:
        flags.append(row)
        with open(os.path.join(out, 'flags.jsonl'), 'a') as f:
            f.write(json.dumps(row) + '\n')
    stop_run(kind)


def stop_run(why):
    if stopping['sent']:
        return
    stopping['sent'] = True
    try:
        pid = int(open(os.path.join(out, 'driver.pid')).read().strip())
        os.kill(pid, signal.SIGTERM)
        with open(os.path.join(out, 'flags.jsonl'), 'a') as f:
            f.write(json.dumps({'t': now(), 'kind': 'stop-sent', 'pid': pid, 'why': why}) + '\n')
    except Exception as e:  # no harness running: the session itself
        with open(os.path.join(out, 'flags.jsonl'), 'a') as f:
            f.write(json.dumps({'t': now(), 'kind': 'stop-failed', 'error': str(e)}) + '\n')


def decoy(path, name):
    if os.path.exists(path):
        os.unlink(path)
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.bind(path)
    s.listen(16)
    while True:
        c, _ = s.accept()
        try:
            pid, uid, gid = struct.unpack('3i', c.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize('3i')))
            try:
                argv = open(f'/proc/{pid}/cmdline', 'rb').read().split(b'\0')[0].decode(errors='replace')
            except Exception:
                argv = None
            row = {'t': now(), 'decoy': name, 'pid': pid, 'argv0': argv}
        except Exception as e:
            row = {'t': now(), 'decoy': name, 'error': str(e)}
        with lock:
            decoy_hits.append(row)
        c.close()


def read_stat(pid):
    s = open(f'/proc/{pid}/stat').read()
    r = s.rfind(')')
    comm = s[s.find('(') + 1:r]
    f = s[r + 2:].split()
    return comm, int(f[1]), int(f[2]), int(f[19])  # comm, ppid, pgid, starttime


def tree():
    parent = {}
    info = {}
    for d in os.listdir('/proc'):
        if not d.isdigit():
            continue
        try:
            comm, ppid, pgid, start = read_stat(int(d))
        except Exception:
            continue
        parent[int(d)] = ppid
        info[int(d)] = (comm, ppid, pgid, start)
    kids = {}
    for p, pp in parent.items():
        kids.setdefault(pp, []).append(p)
    run = []
    stack = list(kids.get(me, []))
    while stack:
        p = stack.pop()
        run.append(p)
        stack.extend(kids.get(p, []))
    return run, info


def env_of(pid):
    try:
        raw = open(f'/proc/{pid}/environ', 'rb').read().split(b'\0')
    except Exception:
        return None
    env = {}
    for item in raw:
        k, _, v = item.partition(b'=')
        k = k.decode(errors='replace')
        if k in ENV_KEYS:
            env[k] = v.decode(errors='replace')
    return env


def ss_table():
    try:
        text = subprocess.run(['ss', '-xpn'], capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return []
    rows = []
    for line in text.splitlines()[1:]:
        t = line.split()
        if len(t) < 8:
            continue
        users = ' '.join(t[8:])
        pids = [int(x) for x in re.findall(r'pid=(\d+)', users)]
        rows.append({'laddr': t[4], 'lport': t[5], 'pport': t[7], 'pids': pids})
    return rows


def check_connections(runset):
    rows = ss_table()
    person_inodes = {r['lport'] for r in rows if r['laddr'] in PERSON_SOCKS}
    x0_inodes = {r['lport'] for r in rows if r['laddr'] in X0_SOCKS}
    for r in rows:
        ours = [p for p in r['pids'] if p in runset]
        if not ours:
            continue
        comm = procs.get(ours[0], {}).get('comm')
        if r['pport'] in person_inodes:
            log_flag('person-bus-connection', pids=ours, comm=comm, peer_inode=r['pport'])
        if r['laddr'] in PERSON_SOCKS:
            log_flag('person-bus-socket-held', pids=ours, path=r['laddr'])
        if r['pport'] in x0_inodes:
            log_flag('display-0-connection', pids=ours, comm=comm, peer_inode=r['pport'])


def browser_kind(name, comm, argv):
    if name in CHROME_NAMES or comm in CHROME_NAMES or (argv and argv[0].startswith('/opt/google/chrome/')):
        return 'chrome'
    if name in ELECTRON_NAMES or comm in ELECTRON_NAMES or (argv and argv[0].endswith('/electron/dist/electron')):
        return 'electron'
    return None


def check_browser(rec, argv):
    kind = rec['browser']
    # Chrome rewrites its process title over argv (and may move environ): its arguments are then one string, split here
    argv = ' '.join(argv).split(' ')
    home = (rec['env'] or {}).get('HOME')
    rec['home_readable'] = home is not None
    # an environment Chrome's title rewrite has hidden says nothing; one that names a HOME must name the run's
    if home is not None and not under(home, tmproot):
        log_flag(f'run-{kind}-home-not-the-runs', pid=rec['pid'], home=home)
    crashpad = os.path.basename(argv[0]).startswith('chrome_crashpad') or rec['comm'].startswith('chrome_crashpad')
    if kind == 'chrome' and not crashpad and not any(a.startswith('--type=') for a in argv):
        dirs = [a.split('=', 1)[1] if '=' in a else '' for a in argv if re.match(r'^--?user-data-dir(=|$)', a)]
        if len(dirs) != 1 or not dirs[0] or not under(dirs[0], tmproot):
            log_flag('run-chrome-profile-not-the-runs', pid=rec['pid'], user_data_dirs=dirs)
        rec['profile'] = dirs[0] if dirs else None
    for a in argv:
        for bad in FORBID:
            if bad in a:
                log_flag('run-browser-argv-names-forbidden', pid=rec['pid'], arg=a[:200])


def scan_paths(rec, pid, comm, links, where):
    for path in links:
        if not path.startswith('/'):
            continue
        for bad in FORBID:
            if under(path, bad):
                log_flag('forbidden-path', pid=pid, comm=comm, path=path, where=where)
        if rec.get('browser') and where == 'maps' and re.search(r'/lib(softokn3|nssckbi|nss3)\.so', path):
            ptype = (re.search(r'--type=(\S+)', rec['argv']) or [None, 'browser'])[1]
            nss_loaded.setdefault(os.path.basename(path), set()).add(f"{rec['browser']}:{ptype}")
        if rec.get('browser') and under(path, tmproot) and ('/.pki/' in path or '/share/pki/' in path):
            key = re.sub(r'^' + re.escape(tmproot) + r'/[^/]+', '<run scratch>', path)
            own_home_hits.setdefault(key, set()).add(f"{rec['browser']} ({where})")
        if path.startswith(HOME + '/') and not any(path.startswith(o) for o in OWN):
            if path not in rec['paths']:
                rec['paths'].add(path)
                home_paths.setdefault(comm, set()).add(path)


def sample_once(check_ss, check_maps):
    run, info = tree()
    runset = set(run)
    for pid in run:
        comm, ppid, pgid, start = info[pid]
        rec = procs.get(pid)
        if rec is None or rec['start'] != start:
            try:
                argv = open(f'/proc/{pid}/cmdline', 'rb').read().split(b'\0')
            except Exception:
                continue
            argv = [a.decode(errors='replace') for a in argv if a]
            name = os.path.basename(argv[0].split(' ')[0]) if argv else comm
            rec = {'pid': pid, 'start': start, 'comm': comm, 'ppid': ppid, 'pgid': pgid, 'first': now(), 'argv': ' '.join(argv)[:600], 'env': env_of(pid), 'paths': set(), 'browser': browser_kind(name, comm, argv)}
            procs[pid] = rec
            if rec['browser'] and argv:
                check_browser(rec, argv)
        rec['last'] = now()
        rec['comm'] = comm
        links = []
        try:
            for fd in os.listdir(f'/proc/{pid}/fd'):
                try:
                    links.append(os.readlink(f'/proc/{pid}/fd/{fd}'))
                except Exception:
                    pass
            counts['fd_reads'] += 1
        except Exception:
            pass
        try:
            links.append(os.readlink(f'/proc/{pid}/cwd'))
        except Exception:
            pass
        scan_paths(rec, pid, comm, links, 'fd/cwd')
        if check_maps:
            try:
                with open(f'/proc/{pid}/maps') as f:
                    mapped = {parts[5].strip() for parts in (line.split(None, 5) for line in f) if len(parts) == 6}
                counts['maps_reads'] += 1
                scan_paths(rec, pid, comm, [m.removesuffix(' (deleted)') for m in mapped], 'maps')
            except Exception:
                pass
    counts['samples'] += 1
    if check_maps:
        counts['maps_samples'] += 1
    if check_ss:
        counts['ss_samples'] += 1
        check_connections(runset)
        if os.path.exists(HOME + '/.pki'):
            log_flag('person-pki-exists', path=HOME + '/.pki')
        try:
            for d in os.listdir(tmproot):
                for sub in ('home/.pki/nssdb', 'home/.local/share/pki/nssdb'):
                    full = os.path.join(tmproot, d, sub)
                    if os.path.isdir(full) and full not in nss_dirs:
                        nss_dirs[full] = {'first': now(), 'entries': sorted(os.listdir(full))}
        except Exception:
            pass
    return run


def sampler(done):
    i = 0
    gaps = []
    last = time.time()
    while not done.is_set():
        sample_once(i % 5 == 0, i % 3 == 0)
        i += 1
        t = time.time()
        gaps.append(t - last)
        last = t
        time.sleep(0.1)
    sampler.gaps = gaps


env = dict(os.environ)
decoys = os.path.join(out, 'decoy')
os.makedirs(decoys, exist_ok=True)
for name in ['session', 'a11y']:
    threading.Thread(target=decoy, args=(os.path.join(decoys, f'{name}.sock'), name), daemon=True).start()
time.sleep(0.2)
env['DBUS_SESSION_BUS_ADDRESS'] = f'unix:path={decoys}/session.sock'
env['AT_SPI_BUS_ADDRESS'] = f'unix:path={decoys}/a11y.sock'
env['TMPDIR'] = tmproot
env.pop('DISPLAY', None)
env.pop('XAUTHORITY', None)
env.pop('WAYLAND_DISPLAY', None)
with open(os.path.join(out, 'wrap-env.json'), 'w') as f:
    json.dump({k: env.get(k) for k in ENV_KEYS + ['TMPDIR']}, f, indent=1)

done = threading.Event()
th = threading.Thread(target=sampler, args=(done,), daemon=True)
th.start()
main = subprocess.Popen(cmd, env=env)


def forward(sig, _frame):
    main.send_signal(sig)


signal.signal(signal.SIGTERM, forward)
signal.signal(signal.SIGINT, forward)
code = None
while code is None:
    try:
        r = os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOHANG | os.WNOWAIT)
    except ChildProcessError:
        r = None
    if r is not None and r.si_pid != main.pid:
        try:
            os.waitpid(r.si_pid, 0)
        except ChildProcessError:
            pass
        continue
    code = main.poll()
    if code is None:
        time.sleep(0.05)
time.sleep(3)
left = sample_once(True, True)
done.set()
th.join()
leftovers = [{'pid': p, 'comm': procs[p]['comm'], 'argv': procs[p]['argv']} for p in left if p in procs]


def browser_row(r):
    m = re.search(r'--type=(\S+)', r['argv'])
    return {'pid': r['pid'], 'comm': r['comm'], 'kind': r['browser'], 'type': m.group(1) if m else None, 'first': r['first'], 'last': r['last'], 'profile': r.get('profile'), 'home': (r['env'] or {}).get('HOME'), 'home_readable': r.get('home_readable'), 'argv_has_profile': '--user-data-dir=' in r['argv']}


summary = {
    'exit': code,
    **counts,
    'sample_gap_ms': {'median': round(sorted(sampler.gaps)[len(sampler.gaps) // 2] * 1000, 1), 'max': round(max(sampler.gaps) * 1000, 1)} if getattr(sampler, 'gaps', None) else None,
    'flags': flags,
    'decoy_connections': decoy_hits,
    'leftovers': leftovers,
    'browsers': [browser_row(r) for r in sorted(procs.values(), key=lambda r: r['first']) if r.get('browser')],
    'browser_run_home_nss': {k: sorted(v) for k, v in sorted(own_home_hits.items())},
    'browser_nss_libraries': {k: sorted(v) for k, v in sorted(nss_loaded.items())},
    'run_home_nss_dirs': nss_dirs,
    'processes': [{k: (sorted(v) if isinstance(v, set) else v) for k, v in r.items()} for r in sorted(procs.values(), key=lambda r: r['first'])],
    'home_paths_by_comm': {k: sorted(v) for k, v in sorted(home_paths.items())},
}
with open(os.path.join(out, 'wrap-summary.json'), 'w') as f:
    json.dump(summary, f, indent=1)
print(json.dumps({'exit': code, 'samples': counts['samples'], 'maps_samples': counts['maps_samples'], 'flags': len(flags), 'decoy_connections': len(decoy_hits), 'leftovers': leftovers, 'processes': len(procs), 'browsers': len(summary['browsers'])}))
sys.exit(0 if code == 0 else 1)
