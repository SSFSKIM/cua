## short-drop (short drop)
| lane | runs | usable | took | median ms |
|---|---:|---:|---:|---:|
| pinned | 40 | 22 | 22 | 252.9 |
| newest | 40 | 25 | 25 | 251.5 |
| cua | 40 | 39 | 40 | 365.9 |

verdict: {"verdict":"fail","against":"newest","bar":251.5,"candidate":365.9,"interval":[112.6,116.7],"bound":12.58,"label":null,"reasons":["cua 365.9 ms against newest's 251.5 ms, the interval [112.6, 116.7] above 0"]}

## select-40 (40 px selection)
| lane | runs | usable | took | median ms |
|---|---:|---:|---:|---:|
| pinned | 40 | 39 | 40 | 254.1 |
| newest | 40 | 39 | 40 | 251.9 |
| cua | 40 | 39 | 40 | 254.4 |

verdict: {"verdict":"pass","against":"newest","bar":251.9,"candidate":254.4,"interval":[1.6,3],"bound":12.6,"label":"within the bound","reasons":[]}

