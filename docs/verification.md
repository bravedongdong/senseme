# 验证记录

2026-09-06，本机 Node.js + Chromium / Codex 内置浏览器。

## 已获得的证据

- `npm run build`：TypeScript 与 Vite 生产构建通过。
- `npm test`：11 项后端测试通过；覆盖歌曲数据归一化、内置/外部网易云适配优先级、错误响应、静态路径约束、HTTP Range、网易云试听标记、歌单缺失详情补全及顺序。
- 生产页面 `http://127.0.0.1:3001`：示例歌曲能够播放、暂停、切歌。
- 直接读取 DOM 中真实 HTMLAudioElement：暂停后 seek 为 16 秒，duration 为 32 秒。
- 网易云搜索“纯音乐”实际返回 25 首；选择 The truth that you leave 后，HTMLAudioElement 显示 duration=223.467979、currentTime=18.858667、paused=false，控制台未发现 CORS/媒体错误。
- 真实远程专辑封面成功上传为 WebGL 纹理并显示倒影。
- 经文件选择器导入本项目 tide.wav：成功识别 32 秒时长；本地 blob 音源播放推进至 17.39 秒。
- 宽屏和 390×844 布局已观察，主封面完整显示并给控制区留出空间。非标准窗口也保持自适应。
- Astra 对场景执行 TypeScript 检查与 1200 次连续切换资源逻辑压力验证；这不是实 GPU 内存/帧率测试。
- 最后复查 1280×720 场景：远处水面已渐隐衔接天空，虹光不再出现水平截断；没有发现 WebGL 控制台错误。
- PSP 画质模式在 1280×720 视口下实际画布为 480×270，遵循不超过 480×272 且保持视口比例的规则；交付预览已恢复高清画质。

## 构建提示

Three.js 单独分块约 510 KB，Vite 会给出体积提示。音乐标签解析器已延迟加载；旧版 music-metadata-browser 的传递依赖 file-type 含 eval，构建发出第三方代码警告。未将这些提示改写成验证通过的性能或安全结论。

## 原版还原范围

构图依据 2009 Energetic 原版图片。原版的实机视频 `https://www.youtube.com/watch?v=0Ww8ggpc1PU` 已在 Chrome 观察到：约 52–56 秒展示前景封面、后方唱片列与水面反射，约 61 秒展示频道选择。视频此段没有提供可量测的完整歌曲切换过程。

上述为 2026-09-06 的证据边界。2026-09-07 用户指定了新的 Bilibili 实机参考，其中 8:27.2–8:27.8 提供了清楚的歌曲切换，取代早期 1.15 秒的无动作依据重建。选帧和可观察的几何、时序见 [reference-video.md](reference-video.md)。其他心情环境尚未逐频道对照，运行测试仍不能单独证明“完全复刻”。

另已在 Chrome 查看 `https://www.youtube.com/watch?v=jzOI9_E9bb0`（PSP SensMe Channels）的约 2:11–2:18 播放场景；实机拍摄存在明显失焦、倾斜及相机移动，不能据此精确测量动画曲线。

## 精度验收进展

已提取用户参考视频同一次切歌的开始、中间、结束帧，封面四角与水线的投影核对结果见下文“中间帧校准补充”。反射扩散与文字显隐仍为视觉拟合，实机视频的镜头移动和屏幕透视需要与场景内运动区分。

## 2026-09-07：用户四项反馈修正

- Astra 移除稳定封面的 y 浮动、倾摆和过渡抬升；旧主封面独立向左淡出并缩至约 82%，缩放以底边为锚，入场约 0.6 秒、离场约 0.4 秒。
- 后排按用户视频的屏幕透视和可见边界校准。真实 Three.js 投影结果记于 architecture.md；被遮挡部分仍属于几何拟合。
- 反射加入九点模糊、深度驱动淡出和独立天空反射底图。初次浏览器检查发现矩形硬边，修复后再次观察 1280×720 页面，已消除硬边；不把未修复版本计为通过。
- 实际浏览器捕捉到切歌中间画面：旧封面向左部分出屏、尺寸减小，下一张同时从后排放大，标题正在淡出。
- 连续两次点击下一首后，最终显示 Drift、04 / 06，主封面也是 Drift，没有残留过期标题或离场封面。
- Luna Max 完成标题/歌手 0.22 秒淡出、更新、0.25 秒淡入；选择和播放源即时同步；版本 token 防止旧 timer 回写。其文字时序基于参考的先后关系，还未进行原版逐帧像素对齐。
- 最终 TypeScript + Vite 生产构建通过；1280×720 与 390×844 实际 WebGL 页面正常，最终浏览器错误日志为空。测试视口已恢复，预览保留。

这轮验证覆盖用户指出的四项修正及连续切歌状态一致性，不把实机录像拟合说成 Sony 原始 shader 或动画曲线。

## 2026-09-07：中间帧校准补充

- 对 8:27.2–8:27.9 的八帧进行屏幕透视校正。Astra 将通用三次缓动替换为依据这些帧拟合的单调曲线：主要运动约 0.6 秒，另有约 0.1 秒收敛尾段。此时序取代上文早期 0.6 秒实现。
- 主封面在 480×272 的投影由约 (23,48)–(220,244) 校正为 (31,47)–(220,236)。离场前 0.1 秒缩至约 85%，右缘约 x165；0.2 秒右缘约 x102。
- `npm run test:scene` 已运行通过：八帧边界的拟合残差 RMS 为 0.44–2.09 PSP 像素，另检查 1000 步进度单调、无过冲、中断后水线约束和三种视口的完整构图。这些是对观测边界的拟合检查，不是原版像素差异或原始代码验证。
- 文字时序进一步校准为保留旧文案 240ms、淡出 140ms、更新后淡入 180ms；取代上文初版 220ms 淡出方案。
- 最新构建通过；实际浏览器再次观察到向左缩小淡出的中间画面、标题先保留后切换。连续切歌最终正确显示 Drift / 04，错误日志为空。测试视口已恢复。

## 2026-09-07：Shuffle All 彩色散景

- Astra 新增可选 `shuffle-all` 程序散景环境，Luna Max 接入心情选择入口和 CSS 预览；默认仍为 Energetic。
- 第一版实际画面发现水面过度反射顶部白色/黄色大光斑；最终版将该环境的镜像采样映射到下半红/洋红色域，两侧保留青色。实际浏览器已确认标题后方的红色水面、中小散景层次及封面柔化倒影。
- 此映射仅用于 Shuffle All 背景，未改变通用封面反射、运动轨迹或队列布局。背景图案由 GLSL 生成，没有将原视频作为运行时纹理。
- 最新 TypeScript + Vite 构建通过；实际选择 Shuffle All 后标签正确，歌曲仍为 Tide / 01，随机播放开关未被切换，WebGL 错误日志为空。
- 原始光斑随机种子和相位未取得；背景配色与分布按参考重建，不声称每个光斑的形状和轨迹逐像素相同。

## 2026-09-08：原版水波数据与离场回归修复

- 通过静态分析 SensMe 1.50，使用原始 75×65×65 高度序列、帧混合、中心差分法线及投影扰动重建水面；详见 water-reverse.md。Energetic / Shuffle All 换为原始解码背景。上述 9 月 7 日的程序散景与水面深度淡出方案已被替代。
- 实际浏览器观察到更大块的连续波浪和更明确的封面倒影，1280×720 与 390×844 构图正常。原版 GE 固定点舍入、纹理 LOD 和背景裁切运动尚未完全重建；九点过滤仍为近似。
- 定位离场退化：原版斜向相机下单纯沿世界 X 轴移动，造成投影宽度在中途从约 169 增至 172 px。现在按屏幕宽度、中心左移及固定底线求解实际三维姿态。480×272 下 0.1 / 0.2 秒宽度为 163.81 / 159.09 px，右缘为 162.05 / 97.59 px。
- 场景检查通过：每种情况 121 次采样覆盖三种视口及中断姿态，检查持续左移、宽度不反增、底线偏差小于 0.001 px 和世界底边接触水面；同时检查镜像相机、倾斜网格投影与原始水波数据循环。生产构建通过。
- 浏览器实际捕捉到旧封面向左缩小淡出；连续两次下一首最终显示 Night Swimming / 05，错误日志为空。新的水面、进场轨迹和后排未回退。

## 2026-09-09：背景默认裁切

静态分析确认原始默认 sprite 为 512×304、中心 (240,136)，当前 GLSL 改为保留每侧 16 像素超出屏幕区域。四个背景 sprite 实为新旧两组清晰/模糊图片，见 original-background.md。构建通过；实际内置浏览器显示 Energetic 背景、水面和封面正常，错误日志为空。此次没有更改暂停姿态、离场或水波序列。

## 2026-09-09：浏览姿态与播放意图

场景回归检查、15 项后端/音频测试、生产构建通过。浏览器实际从列表确认 Glass 后返回前景，时间推进至 5 秒以上；暂停操作后检查页面，错误日志为空。手机弹窗遮挡了背景封面，因此该浏览器观察不能单独证明 Root 姿态的视觉精度；Root 几何与打断行为由实际生产场景方法的投影测试覆盖，详见 playback-states.md。

## 2026-09-09：原版三档封面柔焦

新增运行时证据确认 256/64/32 纹理尺寸表及 SLOPE 模式，独立 GLSL 使用 .03 / .06 主封面/反射参数。移除水面九点重复过滤。生产构建与场景检查通过，包含对量化细节选择的数值检查；最后实际 1280×720 浏览器画面显示清晰主封面、柔焦后排和大块波浪倒影，WebGL 错误日志为空。打开音乐库时可见封面缩到后方，关闭后恢复前景。低层图像降采样与原版颜色量化尚未逐像素一致。

三档柔焦后续校验：以浮点位运算替换 log2/exp2 近似计算，深度扫描与层级边界样本改为严格相等检查。场景检查和构建通过，真实 WebGL 2 页面编译、显示正常且错误日志为空。该检查证明层级量化函数一致，不扩大为最终图像逐像素一致的结论。

## Previous selection and source-resolution artwork
Removed runtime PSP cover resizing/custom LOD. Preserved measured next animation and native wave field. Added actual-scene tests for previous returning from the left, current retreating into slot 1, 2/8/30-song queue wrap, rapid direction changes, and playback-intent Root/Front selection. Browser and build checks accompany this update.

### State changes during reverse selection
Found and fixed an interaction where pause/resume cancelled the previous-song return and substituted presentation easing for its fade. The destination pose now transitions independently beneath the reverse departure transform. Actual scene tests check unchanged position/opacity at each interruption, an uninterrupted departure clock, the expected reverse fade, and the final Root pose in normal and reduced-motion modes. Scene verification and production build passed.

### Reflection-only defocus
Restored depth-based reflected sampling without resizing source artwork or applying defocus to main covers. Real browser screenshot shows sharp source artwork and softened reflected text; no WebGL errors. Added a production reflection-pass regression that checks the background pass excludes covers and the shared materials restore their main-pass defocus flag and opacity.

### Live online music verification
On 2026-09-09, both provider searches for Debussy returned HTTP 200. Netease track 3434137652 returned an unrestricted URL; the actual browser search produced 25 results, loaded album artwork, and played Ballade of the Last Light to 0:13 / 3:09 with no browser errors. Playback was paused after verification. iTunes search initially returned 100px artwork; the Apple CDN 600px variant returned HTTP 200/image/jpeg (214103 bytes). The adapter now requests that variant for recognized Apple CDN thumbnail paths, preserving explicit artwork overrides and other hosts. Restarted the local development server and verified the live response now contains 600x600bb.jpg. All 16 backend/audio tests pass. This verifies these samples at this time, not future upstream availability or every track.

### Additional native channels
Copied decoded bg.gim frames 7–9 for Relax/Mellow/Upbeat, corroborated by the original channel selector image. Browser checks display leaf and snowy-forest backgrounds with the realtime water and sleeve reflections; Upbeat was also selected for verification. Production build and scene regressions pass. Native background transition now uses the 0.5-second channel-change property and a bounded two-texture blend.

### Full exposed channel resource mapping
Confirmed English DAT channel names and bg.gim indexing through the preceding-division sum at 0xf938 and draw call at 0xd284–0xd2a8. Fourteen exposed channel/time variants now map to frames 0–13; Night and Midnight are distinct. Browser verified Night's star field and the full native thumbnail grid. Removed the obsolete synthetic Shuffle All thumbnail overlay. Checks enforce complete frame indexing and native 512×304 dimensions.

### Ambient colour verification
Added original channel RGB values and five-second linear tint transition. Tests cover initial colour, 2.5-second midpoint, endpoint, interrupted continuity and reduced-motion endpoint. The midpoint check initially used exact JavaScript equality and failed on a 1e-16 rounding difference; it now uses a 1e-12 numeric tolerance. The full scene suite passes. Production build passed; browser channel selection reaches Upbeat with the shared colour shader.

### Feather-aware selection
Picking now interpolates the original sleeveAlpha attribute using the actual raycast barycentric coordinates and multiplies it by animated material opacity. Mostly transparent edges pass through to the next visible sleeve; opaque departing sleeves block hidden queue selection without becoming selectable again. Raycast checks cover the solid centre, quarter-opacity perimeter and faded centre. Scene regression and production build pass. This is a web pointer interaction rule; the PSP has no equivalent pointer input.
