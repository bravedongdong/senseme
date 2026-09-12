# SensMe 1.50 water: static reconstruction evidence

Analyzed only decrypted MIPS ELF; did not execute Sony software. All addresses below are unrelocated ELF text/rodata virtual addresses; these sections have file offset = VA + 0xc0. Data-relative references instead require .data relocation and are explicitly labeled.

## Confirmed water algorithm

- Main initialization at VA 0xc0e4–0xc0f0 calls 0xe82c with grid subdivision arguments 64,64. Constructor allocates 65×65 vertices, each 16 bytes: unsigned-short U/V then float X/Y/Z. Draw VA 0xe780–0xe794 uses GU_TRIANGLE_STRIP=4, vtype=0x1182 (short texture coordinates, float position, unsigned-short indices). Indices snake through rows with degenerate connectors, VA 0xeba4–0xeccc.
- Plane positions at 0xe934–0xea30: X spans +22.5 to -22.5, Z spans +15 to -15, Y stays zero. Divisions use 2/64, with X multiplied by4.5×5 and Z by3×5. Note outer loop is Z, inner loop X. Translation is .data+0x488=(9.688,0,0). Rotation function 0x120f08 builds Rx. Initial rotation is -8.5 degrees at 0xe884 and global .data+0x470; scene update can change it via 0xeda4.
- VA 0xeac4–0xeaf0 sets a signed-byte height sequence pointer VA0x15f630, byte count0x4d5cb=316875=75×65×65, frame count75, frame increment1, initial index0. Export is `water-height-75x65x65.s8.bin`; SHA256 9b9ae52c3febb6323f27d39cc61aeb331f7424d4486fd75244672929756f7c57. Original bytes are frame-major then row-major.
- Per update 0xe014, frame index k runs0..59. For k<15, height=lerp(frame[k+60],frame[k],(k+1)/15); k>=15 uses frame[k]. Multiply signed byte by1/128 and0.2 (0xe1ac–0xe27c, constants VA0x77d680/684). Increment k by field+0x74=1, wrap to0 at60 (0xe664–0xe69c). There is no interpolation between consecutive animation frames. Function argument0.004 (global .data+0x480) only accumulates field+0x28 and does not control sequence progression. Absolute update Hz is NOT yet confirmed; 75 is data frame count, not FPS. Update can pause through branch at0xe124–0xe140.
- This path does not integrate a discrete wave equation or evaluate sine sums each frame. It loads the authored height sequence. A separate initialization-only Perlin-like multioctave function0x2f19c provides initial values before animation starts.
- Height writes use a padded67×67 float grid. Normals at0xe3c4–0xe4c0 are normalized central differences: nx=(left-right)*32.5; nz=(up-down)*32.5; n=normalize(nx,1,nz). The32.5 is reciprocal(2/65), deliberately NOT reciprocal world vertex spacing. Heights only distort UV; vertex Y is not displaced.
- UV projection in 0xe324–0xe5c8 multiplies position by MVP using Q12 fixed point, perspective divides, then applies normal distortion. Floating equivalent before fixed-point rounding/clamps:
  u=(0.5+0.5*NDCx - I*nx/4)*(480/512)
  v=(0.5-0.5*NDCy - I*nz)*(272/512)
  I initialized0.022 at0xdf94 (constant VA0x77d668). Horizontal displacement is one-quarter vertical displacement in screen-fraction units. Quantization truncates the matrices, normals and I at4096 and ultimately writes16bit UVs. UV clip thresholds operate at4000/4096; do not replace those with arbitrary repeating texture wrap.
- Water render at0xe6b4 binds RGBA8888 texture512×512 with stride512, using the reflection renderbuffer returned by0x11f08. It enables texture, disables depth test and cull, disables depth writes, and sets texture function MODULATE/RGB and white color0xffffffff. It does not set a new independent water alpha. Blend state can be inherited; texture function RGB and white alpha mean that the water surface itself has no additional fading multiplier in this function. Active RT contents are480×272, corroborated by exact UV multipliers3840 and2176.

## Reflection and defocus

- 0xc8ac–0xc8b8 sets scissor(0,136,480,136) during reflection rendering; full scissor returns at0xc91c–0xc92c. These args reflect the GU scissor API shape; inspect wrapper to interpret endpoint/extent before porting literally.
- Reflection cover draw0x2e42c negates worldPosition.y at0x2e4b4 and negates Y scale at0x2e4f4. It is actual mirrored cover geometry drawn to the reflection RT.
- Reflected vertex generation0x2dea8 uses alpha base127 (0x7f), passed through0x2d5c0 for node-alpha modulation.0x2ddb0 copies original vertex data and installs these alpha values in the colored vertices. Reflection draw also computes127-based alpha at0x2e570. Therefore a roughlyhalf-strength source reflection is grounded in evidence; arbitrary further fading in a water fragment shader is not grounded in this path.
- Property parsing0x10c10–0x10c30 reads NormalCoverArtDefocusIntensity toobject+0x14c and ChannelSelectCoverArtDefocusIntensity to+0x150; getter0xfbe0/0xfbf0. Values are0.03/0.07.
- Object+0x24 takes normal defocus at0x13c0c–0x13c20. Main cover pass0x125fc writes value to0x124948; reflection pass0x1264c doubles it before0x124948. Thus normal mode main0.03/reflection0.06; channel selection main0.07/reflection0.14.
- 0x124948 emits GE command0xD0 with float24 value. PPSSPP `GPU/ge_constants.h` identifies0xD0 as TEXLODSLOPE: https://github.com/hrydgard/ppsspp/blob/master/GPU/ge_constants.h . This is texture LOD slope control, not a Gaussian postprocessing shader. LOD mode and mipchain sampling still need verification before claiming exact screen-space blur radius.

## Quantitative height evidence

All75 frames: signed byte min-85,max90,mean0.29360,std22.44328. After scale: min-0.1328125,max0.140625,std0.0350676. Horizontal spatial autocorrelation at1/2/3/4/6 lattice steps is0.817/0.551/0.354/0.203/0.035. Temporal lag1/5/10/15 correlation0.986/0.735/0.443/0.244. Full numeric report `water-height-stats.json`.

## Main-loop timing confirmation

The continuation of the static analysis located the call chain at VA `0x8700`: main-frame update → `0xb6a8` → `0xb9f0` → `0xe014`. Each main frame calls `sceDisplayWaitVblankStartCB` at `0x8758`; import NID `0x46F186C3` resolves to stub `0x14ce78`. The event pump also uses a 16,667 microsecond budget at `0x8678` / `0x86c4`. Together these support a normal 60 Hz update target and approximately one second for the 60 effective sequence indices. This is a static timing inference, not a measured PSP hardware frame trace. It supersedes the earlier “absolute update Hz not yet confirmed” note above.

## Limits

The supplied UV expressions are a clean mathematical reconstruction from integer instructions, not Sony shader source. Some PSP Allegrex multiply-add opcodes appear as `.byte` in Capstone; their operands and accumulator use were decoded manually. PSP GE texture coordinate orientation and WebGL framebuffer orientation require explicit validation in the port; do not infer a bitmap vertical flip solely from signed NDC terms. Final inherited blend state, exact clip bounds, and LOD mip selection have not been dynamically verified on PSP hardware. No original executable code was added to the product.

## 2026-09-09：LOD 公式补查

独立交叉参考 [PPSSPP 软件光栅器](https://github.com/hrydgard/ppsspp/blob/master/GPU/Software/Rasterizer.cpp) 的 CalculateSamplingParams / TexLog2：SLOPE 模式根据 `2 * clipW * textureLodSlope` 决定细节级别，并叠加偏移。该实现从浮点指数和高四位尾数得到近似对数，再按纹理的最大级别与过滤状态处理，不能等同于固定像素高斯半径。

SensMe 本体 0x125fc–0x12638 在每张主封面绘制前写入 controller+0x24；反射版本 0x1264c–0x1268c 将同值乘二。0x124948 把浮点高 24 位写入 GE 0xD0，核实这是 slope 寄存器。

实施前仍需核实封面纹理绑定的 TEXLEVEL 模式、各级纹理内容和过滤设置；仅发现 slope 写入不能证明所有采样都会使用 SLOPE 模式。因此当前九点过滤保持标记为近似，未在缺少上述证据时替换成未经验证的 LOD 算法。

## 2026-09-09：三档封面 LOD 已接入

继续追踪后得到运行时证据：0x2d77c–0x2d790 调用纹理分配器 0x1ecb4，层数 3，尺寸表为 `.data+0xb40` 的 `(256,64,32)`。注意该地址受重定位影响，不能用 ELF 文件绝对偏移 0xb40 读取。0x1ed54–0x1edb4 按此表为每层分配独立图像。

纹理绑定 0x1efe8 在 0x1f010 设置 TEXLEVEL mode=2（SLOPE）、bias=0；有多级纹理时设置 minFilter=7 / magFilter=1，并逐层调用纹理绑定。另一纹理绑定入口 0x1f5a4 也设置同一模式。因此前节关于模式尚未确认的限制已收敛。

应用 `cover-lod.ts` 将外部封面中心裁成 256 平方图，使用生成纹理链中的 256、64、32 档（跳过 128 档）模拟三个原版层级，按量化深度权重混合。主封面 slope=.03、反射=.06，反射完成后恢复。水面移除额外九点滤镜，只采样已柔焦的反射源。

仍有区别：原版低层图像的降采样核、RGB5551 量化、GPU 插值/舍入尚未逐像素匹配；当前低层由 WebGL 生成，CPU/GLSL 已改为直接提取浮点指数和四位尾数，数值检查要求层级权重严格一致；片段深度和硬件插值本身仍不等同于完整 PSP 光栅模拟。此实现是数值与采样结构等价重建，不是完整 GE 模拟。

## 高清封面与倒影柔化分离
按用户要求取消外部图片 256 平方重采样与主画面强制 LOD。当前 `reflection-defocus.ts` 仅在镜像渲染时应用原版 slope=.06 与三档混合关系，并用原图尺寸计算 mip 偏移；主画面使用标准纹理采样，图片本身不被替换或缩小。镜像完成后恢复材质开关和透明度。这样保留高清封面，同时恢复此前移除 LOD 时丢失的水中柔化。此处仍是采样足迹近似：WebGL mip 生成核与 PSP 独立低层图像不同，非二次幂图像还涉及分数层级混合。

## Cover diagonal gradation
Property parsing at 0x10814–0x10828 reads CoverArtGradationLevel into object+0x94; 0xf998 retrieves it. Vertex generation 0x2d948 calls that getter at 0x2d9a4 and stores the result in f8. At 0x2da98–0x2dabc (and 0x2db60–0x2db84) it computes RGB = ambientRGB * 255 * (1 − gradation*(u+v)*0.5), then truncates and packs vertex colors. Constants 1,0.5,255 are at VA 0x77dcd4/0x77dcd8/0x77dcdc. CoverArtGradationLevel is 0.1. Subsequent coordinate mapping in 0x2dc50–0x2dc64 makes the original V downward.

The material now applies the equivalent diagonal shade to both main and reflected artwork in encoded color space; source images remain unchanged. The mirror copy at 0x2de40–0x2de58 preserves RGB for the visible sleeve geometry. Ambient tint interpolation and exact vertex 8-bit truncation are still not ported, so this isolates the confirmed gradation instead of claiming complete original color reproduction.

## Ambient colour transition port
Ambient RGB now comes from each original AmbientColor property, normalized to 0–1. Parsing at 0x10910–0x1094c converts integers and divides the channels before storing them. Channel selection 0x935c–0x93d8 captures the target delta and loads AmbientInterpTime via 0xf918 (object+0x90). The loop 0xb8fc–0xb998 decrements remaining time and applies start + delta*(1−remaining/duration); 0xbb90–0xbbac clamps completion to the endpoint. AmbientInterpTime is 5.0 seconds.

`ambient.ts` implements that linear time response and captures the current colour when interrupted. A shared material uniform applies the same tint to source covers and reflections, composed with the diagonal gradation in encoded RGB space. Reduced-motion snaps colour to the requested endpoint. Exact 8-bit vertex rounding remains unimplemented.

## Original sleeve edge topology
The draw at 0x2e130–0x2e148 submits primitive 3 (triangles), vertex format 0x119f, count 0x66 (102 indices), index data at VA 0x6f2eec, and the 24-vertex source buffer. The 102 little-endian 16-bit indices span 0–23: 34 triangles. The row-size table at .data+0xb4c is [2,4,6,6,4,2]. .data+0xb34 starts [0,128,255], used symmetrically in each row, with per-node alpha multiplied and shifted by 8 at 0x2da44–0x2da60. Thus this is a planar feathered perimeter, not a solid box rim. Machine-readable topology and source hash are in references/original-cover-topology.json.

The node+0x1c value passed as f12 to 0x2d948 controls row spacing and perimeter width. Its resolved playback/root values must be recovered before changing geometry: replacing it with a guessed constant would change the measured silhouette. The current thin BoxGeometry edge is still an approximation; no runtime edge change was made from this incomplete width evidence. The research DAT and original-properties.json temporary files are currently absent, but the decrypted ELF and disassembly were re-read successfully.

## Resolved edge widths and runtime port
The original DAT temporary file was no longer present and its archive retry returned HTTP 503. The earlier tool output preserved in this same task's session log contains the original property values: FrontNodeEdge=0.0, RootNodeEdge=0.0, PrevNodeEdge=0.02, NextNodeEdge=0.02. ELF parsing at 0x106b4 uses the format string %sNodeEdge and stores its float at node+0x1c (0x106dc), confirming the correspondence.

Production now uses the original 24-vertex / 34-triangle planar geometry and removes the BoxGeometry rim. Rear sleeves use .02; the current sleeve uses zero, interpolated during selection. Main alpha follows the symmetric [0,128,255]/256 ramp. Reflection copies use their separate uniform alpha, consistent with 0x2de40–0x2de58. Exact integer per-node alpha multiplication still differs slightly from floating interpolation. Tests check triangle coverage for three widths and all existing selection regressions. The browser rendered the mesh and next selection without shader errors.

## Vertex colour byte packing
The diagonal RGB calculation and ambient multiplication now run per vertex and truncate to bytes before raster interpolation, matching the order at 0x2dac0–0x2daec. Main alpha first truncates 255*nodeOpacity, then multiplies by the [0,128,255]/256 perimeter weight and truncates again, following 0x2d5c0 and 0x2da44–0x2da64. Reflection uses its separately truncated 127-based alpha without the main perimeter ramp. Pointer hit opacity uses the same vertex values. The previous per-fragment shading and unquantized alpha approximations are superseded. Browser shader compilation and scene regression passed. Full GE interpolation precision and source mip filtering remain different.
