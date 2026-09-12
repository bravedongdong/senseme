# 原版背景绘制

静态分析对象与哈希见 original-package.md。以下为独立重建所用数值，不包含原版执行代码。

## 已确认的默认裁切

- 0xd030 初始化四个 sprite，调用 0x1fc14 将本地尺寸设为 1×1；0x1f908 设置位置 (240,136,0)，0x1f960 设置缩放 (512,304,1)。常量在 VA 0x77d628–0x77d634。
- 全局背景缩放初值由 0xc214–0xc260 写为 512×304，常量 VA 0x77d5f8 / 0x77d5fc。
- 每帧 0xbb50–0xbb6c 把缩放交给两个背景对象（主视图与反射源）；0xd314–0xd354 将相同缩放及以 (240,136) 为中心的位置传入所有四个 sprite。
- 0xd1e4–0xd20c 设置 480×272 正交投影。因此静态默认状态在屏幕四周各裁掉 16 像素；将整张 512×304 贴图压缩到屏幕会改变光斑的比例。

应用采样公式为 `nativeUv = (screenUv - 0.5) * (480/512, 272/304) + 0.5`，主视图与反射源共用，反射先修正横向奇偶。纵向保持贴图正向。

四个 sprite 不是四个拼接象限。0xd278–0xd300 为当前背景的清晰/模糊资源赋值；0xd418–0xd4a4 为过渡中旧背景的清晰/模糊资源赋值。0xd35c 之后按过渡时间和模糊系数组合绘制。

## 未完成

0xab00–0xab9c 会根据界面过渡改变背景尺寸，目标为 512−32q 与 304−19q。0xbab4–0xbb10 根据相机变化产生纵向偏移。此次只修复默认播放构图的裁切，未把未知界面状态随意映射为暂停或添加无依据的常驻漂移动画。模糊背景混合、其他主题动画仍待还原。

## 默认播放状态的模糊权重

0xc280–0xc290 将全局背景模糊插值器（global−0x40f4）的当前值与目标值初始化为零。0xb9a0–0xb9c4 将同一系数传给主背景和反射源背景；0xd39c–0xd3f8 只有在系数大于零时才绘制模糊版本。因此不能把 bg_b.gim 当作默认水面固定覆盖层：它属于界面状态过渡的背景柔焦，而非已经证实缺失的常驻水面模糊。

## Additional corroborated channel backgrounds
Frame 7 (leaves), 8 (snowy forest) and 9 (cherry blossom) of the decoded bg.gim now supply Relax, Mellow and Upbeat. These match the channel thumbnails in references/channels.jpg. All five native backgrounds share the 16px overscan sampling and mirrored-source parity. Native transitions blend two textures over the property ChannelChangeEffectTime=0.5 seconds; interruption retains the dominant endpoint, an approximation pending original interrupted-transition tracing. Other channel images remain unassigned until their labels are corroborated.

## Complete mapping of exposed music/time channels
The original DAT contains English ChannelName0_0…0_4 = Morning, Daytime, Evening, Night, Midnight; ChannelName1…9 = Shuffle All, Energetic, Relax, Mellow, Upbeat, Emotional, Lounge, Dance, Extreme. ChannelTimeDivide0=5 and subsequent divisions=1. The background draw at 0xd284–0xd2a8 calls 0xf938 to sum preceding divisions, then adds the time variant before retrieving the image frame. Thus frame 0–4 are time variants and channel 1–9 use frame channel+4. This confirms the assignments without relying on visual style. `src/scene/backgrounds.ts` records the mapping. Application ID night retains its existing Midnight meaning; nightfall exposes the previously missing Night variant.

All fourteen exposed channels now use decoded native background pixels. Frames 14/15 correspond to Favorites/Newly Added, which are not currently exposed as separate scene channels. Thumbnail buttons use the same background resource as their scene.
