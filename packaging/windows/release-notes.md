bachi-motion 0.2.3（Windows）

下载 `bachi-motion-0.2.3-windows-x64.zip`，整包解压后双击 `bachi-motion.exe`。

- 打开的是程序自己的窗口，不用另外打开浏览器，也不用安装 Node 或 Chrome。
- 安装包里带了 Chromium 和 ffmpeg。解压之后不需要联网。
- 有显卡时，画面用显卡，编码按 NVIDIA NVENC、AMD AMF、Intel QSV 的顺序尝试。
- 没有显卡，或显卡初始化失败，或硬件编码失败时，自动改用 CPU，仍然可以出片。
- 成片在「视频\bachi-motion」。

请解压全部文件。只拷贝 exe 会缺页面、字体和 ffmpeg。

这个版本新增

- 编辑器可以分开调音乐和鼓点两路音量。100 是原来的音量
- 手元成片接上这两路音量。网页「开始渲染」用编辑器里的滑条；命令行用 --music-volume 和 --drum-volume。不写都是 100
- 新建和导出的 TJA 改成次郎、TNDE 能播的写法：CP932（Shift-JIS），换行是 CRLF，没有 BOM。编不进 CP932 的简体字从文件里删掉，不转成繁体。GOGO 只写 #GOGOSTART 和 #GOGOEND。注释只留 ASCII。手顺不写进 TJA。WAVE 只留同目录的文件名；整段编不进去就整行不写
