# Docker 打包（静态网页）

线上只跑网页版：`index.html` + `js/` + `assets/` + 仓库里的原创练习谱 `samples/`。不需要 Node 服务。命令行出片（`render.js` + headless Chrome）不进镜像，仍在本机用。

镜像里没有 `node_modules`、`tests/`，也不包含任何受版权保护的谱面（仓库本身只带溯溯写的练习谱）。

## 本地构建与运行

```bash
docker build -t bachi-motion:local .
docker run --rm -p 8080:8080 bachi-motion:local
# 打开 http://127.0.0.1:8080/
```

进程以非 root 的 `nginx` 用户监听 8080；gzip 已打开。`index.html` 不缓存，`js/` 和 `assets/` 缓存 7 天。

## 子路径（博客 /taiko/）

资源路径全部是相对的（例如 `js/parser.js`、`assets/…`、`fetch("samples/…")`），所以可以挂在任意子路径下。外层 nginx 只要把前缀剥掉再反代到这个容器的 8080：

```nginx
location = /taiko { return 301 /taiko/; }
location /taiko/ {
    proxy_pass http://taiko:8080/;
}
```

浏览器访问 `/taiko/` 时，相对路径会自动变成 `/taiko/js/parser.js`，无需改应用代码。

## 以后仓库改私有

构建方式见 personal-blog 仓库里的说明：优先在部署机上用旁边的本地 checkout（固定到某个 commit）构建；或者把镜像推到 GHCR / Artifact Registry，拉取时再登录。
