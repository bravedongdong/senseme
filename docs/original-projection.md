# Original parameter projection

Source: the two identical plaintext property tables in SensMe 1.50, documented in [original-package.md](original-package.md). The independent read-only check is `node scripts/project-original.mjs /tmp/sensme-reference/original-properties.json`. It prints raw facts, the candidate view matrix and projected sleeve bounds without executing original software. Production constants live in `src/scene/original-parameters.ts`.

## Facts and coordinate interpretation

The source specifies FOV 28.5°, CameraPos = (−6.688, 2.78, −24.15), CameraRot = (−1°, 11.2°, 0°), Front = (1.647, 2.5, −10.463), Next = (7.221, 2.5, 9.039), NextAngle = −32°, NextOffset = (3, 0, 3.4), NextAngleOffset = −6°, and twelve Next nodes. Node alpha decreases by 0.02 per step.

The mapping that agrees with both the 2009 screenshot and the correctly cropped video is:

- Node position `(x,y,z)` → Three.js `(x,y,−z)`; node yaw keeps its numeric angle.
- Five-unit square sleeves centred at y = 2.5, with their lower edges at y = 0.
- View matrix `V = T(CameraPos.x, −CameraPos.y, CameraPos.z) × R_YXZ(CameraRot)`. The property named CameraPos is used in this view transform; treating it directly as a Three.js world camera position gives a different composition.
- Three.js camera world transform is `inverse(V)`, approximately position (1.870, 2.343, 25.034) and XYZ rotation (1°, −11.2°, 0°).
- For rear step i = 1…11, rotate the original XZ offset (3, 3.4) by −6° × i, then add it to the previous position. Sleeve yaw is −32° − 6° × i. This local accumulation produces the curved, gradually receding queue.

Five-unit size and the view interpretation are strongly supported by the resulting silhouettes. YXZ versus XYZ view rotation changes this small-angle scene by less than one pixel; static frames alone do not uniquely prove the engine's Euler convention. The Root node is a separately named source position, but its runtime role is not established here and is not imposed on the observed incoming trajectory.

## Reproducible static output at 480×272

| Sleeve | Full left / top / right / bottom |
|---|---|
| Front | 25.65 / 42.85 / 218.57 / 237.36 |
| Next 1 | 183.81 / 102.79 / 255.60 / 182.55 |
| Next 2 | 227.3 / 106.6 / 291.5 / 179.0 |
| Next 3 | 268.1 / 109.5 / 326.4 / 176.2 |
| Next 4 | 307.2 / 111.7 / 361.1 / 174.0 |
| Next 5 | 345.4 / 113.3 / 395.9 / 172.3 |
| Next 6 | 383.5 / 114.6 / 431.3 / 171.0 |

These decimals are calculated projections, not claimed photographic measurement precision. The 2009 reference's rear right edges are approximately 254, 290, 326, 360, 394 and 430 pixels. Adding the same offset in world space instead gives 255.6, 285.4, 309.5, 329.3, 345.8 and 359.6, a visibly incorrect shrinking interval. Full left edges are partly hidden by preceding sleeves.

The earlier video rectification included the black screen border. [reference-video.md](reference-video.md) now uses the active display quadrilateral; that correction explains much of the earlier 3–5-pixel discrepancy and removes the need to deform the original geometry.

## Motion and reflection checks

The scene check uses the real Three.js camera and poses. Incoming progress is a monotone interpolation through `[0, .213, .576, .686, .863, .940, .980, 1]` at 0.1-second intervals, lasting 0.7 seconds. RMS differences from the transformed active-display annotations are 1.2–2.6 pixels. Only the three exposed edges are checked in the first frame; its concealed left edge cannot be directly measured. The existing 3-pixel RMS threshold was retained.

The mirrored look-at camera reverses horizontal parity: a point on y = 0 has reflected NDC x equal to negative main NDC x, while y and depth agree. The water samples with the corresponding matrix. Because the original water grid itself is tilted, its UVs use the main-view screen projection rather than treating each tilted vertex as a point on the horizontal reflecting plane. Equivalently, the mirrored-camera matrix receives a Y-reflected input point. The source reflection is still around sleeve y = 0.

## Departure regression corrected after the camera migration

The incoming projection and original static queue remain as above. The previous departure implementation translated world X by a rescaled 4.44 units while reducing world scale. Under this oblique camera that changed depth: visible sleeve width increased from approximately 169 px at 0.1 s to 172 px at 0.2 s, and the lower edge moved down from y238 to y241. Those screen effects contradicted the already measured leftward shrinking departure even though world scale was decreasing.

The corrected departure keeps its captured yaw and physical lower-edge height, and numerically solves X, Z and scale to satisfy three screen constraints: centre translates monotonically left by 0.87 initial widths, visible width follows the established shrink curve toward 82%, and the lowest screen edge remains fixed. This is a camera-invariant restoration of the observed animation, not a newly recovered original animation function. Each outgoing instance still captures its current pose and retains its own 0.4-second timer.

At 480×272 the corrected bounds are `(−1.76,75.39)–(162.05,237.36)` at 0.1 s and `(−61.50,83.75)–(97.59,237.36)` at 0.2 s. Width decreases from 163.81 to 159.09 pixels. The check samples 121 points on the full path at 480×272, 1280×720 and 390×844, including an interrupted incoming pose; it asserts monotone screen width/centre, fixed screen bottom and physical contact. Water, background, incoming timing and rear queue were unchanged by this correction.

## Rear queue cross-check against the supplied video
The first tile of `references/bilibili-active-display.jpg` is the 8:27.2 frame rectified to 480×272. Approximate visible right edges of rear sleeves 1–6 are x=251,288,325,360,394,428. Production geometry projects these to 255.60,291.47,326.42,361.08,395.91,431.34: signed errors +4.60,+3.47,+1.42,+1.08,+1.91,+3.34 pixels. This supports the existing curved queue and gives no basis for another layout change.

These are manual silhouette marks, with roughly 3px uncertainty from video compression, edge thickness and rectification. A 6px regression bound catches material layout drift without treating inferred occluded left edges as measured facts. It verifies six visible edges in one state; it does not prove the complete trajectory, hidden nodes or pixel-exact perspective. Remaining hidden nodes retain the twelve-node source parameter recurrence.
