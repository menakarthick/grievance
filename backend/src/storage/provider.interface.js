'use strict';

// Storage abstraction (ARCHITECTURE.md §19.3: "The Media Service already
// exposes a storage abstraction... moving to S3-compatible object storage
// is an adapter swap, not an application change"). Every adapter in this
// directory implements the same three function names so the service layer
// never branches on which backend is configured.
//
// save({ buffer, storageKey }) -> Promise<{ storagePath }>
//   - storageKey: a randomized, non-guessable relative path/key (the
//     caller — src/services/file.service.js — generates this so it stays
//     backend-agnostic; a cloud adapter would use it as the object key).
//   - Returns the value persisted to file_asset.storage_path.
//
// read(storagePath) -> Promise<Buffer>
//   - Throws if the file doesn't exist.
//
// remove(storagePath) -> Promise<void>
//   - Physical deletion. Never called by any File Management API endpoint
//     (docs/11-File-Management-APIs.md §11.13.1: "never a physical storage
//     delete via API") — reserved for the retention-expiry Cleanup Job
//     (ARCHITECTURE.md §17), which doesn't exist yet.
//
// This file documents the contract; JavaScript has no interface keyword.
module.exports = {};
