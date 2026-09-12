# Vercel Hobby 部署

在 Vercel 导入 `bravedongdong/senseme`，使用个人 Hobby 计划。
框架为 Vite，构建命令 `npm run build`，输出 `dist`。

静态页面、音乐示例及纹理由 CDN 提供。`api/[...path].js` 复用本地
Node.js HTTP handler，处理 `/api/health`、搜索、歌单及播放地址接口，
不启动监听端口。内置网易云模块使用可被打包器追踪的静态 import 路径。

发布后检查首页、`/api/health`、`/api/demo` 及音乐搜索。更新 main 分支可触发重新部署。
`NETEASE_API_BASE` 是可选的外部兼容 API 地址，默认使用内置适配器。
