# 播放状态姿态核对（进行中）

用户指出播放与暂停的当前歌曲封面位置、角度、大小不同。现有 `setPlaying` 只更新播放标志，未驱动封面姿态，因此缺少该状态行为。

## 视频证据

用户指定的 BV12qcnewEhZ，490.00–498.05 秒，每 0.35 秒取帧，见 [联系表](references/playback-state-contact.jpg)。联系表仅裁去外侧机身，未进行逐帧透视校正，不能直接用于精确屏幕坐标拟合。

- 490.35–491.75 秒底部显示 Back / Select，属于浏览选曲界面；此时当前封面较小。
- 493.50–494.90 秒同一首 Say So 的封面保持较小姿态。
- 495.25–495.95 秒同一封面向前放大；495.60 秒开始清楚显示 START Pause，支持大封面为播放姿态。
- 496.30 秒后保持大封面。上述片段尚不能单独证明小封面就是暂停姿态；需要结合原版状态分支或另一段暂停操作。

## 原版参数

FrontNodePos = (1.647, 2.5, -10.463)，RootNodePos = (1.605, 2.5, -3.273)。两者原始 scale 都为 (1,1,1)、angle 都为 0。视觉大小及透视角度差异可以由位置变化引起，但不能仅凭命名将 Root 等同于 Pause。状态映射正在静态核对。

## 局部播放效果的独立核对

原版 resume 分支 0xafc4 经 0x13344 调用 0x2e02c：将 cover+0xb8 置零、+0xbc 置 0.08。0x2ec38 每帧累加，超过 1.1 后设为 1、速度改为 -0.08，最后夹到零；数值乘 255 用于另一个绘制对象。

0x2e1cc 的条件绘制发生在专辑封面本体 draw（0x2e144）之后。它重新压入矩阵，给 cover+0xc0 的独立网格设置尺寸并绘制；0x2f838 根据模板重建边缘顶点。因而目前证据支持这是短暂的边框/光晕效果，不能将此分支当成持续的播放/暂停封面位移或缩放。该结论来自静态调用与绘制顺序，尚未以原版帧缓冲逐像素验证。

## 音频状态基础修正（2026-09-09）

`AudioEngineState.playbackRequested` 独立于真实 `playing`。主动暂停会撤销加载中的自动播放意图；晚返回的 play promise 不能覆盖较新的暂停。主界面切歌默认继承意图，避免加载期的 playing=false 导致连续切歌意外停播。场景的声音能量仍使用真实 playing；尚未将该意图强行绑定未确认的暂停几何。

四项行为测试通过：加载意图持续、加载中暂停取消自动播放、晚返回 play 不覆盖暂停、旧歌曲加载不覆盖新选择。测试使用受控媒体事件替身，不能替代实际浏览器音频验证。

补查暂停标志：0x1bd0 查询全局标志位，START 链使用 0x20。主循环 0x86e0 根据该位选择 0x97a4(2)，后者经 0x15e44 取得 UI 对象的 +0x258 子对象，再调用 0x18ab8(1) 更新界面状态。该已追踪分支未写入专辑节点位置、角度或缩放；仍不足以断言所有暂停路径都没有几何变化。

## Front / Root 控制器审计结果（2026-09-09）

这轮静态检查没有找到“暂停必然缩回 Root”的证据。现有可复核调用关系如下，地址均为原版 ELF 虚拟地址：

| 路径 | 可核实的行为 |
|---|---|
| 0x10c3c / 0x10c50 | 分别解析 Front、Root 到配置对象 +0x114 / +0xec。两者 angle=0、scale=(1,1,1)，不是两套不同角度常量。 |
| 0xc148 → 0x12944 | 把 Front 指针注册为封面控制器 +0x1e4 的单独前景目标。 |
| 0xc1b4 → 0x1284c，a2=1 | 把 Root 注册到 Prev / Root / Next 节点链；a2 的标记由 0x1294c 用于找到被选中节点。 |
| 0x125a0 | 经 0x1256c 找到对应的当前封面，调用 0x2d8d4，目标为 controller+0x1e4（Front），然后把 controller state（+8）设为 0。 |
| 0x13238 | 找到同一封面后，把其节点链目标的全部姿态直接拷贝回本体（0x2d8f0），然后把 controller state 设为 1。当前曲目的链节点是 Root。 |
| 0x130ac / 0x149a4 | 沿链的前/后节点移动封面，并设 controller state=1；这解释浏览下一张/上一张时的较小选中位置。 |
| 0x914c → 0x125a0 | 确认/回到当前曲目路径使用单独的 Front 目标。 |
| 0x9178 → 0x13238 | 恢复节点链姿态；已发现外部调用 0x50b8 在一个模态返回/状态初始化条件内，不能直接命名为音频 Pause。 |

0x125a0 传给 0x2d8d4 的 **0.2 是逐帧趋近系数，不是 0.2 秒**。0x2ed18 等调用 0x1451f0 → 0x1451d8，后者明确执行 `current += (target - current) * factor`。这一数值不能当作固定动画时长。

对暂停标志 0x20 的读取点、START 音频切换、0xaf18 的暂停/恢复分支、0x99e8 的界面 busy 查询和主循环 UI 更新进行交叉检查，已追踪的路径没有设置 Front / Root 或修改封面本体姿态。恢复时的短暂边缘效果也不构成持续姿态。因此现在可采用的模型是 **音频播放状态与封面浏览状态分离**：浏览使用 Root，确认展示使用 Front；单纯音频暂停不应在没有新证据时强制切换到 Root。

这不是对所有原版状态路径的形式化证明。用户若提供明确显示暂停操作及前后姿态变化的时间点，应继续核对该操作是否同时退出/进入浏览、频道或菜单状态。

## 浏览姿态已接入

场景新增 setBrowsing，Root 使用原始位置 (1.605,2.5,3.273)，Front 保持既有原版位置。单独的姿态过渡从当前显示姿态开始，可反向或被切歌中断；正向响应按原版每帧 0.2 的趋近系数换算到 60 Hz，返回使用同一响应属于暂时重建。音频 setPlaying 不修改浏览标记。

打开音乐库/列表进入浏览；确认列表歌曲先同步退出浏览，再选择歌曲；关闭窗口也退出浏览。原版的浏览控制与当前 Web 弹窗并非完全相同，因此本次接入证明几何状态分离，不能据此声称完整复刻了原版交互或解决了用户指出的暂停差异。

场景测试覆盖来回打断、Root 状态选曲、切歌与姿态的独立计时、更换曲库、120 次快速浏览/选曲和减少动态效果。浮点端点检查使用 1e-10 容差。原先 Front 逐帧拟合与离场屏幕约束继续通过。

## Current application mapping (user correction)
The 493.50–494.90 screenshots show the smaller Root presentation; 495.60 onward shows the larger Front presentation. Playback intent now selects Front; pause/nonplay selects Root, as requested. Library browsing also selects Root. The camera projects the different depths into different apparent sizes and perspective angles; no invented yaw is added. The static START-branch findings above remain research evidence, not a reason to suppress the requested application state distinction.
