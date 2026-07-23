'use strict';

const { detectImageMimeType, detectAudioMimeType, extensionMatchesMimeType } = require('../../src/utils/fileValidation');

describe('utils/fileValidation', () => {
  test('detects JPEG, PNG, and WEBP by magic bytes', () => {
    expect(detectImageMimeType(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00]))).toBe('image/jpeg');
    expect(detectImageMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(
      detectImageMimeType(Buffer.concat([Buffer.from([0x52, 0x49, 0x46, 0x46]), Buffer.alloc(4), Buffer.from('WEBP')])),
    ).toBe('image/webp');
  });

  test('rejects a RIFF file that is not actually WEBP', () => {
    const buffer = Buffer.concat([Buffer.from([0x52, 0x49, 0x46, 0x46]), Buffer.alloc(4), Buffer.from('AVI ')]);
    expect(detectImageMimeType(buffer)).toBeNull();
  });

  test('rejects a non-image buffer regardless of the claimed extension', () => {
    expect(detectImageMimeType(Buffer.from('not an image'))).toBeNull();
  });

  test('detects WAV, OGG, and MP3 by magic bytes', () => {
    expect(
      detectAudioMimeType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(4)])),
    ).toBe('audio/wav');
    expect(detectAudioMimeType(Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00]))).toBe('audio/ogg');
    expect(detectAudioMimeType(Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00]))).toBe('audio/mpeg');
    expect(detectAudioMimeType(Buffer.from([0xff, 0xfb, 0x00, 0x00]))).toBe('audio/mpeg');
  });

  test('rejects a non-audio buffer', () => {
    expect(detectAudioMimeType(Buffer.from('not audio'))).toBeNull();
  });

  test('extensionMatchesMimeType checks the declared extension against the detected type', () => {
    expect(extensionMatchesMimeType('photo.jpg', 'image/jpeg')).toBe(true);
    expect(extensionMatchesMimeType('photo.png', 'image/jpeg')).toBe(false);
    expect(extensionMatchesMimeType('photo.webp', 'image/webp')).toBe(true);
  });
});
