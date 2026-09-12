import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit', env: process.env }),
];
let closing = false;
function close(code = 0) { if (closing) return; closing = true; for (const c of children) c.kill('SIGTERM'); process.exitCode = code; }
children.forEach(c => { c.on('error', e => { console.error(e.message); close(1); }); c.on('exit', code => close(code ?? 0)); });
process.on('SIGINT', () => close()); process.on('SIGTERM', () => close());
