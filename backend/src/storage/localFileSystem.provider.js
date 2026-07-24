'use strict';

const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');

// Phase-1's only adapter (ARCHITECTURE.md §19.1: "VM-1 local disk, outside
// webroot") — implements provider.interface.js. Storage root is
// intentionally outside any directory Express serves statically, so a file
// is only ever reachable through the signed-download-token endpoint
// (src/utils/signedUrl.js), never a guessable static URL.
function resolveAbsolutePath(storagePath) {
  return path.join(process.cwd(), env.storage.rootDir, storagePath);
}

async function save({ buffer, storageKey }) {
  const absolutePath = resolveAbsolutePath(storageKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return { storagePath: storageKey };
}

async function read(storagePath) {
  return fs.readFile(resolveAbsolutePath(storagePath));
}

async function remove(storagePath) {
  await fs.unlink(resolveAbsolutePath(storagePath)).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
}

module.exports = { provider: 'local', save, read, remove };
