# 原版 1.50 的只读检查

2026-09-07 起检查公开发布过的官方安装文件，核对场景参数与水面算法。没有执行或分发 PSP 程序；后续复刻使用的专用数值波场与两张背景纹理分别记录在本文和 credits.md。

## 来源与复核

[官方 PC 下载页面的历史快照](https://web.archive.org/web/20130505192731/http://www.playstation.com/psp-app/sensme/en/download_pc.html) 列出了 `sensme.dl.playstation.net/sensme/01.50/` 下的两个文件。读取的是 Internet Archive 保存的对应官方文件：

- [EBOOT.PBP 快照](https://web.archive.org/web/20180723035017/http://sensme.dl.playstation.net/sensme/01.50/EBOOT.PBP)，8,389,616 字节，SHA-256 `aebb67a6f82c4a9cb3ae60ee00608f2ce682fb739c79b65cf2e6512c4f60f2b1`。
- [SENSME.DAT 快照](https://web.archive.org/web/20180723035017/http://sensme.dl.playstation.net/sensme/01.50/SENSME.DAT)，5,646,562 字节，SHA-256 `bbc28d53b3fe918d8a28b3601c53045a2fb997d0956243e5d4085d75633c9534`。

PBP 的 PARAM.SFO 确认为 `SensMe™ channels`、`NPIA00013`、版本 `1.50`、声明系统版本 `6.20`。独立图片/音频/PSAR 区段为空。执行区以 `~PSP` 封装标志开头；初次检查在此停止。用户随后明确要求尝试逆向水面效果，进一步分析见下文。

DAT 以 SQLite 开头，但并非只有数据库：偏移 `0x2000` 开始是明文 property 数据，另有语言文本与 22 处 GIM 图像签名。两份全局 property 块完全一致，各有 114 项。SQLite 的歌曲表为空，不能将整个 DAT 简单解释为歌曲数据库。

Luna Max 将这 22 张 GIM 的首张图像解码并经联系表检查，均为 450×220 的多语言按键操作提示图集，使用 8 位索引与 PSP swizzle 排布。没有从这些已解码图像取得背景图。预览仅保留在本机研究临时目录，未用于播放器。

拿到同一文件后可运行：

```sh
node scripts/inspect-original.mjs /path/to/SENSME.DAT
```

检查器核对文件哈希，只读取全局参数与图像签名位置，不执行或输出程序和图像内容。

## 已读取的场景事实

| 参数 | 原版值 |
|---|---|
| FOV | 28.5 |
| CameraPos | -6.688, 2.78, -24.15 |
| CameraRot | -1.0, 11.2, 0.0 |
| FrontNodePos | 1.647, 2.500, -10.463 |
| RootNodePos | 1.605, 2.500, -3.273 |
| NextNodePos | 7.221, 2.500, 9.039 |
| NumNextNode | 12 |
| NextPosOffset | 3.0, 0.0, 3.4 |
| NextAngleOffset | -6.0 |
| NextAlphaOffset | -0.02 |
| PrevNodePos | -4.745, 2.500, 7.643 |
| NormalCoverArtDefocusIntensity | 0.03 |
| TextChangeFadeInTime / FadeOutTime | 0.30 / 0.15 |

这些值来自原版明文资源，不再是视频测量值。但变量名称本身不能证明坐标系、旋转顺序、封面原始尺寸、运行时状态选择或 shader 中的用法。必须先重建投影并对照实机帧，才能替换当前按视频拟合的实现；也不能把 DefocusIntensity 直接当作 Three.js 模糊像素半径。

## 2026-09-08：水面逆向的程序解封

用户进一步要求尝试逆向原版水面，特别指出当前波纹太细、倒影不够明显。使用 [pspdecrypt 项目源代码](https://github.com/John-K/pspdecrypt) 的 PRX 解封模块和 libkirk，在本地编译了只读入 PRX、写出解封数据的最小检查程序。源码固定为提交 `c156627db7634d395c380c0a9589130f603307fc`。该项目的解封实现源自 PPSSPP。

完整命令行工具依赖本机缺少的 OpenSSL 开发头文件，因而未构建成功；实际使用的最小程序仅链接 `PrxDecrypter` 与 libkirk，不包含 IPL/PSAR 处理，也不需要 OpenSSL。未执行 Sony 程序。

- DATA.PSP 解封报告：tag `ADF305F0`，type 2，输出 8,388,828 字节。
- 输出确认为 32 位小端 MIPS ELF，SHA-256 `b7f2aac157d1c88874f36ae8848b74fc87c23dff7bc63f970b3c2a7be95c2c5e`。
- ELF 没有普通符号表或调试信息，但保留代码、只读数据与 PSP relocation 节。
- 其中包含 11 处 GIM 签名，以及 `bg.gim`、`bg_b.gim`、`bg_s.gim`、`default_covers.gim` 和虚化参数名称等引用；这些名称本身尚不能证明对应纹理的运行时用途。

PSP 使用固定功能的 GE 图形管线，不能预期从安装包得到现代 GLSL 源文件；此次目标是确认纹理、绘制与采样方式，再编写 Three.js 的等效实现。硬件依据：[PPSSPP 的 GE 文档](https://www.ppsspp.org/docs/psp-hardware/gpu/)。解封程序与原版 ELF 仅存在研究临时目录。独立实现使用专门界定的数值水波高度场，以及 Energetic / Shuffle All 两张解码后的原生背景纹理；资源出处见 [credits.md](credits.md)。

## 水波数据的精确边界

静态分析确认高度数据从 ELF 虚拟地址 `0x15f630`（文件偏移 `0x15f6f0`）开始，长度 `0x4d5cb`，即 75×65×65 = 316,875 字节。构造函数记录的地址、长度和帧数相互吻合。该片段只包含有符号 8 位高度数值，不包含程序指令。数据 SHA-256 为 `9b9ae52c3febb6323f27d39cc61aeb331f7424d4486fd75244672929756f7c57`。

原版读取值后乘以 `(1/128) × 0.2`。这是预计算波场，不是运行时求解波动方程。每轮实际读取索引 0–59：前 15 个索引将末尾 15 帧与开头 15 帧混合，使循环接续；其余索引直接读取对应帧。主循环的 VBlank 等待及 16,667 微秒事件预算支持正常 60 Hz 更新、约一秒循环，详见 [water-reverse.md](water-reverse.md)。浏览器按时间推进，避免 120 Hz 显示器使波场加速两倍。
