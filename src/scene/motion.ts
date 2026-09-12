import { PRESENTATION } from './render-parameters';

export const INCOMING_SECONDS = PRESENTATION.queueSeconds;
export const DEPARTURE_SECONDS = PRESENTATION.departureSeconds;
const clamp = (time:number) => Math.max(0,Math.min(1,time));

/** One continuous ease-out, shared by both queue directions. No frame-fit knots. */
export function incomingProgress(time:number) {
 return 1-Math.pow(1-clamp(time),3);
}

export function departureProgress(time:number) {
 const t=clamp(time);
 return {
  travel:t*t*(3-2*t),
  shrink:(1-Math.exp(-t/.1375))/(1-Math.exp(-1/.1375)),
  opacity:Math.pow(1-t,1.65),
 };
}

/** Reverse the left-exit path, with the same clock/easing as the retreating queue.
 * Capture the exit state so interrupted next → previous remains continuous.
 */
export function returningProgress(time:number,start=1) {
 const initial=departureProgress(start),remaining=1-incomingProgress(time);
 return {travel:initial.travel*remaining,shrink:initial.shrink*remaining,
  opacity:1-(1-initial.opacity)*remaining};
}

/** Original Front promotion uses current += (target-current)*.2 per update.
 * Browser time normalizes its nominal 60 Hz response; reverse browsing uses the
 * same bounded response as a reconstruction, since its animated return is not
 * fully established. This is independent of the measured song-change curve.
 */
export function browsingProgress(elapsed:number,reducedMotion=false) {
 const t=Math.max(0,elapsed);
 if(reducedMotion)return Math.min(1,t/.18);
 const progress=1-Math.pow(.8,t*60);
 return progress>1-.0001 ? 1 : progress;
}
