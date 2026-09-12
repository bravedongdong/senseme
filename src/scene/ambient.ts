/** Original encoded RGB values and linear five-second ambient transition. */
const AMBIENT:Record<string,number[]> = {
 "morning": [
  255,
  245,
  235
 ],
 "day": [
  255,
  245,
  235
 ],
 "evening": [
  255,
  245,
  235
 ],
 "nightfall": [
  255,
  245,
  235
 ],
 "night": [
  255,
  245,
  235
 ],
 "shuffle-all": [
  255,
  245,
  245
 ],
 "energetic": [
  245,
  245,
  255
 ],
 "relax": [
  245,
  255,
  245
 ],
 "mellow": [
  245,
  245,
  255
 ],
 "upbeat": [
  255,
  235,
  255
 ],
 "emotional": [
  255,
  245,
  235
 ],
 "lounge": [
  250,
  240,
  240
 ],
 "dance": [
  240,
  240,
  240
 ],
 "extreme": [
  240,
  240,
  255
 ]
};
export class AmbientTransition {
 private from:number[];
 private to:number[];
 private start=-5;
 constructor(mood='energetic'){this.from=this.to=this.color(mood);}
 private color(mood:string){return (AMBIENT[mood]??AMBIENT.energetic).map(value=>value/255);}
 sample(time:number,reduced=false){const t=reduced?1:Math.max(0,Math.min(1,(time-this.start)/5));return this.from.map((value,i)=>value+(this.to[i]-value)*t);}
 select(mood:string,time:number){this.from=this.sample(time);this.to=this.color(mood);this.start=time;}
}
