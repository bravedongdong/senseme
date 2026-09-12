"""Original synthesized ambient sketches, CC0. Reproducible offline preview assets."""
from pathlib import Path
import math, wave, array
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT/'public'/'audio'; OUT.mkdir(parents=True, exist_ok=True)
RATE=22050
DURATION=32
# Distinct ambient progressions; no recordings or copyrighted melodies.
PROGRESSIONS = {
 'tide': [[48,55,60,64,71],[45,52,57,60,67],[41,48,53,57,64],[43,50,55,59,66]],
 'glass': [[50,57,62,65,69],[46,53,58,62,65],[53,60,65,69,72],[48,55,60,64,67]],
 'afterglow': [[45,52,57,60,64],[41,48,53,57,60],[48,55,60,64,67],[43,50,55,59,62]],
 'drift': [[52,59,64,67,71],[48,55,60,64,67],[55,62,67,71,74],[50,57,62,66,69]],
 'night': [[42,49,54,57,61],[38,45,50,54,57],[45,52,57,61,64],[40,47,52,56,59]],
 'first-light': [[48,55,60,64,67],[53,60,65,69,72],[45,52,57,60,64],[43,50,55,59,62]],
}
for idx,(name,chords) in enumerate(PROGRESSIONS.items()):
 data=array.array('h')
 for i in range(RATE*DURATION):
  t=i/RATE; beat=t%8; chord=chords[min(3,int(t/8))]
  env=min(1,beat/1.7)*min(1,(8-beat)/2.4)
  fade=min(1,t/2)*min(1,(DURATION-t)/3)
  sig=0
  for j,n in enumerate(chord):
   f=440*2**((n-69)/12)
   sig+=(math.sin(math.tau*f*t)+.22*math.sin(math.tau*f*2.001*t))*(.023 if j==0 else .017)*env
  step=int(t*2); local=t*.5%1; n=chord[(step//2+idx)%5]+12
  f=440*2**((n-69)/12)
  sig+=math.sin(math.tau*f*t)*math.exp(-local*8)*.021
  sig*=fade
  l=sig*(.96+.035*math.sin(t*.7));r=sig*(.96+.035*math.cos(t*.61))
  data.extend((int(max(-1,min(1,l))*32767),int(max(-1,min(1,r))*32767)))
 with wave.open(str(OUT/f'{name}.wav'),'wb') as out:
  out.setnchannels(2);out.setsampwidth(2);out.setframerate(RATE);out.writeframes(data.tobytes())
 print(name,DURATION,'s')
