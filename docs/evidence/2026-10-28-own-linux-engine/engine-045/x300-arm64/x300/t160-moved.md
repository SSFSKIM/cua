0.4.5: gate open 142 (every one overran: true); overran with the gate shut (item 1's rows, after_path) 35; in_floor 123.
Item 1's rows: last step past floor_until (ms) min 0.1, p50 6.0, p95 21.5, max 24.0; motions 2; added_ms p50 / p95 28.0 / 31.1; answer p50 / p95 434.7 / 516.4; release after the take p50 / p95 360.8 / 378.4.
0.4.4 (task 147) shut rows whose path ended more than 1 ms past floor_until: 12; answer p50 / p95 453.8 / 511.4; release after the take p50 / p95 352.9 / 353.9.

Rows where the engine and the row disagree (overran against the path end more than 1 ms past floor_until, or last_step_after_take_ms more than 2 ms from the path end):
- r0 #24: overran false, open false, schedule in_floor, last_step_after_take_ms 324.9, path end after the take 327.1 (floor_until 326), ok true, notice yes
- r11 #0: overran false, open false, schedule in_floor, last_step_after_take_ms 324.0, path end after the take 326.1 (floor_until 326), ok true, notice yes
- r6 #0: overran false, open false, schedule in_floor, last_step_after_take_ms 323.8, path end after the take 326.1 (floor_until 326), ok true, notice yes
- r6 #16: overran true, open false, schedule after_path, last_step_after_take_ms 326.8, path end after the take 326.8 (floor_until 326), ok true, notice yes
- r6 #18: overran true, open false, schedule after_path, last_step_after_take_ms 326.5, path end after the take 326.5 (floor_until 326), ok true, notice yes
- r8 #6: overran true, open false, schedule after_path, last_step_after_take_ms 326.1, path end after the take 326.1 (floor_until 326), ok true, notice yes
- r8 #11: overran true, open false, schedule after_path, last_step_after_take_ms 326.3, path end after the take 326.3 (floor_until 326), ok true, notice yes
