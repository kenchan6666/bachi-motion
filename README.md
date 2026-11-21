# 溯溯的鼓棒（bachi-motion）

把一段太鼓达人 TJA 谱面变成第一人称鼓棒动画。主要给溯月讲谱、对手顺用。纯静态网页，可以开在 GitHub Pages 的 `/bachi-motion/` 子路径下（全部用相对路径，不要加前导 `/`）。

主人模式：贴谱面 → 点「生成 / 播放」→ 按 1-1 手顺看动画。  
溯月模式：导入她写的手顺 JSON（滚奏、插音、金色光圈），覆盖自动手顺。

**仓库名 / Pages 项目名是 `bachi-motion`。** 主标题是 bachi-motion，「溯溯的鼓棒」做副标题。

打开方式：用浏览器直接打开 `index.html`，或在本目录起一个静态服务器。手图是相对路径，`file://` 也能显示；若要用 `?sample=` 拉示例谱，需要 http。

## 网页怎么用

1. 右边（手机上在鼓的上方）有谱面下拉：练习谱2（默认，`samples/suyue_demo2_8bun16bun.tja`，8 分散音 + 16 分三连/五连）、练习谱、分音测试、滚奏演示，以及「自定义…」。选内置谱会立刻生成并可以播放。
2. 播放、重来、循环、慢放和谱面流速都在播放条里，可以随时改。贴自己的谱或打开文件时，选「自定义…」或到「打开谱面」里操作，再点 **生成 / 播放**。
3. 需要讲滚奏 / 插音时，切到「溯月」模式，贴或打开手顺 JSON。格式见 `samples/handorder.example.json`。选「滚奏演示」会自动载入配套手顺并切到溯月模式；也可用 `?sample=suyue_roll_demo`。

### 这版支持的 TJA

- 头：`TITLE`、`SUBTITLE`、`BPM`、`OFFSET`、`COURSE`、`LEVEL`
- 正文：`#START` … `#END`，`#MEASURE x/y`（默认 4/4），以及简单的 `#BPMCHANGE`、`#DELAY`
- 音符：`1` 咚、`2` 咔、`3` 大咚、`4` 大咔、`0` 休止。黄条（`5/6/7`）和气球（`8`）占时值但不打。
- 一个文件里有多个 COURSE 时，网页默认用第一段；命令行用 `--course Oni` 选。
- `OFFSET` 按 TJA 惯例从时间里减去（`OFFSET:0` 时第一个音在 t = 0）。

### 主人模式的手顺（溯溯定的规则）

- 从右手 R 起，之后左右交替：`R L R L…`
- 咚打鼓面，咔打鼓边，全部用整手握的单击
- 中间空了 **超过一拍**（当前 BPM 的一个四分音符）再起的音，重新从 R 开始。刚好一拍不重置
- 大音符（`3`/`4`）默认按左右交替、轮到哪只手就用哪只手单打（画成大音符），打完继续交替、**不重置成右手**。可在「演奏」里改成「双手」（两棒同时落下，下一颗仍接原左右顺序）或「当小音符」（画成小音符、手顺完全不动）。网页也可用 `?bignote=single|both|small`（默认 `single`）

### 溯月手顺 JSON

```json
{
  "song": "曲名",
  "bpm": 160,
  "events": [
    { "t": 0.00, "hand": "R", "face": "don", "grip": "roll", "inserted": false, "src": "1:0" },
    { "t": 0.05, "hand": "R", "face": "don", "grip": "roll", "inserted": true, "src": "1:1" }
  ]
}
```

`t` 是秒，而且是**这段谱面自己的相对时间**（第一个音大约是 `t = 0`），不是整首歌从开头算起的绝对时间。和 TJA 一起用 `--measures A-B` 时，对齐看的是每条事件的 `src`（`"小节:槽位"`，例如 `"119:12"`），时间从谱面该槽位算出来，再映射到切片时间轴（选中的第一小节为 t = 0）。所以无论 JSON 里的 `t` 是相对的还是绝对的，棒和音符都会对在一起。

`grip` 为 `"roll"` 时用滚奏捏棒。滚奏**只会**来自手顺 JSON 里的 `(xx)` 对（比如 16 分滚奏写成 `(RR)(LL)(RR)(LL)`：同一只手连打两下再换手，不是左右各一下），也可以在 JSON 顶层写 `"sticking": "(RR)(LL)…"` 自动标到 events 上。没有括号就不是滚奏。主人模式的自动 1-1 手顺永远只出单击，不会根据密度去猜滚奏。

滚奏时拇指+食指捏在胶带约 1/4 处当轴，棒绕这个点回弹 10–15°（不焊死），手腕再叠一层大约是单击 1/3 高度的小点头；一对打完这只手会停住，等另一只手打它的一对。`inserted: true` 会画金色光圈。大音符用 `"big": true` 标记；若要这一颗双手同时打，可写 `"hand": "both"`（会展开成同时刻的 R+L），或直接写成两条 `"both": true` 的事件。溯月模式下，「大音符」开关只控制画大/画小，不改 JSON 里的单双手。

## URL 参数（网页）

| 参数 | 作用 |
| --- | --- |
| `?autoplay=1` | 载入后自动从开头播完一遍（不循环）。给浏览器里随手录屏用 |
| `?rate=0.5` | 实时播放的慢放倍率（默认 1） |
| `?scroll=2` | 谱面流速 |
| `?sample=suyue_demo2_8bun16bun` | 预载练习谱2（默认展示谱，输入框也预填了这一张） |
| `?sample=suyue_demo` | 预载第一张练习谱 `samples/suyue_demo.tja` |
| `?bignote=single` / `both` / `small` | 大音符处理（默认 `single`：单手交替、画大） |
| `?sample=suyue_division_test` | 预载 4–48 分音测试谱 |
| `?sample=suyue_roll_demo` | 预载滚奏演示谱，并同时载入配套手顺 JSON，进入溯月模式 |
| `?tja=...` | 把一整段 TJA URL 编码后直接预载 |
| `?course=Oni` | 多 COURSE 时选难度 |
| `?measures=119-120` | 只播这一段小节（从 1 起算，含两端） |
| `?export=1` | 隐藏输入框和按钮，舞台铺满窗口（命令行渲染会带上） |
| `?loop=0` / `?paused=1` | 循环、是否暂停 |

自动播放结束时会给出结束信号，方便 ffmpeg / Puppeteer 停录：

- `window.__BACHI_DONE__ === true`
- 在 `document` 上派发自定义事件 `bachimotion:done`（`detail` 里有 `ok`、`start`、`end`、`duration`）

谱面载入并可以 `renderAt` 之后：

- `window.__BACHI_READY__ === true`
- 事件 `bachimotion:ready`

**注意：`?autoplay=1` 走的是实时时钟（`now += dt * rate`），快的地方（比如 BPM 300 的 16 分）会掉帧。只适合随手录一下。要做帧精确的 mp4，请用下面的 `renderAt(t)` 或 `node render.js`，不要用 autoplay 来导出。**

## 帧精确导出：`renderAt(t)`

画面是时刻 `t` 的纯函数：同一个 `t`（外加当前的流速 / 慢放设定）一定画出同一帧，不读墙钟，也不依赖 `requestAnimationFrame`。实时播放循环内部也是调用同一套 `renderFrame(now)`。

| 钩子 | 含义 |
| --- | --- |
| `window.renderAt(t)` | 把动画画在绝对谱面时间 `t`（秒，和 `event.t` 同一套单位），然后返回。会暂停实时播放，避免和导出抢时钟 |
| `window.chartStart` | 这段动画的起点（第一个音或所选小节起点减去 0.7s 入场） |
| `window.chartDuration` | 这段动画的终点（最后一个音或所选小节末尾加上 0.5s 收尾） |

完整的一段视频应从 `chartStart` 走到 `chartDuration`（里面已经包含入场和收尾）。推荐用命令行 `node render.js`。若要自己写 Puppeteer 循环：

```js
// 先等到 window.__BACHI_READY__，不要开 autoplay
const fps = 60;
const { start, end } = await page.evaluate(() => ({
  start: window.chartStart,
  end: window.chartDuration,
}));
const frames = Math.ceil((end - start) * fps);
for (let f = 0; f < frames; f++) {
  const t = start + f / fps;          // 1× 速度；慢放见下方 rate 约定
  await page.evaluate((t) => window.renderAt(t), t);
  await page.screenshot({ path: `frames/f${String(f).padStart(5, "0")}.png` });
}
// ffmpeg -framerate 60 -i frames/f%05d.png -c:v libx264 -pix_fmt yuv420p out.mp4
```

如果只从 `t = 0` 录到结尾（不含 0 之前的入场），也可以 `for f in 0..duration*60: renderAt(f/60)`，这里的 `duration` 用 `window.chartDuration`。

## 命令行：渲染「手元」mp4

在溯溯自己的电脑上把第一人称手部动画导出成视频：

```bash
npm install          # 一次即可；需要本机有 Chrome / Chromium，以及 PATH 里的 ffmpeg
node render.js --tja 谱.tja --course Oni --measures 119-120 --rate 0.5 --out 手元.mp4
# 或
npm run render -- --tja 谱.tja --course Oni --measures 119-120 --rate 0.5 --out 手元.mp4
```

参数（接口已锁定）：

| 参数 | 含义 |
| --- | --- |
| `--tja <path>` | 本地 TJA 文件。只从磁盘读，**用户的谱不要提交进仓库** |
| `--course <name>` | 多 COURSE 时选难度；默认用第一段 / 唯一一段 |
| `--measures <A-B>` | 可选，从 1 起算的闭区间；默认整张谱。选出的第一小节会对齐到 t = 0 |
| `--rate <n>` | 视频时间轴上的慢放，默认 1。`0.5` 表示片子长度翻倍 |
| `--sticking <path>` | 可选，溯月的手顺 JSON；不写则按上面的 1-1 规则自动生成 |
| `--fps <n>` | 帧率，默认 60 |
| `--size <1080p\|720p\|WxH>` | 分辨率，默认 1080p（1920×1080）。舞台按比例居中，两侧是米色边 |
| `--workers <n>` | 并行渲染进程数，默认 `min(6, CPU核心数-2)`；设为 `1` 时走旧版单进程落盘 PNG 路径 |
| `--audio` | 按音符时间叠打点声（见下） |
| `--song <path>` | 可选，把用户自己的原曲（wav/ogg/mp3 等）按下面的公式混进成片。不写则**不含原曲** |
| `--section <a,b>` | 可选，只导出进度条选段（秒，与音符同一套时间）。不写则整首 |
| `--batch <queue.json>` | 按队列连续出多条。每条自己决定有没有 `song` |
| `--serve` | 在本机打开网页并出片（只监听 127.0.0.1）。网页上的「开始渲染」只渲当前这一首。多首排队用 `--batch`。GitHub Pages 不能渲染 |
| `--out <path>` | 输出 mp4 路径 |

`--rate` 的时间约定：`renderAt(t)` 始终吃**真实谱面时间**。视频时长 = `(chartDuration - chartStart) / rate`。第 `f` 帧（从 0 起）画在：

```
t = chartStart + (f / fps) * rate
```

所以 `--rate 0.5 --fps 60` 时，每一帧谱面时间只往前走 `0.5/60` 秒，片子是 1× 的两倍长。

实现：用 puppeteer-core 打开本地静态页（`?export=1`），按帧调用 `window.renderAt`，截整个舞台。默认开启多路并行（`--workers`），将时间轴分段，每段直接以 JPEG 管道送入 ffmpeg（不写逐帧临时图），最后 `-c copy` 无损拼接成 h264 / yuv420p（`--workers 1` 保留旧版单路 PNG 落盘路径）。找不到浏览器时，设置 `CHROME_PATH` 或 `PUPPETEER_EXECUTABLE_PATH`。

### 打点声（`--audio`）

`assets/sounds/don.wav` 和 `ka.wav` 是本项目里合成的短促打击声（16-bit PCM），**不是南梦宫官方或游戏里的采样**，可以一起发布。咚略低、咔略亮。大音符会稍稍加大音量。同一时刻同一面只响一次。声音出现在视频时间 `(event.t - chartStart) / rate` 上。

### 原曲（`--song`）

如果除了 TJA 还提供了用户自己的音频文件，成片会把这段原曲混进去。对齐公式：

```
chartStart = firstNoteTime - 0.7
```

`firstNoteTime` 是解析之后的第一个音。解析时已经按 TJA 惯例减去过一次 `OFFSET`，所以这里**不再减 OFFSET**，也不按 OFFSET 单独裁切。视频窗口仍是原来的约定：入场 `LEAD_IN = 0.7`，收尾 `TAIL_TIME = 0.5`（整段从第一个音所在的导出范围起算）。已有的 `--measures` 会把谱面时间平移，原曲用 `chartStart + timeShift` 对回绝对音频时间。

只有 TJA、没有 `--song` 时，成片**不含原曲**。`--audio` 仍然只叠合成的 don/ka。仓库里不要放官方音频、官方谱或官方视频。

### 截段

进度条上的两颗圆帽同时决定循环和预览/导出。两帽停在整首两端时，窗口与以前相同：入场 0.7 秒，收尾 0.5 秒。

把帽子往里拖之后，预览和 `render.js` 只走这一段。起点取「左帽」和「这段里第一个音的时间 − 0.7 秒」中更早的那个，避免起手被切掉。音符时间在解析时已经减过一次 `OFFSET`，这里不再减。起点若是负数，原曲前面补静音。终点就是右帽。

循环开着时，播到右帽会跳回左帽，这次跳回不再加 0.7 秒。重来：循环开着回到左帽，循环关着回到这段预览的起点。

`--section 2,6` 用同一套谱面时间（秒）。批量队列里可以给单条写 `sectionStart` / `sectionEnd`；不写就是整首，队列顶上的同名字段不会套到每一条。没有 `song` 的条目仍然不含原曲。

网页上「演奏」里的「开始渲染」只渲当前已打开的这一首，不用先排队，并带上当前已经收窄的选段。原曲用已经选好的那首和「原曲」开关；开关关着或还没选，成片就不含原曲。多首排队不在网页上，用 `--batch`。渲染只在运行 `node render.js --serve` 的那台电脑上进行。GitHub Pages 只预览。

队列文件示例（路径相对 JSON 所在目录）：

```json
{
  "fps": 60,
  "size": "1080p",
  "jobs": [
    { "tja": "a.tja", "song": "a.wav", "out": "a.mp4", "technique": "全换", "hand": "R", "roll": "自动滚奏" },
    { "tja": "b.tja", "out": "b.mp4" }
  ]
}
```

第二条没有 `song`，所以不含原曲。已加载的手顺 JSON（`sticking`）仍然原样跟随。

## 本地开发

```bash
npx --yes serve -p 8080   # 或任意静态服务器
# 打开 http://127.0.0.1:8080/
# 示例：http://127.0.0.1:8080/?sample=suyue_demo2_8bun16bun&rate=0.5
```

需要 Node 18+（只在跑 `render.js` 时必须）、浏览器，以及导出视频时的 ffmpeg。

## 目录

```
index.html              页面（主标题 bachi-motion，副标题：溯溯的鼓棒）
js/parser.js            TJA 解析 + 1-1 手顺
js/engine.js            动画引擎（renderAt / 实时时钟共用同一套绘制）
js/app.js               输入框、模式切换、URL 参数
assets/                 仅手 PNG、锚点、合成的 don/ka
samples/suyue_demo2_8bun16bun.tja  默认展示谱：练习谱2（8 分散音 + 16 分三连/五连）
samples/suyue_demo.tja              练习谱1（仍打包）
samples/suyue_division_test.tja     4/8/12/16/24/32/48 分音测试谱
samples/suyue_roll_demo.tja         滚奏演示（四种滚奏 + 24 分 1-2-1）
samples/suyue_roll_demo.handorder.json  滚奏演示配套手顺（选此项会自动进入溯月模式）
samples/handorder.example.json
render.js               手元 mp4 命令行
package.json
```

示例谱是溯溯自己写的，可以放在仓库里。主人给的谱面、QQ 文件和 NBGI 的图都不要放进来。
