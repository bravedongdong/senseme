/** Frozen recovered values; provenance and HD choices: docs/render-parameters.md. */
export const ORIGINAL_RENDER = Object.freeze({
 frontEdge: 0, rearEdge: .02,
 waterHeightScale: .2 / 128, waterNormalScale: 32.5,
 waterDistortion: .022, waterHorizontalRatio: .25,
 reflectionAlpha: 127 / 255, reflectionFilterDelta: .06,
});

/** Deliberate visual choices, not claims about original binary constants. */
export const PRESENTATION = Object.freeze({
 queueSeconds: .7, departureSeconds: .4,
 // Visual pacing; the data frame count does not establish playback frequency.
 waterLoopSeconds: 4,
 // Keep source artwork sharp; halve only the geometric edge feather.
 rearEdgeScale: .5,
});
