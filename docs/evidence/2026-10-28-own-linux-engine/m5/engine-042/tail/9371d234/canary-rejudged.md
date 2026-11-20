| run | step | in front: held presses' largest ping wait (ms) | in front, 9371d234's rule | select, 9371d234's rule |
|---|---|---|---|---|
| k1-1 | K1 | 3.8, 88.5, 83.9, 1.7, 80.3, 83.5, 1.7, 86.5, 86.8 | pass (busy 6, slow 6, slow and started 6 / held 9) | pass (slow 0 / held 9) |
| k1-2 | K1 | 5.9, 90.9, 87.8, 3.8, 90.4, 90.8, 3.8, 92.1, 88.8 | pass (busy 7, slow 6, slow and started 6 / held 9) | pass (slow 0 / held 9) |
| k1-3 | K1 | 5.9, 90.8, 87.7, 1.7, 87.6, 88.8, 3.8, 89.9, 88.8 | pass (busy 7, slow 6, slow and started 6 / held 9) | pass (slow 0 / held 9) |
| k1-4 | K1 | 5.9, 88.7, 85.5, 5.8, 81.4, 86.8, 1.7, 86.4, 85.6 | pass (busy 8, slow 6, slow and started 6 / held 9) | pass (slow 0 / held 9) |
| k1-5 | K1 | 3.8, 93.9, 3.8, 1.8, 88.6, 91, 1.6, 88.7, 87.7 | pass (busy 5, slow 5, slow and started 5 / held 9) | pass (slow 0 / held 9) |
| k2-1 | K2 | 3.8, 86.5, 85.5, 3.8, 83.6, 88.5, 0, 88.9, 88.8 | pass (busy 6, slow 6, slow and started 6 / held 9) | pass (slow 0 / held 9) |
| k2-2 | K2 | 1.8, 84.5, 82.6, 5.9, 83.7, 82.6, 1.8, 83.6, 84.2 | pass (busy 7, slow 6, slow and started 6 / held 9) | pass (slow 0 / held 9) |
| k2-3 | K2 | 1.8, 89, 85.5, 86.7, 87.9, 88.8, 86.6 | pass (busy 6, slow 6, slow and started 6 / held 7) | pass (slow 0 / held 9) |
| k2-4 | K2 | 1.5, 84.7, 87.8, 0, 93.9, 0, 90.5, 85.8 | pass (busy 5, slow 5, slow and started 5 / held 8) | pass (slow 0 / held 9) |
| k2-5 | K2 | 3.8, 85.7, 86.7, 90.5, 88.4, 82.6 | pass (busy 5, slow 5, slow and started 5 / held 6) | pass (slow 0 / held 9) |

| step | runs | canary passes (both cells), 9371d234's rule | in-front runs with no press at 20 ms or more | fewest presses at 20 ms or more in a run |
|---|---:|---:|---:|---|
| K1 | 5 | 5 | 0 | 5 |
| K2 | 5 | 5 | 0 | 5 |

No canary failure under any rule.
