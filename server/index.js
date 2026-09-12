'use strict';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOST, DEFAULT_PORT, startServer } from './music-api.js';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer()
    .then((server) => {
      const address = server.address();
      const host = typeof address === 'object' && address ? address.address : DEFAULT_HOST;
      const port = typeof address === 'object' && address ? address.port : DEFAULT_PORT;
      process.stdout.write(`SenseMe music server listening at http://${host}:${port}\n`);
    })
    .catch((error) => {
      process.stderr.write(`SenseMe music server failed to start: ${error.message}\n`);
      process.exitCode = 1;
    });
}

export * from './music-api.js';
