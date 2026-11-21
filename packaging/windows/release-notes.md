bachi-motion 0.1.0（Windows）

下载 `bachi-motion-0.1.0-windows-x64.zip`，整包解压后双击 `bachi-motion.exe`。

- 打开的是程序自己的窗口，不用另外打开浏览器，也不用安装 Node 或 Chrome。
- 安装包里带了 Chromium 和 ffmpeg。解压之后不需要联网。
- 有显卡时，画面用显卡，编码按 NVIDIA NVENC、AMD AMF、Intel QSV 的顺序尝试。
- 没有显卡，或显卡初始化失败，或硬件编码失败时，自动改用 CPU，仍然可以出片。
- 成片在「视频\bachi-motion」。

请解压全部文件。只拷贝 exe 会缺页面、字体和 ffmpeg。
