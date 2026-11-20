# 回归测试

自写测试谱和本地运动检查，用来拦住手抖、瞬移、过早抬手和休息段晃动。不含本家谱。

```
npm test
```

会依次跑：

1. `node js/parser.js`（parser 自检，约 14 项）
2. `node tests/titlebar-bpm.test.js`（标题栏 BPM 区间：过滤短于 4 拍的段，自制谱）
2b. `node tests/audio-mux.test.js`（原曲对齐：chartStart = 已减 OFFSET 的第一个音 − 0.7，不再减一次；只有 TJA 时不含原曲）
2d. `node tests/section-trim.test.js`（进度条选段：整首仍是原来的入场/收尾；收窄后预览和导出从选段内第一个音 − 0.7 起到右帽，循环跳回左帽不再垫 0.7）
2c. `node tests/batch-queue.test.js`（批量进度、队列里缺省原曲、本机出片接口）
3. `node tests/sticking.test.js`（自动手顺 55 条，fixtures 来自 suyue@ebd21a0；另含入口排序/同拍警告）
4. `node tests/auto-sticking-engine.test.js`（无 JSON 走 autoSticking；有 JSON 时三个控件无效；变速按秒换算拍）
5. `node tests/hand-edits.test.js`（编辑器纯函数：拖选滚奏/交互/恢复、单音换手、撤销重做）
6. `node tests/roll-dot-cache.test.js`（滚奏点 720 点采样缓存必须与逐帧未缓存结果完全一致）
7. `node tests/long-rest-idle.test.js`（长休止归位：咔后长空档停在开场鼓心倒V并静止；下一击是咔也要等休息窗结束再横移；短间隔不归位）
8. `node js/check-single-weld.js`（握点到棒尖 cluster span 必须是 0.0000）
9. `python3 tests/check-hover-exempt.test.py`（HOVER 窄豁免：休息接密串且顶点叠在待机高度不报；密串中间真定格、以及顶点不在待机高度时仍报）
10. 对 `tests/charts/{trest,t160,t220,t280}.tja` 导出逐帧手部数据并用 `check.py` 检查 JUMP / REST / EARLY / HOVER，全部须 `PASS 0`

需要本机或 CI 上的 Chrome，可通过 `CHROME_PATH` 指定。单独导出一谱：

```
BM_ROOT=. node tests/dump.js tests/charts/t160.tja 1-10 > /tmp/o.json
python3 tests/check.py /tmp/o.json
```
