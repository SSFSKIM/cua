"""The private session every #228 probe runs in, and the AT-SPI reads it takes.

A Session is one Xvfb display of its own (never :0), one session bus of its own whose only activatable services are
the accessibility bus launcher and dconf, and one temporary home (HOME, the XDG base directories, XDG_RUNTIME_DIR,
TMPDIR) under /tmp/t177-*. Nothing of the person's is named in the environment it hands to what it starts: no session
bus, no accessibility bus address, no X authority, no session manager. What it starts it stops by pid; the session's
directory goes with it.

The reads use the accessibility bus directly through Gio (no libatspi here): the registry's children are the
applications on the bus, and a walk asks each node for its role name, name and children. `kick` is the one call that
is not a read of the tree as cua's engine reads it: Accessible.GetAttributes or GetRelationSet.
"""
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time

import gi
from gi.repository import Gio, GLib

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
ELECTRON = os.environ.get('PROBE_ELECTRON', '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/node_modules/electron/dist/electron')
FIXTURE = os.path.join(REPO, 'scripts', 'native-matrix', 'fixtures', 'electron')
PROBE_APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe-app')
LAUNCHER = '/usr/libexec/at-spi-bus-launcher'
DCONF = '/usr/libexec/dconf-service'
BUS_FLAGS = Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION
ACC = 'org.a11y.atspi.Accessible'
PROPS = 'org.freedesktop.DBus.Properties'

BUS_CONFIG = """<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <keep_umask/>
  <listen>unix:path={runtime}/bus</listen>
  <servicedir>{root}/services</servicedir>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
"""


def now_ms():
    return time.time() * 1000.0


class Session:
    """One private display, session bus and home. `launcher=False` leaves org.a11y.Bus off the session bus."""

    def __init__(self, label, launcher=True, wm=True):
        self.label = label
        self.root = tempfile.mkdtemp(prefix=f't177-{label}-', dir='/tmp')
        self.launcher = launcher
        self.wm = wm
        self.procs = []  # (name, Popen), in start order
        self.apps = []
        self.display = None
        self.bus_address = None
        self._bus = None
        self._a11y = None

    # -- lifecycle
    def start(self):
        for sub in ('home', 'rt', 'tmp', 'services', 'home/.config', 'home/.local/share', 'home/.cache', 'home/.local/state'):
            os.makedirs(os.path.join(self.root, sub), exist_ok=True)
        os.chmod(os.path.join(self.root, 'rt'), 0o700)
        r, w = os.pipe()
        xvfb = subprocess.Popen(['Xvfb', '-displayfd', str(w), '-screen', '0', '1280x800x24', '-nolisten', 'tcp', '-noreset'],
                                pass_fds=[w], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        os.close(w)
        self.procs.append(('Xvfb', xvfb))
        number = b''
        deadline = time.time() + 10
        while not number.endswith(b'\n') and time.time() < deadline:
            chunk = os.read(r, 16)
            if not chunk:
                break
            number += chunk
        os.close(r)
        self.display = ':' + number.decode().strip()
        if self.display in (':', ':0'):
            raise RuntimeError(f'no private display (got {self.display!r})')
        if self.launcher:
            with open(os.path.join(self.root, 'services', 'org.a11y.Bus.service'), 'w') as f:
                f.write(f'[D-BUS Service]\nName=org.a11y.Bus\nExec={LAUNCHER}\n')
        with open(os.path.join(self.root, 'services', 'ca.desrt.dconf.service'), 'w') as f:
            f.write(f'[D-BUS Service]\nName=ca.desrt.dconf\nExec={DCONF}\n')
        conf = os.path.join(self.root, 'bus.conf')
        with open(conf, 'w') as f:
            f.write(BUS_CONFIG.format(runtime=os.path.join(self.root, 'rt'), root=self.root))
        self.bus_address = f"unix:path={os.path.join(self.root, 'rt', 'bus')}"
        dbus = subprocess.Popen(['dbus-daemon', f'--config-file={conf}', '--nofork', '--print-address=1'],
                                env=self.env(bus=False), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
        self.procs.append(('dbus-daemon', dbus))
        line = dbus.stdout.readline().decode().strip()
        if not line.startswith('unix:path='):
            raise RuntimeError(f'the session bus did not start ({line!r})')
        if self.wm:
            ob = subprocess.Popen(['openbox', '--sm-disable'], env=self.env(), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            self.procs.append(('openbox', ob))
            time.sleep(0.3)
        return self

    def env(self, extra=None, bus=True):
        home = os.path.join(self.root, 'home')
        env = {
            'PATH': '/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin',
            'LANG': 'C.UTF-8',
            'HOME': home,
            'USER': os.environ.get('USER', 'new'),
            'LOGNAME': os.environ.get('LOGNAME', 'new'),
            'XDG_CONFIG_HOME': os.path.join(home, '.config'),
            'XDG_DATA_HOME': os.path.join(home, '.local', 'share'),
            'XDG_CACHE_HOME': os.path.join(home, '.cache'),
            'XDG_STATE_HOME': os.path.join(home, '.local', 'state'),
            'XDG_RUNTIME_DIR': os.path.join(self.root, 'rt'),
            'TMPDIR': os.path.join(self.root, 'tmp'),
            'DISPLAY': self.display,
        }
        if bus:
            env['DBUS_SESSION_BUS_ADDRESS'] = self.bus_address
        env.update(extra or {})
        return env

    def spawn(self, argv, extra_env=None, name=None, own_group=True):
        """Starts an application of the run's in the session. Its pid group is its own, so a stop reaches all of it."""
        log = open(os.path.join(self.root, f'{name or os.path.basename(argv[0])}-{len(self.apps)}.log'), 'wb')
        proc = subprocess.Popen(argv, env=self.env(extra_env), stdout=log, stderr=subprocess.STDOUT, start_new_session=own_group, cwd=self.root)
        proc.t_spawn = now_ms()
        proc.logfile = log.name
        self.apps.append(proc)
        return proc

    @staticmethod
    def stop_group(proc, grace=3.0):
        """TERM then KILL to the process group this module started (never a pid it did not start)."""
        try:
            pgid = os.getpgid(proc.pid)
        except ProcessLookupError:
            return
        if pgid != proc.pid:
            return  # not a group of its own: leave it to the session's end
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.killpg(pgid, sig)
            except ProcessLookupError:
                return
            deadline = time.time() + grace
            while time.time() < deadline:
                try:
                    proc.wait(timeout=0.05)
                except subprocess.TimeoutExpired:
                    pass
                try:
                    os.killpg(pgid, 0)
                except ProcessLookupError:
                    return
                time.sleep(0.05)

    def stop(self, keep=False):
        for conn in (self._a11y, self._bus):
            try:
                if conn is not None:
                    conn.close_sync(None)
            except GLib.Error:
                pass
        for proc in self.apps:
            if getattr(proc, 'no_signal', False):
                continue  # ended with the display instead (see chrome.py)
            self.stop_group(proc)
        for name, proc in reversed(self.procs):
            self.stop_group(proc, grace=2.0)
        # whatever outlived that (a service the session bus activated, an app `gio launch` started): only processes
        # that name this session's directory, and never a Chrome (chrome.py: the run's own Chrome ends with its
        # display, unsignalled)
        for _ in range(3):
            left = [pid for pid in leftovers(self.root) if not is_chrome(pid)]
            if not left:
                break
            for pid in left:
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            time.sleep(0.3)
        if not keep:
            shutil.rmtree(self.root, ignore_errors=True)

    def __enter__(self):
        try:
            return self.start()
        except BaseException:
            self.stop()  # a start that failed half-way leaves no display behind
            raise

    def __exit__(self, *exc):
        self.stop()

    # -- the session bus and its accessibility switches
    def bus(self):
        if self._bus is None:
            self._bus = Gio.DBusConnection.new_for_address_sync(self.bus_address, BUS_FLAGS, None, None)
        return self._bus

    def has_owner(self, name):
        reply = self.bus().call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'NameHasOwner',
                                     GLib.Variant('(s)', (name,)), GLib.VariantType('(b)'), Gio.DBusCallFlags.NONE, 5000, None)
        return reply.unpack()[0]

    def status(self):
        out = {}
        for name in ('IsEnabled', 'ScreenReaderEnabled'):
            reply = self.bus().call_sync('org.a11y.Bus', '/org/a11y/bus', PROPS, 'Get', GLib.Variant('(ss)', ('org.a11y.Status', name)),
                                         GLib.VariantType('(v)'), Gio.DBusCallFlags.NONE, 10000, None)
            out[name] = reply.unpack()[0]
        return out

    def set_status(self, name, value):
        self.bus().call_sync('org.a11y.Bus', '/org/a11y/bus', PROPS, 'Set', GLib.Variant('(ssv)', ('org.a11y.Status', name, GLib.Variant('b', bool(value)))),
                             None, Gio.DBusCallFlags.NONE, 10000, None)

    def gsettings(self, *args):
        return subprocess.run(['gsettings', *args], env=self.env(), capture_output=True, text=True, timeout=20).stdout.strip()

    def a11y(self):
        if self._a11y is None:
            reply = self.bus().call_sync('org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus', 'GetAddress', None, GLib.VariantType('(s)'), Gio.DBusCallFlags.NONE, 10000, None)
            self._a11y = Gio.DBusConnection.new_for_address_sync(reply.unpack()[0], BUS_FLAGS, None, None)
        return self._a11y

    # -- the display
    def windows_of(self, pid):
        """Viewable top-level windows whose _NET_WM_PID is `pid`, by xdotool."""
        done = subprocess.run(['xdotool', 'search', '--onlyvisible', '--pid', str(pid)], env=self.env(), capture_output=True, text=True, timeout=10)
        return [int(line) for line in done.stdout.split() if line.strip().isdigit()]

    def wm_class(self, window):
        done = subprocess.run(['xprop', '-id', str(window), 'WM_CLASS', 'WM_WINDOW_ROLE', '_NET_WM_PID', '_NET_WM_NAME'], env=self.env(), capture_output=True, text=True, timeout=10)
        return done.stdout.strip().replace('\n', ' | ')


def is_chrome(pid):
    """Whether a process runs a Chrome or Chromium browser's files (its executable lies under /opt/google or is named so)."""
    try:
        exe = os.readlink(f'/proc/{pid}/exe')
    except OSError:
        return False
    return exe.startswith('/opt/google/') or os.path.basename(exe).split(' ')[0] in ('chrome', 'chromium', 'chromium-browser', 'google-chrome')


def leftovers(root):
    """Pids that name this session's directory in their environment, their command line or their working directory:
    started in it, by it or by its bus. (Electron's main process rewrites its environment's memory, so
    /proc/<pid>/environ reads empty for it; its command line still names its profile.)"""
    found = []
    needle = root.encode()
    for entry in os.listdir('/proc'):
        if not entry.isdigit() or int(entry) == os.getpid():
            continue
        try:
            with open(f'/proc/{entry}/environ', 'rb') as f:
                if needle in f.read():
                    found.append(int(entry))
                    continue
        except OSError:
            pass
        try:
            with open(f'/proc/{entry}/cmdline', 'rb') as f:
                if needle in f.read():
                    found.append(int(entry))
                    continue
        except OSError:
            pass
        try:
            if os.readlink(f'/proc/{entry}/cwd').startswith(root):
                found.append(int(entry))
        except OSError:
            pass
    return found


# -- AT-SPI over the accessibility bus
def call(conn, dest, path, iface, method, args=None, reply=None, timeout=3000):
    return conn.call_sync(dest, path, iface, method, args, GLib.VariantType(reply) if reply else None, Gio.DBusCallFlags.NONE, timeout, None)


def prop(conn, dest, path, iface, name, timeout=3000):
    try:
        return call(conn, dest, path, PROPS, 'Get', GLib.Variant('(ss)', (iface, name)), '(v)', timeout).unpack()[0]
    except GLib.Error as error:
        return f'<error {error.message[:60]}>'


def registry(session):
    """The applications on the accessibility bus: [{bus, path, pid, toolkit, version, name}]."""
    conn = session.a11y()
    kids = call(conn, 'org.a11y.atspi.Registry', '/org/a11y/atspi/accessible/root', ACC, 'GetChildren', None, '(a(so))').unpack()[0]
    out = []
    for bus, path in kids:
        try:
            pid = call(conn, 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetConnectionUnixProcessID', GLib.Variant('(s)', (bus,)), '(u)').unpack()[0]
        except GLib.Error:
            pid = None
        out.append({'bus': bus, 'path': path, 'pid': pid,
                    'toolkit': prop(conn, bus, path, 'org.a11y.atspi.Application', 'ToolkitName'),
                    'version': prop(conn, bus, path, 'org.a11y.atspi.Application', 'Version'),
                    'name': prop(conn, bus, path, ACC, 'Name')})
    return out


def app_of(session, pid):
    for app in registry(session):
        if app['pid'] == pid:
            return app
    return None


def walk(session, app, limit=6000, depth_limit=64):
    """A preorder read of one application's tree as cua's engine reads structure: role name, name, children.

    No GetAttributes, no GetRelationSet. Returns {nodes, roles, web_documents, rows: [(depth, role, name, nchildren)]}.
    """
    conn = session.a11y()
    rows = []
    stack = [(app['bus'], app['path'], 0)]
    failed = 0
    while stack and len(rows) < limit:
        bus, path, depth = stack.pop()
        try:
            role = call(conn, bus, path, ACC, 'GetRoleName', None, '(s)').unpack()[0]
            name = prop(conn, bus, path, ACC, 'Name')
            kids = call(conn, bus, path, ACC, 'GetChildren', None, '(a(so))').unpack()[0] if depth < depth_limit else []
        except GLib.Error:
            failed += 1
            continue
        rows.append((depth, role, name if isinstance(name, str) else '', len(kids)))
        for kid_bus, kid_path in reversed(kids):
            stack.append((kid_bus, kid_path, depth + 1))
    roles = {}
    for _, role, _, _ in rows:
        roles[role] = roles.get(role, 0) + 1
    web = [(role, name, kids) for _, role, name, kids in rows if role in ('document web', 'document frame')]
    return {'nodes': len(rows), 'failed': failed, 'roles': roles, 'web_documents': web, 'rows': rows}


def has_named(tree, role, name):
    return any(r == role and n == name for _, r, n, _ in tree['rows'])


def kick(session, app, method='GetAttributes', path=None):
    """The one request that is not a structural read: Accessible.GetAttributes or GetRelationSet on one object."""
    conn = session.a11y()
    reply = 'a{ss}' if method == 'GetAttributes' else 'a(ua(so))'
    started = now_ms()
    try:
        out = call(conn, app['bus'], path or app['path'], ACC, method, None, f'({reply})').unpack()[0]
        return {'method': method, 'path': path or app['path'], 'ok': True, 'ms': round(now_ms() - started, 2), 'reply': repr(out)[:200]}
    except GLib.Error as error:
        return {'method': method, 'path': path or app['path'], 'ok': False, 'ms': round(now_ms() - started, 2), 'error': error.message[:200]}


def render(tree, limit=80):
    lines = []
    for depth, role, name, kids in tree['rows'][:limit]:
        lines.append(f"{'  ' * depth}{role} {json.dumps(name)} ({kids})")
    if len(tree['rows']) > limit:
        lines.append(f"... {len(tree['rows']) - limit} more")
    return '\n'.join(lines)


def wait_for(predicate, timeout, step=0.05):
    """Polls until predicate() is truthy; returns (value, elapsed ms) or (None, elapsed)."""
    started = now_ms()
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = predicate()
        if value:
            return value, round(now_ms() - started, 1)
        time.sleep(step)
    return None, round(now_ms() - started, 1)


def fixture_argv(session, extra=()):
    return [ELECTRON, FIXTURE, f"--cua-fixture-user-data={os.path.join(session.root, 'fixture-data')}", *extra]


def fixture_log(session):
    """The fixture's own record of app.isAccessibilitySupportEnabled(): [{at, enabled, source}]."""
    path = os.path.join(session.root, 'fixture-data', 'cua-fixture-accessibility.jsonl')
    try:
        with open(path) as f:
            return [json.loads(line) for line in f if line.strip()]
    except OSError:
        return []


def emit(record, out=None):
    line = json.dumps(record, sort_keys=True)
    print(line, flush=True)
    if out:
        with open(out, 'a') as f:
            f.write(line + '\n')
