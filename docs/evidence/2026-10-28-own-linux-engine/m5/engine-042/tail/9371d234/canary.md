| run | step | Chrome (gate.mjs) | harness Chrome executables (process record: processes) | in front: busy / held (slow >= 20 ms) | in front verdict | select: slow / held (cold) | select verdict | exit |
|---|---|---|---|---|---|---|---|---:|
| k1-1 | K1 | Google Chrome 156.0.8078.73 | /opt/google/chrome/chrome: 35 | 6 / 9 (6) | pass | 0 / 9 (0) | pass | 0 |
| k1-2 | K1 | Google Chrome 156.0.8078.73 | /opt/google/chrome/chrome: 35 | 7 / 9 (6) | pass | 0 / 9 (0) | pass | 0 |
| k1-3 | K1 | Google Chrome 156.0.8078.73 | /opt/google/chrome/chrome: 35 | 7 / 9 (6) | pass | 0 / 9 (0) | pass | 0 |
| k1-4 | K1 | Google Chrome 156.0.8078.73 | /opt/google/chrome/chrome: 34 | 8 / 9 (6) | pass | 0 / 9 (0) | pass | 0 |
| k1-5 | K1 | Google Chrome 156.0.8078.73 | /opt/google/chrome/chrome: 34 | 5 / 9 (5) | pass | 0 / 9 (0) | pass | 0 |
| k2-1 | K2 | Google Chrome 158.0.8127.36 | /Users/new/.local/share/cua-171/chrome-stable/158.0.8127.36-1/root/opt/google/chrome/chrome: 37 | 6 / 9 (6) | pass | 0 / 9 (0) | pass | 0 |
| k2-2 | K2 | Google Chrome 158.0.8127.36 | /Users/new/.local/share/cua-171/chrome-stable/158.0.8127.36-1/root/opt/google/chrome/chrome: 37 | 7 / 9 (6) | pass | 0 / 9 (0) | pass | 0 |
| k2-3 | K2 | Google Chrome 158.0.8127.36 | /Users/new/.local/share/cua-171/chrome-stable/158.0.8127.36-1/root/opt/google/chrome/chrome: 36 | 6 / 7 (6) | pass | 0 / 9 (0) | pass | 0 |
| k2-4 | K2 | Google Chrome 158.0.8127.36 | /Users/new/.local/share/cua-171/chrome-stable/158.0.8127.36-1/root/opt/google/chrome/chrome: 36 | 5 / 8 (5) | pass | 0 / 9 (0) | pass | 0 |
| k2-5 | K2 | Google Chrome 158.0.8127.36 | /Users/new/.local/share/cua-171/chrome-stable/158.0.8127.36-1/root/opt/google/chrome/chrome: 37 | 5 / 6 (5) | pass | 0 / 9 (0) | pass | 0 |

| step | runs | both cells pass | in-front canary floor met (busy x 2 >= held, held >= 3) | busy / held, lowest share | busy / held, pooled | select fast on every warm held drag |
|---|---:|---:|---:|---|---|---:|
| K1 | 5 | 5 | 5 | 5 / 9 (k1-5) | 33 / 45 | 5 |
| K2 | 5 | 5 | 5 | 5 / 8 (k2-4) | 29 / 39 | 5 |

Every cell of every run passed.
