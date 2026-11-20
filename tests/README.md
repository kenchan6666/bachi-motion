# 回归测试

自写测试谱和本地运动检查，用来拦住手抖、瞬移、过早抬手和休息段晃动。不含本家谱。

```
npm test
```

会依次跑：

1. `node js/parser.js`（parser 自检，约 14 项）
2. `node tests/titlebar-bpm.test.js`（标题栏 BPM 区间：过滤短于 4 拍的段，自制谱）
3. `node js/check-single-weld.js`（握点到棒尖 cluster span 必须是 0.0000）
4. 对 `tests/charts/{trest,t160,t220,t280}.tja` 导出逐帧手部数据并用 `check.py` 检查 JUMP / REST / EARLY / HOVER，全部须 `PASS 0`

需要本机或 CI 上的 Chrome，可通过 `CHROME_PATH` 指定。单独导出一谱：

```
BM_ROOT=. node tests/dump.js tests/charts/t160.tja 1-10 > /tmp/o.json
python3 tests/check.py /tmp/o.json
```
