# 溯溯的鼓棒（bachi-motion）

把一段太鼓达人 TJA 谱面变成第一人称鼓棒动画。主要给溯月讲谱、对手顺用。纯静态网页，可以开在 GitHub Pages 的 `/bachi-motion/` 子路径下（全部用相对路径，不要加前导 `/`）。

主人模式：贴谱面 → 点「生成 / 播放」→ 按 1-1 手顺看动画。  
溯月模式：导入她写的手顺 JSON（滚奏、插音、金色光圈），覆盖自动手顺。

**仓库名 / Pages 项目名是 `bachi-motion`。** 页面标题是「溯溯的鼓棒」。

打开方式：用浏览器直接打开 `index.html`，或在本目录起一个静态服务器。手图是相对路径，`file://` 也能显示；若要用 `?sample=` 拉示例谱，需要 http。

## 网页怎么用

1. 左边默认是「主人」模式。把 TJA 贴进输入框（已预填溯溯的 5 小节练习谱 `samples/suyue_demo.tja`），或点「打开 TJA」。
2. 点 **生成 / 播放**。慢放和谱面流速滑块跟以前一样，可以随时改。
3. 需要讲滚奏 / 插音时，切到「溯月」模式，贴或打开手顺 JSON。格式见 `samples/handorder.example.json`。

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
- 大音符（`3`/`4`）双手同时打；打完下一个音也从 R 起

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

`t` 是秒。`grip` 为 `"roll"` 时用滚奏捏棒（引擎里已有回弹 / 晃动）。`inserted: true` 会画金色光圈。大音符用两条同时刻的事件，并加上 `"both": true, "big": true`。

## URL 参数（网页）

| 参数 | 作用 |
| --- | --- |
| `?autoplay=1` | 载入后自动从开头播完一遍（不循环）。给浏览器里随手录屏用 |
| `?rate=0.5` | 实时播放的慢放倍率（默认 1） |
| `?scroll=2` | 谱面流速 |
| `?sample=suyue_demo` | 预载 `samples/suyue_demo.tja`（只要 `samples/` 下的安全文件名） |
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
| `--audio` | 按音符时间叠打点声（见下） |
| `--out <path>` | 输出 mp4 路径 |

`--rate` 的时间约定：`renderAt(t)` 始终吃**真实谱面时间**。视频时长 = `(chartDuration - chartStart) / rate`。第 `f` 帧（从 0 起）画在：

```
t = chartStart + (f / fps) * rate
```

所以 `--rate 0.5 --fps 60` 时，每一帧谱面时间只往前走 `0.5/60` 秒，片子是 1× 的两倍长。

实现：用 puppeteer-core 打开本地静态页（`?export=1`），按帧调用 `window.renderAt`，截整个舞台，再交给 ffmpeg 编成 h264 / yuv420p。找不到浏览器时，设置 `CHROME_PATH` 或 `PUPPETEER_EXECUTABLE_PATH`。

### 打点声（`--audio`）

`assets/sounds/don.wav` 和 `ka.wav` 是本项目里合成的短促打击声（16-bit PCM），**不是南梦宫官方或游戏里的采样**，可以一起发布。咚略低、咔略亮。大音符会稍稍加大音量。同一时刻同一面只响一次。声音出现在视频时间 `(event.t - chartStart) / rate` 上。

## 本地开发

```bash
npx --yes serve -p 8080   # 或任意静态服务器
# 打开 http://127.0.0.1:8080/
# 示例：http://127.0.0.1:8080/?sample=suyue_demo&rate=0.5
```

需要 Node 18+（只在跑 `render.js` 时必须）、浏览器，以及导出视频时的 ffmpeg。

## 目录

```
index.html              页面（标题：溯溯的鼓棒）
js/parser.js            TJA 解析 + 1-1 手顺
js/engine.js            动画引擎（renderAt / 实时时钟共用同一套绘制）
js/app.js               输入框、模式切换、URL 参数
assets/                 仅手 PNG、锚点、合成的 don/ka
samples/suyue_demo.tja  溯溯原创示例（可以进仓库）
samples/handorder.example.json
render.js               手元 mp4 命令行
package.json
```

示例谱是溯溯自己写的，可以放在仓库里。主人给的谱面、QQ 文件和 NBGI 的图都不要放进来。
