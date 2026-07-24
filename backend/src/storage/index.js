'use strict';

const localFileSystem = require('./localFileSystem.provider');

// Registry of storage adapters, keyed by provider name (env.storage.provider).
// Only 'local' is implemented this phase — S3/Azure Blob/MinIO are future
// adapter slots (this instruction's explicit scope: "Implement ONLY the
// Local File System adapter... keep the storage layer pluggable"). Adding
// one later means adding a file here and to this map, never touching
// src/services/file.service.js.
const ADAPTERS = {
  local: localFileSystem,
  // s3: require('./s3.provider'),       // future
  // azureBlob: require('./azureBlob.provider'), // future
  // minio: require('./minio.provider'), // future
};

function getStorageAdapter() {
  const env = require('../config/env');
  const adapter = ADAPTERS[env.storage.provider];
  if (!adapter) throw new Error(`Unknown storage provider "${env.storage.provider}" — only "local" is implemented.`);
  return adapter;
}

module.exports = { getStorageAdapter };
