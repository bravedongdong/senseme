import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicServer, createNeteaseProvider, parseByteRange } from './music-api.js';

test('byte ranges support seeks, suffix reads and reject invalid ranges', () => {
  assert.deepEqual(parseByteRange('bytes=40-59',100),{start:40,end:59});
  assert.deepEqual(parseByteRange('bytes=40-',100),{start:40,end:99});
  assert.deepEqual(parseByteRange('bytes=-20',100),{start:80,end:99});
  assert.deepEqual(parseByteRange('bytes=80-120',100),{start:80,end:99});
  for (const h of ['bytes=100-', 'bytes=70-30','bytes=-0','bytes=1-2,4-5','bytes=-']) assert.equal(parseByteRange(h,100),false);
});

test('production audio response supplies bytes and matching range headers', async () => {
  const server = createMusicServer();
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    const r=await fetch(`${base}/audio/tide.wav`, {headers:{Range:'bytes=0-43'}});
    assert.equal(r.status,206);
    assert.equal(r.headers.get('content-length'),'44');
    const body=Buffer.from(await r.arrayBuffer());
    assert.equal(body.subarray(0,4).toString(),'RIFF');
    const h=await fetch(`${base}/audio/tide.wav`,{method:'HEAD',headers:{Range:'bytes=44-100'}});
    assert.equal(h.status,206); assert.equal(h.headers.get('content-length'),'57');
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});

test('playlist fetches missing details and preserves original order', async () => {
  const provider=createNeteaseProvider({baseUrl:'https://example.test',fetchImpl:async url=>({ok:true,status:200,headers:new Headers({'content-type':'application/json'}),text:async()=>JSON.stringify(String(url).includes('playlist/detail') ? {playlist:{name:'ordered',tracks:[{id:2,name:'Two'}],trackIds:[{id:1},{id:2},{id:3}]}} : {songs:[{id:3,name:'Three'},{id:1,name:'One'}]})})});
  const p=await provider.playlist('1'); assert.deepEqual(p.tracks.map(t=>t.id),['1','2','3']);
});

test('available Netease trial URL is labelled as a preview',async()=>{
  const provider=createNeteaseProvider({baseUrl:'https://example.test',fetchImpl:async()=>({ok:true,status:200,headers:new Headers({'content-type':'application/json'}),text:async()=>JSON.stringify({data:[{url:'https://example.test/preview.mp3',freeTrialInfo:{start:30,end:60}}]})})});
  assert.equal((await provider.trackUrl('1')).preview,true);
});
