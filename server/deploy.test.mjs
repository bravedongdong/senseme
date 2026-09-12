import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const exec = promisify(execFile);

test('cloud PORT binds all interfaces and serves frontend files and health endpoint', async (t) => {
 const dist=await mkdtemp(path.join(tmpdir(),'senseme-deploy-'));
 t.after(()=>rm(dist,{recursive:true,force:true}));
 await writeFile(path.join(dist,'index.html'),'<html>Deployment fixture</html>');
 const {stdout}=await exec(process.execPath,['--input-type=module','-e',`
  import {startServer} from './server/music-api.js';
  const server=await startServer();
  try {
   const address=server.address(),origin='http://127.0.0.1:'+address.port;
   const health=await fetch(origin+'/api/health');
   const page=await fetch(origin+'/');
   console.log(JSON.stringify({host:address.address,health:health.status,page:page.status,html:(await page.text()).includes('<html')}));
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 `],{env:{...process.env,HOST:'',PORT:'0',SENSEME_DIST_DIR:dist},timeout:15000});
 assert.deepEqual(JSON.parse(stdout),{host:'0.0.0.0',health:200,page:200,html:true});
});
