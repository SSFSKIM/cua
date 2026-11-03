#!/usr/bin/python3 -I
# Task 49: the facts of one guarded session, from its files (wrap-summary.json, session.jsonl, windows.jsonl, each
# phase's results), printed as JSON lines for the evidence README. Reads only the run's own files.
# usage: analyze.py <session dir>
import collections, glob, gzip, json, os, re, sys

d = sys.argv[1]
H = '/Users/new'


def rows(path):
    if not os.path.exists(path):
        return []
    opener = gzip.open if path.endswith('.gz') else open
    with opener(path, 'rt') as f:
        return [json.loads(l) for l in f if l.strip()]


def out(kind, **kw):
    print(json.dumps({'kind': kind, **kw}))


s = json.load(open(os.path.join(d, 'wrap-summary.json')))
procs = s['processes']
comms = collections.Counter(p['comm'] for p in procs)
out('guard', exit=s['exit'], samples=s['samples'], maps_samples=s['maps_samples'], ss_samples=s['ss_samples'], fd_reads=s['fd_reads'], maps_reads=s['maps_reads'], gap_ms=s['sample_gap_ms'], processes=len(procs), flags=s['flags'], decoy_connections=s['decoy_connections'], leftovers=s['leftovers'])
# every process's bus and home variables, as read at its first sample
envs = collections.Counter()
for p in procs:
    e = p.get('env') or {}
    envs[(re.sub(r'/tmp/cua171-task49-[^/]+/[^/,]+', '<run scratch>', e.get('DBUS_SESSION_BUS_ADDRESS', '<unset>'))[:90], re.sub(r'guid=\w+', 'guid=…', e.get('AT_SPI_BUS_ADDRESS', '<unset>')), 'run' if (e.get('HOME') or '').startswith('/tmp/cua171-task49-') else ('person' if e.get('HOME') == H else e.get('HOME', '<unreadable>')))] += 1
out('environments', by_session_a11y_home=[{'session': k[0], 'a11y': k[1], 'home': k[2], 'processes': n} for k, n in envs.most_common()])
apps_person_home = sorted({p['comm'] for p in procs if (p.get('env') or {}).get('HOME') == H})
out('processes-with-person-home', comms=apps_person_home)
b = s['browsers']
kinds = collections.Counter((x['kind'], x['type'] or 'main') for x in b)
profiles = sorted({x['profile'] for x in b if x.get('profile')})
homes = collections.Counter('run' if (x['home'] or '').startswith('/tmp/cua171-task49-') else (x['home'] or 'unreadable (title rewrite)') for x in b)
mains = [x for x in b if x['kind'] == 'chrome' and not x['type'] and x['comm'] == 'chrome' and x['argv_has_profile']]
out('browsers', processes=len(b), by_kind_type={f'{k[0]}:{k[1]}': n for k, n in sorted(kinds.items())}, chrome_browser_processes=[{'pid': x['pid'], 'lived_s': round(x['last'] - x['first'], 1), 'profile': re.sub(r'/tmp/cua171-task49-[^/]+/', '<tmp>/', x['profile'] or '')} for x in mains], distinct_profiles=len(profiles), homes=dict(homes), nss_libraries=s.get('browser_nss_libraries'), run_home_nss_paths=s.get('browser_run_home_nss'), run_home_nss_dirs={re.sub(r'/tmp/cua171-task49-[^/]+/[^/]+/', '<run scratch>/', k): v for k, v in (s.get('run_home_nss_dirs') or {}).items()})
out('person-home-paths-held', by_comm=s['home_paths_by_comm'])
for r in rows(os.path.join(d, 'session.jsonl')):
    if r['kind'] in ('server', 'setup', 'phase-end', 'server-stopped', 'owner-changed'):
        out('session-' + r['kind'], **{k: v for k, v in r.items() if k not in ('kind',)})
# the windows of the display, per phase: Chrome's and Electron's, and any window with no run label
wins = rows(os.path.join(d, 'windows.jsonl'))
byid = {}
for w in wins:
    byid.setdefault(w['id'], []).append(w)
per_phase = collections.defaultdict(list)
for wid, ws in byid.items():
    first = next((w for w in ws if w['at'] == 'first'), None)
    later = next((w for w in ws if w['at'] == '+2s'), None)
    gone = next((w for w in ws if w['at'] == 'gone'), None)
    if not first:
        continue
    name = (later or first).get('name')
    per_phase[first['phase']].append({'id': wid, 'class': (later or first).get('class'), 'name': name, 'state_first': first.get('state'), 'state_2s': later.get('state') if later else None, 'transient_for': first.get('transient_for'), 'type': first.get('type'), 'lived_ms': gone.get('lived_ms') if gone else None})
for phase, ws in per_phase.items():
    chrome = [w for w in ws if 'Google-chrome' in (w['class'] or '')]
    electron = [w for w in ws if re.search(r'lectron', w['class'] or '')]
    unlabelled = [w for w in ws if 'cua171-' not in (w['name'] or '') and w['name'] != '"person"']
    out('windows', phase=phase, total=len(ws), chrome=len(chrome), chrome_classes=sorted({w['class'] for w in chrome}), chrome_states=collections.Counter(str(w['state_2s']) for w in chrome), chrome_titles_without_label=[w for w in chrome if 'cua171-' not in (w['name'] or '')], chrome_maximized=[w['id'] for w in chrome if 'MAXIMIZED' in str(w['state_first']) + str(w['state_2s'])], electron=len(electron), electron_classes=sorted({w['class'] for w in electron}), unlabelled=[{k: w[k] for k in ('id', 'class', 'name', 'type', 'transient_for', 'lived_ms')} for w in unlabelled])
