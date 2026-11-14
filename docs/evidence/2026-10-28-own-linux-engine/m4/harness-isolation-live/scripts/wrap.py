#!/usr/bin/python3 -I
# Task 46's outer guard (#171 M4): runs one private-display session (session.mjs) as its descendant, under a child
# subreaper so every process the run starts stays in its tree, with two decoy buses standing for the person's (the
# session bus and the accessibility bus a shell would carry), and samples every descendant's fds, cwd and Unix
# connections. A descendant that names a path under the person's Chrome profile or NSS database, a Chrome of the run,
# or a connection to the person's session or accessibility bus is a stop condition: the harness driver gets SIGTERM
# (its own stop) at once. Metadata only: fd link targets, cwd, ss socket tables, selected environment keys of the
# run's own processes. Nothing under ~/.config/google-chrome or ~/.pki is opened, read or listed.
# usage: wrap.py <out> <command...>
import ctypes, json, os, re, signal, socket, struct, subprocess, sys, threading, time

HOME = '/Users/new'
FORBID = [HOME + '/.config/google-chrome', HOME + '/.pki', HOME + '/.local/share/pki']
PERSON_SOCKS = {'/run/user/501/bus', '/run/user/501/at-spi/bus_0'}
CHROME_NAMES = {'chrome', 'google-chrome', 'google-chrome-stable', 'google-chrome-beta', 'google-chrome-unstable', 'chromium', 'chromium-browser', 'chrome_crashpad_handler'}
ENV_KEYS = ['DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS', 'HOME', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'GSETTINGS_BACKEND']
# HOME paths that are the run's own tooling, not an application's reach into the person's home
OWN = [HOME + '/.local/share/cua-171', HOME + '/Developer/GitHub/cua', HOME + '/.local/share/cua/runtimes', HOME + '/.cargo', HOME + '/.rustup']

out = os.path.abspath(sys.argv[1])
cmd = sys.argv[2:]
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
samples = 0
ss_samples = 0
stopping = {'sent': False}


def now():
    return round(time.time() - t0, 3)


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
    except Exception as e:  # no driver running: the session itself
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
    for r in rows:
        ours = [p for p in r['pids'] if p in runset]
        if ours and r['pport'] in person_inodes:
            comm = procs.get(ours[0], {}).get('comm')
            log_flag('person-bus-connection', pids=ours, comm=comm, peer_inode=r['pport'])
        if ours and r['laddr'] in PERSON_SOCKS:
            log_flag('person-bus-socket-held', pids=ours, path=r['laddr'])


def sample_once(check_ss):
    global samples
    run, info = tree()
    runset = set(run)
    for pid in run:
        comm, ppid, pgid, start = info[pid]
        key = (pid, start)
        rec = procs.get(pid)
        if rec is None or rec['start'] != start:
            try:
                argv = open(f'/proc/{pid}/cmdline', 'rb').read().split(b'\0')
            except Exception:
                continue
            argv = [a.decode(errors='replace') for a in argv if a]
            rec = {'pid': pid, 'start': start, 'comm': comm, 'ppid': ppid, 'pgid': pgid, 'first': now(), 'argv': ' '.join(argv)[:400], 'env': env_of(pid), 'paths': set()}
            procs[pid] = rec
            name = os.path.basename(argv[0]) if argv else comm
            if name in CHROME_NAMES or comm in CHROME_NAMES or (argv and argv[0].startswith('/opt/google/chrome')):
                log_flag('run-chrome', pid=pid, argv0=argv[0] if argv else None)
        rec['last'] = now()
        rec['comm'] = comm
        links = []
        try:
            for fd in os.listdir(f'/proc/{pid}/fd'):
                try:
                    links.append(os.readlink(f'/proc/{pid}/fd/{fd}'))
                except Exception:
                    pass
        except Exception:
            pass
        try:
            links.append(os.readlink(f'/proc/{pid}/cwd'))
        except Exception:
            pass
        for path in links:
            if not path.startswith('/'):
                continue
            for bad in FORBID:
                if path == bad or path.startswith(bad + '/'):
                    log_flag('forbidden-path', pid=pid, comm=comm, path=path)
            if path.startswith(HOME + '/') and not any(path.startswith(o) for o in OWN):
                if path not in rec['paths']:
                    rec['paths'].add(path)
                    home_paths.setdefault(comm, set()).add(path)
    samples += 1
    if check_ss:
        check_connections(runset)
    return run


def sampler(done):
    global ss_samples
    i = 0
    gaps = []
    last = time.time()
    while not done.is_set():
        sample_once(i % 5 == 0)
        if i % 5 == 0:
            ss_samples += 1
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
env.pop('DISPLAY', None)
env.pop('XAUTHORITY', None)
env.pop('WAYLAND_DISPLAY', None)
with open(os.path.join(out, 'wrap-env.json'), 'w') as f:
    json.dump({k: env.get(k) for k in ENV_KEYS}, f, indent=1)

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
left = sample_once(True)
done.set()
th.join()
leftovers = [{'pid': p, 'comm': procs[p]['comm'], 'argv': procs[p]['argv']} for p in left if p in procs]
summary = {
    'exit': code,
    'samples': samples,
    'ss_samples': ss_samples,
    'sample_gap_ms': {'median': round(sorted(sampler.gaps)[len(sampler.gaps) // 2] * 1000, 1), 'max': round(max(sampler.gaps) * 1000, 1)} if getattr(sampler, 'gaps', None) else None,
    'flags': flags,
    'decoy_connections': decoy_hits,
    'leftovers': leftovers,
    'processes': [{k: (sorted(v) if isinstance(v, set) else v) for k, v in r.items()} for r in sorted(procs.values(), key=lambda r: r['first'])],
    'home_paths_by_comm': {k: sorted(v) for k, v in sorted(home_paths.items())},
}
with open(os.path.join(out, 'wrap-summary.json'), 'w') as f:
    json.dump(summary, f, indent=1)
print(json.dumps({'exit': code, 'samples': samples, 'flags': len(flags), 'decoy_connections': len(decoy_hits), 'leftovers': leftovers, 'processes': len(procs)}))
sys.exit(0 if code == 0 else 1)
