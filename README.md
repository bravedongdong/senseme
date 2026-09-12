# SenseMe 水面音乐播放器

使用 **Three.js + TypeScript + Node.js** 重建 PSP SensMe channels 的播放场景：左侧漂浮大封面、向右后方延伸的唱片队列、水面实时倒影、GLSL 波纹与切歌过渡。

## 运行

推荐 Node.js 22 或更高版本。当前环境也已通过 Node.js 18.20.5 的运行测试，但内置第三方网易云包的部分依赖要求较新 Node 版本。

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:5173 。开发服务同时启动 Vite（5173）与 Node 音乐接口（3001）。

生产运行：

```sh
npm run build
npm start
```

打开 http://127.0.0.1:3001 。默认仅监听本机。

## 已实现

- Three.js 独立 3D 场景，实时镜像相机反射，不使用播放页背景截图代替渲染。
- 按原版高度场与网格采样方式重建水波，封面以约 50% 不透明度绘入倒影；切歌与倒影同步。
- 点击封面、左右滑动、按钮及方向键切歌；快速连续操作从当前姿态继续过渡。
- 播放、暂停、进度、音量、随机与循环、收藏、沉浸和全屏。
- Energetic 蓝天彩虹、Shuffle All 彩色散景、Relax 绿叶、Mellow 雪林、Upbeat 樱花与其他心情配色，支持高清与低分辨率模式。
- 网易云兼容第三方 API 内置调用，或接入已有兼容服务。
- iTunes 免费短片段试听、本地音频元数据与内嵌封面导入。
- 6 首原创合成氛围示例，首次安装完成后无需网络即可播放。

本地文件只在浏览器中处理，不上传。刷新后需要重新导入，收藏标记保存在本机浏览器。

## 音乐来源

默认使用原创示例音乐，便于独立验证渲染和播放。进入音乐库的“在线搜索”，可使用网易云或 iTunes。

网易云使用 `@neteasecloudmusicapienhanced/api` 的匿名公开接口。无需配置即可尝试搜索和播放，上游可用性、地区与歌曲授权决定能否取得音源。受限歌曲显示错误，不进行付费解锁。iTunes 仅提供试听片段。

如果已有 NeteaseCloudMusicApi 兼容服务，可覆盖内置适配：

```sh
NETEASE_API_BASE=http://127.0.0.1:3000 npm run dev
```

详细接口见 [docs/music-api.md](docs/music-api.md)。

## 还原依据与边界

核心场景及架构由 **Astra** 实现；音乐服务和音频模块由 **Luna Max** 实现，集成与验证在主任务完成。

封面排布采用原版 1.50 的相机与队列参数，切歌对照用户指定的 [实机视频约 8 分钟后的片段](https://www.bilibili.com/video/BV12qcnewEhZ/)。水面使用从原版程序数据段界定出的高度序列，GLSL 与运行代码由本项目重新编写。界面中的 14 个心情与时段频道使用原版背景纹理，封面、倒影和波浪仍实时渲染。原版截图和视频选帧只用于研究。

已观察到约 0.6 秒的主要运动及约 0.1 秒收敛尾段、向左缩小渐隐的离场和静止封面。实机摄影存在透视与帧率误差，原版固定点 UV、纹理 LOD 和背景 sprite 裁切也尚未完整移植，**还不能声称逐帧完全一致**。频道资源索引已核对原版名称表；所有状态下的背景移动仍未完整还原。具体观察见 [docs/reference-video.md](docs/reference-video.md)，水面逆向证据见 [docs/water-reverse.md](docs/water-reverse.md)。

心情选择目前改变视觉场景并保留播放列表，不复现 Sony 的专有 12 Tone Analysis 音乐分析。

官方历史安装包、数值波场和两张背景的来源、哈希及复核方法见 [docs/original-package.md](docs/original-package.md) 与 [docs/credits.md](docs/credits.md)。原版可执行程序没有加入应用。

架构、观察结果与待核验项见 [docs/architecture.md](docs/architecture.md)。参考与素材信息见 [docs/credits.md](docs/credits.md)。

## 验证

```sh
npm run build
npm test
npm run test:scene
```

`test:scene` 将实际 Three.js 投影与视频选帧边界比较，并检查过渡无过冲、接触边及竖屏构图。它不代替浏览器的 WebGL、音频和视觉检查。验证记录见 [docs/verification.md](docs/verification.md)。

## 操作

- 空格：播放 / 暂停
- 左右方向键：上一首 / 下一首
- H：隐藏 / 显示控制
- F：全屏
- L：音乐库
- Esc：关闭弹窗

## 文件布局

- `src/scene/`：Astra 编写的 Three.js 场景、反射与 GLSL。
- `src/audio/`：音频状态、频谱能量、本地元数据。
- `src/main.ts`、`src/style.css`：DOM 控制与布局。
- `server/`：音乐提供方适配、HTTP API、生产静态文件服务。
- `public/audio/`、`public/covers/`：独立运行所需的示例素材。

非 Sony 官方产品；SensMe 商标归其各自所有者所有。

### 渲染参数与交付基线

原版提取数值、高清边缘调节和双向动画时序统一记录在 [渲染参数](docs/render-parameters.md)。后续优先复用仓库中的参数与素材，不重复解包；逐帧像素误差不作为验收门槛。
