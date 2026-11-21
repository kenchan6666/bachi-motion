# 标题栏字体

切片后的 [Noto Serif CJK JP Bold](https://github.com/notofonts/noto-cjk)，按 [SIL Open Font License 1.1](OFL.txt) 再分发。

原字体版权归 Adobe 与 Google。OFL 规定改写版本不得使用 Reserved Font Name（Noto / Source），所以子集在 name 表里改名为 **Bachi Serif CJK**。`OFL.txt` 与切片放在同一目录。

## 字集

范围与先前的整包相同，**没有**再把字集砍到 1MB。只是按 unicode-range 切成许多小 WOFF2，浏览器只下载当前歌名和第二行用到的那几片：

- 拉丁字母、数字、拉丁补充与常用标点（含 `· × — –` 等）——单独的一小片 `woff2/bachi-serif-cjk-latin.woff2`
- 拉丁扩展、希腊、西里尔、制表符等（`latin-ext`）
- 平假名、片假名及片假名扩展（`kana`）
- CJK 标点与全角/半角形式（`punct`）
- JIS X 0208 常用日文汉字 + GB2312 一级汉字，按码位切成约 50–150KB 一片（`han-01` …）

没有收入韩文、CJK 扩展区、GB2312 二级和罕用汉字。子集里没有的简体、繁体和港字会回退到页面实际加载的 **Noto Serif SC** 与 **Noto Serif TC**（同一套衬线，覆盖简繁），再不行才是系统里的宋体 / 微软正黑 / 雅黑。只把这些家族写在 `font-family` 里并不会下载它们；标题和右上角歌名会 `document.fonts.load` 这两套，导出也会等它们就绪。

码点清单在 `unicodes.txt`。各片的文件名、体积和 `unicode-range` 见 `subsets.json`。`bachi-serif-cjk.css` 里是同一 `font-family: "Bachi Serif CJK"` 的多条 `@font-face`（写法跟 Google Fonts 一样）。

页面和导出都用

```js
document.fonts.load('bold 1em "Bachi Serif CJK"', 歌名 + 第二行)
document.fonts.load('bold 1em "Noto Serif SC"', 歌名 + 第二行)
document.fonts.load('bold 1em "Noto Serif TC"', 歌名 + 第二行)
```

等待当前文字所需的切片就绪，而不是只等 `document.fonts.ready`。一行放不下时先缩小到仍可读，再加省略号，不会把歌名裁成空白。

## 重新切片

需要 Python 3、[fonttools](https://github.com/fonttools/fonttools) 和 [brotli](https://pypi.org/project/brotli/)（WOFF2 编解码都要用）。源字体请自行下载 Noto Serif CJK JP Bold（OTF），不要把整包源字体提交进仓库。

```bash
python3 -m venv /tmp/fontbuild/venv
/tmp/fontbuild/venv/bin/pip install fonttools brotli
/tmp/fontbuild/venv/bin/python assets/fonts/build-subsets.py \
  --src /path/to/NotoSerifCJKjp-Bold.otf \
  --out-dir assets/fonts
```

脚本会按 `unicodes.txt` 切出 `woff2/*.woff2`、重写 `bachi-serif-cjk.css` 和 `subsets.json`，并把 name 表改成 Bachi Serif CJK。汉字片的目标体积大约 100KB（允许 50–150KB）；拉丁核心片故意切得很小。
