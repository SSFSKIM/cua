#!/usr/bin/python3 -I
# #171 M5, task 91: ruling 773's cross-check, in place of reruns. Every completed x64 `:0` step's stored guard record is
# replayed through M5's guard rule (own_audit_proxy.py, the code wrap71.py runs), and the new flag set must be the old one
# minus exactly the two race stops: V5's first attempt and F3's V3.
#
# What a stored record can replay. The rule only ever turns an `outside-peer-connection` flag into a count: in wrap71.py
# it sits after every rule that counts and before the last flag, and it applies only where the server end shows no pid.
# So a check it changes is a check the old guard flagged, and every flag is in the record (wrap-summary.json `flags`, the
# same rows as flags.jsonl). Each flag is replayed with the run's process table as recorded (pid, start, comm, argv,
# first and last seen): the proxy is alive at the flag's time `t` when its record was seen at a sample before it and at
# one after it (first <= t <= last; a pid that started again is a new record). Every other check needs nothing replayed:
# the rule cannot add a flag, and a check the old guard counted it never reaches.
# What it cannot replay. (1) A stopped run ended at its flag, so what the rest of that step would have met is unknown;
# the cross-check says only that its stop is no longer one. (2) The exact instant of the check: the table carries sample
# times, so `first <= t <= last` is the stored form of "alive at that check", a zombie in that span would not show, and
# the kernel name and argv are the recorded ones (the live guard reads all three at the check). (3) Which run process
# connected: both stopped runs' client was too short-lived to be recorded (comm null), and the rule does not ask.
# (4) Fix wave 1's listener condition: the guard keeps no socket table (wrap-summary.json has none, and X40 appears in
# the stopped records only in their flag rows), so whether the proxy held every listener at its path alone at those
# checks is not in the record. The replay applies the rule's process conditions to the record and the listener
# condition to a stated assumption: that the one recorded proxy held the listener alone. The new flag set can be no
# smaller than the old one minus the stops the record cannot rule out, which are exactly the two race stops; that those
# two are cleared rests on the assumption (the harness's only listener at :<N> being the xtrace audit.mjs started there).
# The listener controls below show the rule flags both stops for any other listener.
# usage: crosscheck-773.py [<store root>] [--committed]   (default: the local store ~/.local/share/cua-171/m5)
import gzip, importlib.util, json, os, sys

HERE = os.path.dirname(os.path.realpath(__file__))
sys.dont_write_bytecode = True  # the checkout stays clean
_spec = importlib.util.spec_from_file_location('own_audit_proxy', os.path.join(HERE, 'own_audit_proxy.py'))
rule = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rule)

# (step, the local store's directory, the committed evidence's, whether it is one of ruling 773's two race stops)
STEPS = [
    ('V1 at H', 'out-x64/V1.pinned-release', 'out/V1.pinned-release', False),
    ('V2 at H', 'out-x64/V2.pinned-release', 'out/V2.pinned-release', False),
    ('V3 at H', 'out-x64/V3.pinned-release', 'out/V3.pinned-release', False),
    ('V4 at H', 'out-x64/V4.pinned-release', 'out/V4.pinned-release', False),
    ("V5 at H, the first attempt (stopped)", 'out-x64/V5.pinned-release', 'out/V5.pinned-release', True),
    ('V5 at H, the rerun', 'out-x64-rerun1/V5.pinned-release', 'out-rerun1/V5.pinned-release', False),
    ('Z0 at H', 'out-x64-rerun1/Z0.pinned-release', 'out-rerun1/Z0.pinned-release', False),
    ("F3's V2", 'f3-out-x64/V2.development-run', 'f3-out/V2.development-run', False),
    ("F3's V3 (stopped)", 'f3-out-x64/V3.development-run', 'f3-out/V3.development-run', True),
]


def read_json(path):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    with gzip.open(path + '.gz', 'rt') as f:
        return json.load(f)


def jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def stored_at(t):
    """A recorded process as the record shows it at time t: alive when seen before and after it."""
    return lambda rec: rec if rec['first'] <= t <= rec['last'] else None


def proxies_for(flag, processes):
    """The recorded processes that meet the rule's process conditions for this flag (the record holds those)."""
    if flag.get('kind') != 'outside-peer-connection' or flag.get('peer_pids'):
        return []
    return rule.recorded_proxy(flag.get('peer_path'), processes, stored_at(flag['t']))


def counted_by_773(flag, processes, listeners=None):
    """The recorded proxy the whole rule counts this flag for, or None (the flag stands). `listeners` is the listener
    rows' owners; the record holds none, so by default it is the stated assumption: the one proxy found holds it alone."""
    found = proxies_for(flag, processes)
    if not found:
        return None
    if listeners is None:
        listeners = [[found[0]['pid']]] if len(found) == 1 else []
    return rule.own_audit_proxy(flag.get('peer_path'), processes, stored_at(flag['t']), listeners)


def key(flag):
    return json.dumps(flag, sort_keys=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    committed = '--committed' in sys.argv
    root = args[0] if args else os.path.expanduser('~/.local/share/cua-171/m5')
    print(f"ruling 773's cross-check over the stored :0 records in {root} ({'the committed evidence' if committed else 'the local store'})")
    print(f'rule: {os.path.relpath(os.path.join(HERE, "own_audit_proxy.py"))}\n')
    old_all, new_all, expected_removed = set(), set(), set()
    for step, local, comm_dir, race in STEPS:
        d = os.path.join(root, comm_dir if committed else local)
        summary = read_json(os.path.join(d, 'wrap-summary.json'))
        flags = summary['flags']
        rows = [r for r in jsonl(os.path.join(d, 'flags.jsonl')) if r.get('kind') not in ('stop-sent', 'stop-failed')]
        assert [key(r) for r in rows] == [key(f) for f in flags], f'{step}: flags.jsonl and the summary disagree'
        procs = summary['processes']
        print(f'== {step}: {d}')
        print(f"   guard exit {summary['exit']}, {summary['ss_samples']} socket samples, {len(procs)} processes recorded, {len(flags)} flag(s), {len(jsonl(os.path.join(d, 'counted.jsonl')))} counted row(s) of task 71's")
        for f in flags:
            k = (step, key(f))
            old_all.add(k)
            proxy = counted_by_773(f, procs)
            if race:
                expected_removed.add(k)
            if proxy:
                print(f"   old flag  {f['kind']} t={f['t']} pids={f['pids']} peer={f.get('peer_path')} peer_pids={f.get('peer_pids')}")
                print(f"   new       counted: the run's own audit proxy, xtrace pid {proxy['pid']} (first {proxy['first']}, last {proxy['last']}, ppid {proxy['ppid']}): {proxy['argv'][:120]}")
                print(f"             its process conditions from the record; the listener at {f['peer_path']}: not in the record, assumed held by pid {proxy['pid']} alone")
            else:
                new_all.add(k)
                print(f"   old flag  {f['kind']} t={f['t']} {json.dumps({x: f[x] for x in f if x not in ('t', 'kind')})}")
                print('   new       still flagged')
        if not flags:
            print('   no flag before, none after')
    removed = old_all - new_all
    print('\nold flags:', len(old_all), ' new flags:', len(new_all), ' removed:', len(removed), ' added:', len(new_all - old_all))
    for step, _ in sorted(removed):
        print(f'   removed: {step}')
    # the negative controls on the stored rows themselves: each race flag, changed in one respect, must stand
    print("\ncontrols on the two race flags' own records (each must stay flagged):")
    controls_hold = True
    for step, local, comm_dir, race in STEPS:
        if not race:
            continue
        d = os.path.join(root, comm_dir if committed else local)
        summary = read_json(os.path.join(d, 'wrap-summary.json'))
        procs = summary['processes']
        for f in summary['flags']:
            proxy = counted_by_773(f, procs)
            if not proxy:
                continue
            others = [r for r in procs if r['pid'] != proxy['pid']]
            other_display = str(int(rule.proxy_display(proxy['argv'])) + 1)
            cases = [
                ("without the proxy's record (no recorded proxy)", f, others),
                (f"at a time after the proxy's last sighting ({proxy['last']} s)", {**f, 't': proxy['last'] + 0.001}, procs),
                (f"to :{other_display}'s socket, whose proxies were not alive then", {**f, 'peer_path': f'/tmp/.X11-unix/X{other_display}'}, procs),
                ("to the abstract name of the proxy's socket", {**f, 'peer_path': '@' + f['peer_path']}, procs),
                ("with the proxy recorded under another kernel name", f, others + [{**proxy, 'comm': 'xtrace-not'}]),
            ]
            # fix wave 1's listener condition, on the stored process table: any listener but the proxy's alone flags
            listener_cases = [
                ('with no listener at the path in the snapshot', []),
                ("with the listener another pid's", [[proxy['ppid']]]),
                ('with the listener showing no owner', [[]]),
                ('with the listener shared by the proxy and another pid', [[proxy['pid'], proxy['ppid']]]),
                ("with a second listener at the path, another pid's", [[proxy['pid']], [proxy['ppid']]]),
            ]
            cases = [(what, flag, table, None) for what, flag, table in cases] + [(what, f, procs, listeners) for what, listeners in listener_cases]
            for what, flag, table, listeners in cases:
                stands = counted_by_773(flag, table, listeners) is None
                controls_hold &= stands
                print(f"   {step}, {what}: {'still flagged' if stands else 'COUNTED (the control fails)'}")
    holds = new_all == old_all - expected_removed and removed == expected_removed and len(expected_removed) == 2 and controls_hold
    print(f"cross-check: {'HOLDS' if holds else 'DIFFERS'}: the new flag set is the old one minus exactly V5's first attempt and F3's V3" + ('' if holds else ', which it is not'))
    print('   (the listener condition is not in the stored records: the two are cleared on their process conditions, which')
    print('   the records hold, and on the assumption that the proxy held its socket\'s listener alone; any other listener')
    print('   flags both)')
    return 0 if holds else 1


if __name__ == '__main__':
    sys.exit(main())
