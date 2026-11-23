# linux-engine-diff summary

## t73-events-vendor-js (experiment events)

Through OpenAI's JavaScript client (the desktop-only commands, well-formed requests, effects read back):

| scenario | newest | cua | effects (pinned / newest / cua) |
|---|---|---|---|
| desktop move_relative | same | same | 2/2 / 2/2 / 2/2 |
| drag_handle | differs at step 0 (event) | same | 3/3 / 3/3 / 3/3 |

cua sent the pinned build's events and answers in every scenario.

Request times per route and command (median ms; `first` is the request after the engine started, `later` the rest; through the client they include its deferred settle, so they are recorded, not judged):

| route | command | series | n | pinned | newest | cua | cua − faster, 95% interval | verdict |
|---|---|---|---:|---:|---:|---:|---|---|
| desktop | drag_handle | first | 1 | 78.58 | 78.09 | 69.51 | – | at or below (recorded) |
| desktop | drag_handle | later | 2 | 123.59 | 119.54 | 90.24 | – | at or below (recorded) |
| desktop | move_relative | first | 1 | 5.2 | 4.82 | 2.84 | – | at or below (recorded) |
| desktop | move_relative | later | 1 | 155.93 | 126.19 | 91.99 | – | at or below (recorded) |

