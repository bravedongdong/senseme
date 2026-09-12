# SensMe water player — architecture and reconstruction notes

## Evidence and fidelity limits

The original 2009 Energetic screenshot is preserved at [PlayStation LifeStyle](https://www.playstationlifestyle.net/2009/07/31/psp-gos-sensme-first-look/) and locally in `docs/references/energetic.jpg`. The user-provided [video reference](reference-video.md), around 8:27, establishes the motion and Shuffle All appearance. The later [SensMe 1.50 package investigation](original-package.md) provides original camera/queue properties, numerical water heights and two native background images. See [original-projection.md](original-projection.md) for reproducible coordinate mapping and facts versus inference.

This is independently authored TypeScript/GLSL, not the original rendering executable. PSP renders this effect through its GE fixed-function pipeline and a CPU-generated UV mesh; there is no claim that Sony supplied GLSL. The dedicated numerical water field and two decoded background textures have documented original provenance. No Sony executable or music is included. Exact fixed-point quantization, texture LOD selection, every transition curve, and original background sprite movement remain incompletely reproduced.

## System boundaries

The Node service owns provider adapters, normalized metadata and media URL handling. DOM controls and `HTMLAudioElement` own playback and accessibility. `SensMeScene` owns visual state and GPU resources; it never advances the authoritative playlist or starts audio. `onSelect(index)` routes canvas selection and swipe gestures back to application state.

```text
Node provider adapter → catalog / player state → HTMLAudioElement
                                  ↓
                            SensMeScene
                  background + sleeves → reflection RT
                                  ↓
                    original UV water grid → final view
```

## Scene API

`new SensMeScene(container, { onSelect?, onError? })`

| Method | Purpose |
|---|---|
| `setTracks(tracks, selectedIndex = 0)` | Replace normalized `{ id, title, artist, cover }` catalog. |
| `select(index, direction?)` | Animate toward a wrapped playlist index. |
| `setMood(name)` | Crossfade background/palette; unknown names use Energetic. |
| `setPlaying(boolean)` / `setEnergy(0…1)` | Receive optional audio state. The original wave field is independent of audio energy. |
| `setQuality('original' \| 'high')` | Fit inside a 480×272 drawing buffer or use device-scaled rendering. |
| `resize()` | Update camera, drawing buffer and reflection target dimensions. |
| `getDiagnostics()` | Report frame/resource counts, viewport, wave loading/frame and native background loading. |
| `dispose()` | Release render resources, events, observers and pending wave fetch. |

Mood keys are `shuffle-all`, `energetic`, `relax`, `mellow`, `upbeat`, `emotional`, `lounge`, `dance`, `extreme`, `evening`, `morning`, `day`, `night`. Energetic is the initial default.

## Camera, sleeves and motion

Landscape uses the original 28.5° vertical FOV and the original view transform. All sleeves are five-unit squares with centres at y = 2.5 and contact edges at y = 0. Twelve rear nodes follow the source's locally rotated offset accumulation, rather than independently shrinking cards to fit a photograph. Raw source numbers and projected bounds are recorded in [original-projection.md](original-projection.md). Textured faces use square-cropped sRGB artwork, with thin sleeve edges and labelled fallback covers.

The selected sleeve at 480×272 projects to approximately `(26,43)`–`(219,237)`. At 1280×720 it is `(73,113)`–`(583,628)`. Portrait uses a 44° FOV and backs the same camera orientation away from the active sleeve, with an off-axis reframe reserving 330 CSS pixels below the cover for controls. At 390×844 its bounds are `(46,152)`–`(337,456)`.

Incoming motion lasts approximately 0.7 seconds: 0.6 seconds of substantial movement and a 0.1-second tail. Monotone Hermite interpolation passes through world-progress samples `[0, .213, .576, .686, .863, .940, .980, 1]` at 0.1-second intervals. A new selection captures the current displayed pose, so interruption does not reset to an old endpoint. The outgoing instance moves left approximately 0.87 of its captured screen width, visibly shrinks to 82% width and fades over 0.4 seconds. Its physical contact edge remains y = 0 and its lowest projected edge remains at the captured screen waterline. `departure.ts` solves X, Z and physical scale from the target screen centre, width and bottom, retaining the captured yaw. This compensates for the original camera's oblique projection: a direct world-X translation changed depth and had incorrectly made visible width grow from 169 to 172 pixels between 0.1 and 0.2 seconds. Translation, shrink and alpha still use the previously measured separate curves. At 480×272, the corrected early widths are 163.81 then 159.09 pixels, right edges x162.05 then x97.59, and bottom stays y237.36. Opacity is approximately 62% then 32%; it is a visual reconstruction, not an exact alpha recovered from video.

There is no idle bob, idle tilt, vertical lift, or selection-induced water impulse. Each departing instance has its own timer. The destination queue contains the front plus up to twelve rear sleeves, while the total staged resource count, including outgoing instances, remains capped at 24. Reduced-motion shortens selection to 0.18 seconds and freezes environmental time.

## Water: original numerical field and equivalent UV pipeline

`public/water/sensme-height-75x65x65.s8.bin` contains the precisely delimited 316,875-byte signed numerical field. Its origin and SHA-256 are in [original-package.md](original-package.md). It contains 75 frames of 65×65 heights. The port performs these independently authored steps:

1. Use a 64×64-cell mesh spanning original X ±22.5 and Z ±15. Translate it by (9.688,0,0) and apply original Rx −8.5°, converted into the application's Z-flipped coordinates. Heights do not move vertices vertically.
2. Advance through effective indices 0…59 at a nominal 60 Hz. For k < 15, blend source frames k+60 and k with weight `(k+1)/15`; otherwise use frame k directly. Scale signed bytes by `0.2/128`. The original update is tied to each main loop/vblank; this browser implementation follows a 60 Hz clock independently of monitor refresh rate.
3. Compute central differences `(hLeft−hRight)×32.5` and `(hUp−hDown)×32.5`, then normalize `(dx,1,dz)`. This coefficient follows the original normalized grid spacing, not the larger world spacing. Only the outermost neighbour padding is reconstructed by clamping.
4. Project the mesh into the main view, then offset the per-vertex UV by original intensity 0.022, with horizontal displacement one-quarter of vertical displacement. Convert the axes for WebGL and the mirrored camera's horizontal parity. Interpolate those coarse UVs across triangles. No fragment-level sine waves or extra noise are added.
5. Render reflected sleeves with source alpha `127/255`, multiplied by their normal node alpha. There is no additional height/exponential fade, Fresnel tint or streak overlay in the water shader. Its background remains the same pixel's actual environment.

The current reflection targets use the browser viewport aspect ratio and resolution chosen by quality, rather than the PSP's 512×512 allocation with a 480×272 active rectangle. This avoids sampling unused padding while keeping normalized screen displacement equivalent. The original UV fixed-point rounding/clamp is not bit-exact in this floating-point port.

Artwork retains its source resolution and uses standard Three.js mip filtering. The PSP cover conversion and main-pass custom LOD are disabled at the user's request. Reflection-only depth defocus samples the source mipchain with a source-size offset; source images and main-pass sharpness are preserved. Original wave data and reflection opacity are retained.

A sky-only reflection pass is retained alongside the combined pass for consistent environment ownership; the combined RT already includes the 127/255-alpha sleeves. The current water samples the combined target directly. The reflected camera's X parity is explicitly checked; it is not an error that its NDC x is the negative of the main camera's x.

## Backgrounds

Energetic and Shuffle All load their dedicated decoded native images from `public/reference/energetic.png` and `public/reference/shuffle-all.png`. Main and reflected views sample the same upright screen background. The reflected view accounts only for horizontal camera parity; it does not mirror the upper white/yellow lights vertically into the lower water field. Thus the source texture's actual lower red/cyan region supplies Shuffle All water colour, replacing the earlier procedural vertical-remap approximation.

The native sprite now preserves the original default 16-pixel overscan around a 480×272 screen (512×304 image centred at 240,136). The four sprites represent old/new sharp/blurred images, not four tiled quadrants; see original-background.md. Interface-driven background resizing, vertical offset and blurred-image mixing remain incomplete. Crossfade uses the existing damped theme transition. Other mood keys retain the independently generated sky/cloud/rainbow fallback. The procedural bokeh fallback remains available while native textures load. This background change does not alter sleeve geometry or motion.

## Runtime and resource ownership

The scene skips rendering while the document is hidden and clamps frame deltas after pauses. WebGL context loss pauses rendering and reports through `onError`; restoration resumes it. Cover loading checks both card identity and catalog generation before applying asynchronous results. Same-URL concurrent loads share a promise and texture; caches are capped at 48. Generated fallbacks and removed sleeves are disposed. Late results for replaced catalogs are disposed instead of entering the current cache. Wave loading is abortable and its immutable data is shared by the single mesh.

The original-quality drawing buffer preserves display aspect ratio inside 480×272: 1280×720 becomes 480×270 and 390×844 becomes 125×272. This is a resolution treatment, not a claim of full PSP emulation. Diagnostics report actual dimensions.

## Verification

`npm run test:scene` projects the real production poses/camera and samples real motion functions without a GPU. Against the active-display video annotations, intermediate-frame RMS residuals are approximately 1.2–2.6 reference pixels under the unchanged 3-pixel threshold. The first frame checks only the three exposed edges; the concealed left edge is not measurable. It also checks monotonic interrupted motion, y=0 contact, early departure, portrait fit and reflected-camera parity/registration. Departure is sampled 121 times in each viewport for both a settled and an interrupted incoming pose: projected width must never grow, screen centre must never reverse, and the screen bottom must remain within 0.001 pixels of its initial waterline. A decreasing world-scale assertion alone would not detect the camera-migration regression.

Earlier constructor-free resource testing exercised 1,200 rapid selections: total staged sleeves/fallbacks stayed at 24, four repeated URLs produced four requests, and unique cached covers stayed at 48. Catalog replacement disposed a late result exactly once. These are resource-ownership checks, not GPU-driver or visual smoothness measurements. Final browser screenshots and playback tests are recorded separately by the integration task.

Earlier camera32°/variable-size rear-card fits, four-sine water, short depth fade and procedural-only backgrounds are superseded by the original evidence described above; historical screenshots are not evidence of the current rendering path.

Previous selection reverses the left departure path over 0.4 seconds, while the current sleeve and queue retreat with the reversed incoming curve. Interrupted outgoing sleeves can return from their current departure progress. Playback intent selects Front; paused/nonplaying and explicit library browsing select Root. Loading notifications do not change playback intent. These are application mappings informed by the reference screenshots, not proof that every original pause branch changes pose.
