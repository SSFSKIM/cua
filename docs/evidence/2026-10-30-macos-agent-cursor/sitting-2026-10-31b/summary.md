# The agent cursor's sitting: what each item recorded

## Item 1

5 cell(s), 2 failed; 3 task(s), 1 failed.

- task glide-cover failed: {"ok":false,"covers":[{"bounds":{"height":825,"width":1438,"x":26,"y":59},"layer":0,"number":19462,"onScreen":true,"ownerPid":95245},{"bounds":{"height":898,"width":1512,"x":0,"y":33},"layer":0,"number":46436,"onScreen":true,"ownerPid":92136},{"bounds":{"height":560,"width":720,"x":140,"y":100},"layer":0,"number":47426,"onScreen":true,"ownerPid":93114}],"bounds":{"height":760,"width":1000,"x":80,"y":60},"problem":"3 window(s) lie over the chrome scene's run window"}
- a: Chrome for Testing: the page's "Scene option" checkbox failed: sceneOption is not in the chrome window's text
- a: Chrome for Testing: the checkbox read back failed: sceneOption is not in the chrome window's text
- watch `order-first-target`: from the engine's numbers: TextEdit's alignment changes before or while the cursor shows at it (cursor-sitting.mjs order-meta) — **no verdict recorded**
- watch `order-second-target`: from the engine's numbers: the checkbox changes before the arrow's tip reaches it (cursor-sitting.mjs order-meta) — **no verdict recorded**

## Item 12-control

40 cell(s), 0 failed; 6 task(s), 0 failed.


## Item 12-fps60

40 cell(s), 0 failed; 12 task(s), 1 failed.

- task glide-frames failed: {"ok":false,"arm":"fps60","verdict":"not capped","why":"the capped glides composited a frame every 8.3 ms (119.8 Hz), under 14 ms apart","base":{"pid":7641,"glides":2,"frames":170.5,"ms":1427.1,"hz":119.5,"intervalMs":8.3,"rock":{"pid":7641,"begin":68548688950786,"end":68548712950786,"ms":1000,"mode":"rock","frames":120,"hz":120,"intervalMs":8.332791666666667},"rows":[{"pid":7641,"begin":68548605062351,"end":68548641962350,"ms":1537.5,"mode":"path","frames":183,"hz":119.02439024390243,"intervalMs":8.333896059184173},{"pid":7641,"begin":68548646204691,"end":68548677804692,"ms":1316.7,"mode":"path","frames":158,"hz":119.99696210222527,"intervalMs":8.32916892945668}]},"capped":{"pid":8689,"glides":2,"frames":171,"ms":1427.1,"hz":119.8,"intervalMs":8.3,"rock":{"pid":8689,"begin":68548825348030,"end":68548849348030,"ms":1000,"mode":"rock","frames":120,"hz":120,"intervalMs":8.335458333333333},"rows":[{"pid":8689,"begin":68548741502073,"end":68548778402072,"ms":1537.5,"mode":"path","frames":184,"hz":119.67479674796748,"intervalMs":8.329875225741876},{"pid":8689,"begin":68548782716668,"end":68548814316668,"ms":1316.7,"mode":"path","frames":158,"hz":119.99696210222527,"intervalMs":8.335336015822785}]},"pids":[7641,8689]}

## Item 12-still

40 cell(s), 0 failed; 8 task(s), 0 failed.

