'use strict';

const crypto = require('crypto');
const storageProvider = require('../../src/storage/localFileSystem.provider');

describe('storage/localFileSystem.provider (ARCHITECTURE.md §19 storage abstraction, local adapter)', () => {
  test('save/read round-trips the exact bytes written', async () => {
    const buffer = Buffer.from(`test content ${crypto.randomUUID()}`);
    const storageKey = `test/${crypto.randomUUID()}.txt`;

    const { storagePath } = await storageProvider.save({ buffer, storageKey });
    expect(storagePath).toBe(storageKey);

    const readBack = await storageProvider.read(storagePath);
    expect(readBack.equals(buffer)).toBe(true);

    await storageProvider.remove(storagePath);
  });

  test('remove is idempotent — removing an already-removed (or never-existing) key does not throw', async () => {
    const storageKey = `test/${crypto.randomUUID()}-never-existed.txt`;
    await expect(storageProvider.remove(storageKey)).resolves.toBeUndefined();
  });

  test('reading a non-existent key rejects', async () => {
    const storageKey = `test/${crypto.randomUUID()}-does-not-exist.bin`;
    await expect(storageProvider.read(storageKey)).rejects.toThrow();
  });
});
