# Render 免费部署

仓库根目录的 `render.yaml` 定义一个免费的新加坡 Node.js Web Service。
前端和 API 同域部署，使用内置网易云适配器，无需额外数据库。

- 构建：`npm ci --include=dev && npm run build`
- 启动：`npm start`
- 健康检查：`/api/health`
- Node.js：22
- 监听：`0.0.0.0`，端口读取 Render 的 `PORT`
- 实例：必须选 **Free**

将仓库连接 Render 后，可通过 New → Blueprint 导入；或按以上参数创建 Web Service。
无需将 `.env`、`node_modules`、本地日志或 `dist` 提交到仓库。
部署完成后检查首页、健康接口、示例播放及音乐搜索。

如果内置音乐接口在部署区域不可用，可在控制台配置 `NETEASE_API_BASE` 为另一个兼容接口地址。
免费实例闲置 15 分钟会休眠，首次重新访问需要唤醒。
