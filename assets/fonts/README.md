# 标题栏字体

`BachiSerifCJK-Bold.woff2` 是 [Noto Serif CJK JP Bold](https://github.com/notofonts/noto-cjk) 的子集，按 [SIL Open Font License 1.1](OFL.txt) 再分发。

原字体版权归 Adobe 与 Google。OFL 规定改写版本不得使用 Reserved Font Name（Noto / Source），所以子集在 name 表里改名为 **Bachi Serif CJK**。

## 子集范围

只保留标题栏会用到的一个粗体，并裁掉竖排等用不到的特性：

- 拉丁字母、数字、拉丁补充与常用标点（含 `· × ＊ — – ~ ♪ ★` 等）
- 平假名、片假名及片假名扩展
- JIS X 0208（常用日文汉字 6355 + 符号）
- GB2312 一级汉字（3755，覆盖常见简体曲名，如「樱」）
- CJK 标点与全角/半角形式

约 1.7 万字形，WOFF2 大约 3.8 MiB。没有收入韩文、CJK 扩展区、GB2312 二级和罕用汉字，以控制体积。极少数生僻曲名可能缺字，会回退到系统衬线体。

标题是动态的，无法按某一首曲预先裁到更小；上述范围是「常见日文/中文曲名」和体积之间的权衡。
