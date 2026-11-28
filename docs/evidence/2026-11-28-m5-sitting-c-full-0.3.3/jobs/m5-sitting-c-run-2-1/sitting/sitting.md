## Sitting C (full): the native matrix, three runs a side, with the Korean and Unicode rows, the concurrent-use and intervention cells, Acceptance 3's keystroke witness and the window-order oracle; #212's save-sheet cell

Proves: Acceptance 3, 4 and 7.

| step | kind | status | exit | time | sitting so far | job so far | note |
|---|---|---|---|---|---|---|---|
| witness-tap | diagnostic | INFO | 0 | 5 s | 0 min | 4 min | R3's witness tap built and granted Input Monitoring (ruling 1225) |
| matrix-cua-2 | run | PASS | 1 | 2486 s | 42 min | 45 min | recorded complete; exit 1 is the run's own outcome, which its judge reads |
| matrix-vendor-2 | run | PASS | 1 | 3830 s | 105 min | 109 min | recorded complete; exit 1 is the run's own outcome, which its judge reads |
| save-sheet-cua-2 | run | PASS | 0 | 87 s | 107 min | 111 min | 1 sample over 1 run: cua run-2 sample 2 PASS; the run's folder empty; AXDocument none, AXEdited false (closeButton); Go To closed (Escape 0x) |
| save-sheet-vendor-2 | run | PASS | 0 | 102 s | 108 min | 112 min | 1 sample over 1 run: vendor run-2 sample 2 PASS; the run's folder empty; AXDocument none, AXEdited false (closeButton); Go To closed (Escape 0x) |

**PASS** (exit 0): 4 PASS, 0 FAIL, 0 NO VERDICT, 0 OWNER, 1 INFO, 0 SKIP, 0 PENDING.

Wall time: the sitting 108 min so far, the job 112 min of its 360.

## The run job (ruling 1228)

No harness or infrastructure stop: the job passes; its verdicts above go to the judging job.

## The alert guard

Per step and cell: the cells the alert guard refused unsent (NO VERDICT `alert` or `unread`) and those the key-window requirement refused (NO VERDICT `keyWindow`: the scene's app held another key window, or none), the key cells guarded with their key reading not taken (`key cells guarded unread`: unguarded against the alert holding the key, which the key guard's front check cannot see), the click or key cells sent with their key window read (`cells key window read`), and those sent with it unread (`cells key window unread`, with why: an untrusted reader means the key-window requirement went unobserved).

| step | cell | NO VERDICT alert | NO VERDICT unread | NO VERDICT keyWindow | key cells guarded unread | cells key window read | cells key window unread |
|---|---|---|---|---|---|---|---|
| matrix-cua-2 | row:46 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:48 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:50 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:52 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:56 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:60 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:62 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:64 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:70 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | keys:super+o | 0 | 0 | 0 | 0 | 5 | 0 |
| matrix-cua-2 | keys:super+n | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | keys:super+s | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-2 | save-panel:untitled | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:116 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:132 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:134 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:136 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:140 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:142 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:190 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:192 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:194 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:200 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:202 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:204 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:210 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:258 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:260 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:262 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:268 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:270 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:274 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:276 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:278 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:282 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:283 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:284 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:285 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:287 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:289 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:290 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:291 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:294 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:297 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:298 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:299 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:301 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:302 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:305 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:306 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:307 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:310 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:311 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:312 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:317 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:318 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:319 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:320 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:322 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:324 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:325 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:326 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:329 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:332 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:333 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:334 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:337 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:338 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:342 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:343 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:344 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:346 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:347 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:351 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:351:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:352 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-2 | row:352:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:353 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:353:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-2 | row:354 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:354:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:354:2 | 0 | 0 | 0 | 0 | 1 | 2 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 2) |
| matrix-cua-2 | row:355 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:355:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:356 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-2 | row:357 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:358 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:359 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:360 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:361 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:362 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:363 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:364 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:365 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:366 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:367 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-2 | row:368 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:369 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:370 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:371 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:372 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:373 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:374 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:375 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:376 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:377 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:378 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:379 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:380 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:381 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:382 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:383 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:384 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:385 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:386 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:387 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:388 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:389 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:390 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:391 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:392 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:393 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:394 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:395 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:396 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:397 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:398 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:399 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:400 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:401 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:402 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:403 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:404 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:405 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:406 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:407 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:408 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:409 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:410 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:411 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:412 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:413 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:413:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:414 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:414:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:415 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:415:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:416 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:417 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:418 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:419 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:420 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:421 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:422 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:423 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:424 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:425 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:426 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:427 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:428 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:429 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:430 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:431 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:432 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:433 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:434 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:435 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:436 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:437 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:438 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:439 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:440 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:441 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:442 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:443 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:444 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:445 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:446 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:447 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:448 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:449 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:450 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:451 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:452 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:453 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:454 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:455 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:456 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:457 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:458 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:459 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:460 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:461 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:462 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:463 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:464 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:465 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:466 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:467 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:468 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:469 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:470 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:471 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:472 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | unicode:prepare:textedit | 0 | 0 | 0 | 0 | 4 | 0 |
| matrix-cua-2 | unicode:prepare:electron | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-2 | row:473 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:474 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:475 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:476 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:477 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:478 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:479 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:480 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:481 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:482 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:483 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:484 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:485 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:486 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:487 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:488 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:489 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:490 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | unicode:prepare:chrome | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:491 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:492 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:493 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:494 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:495 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:496 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:497 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:498 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:499 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:500 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:501 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:502 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:503 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:504 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:505 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:506 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:507 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:508 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:509 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:510 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:511 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:512 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:513 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:514 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:515 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:516 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:517 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:518 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:519 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:520 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:521 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:522 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:523 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:524 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:525 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:526 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:527 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:528 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:529 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:530 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:531 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:532 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:533 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:534 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:535 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:536 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:537 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:538 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:539 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:540 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:541 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:542 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:543 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:544 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:545 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:546 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:547 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:548 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:549 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:550 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:551 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:552 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:553 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:554 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:555 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:556 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:557 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:558 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:559 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:560 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:561 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:562 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:563 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:564 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:565 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:566 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:567 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:568 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:569 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:570 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:571 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:572 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:573 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:574 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:575 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:576 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:577 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:578 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:579 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:580 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:46 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:48 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:50 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:52 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:56 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:60 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:62 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:64 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:70 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | keys:super+o | 0 | 0 | 0 | 0 | 5 | 0 |
| matrix-vendor-2 | keys:super+n | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | keys:super+s | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-2 | save-panel:untitled | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:116 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:132 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:134 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:136 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:140 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:142 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:190 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:192 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:194 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:200 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:202 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:204 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:210 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:258 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:260 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:262 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:268 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:270 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:274 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:276 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:278 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:282 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:283 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:284 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:285 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:287 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:289 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:290 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:291 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:294 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:297 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:298 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:299 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:301 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:302 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:305 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:306 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:307 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:310 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:311 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:312 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:317 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:318 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:319 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:320 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:322 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:324 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:325 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:326 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:329 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:332 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:333 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:334 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:337 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:338 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:342 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:343 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:344 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:346 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:347 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:351 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:351:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:352 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-2 | row:352:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:353 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:353:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-2 | row:354 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:354:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-2 | row:355 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:355:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:356 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-2 | row:357 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:358 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:359 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:360 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:361 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:362 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:363 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:364 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:365 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:366 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:367 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-2 | row:368 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:369 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:370 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:371 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:372 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:373 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:374 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:375 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:376 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:377 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:378 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:379 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:380 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:381 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:382 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:383 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:384 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:385 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:386 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:387 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:388 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:389 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:390 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:391 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:392 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:393 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:394 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:395 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:396 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:397 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:398 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:399 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:400 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:401 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:402 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:403 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:404 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:405 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:406 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:407 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:408 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:409 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:410 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:411 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:412 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:413 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:413:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:414 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:414:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:415 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:415:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:416 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:417 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:418 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:419 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:420 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:421 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:422 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:423 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:424 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:425 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:426 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:427 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-2 | row:428 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:429 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:430 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:431 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:432 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:433 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:434 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:435 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:436 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:437 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:438 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:439 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:440 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:441 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:442 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:443 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:444 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:445 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:446 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:447 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:448 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:449 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:450 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:451 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:452 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:453 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:454 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:455 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:456 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:457 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:458 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:459 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:460 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:461 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:462 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:463 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:464 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:465 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:466 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:467 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:468 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:469 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:470 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:471 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:472 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | unicode:prepare:textedit | 0 | 0 | 0 | 0 | 4 | 0 |
| matrix-vendor-2 | unicode:prepare:electron | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-2 | row:473 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:474 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:475 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:476 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:477 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:478 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:479 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:480 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:481 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:482 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:483 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:484 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-2 | row:485 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:486 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:487 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:488 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:489 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:490 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | unicode:prepare:chrome | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:491 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:492 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:493 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:494 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:495 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:496 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:497 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:498 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:499 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:500 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:501 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:502 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:503 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:504 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:505 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:506 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:507 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:508 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:509 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:510 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:511 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:512 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:513 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:514 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:515 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:516 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:517 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:518 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:519 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:520 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:521 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:522 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:523 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:524 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:525 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:526 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:527 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:528 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:529 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:530 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:531 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:532 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:533 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:534 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:535 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:536 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:537 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:538 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-2 | row:539 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:540 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:541 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:542 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:543 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:544 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:545 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:546 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:547 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:548 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:549 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:550 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:551 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:552 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:553 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:554 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:555 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:556 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:557 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:558 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:559 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:560 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:561 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:562 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:563 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:564 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:565 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:566 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:567 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:568 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:569 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:570 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:571 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:572 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:573 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:574 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:575 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:576 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:577 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:578 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:579 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:580 | 0 | 0 | 0 | 0 | 2 | 0 |
| save-sheet-cua-2 | row:0:1 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-cua-2 | row:0 | 0 | 0 | 0 | 0 | 1 | 0 |
| save-sheet-cua-2 | row:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| save-sheet-vendor-2 | row:0:1 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-vendor-2 | row:0 | 0 | 0 | 0 | 0 | 1 | 0 |
| save-sheet-vendor-2 | row:1 | 0 | 0 | 0 | 0 | 1 | 0 |

## The key-window requirement

In this sitting's records: 1217 click or key cells sent with the key window read; 0 refused NO VERDICT keyWindow; 11 sent with the key window unread (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 11).
Setup's reading of the reader's grant over the loopback ssh: trusted. Context only: the verdict below is the sitting's own readings.

Observed, except for the 11 cells sent unread.

## TextEdit and the Open panel, read back (ruling 1169)

Where each step's TextEdit windows and Open panels stood, against what the venue planned, and whether an alert the venue read overlapped them (the alert guard then refused the cells there). A panel the run resized as well as moved (ruling 1199) says so.

| step | window | planned | actual | overlaps an alert |
|---|---|---|---|---|
| matrix-cua-2 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| matrix-cua-2 | panel:openPanel/frontmost/getAXState.panel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-2 | panel:openPanel/frontmost/typeText.search | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-2 | panel:openPanel/frontmost/pressKey.escape | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-2 | panel:openPanel/frontmost/click.cancel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-2 | panel:savePanel/frontmost/pressKey.escape | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-2 | panel:savePanel/frontmost/typeText.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-2 | panel:savePanel/frontmost/setValue.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-2 | panel:openPanel/background@finder | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-2 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| matrix-vendor-2 | panel:openPanel/frontmost/getAXState.panel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-2 | panel:openPanel/frontmost/typeText.search | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-2 | panel:openPanel/frontmost/pressKey.escape | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-2 | panel:openPanel/frontmost/click.cancel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-2 | panel:savePanel/frontmost/pressKey.escape | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-2 | panel:savePanel/frontmost/typeText.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-2 | panel:savePanel/frontmost/setValue.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-2 | panel:openPanel/background@finder | -58,80 880x448 | -58,80 880x448 | no |
| save-sheet-cua-2 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| save-sheet-vendor-2 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |

## The screen at the end

2 alert windows; the display 1920x1080 (mode 10).

## The venue (ruling 1169)

The alert windows after the mode switch: alert 60 (893,244 260x364), alert 34 (830,188 260x348). TextEdit's preferences (com.apple.TextEdit, read back from its container's plist): WidthInChars read back, NSRequiresOpenUntitledWindowAtLaunch read back, ApplePersistenceIgnoreState read back, NSWindow Frame NSNavPanelAutosaveName read back, NSNavPanelExpandedSizeForOpenMode read back. TextEdit's saved application state: none at /Users/runner/Library/Saved Application State/com.apple.TextEdit.savedState.

Input sources (ruling 1189): enabled through TISEnableInputSource (./input-sources.swift), read back from TIS's enabled list after 1 read; the preference's value (com.apple.HIToolbox AppleEnabledInputSources) recorded beside it; restored: nothing: the VM is thrown away (ruling 1189). Every source the runs select held.

| source | enable | TIS's enabled list | the preference | held |
|---|---|---|---|---|
| com.apple.keylayout.ABC | status 0 | in TIS's enabled list, enabled, selectable | listed | yes |
| com.apple.inputmethod.Korean | status 0 | in TIS's enabled list, enabled (the input method its mode needs) | listed | yes |
| com.apple.inputmethod.Korean.2SetKorean | status 0 | in TIS's enabled list, enabled, selectable | listed | yes |

| scene | the mini | hosted | why | grounding | cells resting on it |
|---|---|---|---|---|---|
| chrome | 80,60 1000x760 | 22,60 800x760 | the capture alerts read fresh after the mode switch: alert 60 (893,244 260x364), alert 34 (830,188 260x348); the mini's 80,60 1000x760 would overlap them; Chrome is 800x760 on a hosted runner (ruling 1169); the frame 22,60 800x760 | window points grounded on the notes field's frame as read in the run's window, toolbar and infobars whatever they are (../native-matrix/plan.mjs chromeDragFromField, ruling 1226); a frame not read leaves the drag invalid | chrome/frontmost/drag.select, chrome/background/drag.select@textedit, native-mac chrome (its tree: the page in the window, both lanes alike) |
| electron | 140,100 720x560 | 102,100 720x560 | the capture alerts read fresh after the mode switch: alert 60 (893,244 260x364), alert 34 (830,188 260x348); the mini's 140,100 720x560 would overlap them; the frame 102,100 720x560 | window points on the fixture's size, unchanged at 720x560: its drag's layout (ELECTRON_FIELD_LAYOUT) holds as it is; #259's point is grounded on the field's frame as read (../native-matrix/plan.mjs electronPointFromField, ruling 1228); only the origin moved | electron/frontmost/drag.select, electron/frontmost/click.point, electron/background/drag.select@finder, native-mac electron (its tree) |
| finder | 80,80 920x520 | 22,80 800x520 | the capture alerts read fresh after the mode switch: alert 60 (893,244 260x364), alert 34 (830,188 260x348); the mini's 80,80 920x520 would overlap them; the frame 22,80 800x520 | element-addressed rows; the height is the mini's, so the same rows are visible | finder/frontmost/click.row, finder/frontmost/pressKey.down, finder/frontmost/typeText.typeSelect, finder/frontmost/scroll.down, finder/frontmost/performSecondaryAction.down, finder/background/click.row@textedit, finder/background/pressKey.down@textedit, finder/background/typeText.typeSelect@textedit, finder/background/scroll.down@textedit, finder/background/performSecondaryAction.down@textedit, finder/background/click.row@electron, finder/background/pressKey.down@electron, finder/background/typeText.typeSelect@electron, finder/background/scroll.down@electron, finder/background/performSecondaryAction.down@electron, native-mac finder (its tree: the rows its height shows; the diff pairs equal frames only) |
| textedit | WidthInChars 75, NSRequiresOpenUntitledWindowAtLaunch YES (AppKit's default), ApplePersistenceIgnoreState NO (AppKit's default: windows restored) | WidthInChars 60, NSRequiresOpenUntitledWindowAtLaunch NO, ApplePersistenceIgnoreState YES, saved application state to be removed after the warm-ups, outside the container (venue.textEdit.savedState says what was) | the capture alerts read fresh after the mode switch: alert 60 (893,244 260x364), alert 34 (830,188 260x348); at 1920x1080 TextEdit's default width put its new document at 242,107 603x505 (pilot A, run 45252131587), over alert 31; its origin is AppKit's cascade, read back by each run; the untitled document AppKit opens at launch stood at 241,87 586x488 on the runner's first TextEdit launch and 213,78 387x505 on the next (pilot A, run 45272465181), so none is opened (the design session); vv-1's launch window again stood at 241,87 586x488 with that key in force and its new document took 603x505, the default width, though the domain read WidthInChars 60 back (pilot A's re-run, run 45277221729): a window the warm-ups' saved state restored, and a domain write the sandboxed TextEdit does not read, so restoration is turned off, removing the saved state outside the container is attempted (venue.textEdit.savedState records the outcome) and every key is read back from TextEdit's container | fractions of the document window (its drag) and its own rows: valid at any width the text view fills, the prepare's clicks proving each end | textedit/frontmost/drag.select, textedit/background/drag.select@finder, textedit/background/drag.select@chrome, native-mac textedit (its tree) |
| textedit document | view size none: TextEdit takes the paper's width, sha256 default e3703ac3a303696332910efb44330a6604f403849695ca011bfacf2a23ad4a76, sha256 wide-page e228c76974983f74cbd27e31eefca527584ceb5eac25771eecab205446a391a3 | view size 480x792 (\vieww9600\viewh15840), sha256 default dff8383ef0c0a5142279fd1d536a562bff45a4f06be68bbd5d603e270e988ffd, sha256 wide-page f32e9d20e9a2c43fe0f76ebb08e70a0b7e14dbc3b2629e7c913a8af9248e08ef | the scene's cua-scene.rtf, opened as a file with no view size, stood at 213,78 627x877 on both sides (pilot B, run 45274556933): the paper's width, which WidthInChars does not change, its right edge 840 over alert 31; a view 480 wide ends left of the strip's 822 from the cascade origins read so far, one step more; its origin is AppKit's cascade, read back by each run | the window's size only: the file is the mini's with the view size inserted, so its text and attribute runs are the mini's (textutil's text and HTML of both files are equal, test/repl-parity/scenes-mac.test.mjs); the cells' fractions and rows hold as for TextEdit's preferences; the wide page stays wider than the window (its 200% zoom) | textedit/frontmost/drag.select, textedit/background/drag.select@finder, textedit/background/drag.select@chrome, native-mac textedit (its tree), hscroll/textedit-wide-page/right (the wide-page layout: its page wider than the window) |
| openPanel | AppKit's: centred on the screen | 80,80 720x440 | the capture alerts read fresh after the mode switch: alert 60 (893,244 260x364), alert 34 (830,188 260x348); the mini leaves the panel centred, where the alerts are; the frame 80,80 720x440 | element-addressed (its Cancel, its search field, the Save sheet's name field, A's New Document): the frame decides only whether the guard refuses them; on a hosted runner the matrix moves each opening into the strip by Accessibility (ruling 1195), and a read-back outside it is NO VERDICT venue | openPanel/frontmost/getAXState.panel, openPanel/frontmost/typeText.search, openPanel/frontmost/pressKey.escape, openPanel/frontmost/click.cancel, openPanel/background/getAXState.panel@finder, openPanel/background/click.cancel@finder, savePanel/frontmost/pressKey.escape, savePanel/frontmost/typeText.name, savePanel/frontmost/setValue.name, native-baseline setup.newDocument (the panel at TextEdit's launch, where one shows: the mini's) |
